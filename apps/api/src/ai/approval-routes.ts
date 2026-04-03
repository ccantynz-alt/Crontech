// ── AI Approval Routes (Hono + SSE) ───────────────────────────────
// Human-in-the-loop approval API for AI agent actions.
// GET  /approvals         - List pending approval requests
// POST /approvals/:id/approve - Approve an action
// POST /approvals/:id/reject  - Reject an action
// GET  /approvals/stream  - SSE stream of approval events
// All inputs validated with Zod. Approval events streamed via SSE.

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  createApprovalGate,
  type ApprovalRequest,
  type ApprovalDecision,
} from "@back-to-the-future/ai-core";

// ── Input Schemas ───────────────────────────────────────────────

const ApproveInputSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  approvedBy: z.string().min(1, "Approver identity is required"),
});

const RejectInputSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  rejectedBy: z.string().min(1, "Rejector identity is required"),
});

const ApprovalIdParam = z.string().uuid("Invalid approval ID");

// ── SSE Subscriber Management ───────────────────────────────────

interface SSESubscriber {
  id: string;
  writer: WritableStreamDefaultWriter<string>;
  controller: AbortController;
}

const sseSubscribers = new Map<string, SSESubscriber>();

function broadcastApprovalEvent(
  event: string,
  data: Record<string, unknown>,
): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\nid: ${String(Date.now())}\n\n`;
  for (const [id, subscriber] of sseSubscribers) {
    subscriber.writer.write(payload).catch(() => {
      // Subscriber disconnected -- clean up
      sseSubscribers.delete(id);
      subscriber.controller.abort();
    });
  }
}

// ── In-Memory Approval Store ────────────────────────────────────

/**
 * Pending approval requests awaiting human decision.
 * Key: approval request ID, Value: request + resolver pair.
 */
interface PendingEntry {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
}

const pendingApprovals = new Map<string, PendingEntry>();

/**
 * Resolved approvals kept for audit trail (last 1000).
 */
const resolvedApprovals: ApprovalDecision[] = [];
const MAX_RESOLVED_HISTORY = 1000;

function addResolved(decision: ApprovalDecision): void {
  resolvedApprovals.push(decision);
  if (resolvedApprovals.length > MAX_RESOLVED_HISTORY) {
    resolvedApprovals.shift();
  }
}

// ── Approval Gate Instance ──────────────────────────────────────

/**
 * The shared approval gate that AI agents use to request human approval.
 * When approval is required, the callback stores the request and waits
 * for a human to approve/reject via the API routes.
 */
export const approvalGate = createApprovalGate(
  (request: ApprovalRequest): Promise<ApprovalDecision> => {
    return new Promise<ApprovalDecision>((resolve) => {
      pendingApprovals.set(request.id, { request, resolve });

      // Broadcast the new approval request to all SSE subscribers
      broadcastApprovalEvent("approval:pending", {
        id: request.id,
        action: request.action,
        riskLevel: request.riskLevel,
        description: request.description,
        toolName: request.toolName,
        params: request.params,
        timestamp: request.timestamp,
      });
    });
  },
);

// ── Route Definitions ───────────────────────────────────────────

export const approvalRoutes = new Hono();

/**
 * GET /approvals
 * List all pending approval requests.
 * Returns an array of ApprovalRequest objects.
 */
approvalRoutes.get("/approvals", (c) => {
  const pending: ApprovalRequest[] = [];
  for (const entry of pendingApprovals.values()) {
    pending.push(entry.request);
  }

  return c.json({
    pending,
    count: pending.length,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /approvals/:id/approve
 * Approve a pending AI action.
 */
approvalRoutes.post("/approvals/:id/approve", async (c) => {
  const idResult = ApprovalIdParam.safeParse(c.req.param("id"));
  if (!idResult.success) {
    return c.json(
      { error: "Invalid approval ID", details: idResult.error.flatten() },
      400,
    );
  }

  const body: unknown = await c.req.json();
  const parsed = ApproveInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const id = idResult.data;
  const entry = pendingApprovals.get(id);
  if (!entry) {
    return c.json({ error: "Approval request not found or already resolved" }, 404);
  }

  const decision: ApprovalDecision = {
    requestId: id,
    approved: true,
    reason: parsed.data.reason,
    approvedBy: parsed.data.approvedBy,
    timestamp: Date.now(),
  };

  // Resolve the promise that the approval gate is awaiting
  pendingApprovals.delete(id);
  entry.resolve(decision);
  addResolved(decision);

  // Broadcast resolution to SSE subscribers
  broadcastApprovalEvent("approval:resolved", {
    requestId: id,
    approved: true,
    reason: decision.reason,
    approvedBy: decision.approvedBy,
    timestamp: decision.timestamp,
  });

  return c.json({ success: true, decision });
});

/**
 * POST /approvals/:id/reject
 * Reject a pending AI action.
 */
approvalRoutes.post("/approvals/:id/reject", async (c) => {
  const idResult = ApprovalIdParam.safeParse(c.req.param("id"));
  if (!idResult.success) {
    return c.json(
      { error: "Invalid approval ID", details: idResult.error.flatten() },
      400,
    );
  }

  const body: unknown = await c.req.json();
  const parsed = RejectInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const id = idResult.data;
  const entry = pendingApprovals.get(id);
  if (!entry) {
    return c.json({ error: "Approval request not found or already resolved" }, 404);
  }

  const decision: ApprovalDecision = {
    requestId: id,
    approved: false,
    reason: parsed.data.reason,
    approvedBy: parsed.data.rejectedBy,
    timestamp: Date.now(),
  };

  // Resolve the promise that the approval gate is awaiting
  pendingApprovals.delete(id);
  entry.resolve(decision);
  addResolved(decision);

  // Broadcast resolution to SSE subscribers
  broadcastApprovalEvent("approval:resolved", {
    requestId: id,
    approved: false,
    reason: decision.reason,
    approvedBy: decision.approvedBy,
    timestamp: decision.timestamp,
  });

  return c.json({ success: true, decision });
});

/**
 * GET /approvals/stream
 * SSE stream for real-time approval events.
 * Emits:
 * - "approval:pending"  when a new approval request arrives
 * - "approval:resolved" when an approval is approved or rejected
 * - "keepalive"         every 15 seconds to prevent proxy timeouts
 */
approvalRoutes.get("/approvals/stream", async (c) => {
  return streamSSE(
    c,
    async (stream) => {
      const subscriberId = crypto.randomUUID();
      const { readable, writable } = new TransformStream<string, string>();
      const writer = writable.getWriter();
      const controller = new AbortController();

      sseSubscribers.set(subscriberId, { id: subscriberId, writer, controller });

      // Send initial state: all currently pending approvals
      const currentPending: ApprovalRequest[] = [];
      for (const entry of pendingApprovals.values()) {
        currentPending.push(entry.request);
      }

      await stream.writeSSE({
        event: "approval:init",
        data: JSON.stringify({
          pending: currentPending,
          count: currentPending.length,
          timestamp: new Date().toISOString(),
        }),
        id: String(Date.now()),
      });

      // Keep-alive every 15 seconds
      const keepAliveInterval = setInterval(async () => {
        try {
          await stream.writeSSE({
            event: "keepalive",
            data: JSON.stringify({ timestamp: new Date().toISOString() }),
            id: String(Date.now()),
          });
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 15_000);

      // Read from the transform stream and forward to SSE
      const reader = readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await stream.write(value);
        }
      } catch {
        // Stream closed (client disconnected or abort)
      } finally {
        clearInterval(keepAliveInterval);
        sseSubscribers.delete(subscriberId);
        reader.releaseLock();
        try {
          await writer.close();
        } catch {
          // Already closed
        }
      }
    },
    async (_error, stream) => {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          type: "error",
          message: "Approval stream encountered an error",
        }),
        id: String(Date.now()),
      });
    },
  );
});

export default approvalRoutes;
