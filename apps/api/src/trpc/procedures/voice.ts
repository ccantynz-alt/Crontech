// BLK-018 Voice-2 — Voice dispatch: turn a natural-language transcript
// from the VoicePill component into a structured platform intent.
//
// Flow: WebSpeech STT (client) → /voice.dispatch → Anthropic generateObject →
// structured IntentSchema → client acts (navigate, search flywheel, run op).
//
// Every dispatch is logged to the theatre so operators can watch voice
// traffic live on /ops alongside deploys and ingests.
//
// TODO(BLK-020 Phase B): still uses Vercel `ai`'s `generateObject` for
// schema-validated structured output. Porting to raw
// `@anthropic-ai/sdk` requires wiring Anthropic's tool-use API
// (single-tool-with-required-schema pattern) plus Zod → JSON-Schema
// conversion and result validation. Deferred to Phase B.

import { getAnthropicModelFromEnv, hasAnthropicProvider } from "@back-to-the-future/ai-core";
import { startRun } from "@back-to-the-future/theatre";
import { TRPCError } from "@trpc/server";
import { generateObject } from "ai";
import { z } from "zod";
import { protectedProcedure, router } from "../init";

// ── Intent schema ─────────────────────────────────────────────────
// Every voice command must resolve to one of these intents. If the
// model can't map it, it returns `{ kind: "unknown" }` and we surface
// that back to the user with the verbatim transcript.

const KNOWN_ROUTES = [
  "/",
  "/dashboard",
  "/ops",
  "/flywheel",
  "/builder",
  "/chat",
  "/deployments",
  "/projects",
  "/repos",
  "/settings",
  "/billing",
  "/support",
  "/admin",
  "/admin/gate",
  "/admin/pulse",
] as const;

const IntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("navigate"),
    route: z.enum(KNOWN_ROUTES),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("search_memory"),
    query: z.string().min(1).max(300),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("search_ops"),
    filter: z.string().max(200),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("run_ingest"),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("ask"),
    question: z.string().min(1).max(1000),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("unknown"),
    reason: z.string().max(400),
  }),
]);

export type VoiceIntent = z.infer<typeof IntentSchema>;

const SYSTEM_PROMPT = `You are the voice dispatcher for Crontech — an AI-native full-stack developer platform. Your only job is to map a spoken transcript into exactly one structured intent.

Available intents:
- navigate: user wants to open a specific page in the app. Must pick a route from the allowed enum.
- search_memory: user wants to search past Claude Code sessions on the Flywheel memory page.
- search_ops: user wants to find a specific operation on the Ops page (e.g. "show me the last failed deploy").
- run_ingest: user wants to re-ingest Claude Code transcripts into the flywheel.
- ask: user is asking a question that needs an AI answer (not a platform action).
- unknown: transcript is empty, meaningless, or does not match any other intent.

Be strict. Prefer "unknown" with a clear reason over forcing an intent that doesn't fit. Always include a short "reason" field explaining why you chose this intent.

Available routes for navigate:
/ /dashboard /ops /flywheel /builder /chat /deployments /projects /repos /settings /billing /support /admin /admin/gate /admin/pulse

- /admin/gate: the Command Gate — live status, vitals, quick-action buttons (iPad command center)
- /admin/pulse: the Sovereign Pulse — animated orb + real-time platform metrics`;

export const voiceRouter = router({
  /**
   * Dispatch a transcript into a structured intent. Every call writes
   * a single theatre run (kind=voice) so ops can see voice traffic.
   * When no Anthropic key is configured, we return kind=unknown with
   * a helpful reason rather than failing — keeps the pipe testable.
   */
  dispatch: protectedProcedure
    .input(
      z.object({
        transcript: z.string().min(1).max(2_000),
        /** Where in the app the user was when they spoke. Helps
         * disambiguate "go back" vs "refresh" vs "search here". */
        context: z
          .object({
            route: z.string().max(200).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const run = await startRun(ctx.db, {
        kind: "voice",
        title: `Voice: "${input.transcript.slice(0, 60)}${input.transcript.length > 60 ? "…" : ""}"`,
        actorUserId: ctx.userId,
        actorLabel: "voice-pill",
        metadata: {
          contextRoute: input.context?.route ?? null,
          transcriptLength: input.transcript.length,
        },
      });

      try {
        if (!hasAnthropicProvider()) {
          const intent: VoiceIntent = {
            kind: "unknown",
            reason: "ANTHROPIC_API_KEY not configured — cannot classify transcript.",
          };
          await run.log("no anthropic provider; echoing unknown intent", "stderr");
          await run.succeed();
          return { intent, transcript: input.transcript, source: "stub" as const };
        }

        const intent = await run.step("classify transcript", async (step): Promise<VoiceIntent> => {
          await step.log(`transcript: ${input.transcript}`);
          const model = getAnthropicModelFromEnv();
          if (!model) {
            throw new Error("Anthropic model unavailable.");
          }

          const { object } = await generateObject({
            model,
            schema: IntentSchema,
            system: SYSTEM_PROMPT,
            prompt: [
              `Current route: ${input.context?.route ?? "(unknown)"}`,
              "",
              "Transcript:",
              input.transcript,
            ].join("\n"),
            temperature: 0.1,
          });

          await step.log(`→ ${object.kind}: ${object.reason}`);
          return object;
        });

        await run.succeed();
        return { intent, transcript: input.transcript, source: "ai" as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await run.fail(message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Voice dispatch failed: ${message}`,
        });
      }
    }),

  /**
   * Optimise text for browser TTS via Web Speech API.
   *
   * Takes a raw message (e.g. a metric alert or status update) and returns
   * a version cleaned up for natural-sounding speech: expands abbreviations,
   * adds punctuation pauses, removes markdown and emoji. The client then
   * calls `speechSynthesis.speak(new SpeechSynthesisUtterance(result.text))`.
   *
   * When Anthropic is not configured, returns the original text unchanged —
   * Web Speech still works, just without AI polishing.
   */
  tts: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(2_000),
        /** Voice rate 0.1–2.0. Defaults to 1.0. */
        rate: z.number().min(0.1).max(2.0).optional(),
        /** Voice pitch 0.0–2.0. Defaults to 1.0. */
        pitch: z.number().min(0.0).max(2.0).optional(),
      }),
    )
    .query(async ({ input }) => {
      let spokenText = input.text;

      if (hasAnthropicProvider()) {
        const model = getAnthropicModelFromEnv();
        if (model) {
          try {
            const { object } = await generateObject({
              model,
              schema: z.object({
                spokenText: z.string().min(1),
              }),
              system: `You convert dashboard text into natural spoken speech for a text-to-speech engine.
Rules:
- Remove markdown (**, *, #, backticks, brackets)
- Remove emoji entirely
- Expand abbreviations: "ms" → "milliseconds", "req/s" → "requests per second", "uptime" → "up time"
- Add natural pauses using commas
- Numbers: "$1234" → "1234 dollars", "95%" → "95 percent"
- Keep it under 200 words
- Return only the spoken text, no preamble`,
              prompt: input.text,
              temperature: 0.1,
            });
            spokenText = object.spokenText;
          } catch {
            // Fall through to raw text on AI failure
          }
        }
      }

      return {
        text: spokenText,
        rate: input.rate ?? 1.0,
        pitch: input.pitch ?? 1.0,
      };
    }),
});
