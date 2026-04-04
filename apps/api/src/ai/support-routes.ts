// ── Support Routes (Hono) ───────────────────────────────────────
// Customer support AI agent endpoints.
// POST /support/chat         — main chat (streaming SSE)
// GET  /support/history/:id  — conversation history
// POST /support/feedback     — rate a response
// POST /support/escalate     — manual escalation to human
// All inputs validated with Zod. Responses streamed via SSE.

import { Hono } from "hono";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@cronix/db";
import {
  supportConversations,
  supportMessages,
  supportFeedback,
  supportTickets,
} from "@cronix/db";
import { runSupportAgent } from "./support-agent";
import { traceAICall } from "../telemetry";
import type { CoreMessage } from "ai";

// ── Input Schemas ──────────────────────────────────────────────

const ChatInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .min(1, "At least one message is required"),
  userId: z.string().nullable().optional(),
  sessionId: z.string().min(1, "Session ID is required"),
});

const FeedbackInputSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
  rating: z.enum(["positive", "negative"]),
  comment: z.string().optional(),
});

const EscalateInputSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  reason: z.string().min(1, "Reason is required"),
  summary: z.string().optional(),
});

// ── Route Definitions ──────────────────────────────────────────

export const supportRoutes = new Hono();

/**
 * POST /support/chat
 * Main support chat endpoint with streaming SSE.
 * Accepts messages, optional userId for account context, and sessionId for tracking.
 */
supportRoutes.post("/chat", async (c) => {
  const body = await c.req.json();
  const parsed = ChatInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { messages, userId, sessionId } = parsed.data;

  // Ensure conversation record exists
  const existing = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.sessionId, sessionId))
    .limit(1);

  if (!existing[0]) {
    await db.insert(supportConversations).values({
      id: crypto.randomUUID(),
      userId: userId ?? null,
      sessionId,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Persist the latest user message
  const latestUserMsg = messages[messages.length - 1];
  if (latestUserMsg && latestUserMsg.role === "user") {
    await db.insert(supportMessages).values({
      id: crypto.randomUUID(),
      conversationId: existing[0]?.id ?? (
        await db
          .select({ id: supportConversations.id })
          .from(supportConversations)
          .where(eq(supportConversations.sessionId, sessionId))
          .limit(1)
      )[0]!.id,
      role: "user",
      content: latestUserMsg.content,
      createdAt: new Date(),
    });
  }

  const result = await traceAICall(
    "support.chat",
    { sessionId, hasUserId: !!userId, messageCount: messages.length },
    async () => {
      return runSupportAgent({
        messages: messages as CoreMessage[],
        userId: userId ?? null,
        sessionId,
      });
    },
  );

  // Collect the full text for storage after streaming completes
  const conversationRecord = existing[0] ?? (
    await db
      .select()
      .from(supportConversations)
      .where(eq(supportConversations.sessionId, sessionId))
      .limit(1)
  )[0];

  // Use the AI SDK data stream protocol for SSE
  const response = result.toDataStreamResponse({
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });

  // Save assistant response asynchronously after stream finishes
  result.text.then(async (fullText: string) => {
    if (conversationRecord && fullText) {
      await db.insert(supportMessages).values({
        id: crypto.randomUUID(),
        conversationId: conversationRecord.id,
        role: "assistant",
        content: fullText,
        createdAt: new Date(),
      });

      await db
        .update(supportConversations)
        .set({ updatedAt: new Date() })
        .where(eq(supportConversations.id, conversationRecord.id));
    }
  }).catch(() => {
    // Best-effort persistence — don't crash the stream
  });

  return response;
});

/**
 * GET /support/history/:sessionId
 * Get conversation history for a session.
 */
supportRoutes.get("/history/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  const conversation = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.sessionId, sessionId))
    .limit(1);

  if (!conversation[0]) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.conversationId, conversation[0].id))
    .orderBy(supportMessages.createdAt);

  return c.json({
    conversation: {
      id: conversation[0].id,
      sessionId: conversation[0].sessionId,
      status: conversation[0].status,
      category: conversation[0].category,
      summary: conversation[0].summary,
      createdAt: conversation[0].createdAt,
      updatedAt: conversation[0].updatedAt,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
      createdAt: m.createdAt,
    })),
  });
});

/**
 * POST /support/feedback
 * Submit thumbs up/down feedback on a support response.
 */
supportRoutes.post("/feedback", async (c) => {
  const body = await c.req.json();
  const parsed = FeedbackInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { messageId, rating, comment } = parsed.data;

  // Verify the message exists
  const message = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.id, messageId))
    .limit(1);

  if (!message[0]) {
    return c.json({ error: "Message not found" }, 404);
  }

  const feedbackId = crypto.randomUUID();

  await db.insert(supportFeedback).values({
    id: feedbackId,
    messageId,
    rating,
    comment: comment ?? null,
    createdAt: new Date(),
  });

  return c.json({
    success: true,
    feedbackId,
    message: "Thank you for your feedback!",
  });
});

/**
 * POST /support/escalate
 * Manually escalate a conversation to a human support agent.
 */
supportRoutes.post("/escalate", async (c) => {
  const body = await c.req.json();
  const parsed = EscalateInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { sessionId, reason, summary } = parsed.data;

  const conversation = await db
    .select()
    .from(supportConversations)
    .where(eq(supportConversations.sessionId, sessionId))
    .limit(1);

  if (!conversation[0]) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Update conversation status to escalated
  await db
    .update(supportConversations)
    .set({
      status: "escalated",
      summary: summary ?? reason,
      updatedAt: new Date(),
    })
    .where(eq(supportConversations.id, conversation[0].id));

  // Create a support ticket for the escalation
  const ticketId = crypto.randomUUID();

  await db.insert(supportTickets).values({
    id: ticketId,
    conversationId: conversation[0].id,
    userId: conversation[0].userId,
    category: "escalation",
    priority: "high",
    status: "open",
    summary: `Escalated: ${reason}${summary ? ` — ${summary}` : ""}`,
    createdAt: new Date(),
  });

  return c.json({
    success: true,
    ticketId,
    message:
      "Your conversation has been escalated to a human support agent. They will review the context and follow up shortly.",
  });
});

export default supportRoutes;
