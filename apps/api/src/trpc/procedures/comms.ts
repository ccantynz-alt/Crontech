// ── Unified Communications Intent Router ──────────────────────────────
// One tRPC entry-point for all outbound communication. Accepts a natural-
// language intent, uses Anthropic `generateObject` to classify the channel
// and extract the payload, then dispatches to the correct transport.
//
// Transport matrix:
//   email  → sendEmail (apps/api/src/email/client.ts)
//   sms    → sendSms   (apps/api/src/sms/send.ts)  — requires an active
//            number on the caller's account
//   voice  → TTS pipeline (not yet wired — queued with a clear message)
//
// Pattern mirrors voice.ts: `hasAnthropicProvider` guard, `generateObject`
// for schema-validated structured output, `startRun` theatre audit trail.

import { getAnthropicModelFromEnv, hasAnthropicProvider } from "@back-to-the-future/ai-core";
import { smsNumbers } from "@back-to-the-future/db";
import { startRun } from "@back-to-the-future/theatre";
import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { sendEmail } from "../../email/client";
import { SendSmsError, sendSms } from "../../sms/send";
import {
  SinchClient,
  configFromEnv,
  isValidE164,
  markupPercentFromEnv,
} from "../../sms/sinch-client";
import { protectedProcedure, router } from "../init";

// ── Input / Output schemas ─────────────────────────────────────────────

const CommsSendInputSchema = z.object({
  /** Natural-language description of what to send. */
  intent: z.string().min(1).max(2_000),
  /**
   * Optional channel hint. When provided, AI classification is skipped
   * and the request is routed directly to this transport.
   */
  channel: z.enum(["email", "sms", "voice"]).optional(),
  /** Recipient email address or E.164 phone number. */
  to: z.string().optional(),
  /** Email subject hint (only used when channel is "email"). */
  subject: z.string().optional(),
});

export type CommsSendInput = z.infer<typeof CommsSendInputSchema>;

const CommsClassifyInputSchema = z.object({
  intent: z.string().min(1).max(2_000),
});

/** The structured payload the AI extracts from a natural-language intent. */
const AiClassificationSchema = z.object({
  channel: z.enum(["email", "sms", "voice"]),
  to: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  confidence: z.number().min(0).max(1),
});

type AiClassification = z.infer<typeof AiClassificationSchema>;

const CommsSendOutputSchema = z.object({
  channel: z.enum(["email", "sms", "voice"]),
  status: z.enum(["sent", "queued", "failed"]),
  messageId: z.string().nullable(),
  confidence: z.number().nullable(),
  error: z.string().nullable(),
});

export type CommsSendOutput = z.infer<typeof CommsSendOutputSchema>;

const CommsClassifyOutputSchema = AiClassificationSchema.extend({
  wouldSend: z.literal(true),
});

export type CommsClassifyOutput = z.infer<typeof CommsClassifyOutputSchema>;

// ── Constants ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a communications routing AI. Given a user's intent, extract:
- channel: the best transport — "email" (formal/long-form), "sms" (short/urgent), or "voice" (call/TTS notification)
- to: the recipient address. For email, a valid email address. For sms/voice, an E.164 phone number (e.g. +14155551234).
- subject: email subject line (only when channel is "email"; omit for sms/voice).
- body: the full message body to send. Write the actual message content, not a description of it.
- confidence: a float 0.0–1.0 representing your certainty about the routing decision.

Be precise. If the recipient or channel is ambiguous, prefer confidence < 0.5.
Never invent recipient addresses — use only what the user provided.`;

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Classify the intent via Anthropic `generateObject`. Returns null when
 * the Anthropic provider is not configured.
 */
async function classifyIntent(intent: string): Promise<AiClassification | null> {
  if (!hasAnthropicProvider()) return null;

  const model = getAnthropicModelFromEnv();
  if (!model) return null;

  const { object } = await generateObject({
    model,
    schema: AiClassificationSchema,
    system: SYSTEM_PROMPT,
    prompt: intent,
    temperature: 0.1,
  });

  return object;
}

/**
 * Dispatch to the email transport. Wraps `body` in a minimal paragraph
 * tag to produce valid HTML that all mail clients can render.
 */
async function dispatchEmail(to: string, subject: string, body: string): Promise<CommsSendOutput> {
  const html = `<p>${body.replace(/\n/g, "<br />")}</p>`;
  const result = await sendEmail(to, subject, html);
  if (!result.success) {
    return {
      channel: "email",
      status: "failed",
      messageId: null,
      confidence: null,
      error: result.error ?? "Email send failed.",
    };
  }
  return {
    channel: "email",
    status: "sent",
    messageId: result.id ?? null,
    confidence: null,
    error: null,
  };
}

/**
 * Resolve the caller's first active SMS number to use as the `from`
 * address. Mirrors the `resolveFromNumber` helper in sms.ts (not
 * exported there, so we re-implement the DB query here).
 */
async function resolveFromNumber(
  userId: string,
  db: Parameters<typeof sendSms>[1]["db"],
): Promise<string | null> {
  const rows = await db
    .select()
    .from(smsNumbers)
    .where(and(eq(smsNumbers.userId, userId), isNull(smsNumbers.releasedAt)))
    .orderBy(desc(smsNumbers.purchasedAt))
    .limit(1);
  return rows[0]?.e164Number ?? null;
}

/**
 * Dispatch to the SMS transport. Resolves the `from` number from the
 * user's active numbers; maps `SendSmsError` to a structured output
 * rather than throwing so callers receive a uniform `CommsSendOutput`.
 */
async function dispatchSms(
  userId: string,
  to: string,
  body: string,
  db: Parameters<typeof sendSms>[1]["db"],
): Promise<CommsSendOutput> {
  if (!isValidE164(to)) {
    return {
      channel: "sms",
      status: "failed",
      messageId: null,
      confidence: null,
      error: `Invalid E.164 phone number: "${to}". Provide a number like +14155551234.`,
    };
  }

  // Resolve the caller's first active number as the sender. Callers that
  // need a specific `from` should use sms.send directly.
  const from = await resolveFromNumber(userId, db);
  if (!from) {
    return {
      channel: "sms",
      status: "failed",
      messageId: null,
      confidence: null,
      error:
        "No active SMS number on your account. Purchase a number before sending SMS via comms.send.",
    };
  }

  const client = new SinchClient(configFromEnv());

  try {
    const result = await sendSms(
      { userId, from, to, body },
      {
        db,
        client,
        markupPercent: markupPercentFromEnv(),
      },
    );
    return {
      channel: "sms",
      status: result.status === "failed" ? "failed" : "sent",
      messageId: result.id,
      confidence: null,
      error: null,
    };
  } catch (err) {
    if (err instanceof SendSmsError) {
      return {
        channel: "sms",
        status: "failed",
        messageId: null,
        confidence: null,
        error: err.message,
      };
    }
    const message = err instanceof Error ? err.message : "Unexpected SMS error.";
    return {
      channel: "sms",
      status: "failed",
      messageId: null,
      confidence: null,
      error: message,
    };
  }
}

/**
 * Voice / TTS dispatch. The full TTS pipeline (text → audio → call) is
 * tracked under a future block. Until it is wired, we return a queued
 * status with an explicit message so callers are not silently swallowed.
 */
function dispatchVoice(_to: string, _body: string): CommsSendOutput {
  return {
    channel: "voice",
    status: "queued",
    messageId: null,
    confidence: null,
    error: "Voice delivery not yet wired for comms.send — implement TTS pipeline.",
  };
}

// ── Router ─────────────────────────────────────────────────────────────

export const commsRouter = router({
  /**
   * Unified outbound communications entry-point.
   *
   * Accepts a natural-language `intent` and optional hints (`channel`,
   * `to`, `subject`). When `channel` is provided the AI classification
   * step is skipped and the call routes directly to the transport.
   *
   * Every call is logged to the theatre so operators can watch comms
   * traffic on /ops alongside deploys, voice events, and ingests.
   */
  send: protectedProcedure
    .input(CommsSendInputSchema)
    .mutation(async ({ ctx, input }): Promise<CommsSendOutput> => {
      const run = await startRun(ctx.db, {
        kind: "agent",
        title: `Comms send: "${input.intent.slice(0, 60)}${input.intent.length > 60 ? "…" : ""}"`,
        actorUserId: ctx.userId,
        actorLabel: "comms-router",
        metadata: {
          explicitChannel: input.channel ?? null,
          intentLength: input.intent.length,
        },
      });

      try {
        // ── Step 1: resolve channel + payload ───────────────────────
        let classification: AiClassification;

        if (input.channel !== undefined) {
          // Caller provided an explicit channel — skip AI, build a
          // synthetic classification from the input hints.
          const to = input.to ?? "";
          const body = input.intent; // treat the intent as the message body
          classification = {
            channel: input.channel,
            to,
            body,
            confidence: 1,
            ...(input.subject !== undefined ? { subject: input.subject } : {}),
          };
          await run.log(`explicit channel=${input.channel}; skipping AI`, "stdout");
        } else {
          // No channel hint — require Anthropic.
          if (!hasAnthropicProvider()) {
            await run.fail("no anthropic provider and no explicit channel");
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "AI provider required for intent classification. Provide an explicit channel.",
            });
          }

          const aiResult = await run.step(
            "classify intent",
            async (step): Promise<AiClassification> => {
              await step.log(`intent: ${input.intent}`);
              const result = await classifyIntent(input.intent);
              if (!result) {
                throw new Error("Anthropic model unavailable despite provider check passing.");
              }
              await step.log(
                `→ channel=${result.channel} to=${result.to} confidence=${result.confidence.toFixed(2)}`,
              );
              return result;
            },
          );
          classification = aiResult;

          // Merge any explicit overrides from the caller.
          if (input.to !== undefined) {
            classification = { ...classification, to: input.to };
          }
          if (input.subject !== undefined) {
            classification = { ...classification, subject: input.subject };
          }
        }

        // ── Step 2: dispatch to the correct transport ───────────────
        let output: CommsSendOutput;

        switch (classification.channel) {
          case "email": {
            const subject = classification.subject ?? input.subject ?? "Message from Crontech";
            output = await dispatchEmail(classification.to, subject, classification.body);
            break;
          }
          case "sms": {
            output = await dispatchSms(ctx.userId, classification.to, classification.body, ctx.db);
            break;
          }
          case "voice": {
            output = dispatchVoice(classification.to, classification.body);
            break;
          }
          default: {
            // Exhaustiveness guard — Zod enum + discriminated union
            // should make this unreachable at runtime.
            const exhaustive: never = classification.channel;
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Unknown channel: ${String(exhaustive)}`,
            });
          }
        }

        // Stamp confidence on the output (null when channel was explicit).
        const confidence = input.channel !== undefined ? null : classification.confidence;
        const finalOutput: CommsSendOutput = { ...output, confidence };

        await run.log(
          `dispatched channel=${finalOutput.channel} status=${finalOutput.status}`,
          "stdout",
        );

        if (finalOutput.status === "failed") {
          await run.fail(finalOutput.error ?? "transport failed");
        } else {
          await run.succeed();
        }

        return finalOutput;
      } catch (err) {
        if (err instanceof TRPCError) {
          // run.fail already called above for the PRECONDITION_FAILED case.
          throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        await run.fail(message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `comms.send failed: ${message}`,
        });
      }
    }),

  /**
   * Dry-run classifier: classify the intent without sending anything.
   *
   * Returns the AI's channel/recipient/body extraction plus a `wouldSend`
   * flag so callers (e.g. GlueCron) can preview routing before committing
   * to a real send.
   *
   * Requires Anthropic to be configured; throws `PRECONDITION_FAILED`
   * when it is not.
   */
  classify: protectedProcedure
    .input(CommsClassifyInputSchema)
    .query(async ({ input }): Promise<CommsClassifyOutput> => {
      if (!hasAnthropicProvider()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI provider required for intent classification. Provide an explicit channel.",
        });
      }

      const result = await classifyIntent(input.intent);
      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Anthropic model unavailable despite provider check passing.",
        });
      }

      return { ...result, wouldSend: true };
    }),
});

export type CommsRouter = typeof commsRouter;
