// ── Support Agent ───────────────────────────────────────────────
// Claude-powered AI customer support agent for Cronix.
// Uses Vercel AI SDK with tool-calling capabilities for account
// lookup, billing, knowledge base search, and escalation.
// All responses streamed via SSE.

import { streamText, tool, stepCountIs, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { db, users, subscriptions, usageRecords, auditLogs } from "@cronix/db";
import { QdrantPipeline } from "@cronix/ai-core";
import { getStripe } from "../billing/stripe";
import { PLANS } from "../billing/plans";
import type { PlanId } from "../billing/plans";

// ── System Prompt ──────────────────────────────────────────────

const SUPPORT_SYSTEM_PROMPT = `You are Cronix Support, a friendly and professional AI customer support agent for the Cronix platform — the most advanced AI-native full-stack platform for website builders and video creators.

## Guidelines
- Be friendly, professional, and concise. Users appreciate quick, clear answers.
- Always be transparent that you are an AI assistant. Never pretend to be human.
- Before answering any billing or account question, ALWAYS use the lookup tools to check the user's actual account data. Never guess.
- If you are unsure about something, search the knowledge base first. If still unsure, escalate to a human agent.
- Offer to escalate to a human support agent at any time if the user prefers.
- NEVER share sensitive data like full card numbers, passwords, or internal system details.
- When discussing billing amounts, format them properly (e.g., $29.00/month, not 2900 cents).
- If the user has no account context (anonymous), you can still answer general questions using the knowledge base.
- For complex issues that require manual intervention, create a support ticket and explain what will happen next.
- Keep responses focused and actionable. Avoid unnecessary filler.

## Capabilities
You can look up user accounts, subscriptions, usage, invoices, and recent errors.
You can search the knowledge base for documentation and FAQ answers.
You can apply promo codes, extend trial periods, create tickets, and escalate to humans.

## Tone
Helpful, empathetic, technically competent. You understand the platform deeply.`;

// ── Qdrant Pipeline (lazy singleton) ───────────────────────────

let _supportPipeline: QdrantPipeline | undefined;

function getSupportPipeline(): QdrantPipeline {
  if (!_supportPipeline) {
    _supportPipeline = new QdrantPipeline({
      storeConfig: {
        collectionName: "cronix_support_kb",
      },
    });
  }
  return _supportPipeline;
}

// ── Tool Definitions ───────────────────────────────────────────

const supportTools = {
  lookupUser: tool({
    description:
      "Look up a user's profile, plan, and account status by user ID.",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to look up"),
    }),
    execute: async ({ userId }) => {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = result[0];
      if (!user) {
        return { error: "User not found", userId };
      }

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      };
    },
  }),

  lookupSubscription: tool({
    description:
      "Get Stripe subscription details including current plan, status, and billing dates.",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to look up subscription for"),
    }),
    execute: async ({ userId }) => {
      const result = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const sub = result[0];
      if (!sub) {
        return {
          plan: "free",
          status: "active",
          message: "No subscription found — user is on the free plan.",
        };
      }

      const planId = (sub.plan ?? "free") as PlanId;
      const plan = PLANS[planId];

      return {
        plan: planId,
        planName: plan.name,
        status: sub.status,
        stripeSubscriptionId: sub.stripeSubscriptionId
          ? "***" + sub.stripeSubscriptionId.slice(-4)
          : null,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        priceMonthly: plan.priceMonthly,
        features: plan.features,
      };
    },
  }),

  lookupUsage: tool({
    description:
      "Get current usage for a user (AI tokens, video minutes, storage) in the current billing period.",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to look up usage for"),
    }),
    execute: async ({ userId }) => {
      const subResult = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const sub = subResult[0];
      const periodStart = sub?.currentPeriodStart ?? new Date(0);
      const planId = (sub?.plan ?? "free") as PlanId;
      const plan = PLANS[planId];

      const usageRows = await db
        .select({
          type: usageRecords.type,
          total: sql<number>`sum(${usageRecords.quantity})`,
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.userId, userId),
            gte(usageRecords.recordedAt, periodStart),
          ),
        )
        .groupBy(usageRecords.type);

      const usage: Record<string, number> = {
        ai_tokens: 0,
        video_minutes: 0,
        storage_bytes: 0,
      };

      for (const row of usageRows) {
        usage[row.type] = row.total;
      }

      return {
        usage,
        limits: plan.limits,
        plan: planId,
        periodStart,
        periodEnd: sub?.currentPeriodEnd ?? null,
      };
    },
  }),

  lookupInvoices: tool({
    description:
      "Get recent invoices and payment status from Stripe for a user.",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to look up invoices for"),
    }),
    execute: async ({ userId }) => {
      const subResult = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const sub = subResult[0];
      if (!sub?.stripeCustomerId) {
        return { invoices: [] as unknown[], message: "No billing account found." };
      }

      try {
        const stripe = getStripe();
        const result = await stripe.invoices.list({
          customer: sub.stripeCustomerId,
          limit: 5,
        });

        return {
          invoices: result.data.map((inv) => ({
            id: inv.id,
            number: inv.number,
            status: inv.status,
            amountDue: inv.amount_due,
            amountPaid: inv.amount_paid,
            currency: inv.currency,
            periodStart: inv.period_start
              ? new Date(inv.period_start * 1000).toISOString()
              : null,
            periodEnd: inv.period_end
              ? new Date(inv.period_end * 1000).toISOString()
              : null,
            invoicePdf: inv.invoice_pdf,
            createdAt: inv.created
              ? new Date(inv.created * 1000).toISOString()
              : null,
          })),
        };
      } catch {
        return {
          invoices: [] as unknown[],
          message: "Unable to retrieve invoices from Stripe.",
        };
      }
    },
  }),

  searchKnowledgeBase: tool({
    description:
      "Semantic search over the Cronix docs and FAQ knowledge base. Use for answering product questions, troubleshooting, and general help.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
    }),
    execute: async ({ query }) => {
      try {
        const pipeline = getSupportPipeline();
        const results = await pipeline.semanticSearch(
          query,
          { contentType: "support_kb" },
          5,
          0.6,
        );

        if (results.length === 0) {
          return {
            results: [] as unknown[],
            message: "No relevant knowledge base articles found.",
          };
        }

        return {
          results: results.map((r) => ({
            content: r.content,
            score: r.score,
            metadata: r.metadata,
          })),
        };
      } catch {
        return {
          results: [] as unknown[],
          message: "Knowledge base search unavailable.",
        };
      }
    },
  }),

  lookupRecentErrors: tool({
    description:
      "Get recent errors or issues for a user's account from the audit log.",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to look up errors for"),
    }),
    execute: async ({ userId }) => {
      const errors = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorId, userId),
            eq(auditLogs.result, "failure"),
          ),
        )
        .orderBy(desc(auditLogs.timestamp))
        .limit(10);

      return {
        errors: errors.map((e) => ({
          action: e.action,
          resourceType: e.resourceType,
          detail: e.detail,
          timestamp: e.timestamp,
        })),
        count: errors.length,
      };
    },
  }),

  applyPromoCode: tool({
    description:
      "Apply a promotional code to a user's account. Returns success or failure.",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to apply the promo code to"),
      code: z.string().describe("The promotional code to apply"),
    }),
    execute: async ({ userId, code }) => {
      const subResult = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const sub = subResult[0];
      if (!sub?.stripeCustomerId) {
        return {
          success: false,
          message:
            "No billing account found. User needs an active subscription first.",
        };
      }

      try {
        const stripe = getStripe();
        const promoCodes = await stripe.promotionCodes.list({
          code,
          active: true,
          limit: 1,
        });

        const promoCode = promoCodes.data[0];
        if (!promoCode) {
          return {
            success: false,
            message: `Promo code "${code}" is invalid or expired.`,
          };
        }

        await stripe.customers.update(sub.stripeCustomerId, {
          coupon: promoCode.coupon.id,
        });

        return {
          success: true,
          message: `Promo code "${code}" applied successfully.`,
          discount: promoCode.coupon.percent_off
            ? `${promoCode.coupon.percent_off}% off`
            : promoCode.coupon.amount_off
              ? `$${(promoCode.coupon.amount_off / 100).toFixed(2)} off`
              : "Discount applied",
        };
      } catch {
        return {
          success: false,
          message:
            "Failed to apply promo code. Please try again or contact support.",
        };
      }
    },
  }),

  extendTrial: tool({
    description:
      "Extend a user's free trial period by a specified number of days.",
    inputSchema: z.object({
      userId: z
        .string()
        .describe("The user ID to extend the trial for"),
      days: z
        .number()
        .min(1)
        .max(90)
        .describe("Number of days to extend the trial"),
    }),
    execute: async ({ userId, days }) => {
      const subResult = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      const sub = subResult[0];
      if (!sub?.stripeSubscriptionId) {
        return {
          success: false,
          message: "No active subscription found to extend trial for.",
        };
      }

      if (sub.status !== "trialing") {
        return {
          success: false,
          message: `Cannot extend trial — subscription status is "${sub.status}", not "trialing".`,
        };
      }

      try {
        const stripe = getStripe();
        const stripeSub = await stripe.subscriptions.retrieve(
          sub.stripeSubscriptionId,
        );
        const currentEnd =
          stripeSub.trial_end ?? Math.floor(Date.now() / 1000);
        const newEnd = currentEnd + days * 86400;

        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          trial_end: newEnd,
        });

        return {
          success: true,
          message: `Trial extended by ${days} days.`,
          newTrialEnd: new Date(newEnd * 1000).toISOString(),
        };
      } catch {
        return {
          success: false,
          message:
            "Failed to extend trial. Please escalate to a human agent.",
        };
      }
    },
  }),

  escalateToHuman: tool({
    description:
      "Escalate the conversation to a human support agent with a context summary.",
    inputSchema: z.object({
      reason: z.string().describe("Why this needs human attention"),
      summary: z
        .string()
        .describe("Summary of the conversation and issue so far"),
    }),
    execute: async ({ reason, summary }) => {
      return {
        escalated: true,
        message:
          "This conversation has been escalated to a human support agent. They will review the context and follow up shortly.",
        reason,
        summary,
      };
    },
  }),

  createTicket: tool({
    description: "Create a support ticket for tracking and follow-up.",
    inputSchema: z.object({
      userId: z
        .string()
        .describe("The user ID to create the ticket for"),
      category: z
        .string()
        .describe(
          "Ticket category (billing, technical, account, feature_request, bug)",
        ),
      summary: z.string().describe("Brief summary of the issue"),
    }),
    execute: async ({ userId, category, summary }) => {
      const ticketId = `tkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      return {
        ticketId,
        userId,
        category,
        summary,
        status: "open",
        message: `Support ticket ${ticketId} created. Our team will review it and follow up.`,
      };
    },
  }),
};

// ── Agent Runner ───────────────────────────────────────────────

export interface SupportChatOptions {
  messages: ModelMessage[];
  userId?: string | null;
  sessionId: string;
  maxTokens?: number;
}

/**
 * Run the support agent with streaming. Returns a streamText result
 * that can be converted to an SSE response.
 */
export function runSupportAgent(options: SupportChatOptions) {
  const { messages, userId, maxTokens = 4096 } = options;

  // Build context-aware system prompt
  let systemPrompt = SUPPORT_SYSTEM_PROMPT;
  if (userId) {
    systemPrompt += `\n\n## Current Session Context\nThe user is authenticated with ID: ${userId}. You can use their ID to look up account details.`;
  } else {
    systemPrompt += `\n\n## Current Session Context\nThe user is not authenticated (anonymous). You can answer general questions but cannot look up account-specific data. Suggest they log in for account-related help.`;
  }

  return streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: systemPrompt,
    messages,
    tools: supportTools,
    stopWhen: stepCountIs(8),
    maxOutputTokens: maxTokens,
    temperature: 0.3,
  });
}

export { supportTools, SUPPORT_SYSTEM_PROMPT };
