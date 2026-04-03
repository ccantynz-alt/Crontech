// ── Agent Routes (Hono) ─────────────────────────────────────────
// Endpoints for the LangGraph multi-agent orchestration system.
// POST /agents/run       -- Run an agent graph with streaming (SSE)
// POST /agents/plan      -- Get a plan without executing
// GET  /agents/status/:id -- Check running agent status
// POST /agents/approve/:id -- Human-in-the-loop approval
// All inputs validated with Zod. Agent responses streamed via SSE.

import { Hono } from "hono";
import { z } from "zod";
import {
  readProviderEnv,
  createAgentGraph,
  createInitialState,
  plannerNode,
  runTechScout,
  TechScoutInputSchema,
  runSiteArchitect,
  SiteArchitectInputSchema,
  runVideoDirector,
  VideoDirectorInputSchema,
  type ComputeTier,
  type AgentConfig,
  type AgentEvent,
  type AgentState,
  type PlanStep,
} from "@cronix/ai-core";
import { traceAICall } from "../telemetry";

// ── In-Memory Run Store ─────────────────────────────────────────
// Tracks running and completed agent executions.
// In production this would be backed by Durable Objects or a database.

interface AgentRun {
  id: string;
  status: "running" | "completed" | "failed" | "awaiting_approval";
  state: AgentState | null;
  events: AgentEvent[];
  createdAt: number;
  completedAt: number | null;
  pendingApproval: {
    step: PlanStep;
    reason: string;
    resolve: ((approved: boolean) => void) | null;
  } | null;
}

const runs = new Map<string, AgentRun>();

function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Clean up old runs (keep last 100)
function cleanupRuns(): void {
  if (runs.size > 100) {
    const sorted = [...runs.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    const toDelete = sorted.slice(0, sorted.length - 100);
    for (const [id] of toDelete) {
      runs.delete(id);
    }
  }
}

// ── Input Schemas ───────────────────────────────────────────────

const AgentRunInputSchema = z.object({
  message: z.string().min(1, "Message is required"),
  computeTier: z.enum(["client", "edge", "cloud"]).default("cloud"),
  maxRetries: z.number().int().min(0).max(5).default(2),
  maxTokens: z.number().int().min(1).max(16384).default(4096),
  temperature: z.number().min(0).max(2).default(0.5),
  timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  requireApprovalFor: z.array(z.string()).optional(),
  specialist: z
    .enum(["general", "tech-scout", "site-architect", "video-director"])
    .default("general"),
  specialistInput: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const PlanOnlyInputSchema = z.object({
  message: z.string().min(1, "Message is required"),
  computeTier: z.enum(["client", "edge", "cloud"]).default("cloud"),
  temperature: z.number().min(0).max(2).default(0.3),
});

const ApprovalInputSchema = z.object({
  approved: z.boolean(),
});

// ── Route Definitions ───────────────────────────────────────────

export const agentRoutes = new Hono();

/**
 * POST /agents/run
 * Run an agent graph with streaming SSE output.
 * Supports general agent graph and specialist agents.
 */
agentRoutes.post("/run", async (c) => {
  const body = await c.req.json();
  const parsed = AgentRunInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const {
    message,
    computeTier,
    maxRetries,
    maxTokens,
    temperature,
    timeoutMs,
    requireApprovalFor,
    specialist,
    specialistInput,
    metadata,
  } = parsed.data;

  const runId = generateRunId();
  cleanupRuns();

  const run: AgentRun = {
    id: runId,
    status: "running",
    state: null,
    events: [],
    createdAt: Date.now(),
    completedAt: null,
    pendingApproval: null,
  };
  runs.set(runId, run);

  const providerEnv = readProviderEnv();

  const agentConfig: AgentConfig = {
    computeTier: computeTier as ComputeTier,
    providerEnv,
    maxRetries,
    maxTokens,
    temperature,
    timeoutMs,
    requireApprovalFor,
  };

  // Stream via SSE
  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        function sendEvent(event: AgentEvent): void {
          run.events.push(event);
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        agentConfig.onEvent = sendEvent;

        try {
          await traceAICall(
            "agent.run",
            {
              computeTier,
              specialist,
              maxRetries,
              maxTokens,
              temperature,
            },
            async () => {
              // Route to specialist or general graph
              if (specialist === "tech-scout") {
                const input = TechScoutInputSchema.parse({
                  query: message,
                  ...specialistInput,
                });
                const result = await runTechScout(input, agentConfig);
                sendEvent({
                  type: "output",
                  content: JSON.stringify(result, null, 2),
                  timestamp: Date.now(),
                });
                return result;
              }

              if (specialist === "site-architect") {
                const input = SiteArchitectInputSchema.parse({
                  description: message,
                  ...specialistInput,
                });
                const result = await runSiteArchitect(input, agentConfig);
                sendEvent({
                  type: "output",
                  content: JSON.stringify(result, null, 2),
                  timestamp: Date.now(),
                });
                return result;
              }

              if (specialist === "video-director") {
                const input = VideoDirectorInputSchema.parse({
                  description: message,
                  ...specialistInput,
                });
                const result = await runVideoDirector(input, agentConfig);
                sendEvent({
                  type: "output",
                  content: JSON.stringify(result, null, 2),
                  timestamp: Date.now(),
                });
                return result;
              }

              // General agent graph
              const graph = createAgentGraph();
              const initialState = createInitialState(message, metadata);
              const finalState = await graph.invoke(initialState, agentConfig);
              run.state = finalState;
              return finalState;
            },
          );

          run.status = "completed";
          run.completedAt = Date.now();

          sendEvent({
            type: "complete",
            finalOutput: run.state?.output ?? null,
            timestamp: Date.now(),
          });
        } catch (err) {
          run.status = "failed";
          run.completedAt = Date.now();

          const errorMessage =
            err instanceof Error ? err.message : "Agent execution failed";
          sendEvent({
            type: "error",
            message: errorMessage,
            timestamp: Date.now(),
          });
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Run-Id": runId,
      },
    },
  );
});

/**
 * POST /agents/plan
 * Get an execution plan without running it.
 * Useful for previewing what the agent would do.
 */
agentRoutes.post("/plan", async (c) => {
  const body = await c.req.json();
  const parsed = PlanOnlyInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { message, computeTier, temperature } = parsed.data;
  const providerEnv = readProviderEnv();

  const agentConfig: AgentConfig = {
    computeTier: computeTier as ComputeTier,
    providerEnv,
    temperature,
  };

  try {
    const initialState = createInitialState(message);
    const result = await traceAICall(
      "agent.plan",
      { computeTier, temperature },
      async () => {
        return plannerNode(initialState, agentConfig);
      },
    );

    return c.json({
      success: true,
      plan: result.plan ?? [],
      reasoning:
        result.messages?.at(-1)?.content ?? "Plan created",
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Planning failed";
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * GET /agents/status/:id
 * Check the status of a running or completed agent execution.
 */
agentRoutes.get("/status/:id", (c) => {
  const id = c.req.param("id");
  const run = runs.get(id);

  if (!run) {
    return c.json({ error: `Run "${id}" not found` }, 404);
  }

  return c.json({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    eventCount: run.events.length,
    lastEvent: run.events.at(-1) ?? null,
    pendingApproval: run.pendingApproval
      ? {
          step: run.pendingApproval.step,
          reason: run.pendingApproval.reason,
        }
      : null,
    output: run.state?.output ?? null,
  });
});

/**
 * POST /agents/approve/:id
 * Human-in-the-loop approval for destructive agent actions.
 * Approves or rejects a pending action.
 */
agentRoutes.post("/approve/:id", async (c) => {
  const id = c.req.param("id");
  const run = runs.get(id);

  if (!run) {
    return c.json({ error: `Run "${id}" not found` }, 404);
  }

  if (run.status !== "awaiting_approval" || !run.pendingApproval) {
    return c.json(
      { error: `Run "${id}" is not awaiting approval` },
      400,
    );
  }

  const body = await c.req.json();
  const parsed = ApprovalInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { approved } = parsed.data;

  // Resume the agent
  run.pendingApproval.resolve?.(approved);
  run.pendingApproval = null;
  run.status = "running";

  return c.json({
    success: true,
    approved,
    message: approved
      ? "Action approved. Agent resuming."
      : "Action rejected. Agent will skip this step.",
  });
});

export default agentRoutes;
