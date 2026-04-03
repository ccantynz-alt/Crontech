// ── Agent Types & Schemas ─────────────────────────────────────────
// Shared types for the LangGraph multi-agent orchestration system.
// Every type has a corresponding Zod schema for validation at boundaries.

import { z } from "zod";
import type { ComputeTier } from "../compute-tier";
import type { AIProviderEnv } from "../providers";

// ── Plan Step ────────────────────────────────────────────────────

export const PlanStepSchema = z.object({
  id: z.string().describe("Unique step identifier"),
  action: z.string().describe("Human-readable description of the action"),
  tool: z.string().describe("Tool name to invoke"),
  args: z.record(z.unknown()).describe("Arguments to pass to the tool"),
  dependsOn: z
    .array(z.string())
    .default([])
    .describe("IDs of steps that must complete before this one"),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

// ── Step Result ──────────────────────────────────────────────────

export const StepResultSchema = z.object({
  stepId: z.string(),
  success: z.boolean(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number(),
});

export type StepResult = z.infer<typeof StepResultSchema>;

// ── Review Verdict ───────────────────────────────────────────────

export const ReviewVerdictSchema = z.object({
  approved: z.boolean(),
  qualityScore: z.number().min(0).max(1),
  issues: z.array(z.string()),
  action: z
    .enum(["accept", "retry", "replan"])
    .describe("What to do next: accept results, retry failed steps, or create a new plan"),
});

export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

// ── Agent State ──────────────────────────────────────────────────
// The central state object that flows through the LangGraph.
// Every node reads from and writes to this state.

export const AgentStateSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.string(),
      name: z.string().optional(),
    }),
  ),
  currentStep: z.enum(["planning", "executing", "reviewing", "responding", "complete", "error"]),
  plan: z.array(PlanStepSchema).nullable(),
  results: z.array(StepResultSchema),
  errors: z.array(z.string()),
  metadata: z.record(z.unknown()),
  review: ReviewVerdictSchema.nullable().optional(),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(2),
  output: z.string().nullable().optional(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

// ── Agent Events (streamed to the client) ────────────────────────

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("plan_created"),
    plan: z.array(PlanStepSchema),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("step_started"),
    stepId: z.string(),
    action: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("step_completed"),
    result: StepResultSchema,
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("review_completed"),
    verdict: ReviewVerdictSchema,
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("approval_required"),
    runId: z.string(),
    step: PlanStepSchema,
    reason: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("output"),
    content: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("complete"),
    finalOutput: z.string().nullable(),
    timestamp: z.number(),
  }),
]);

export type AgentEvent = z.infer<typeof AgentEventSchema>;

// ── Agent Config ─────────────────────────────────────────────────

export interface AgentConfig {
  /** Compute tier for LLM calls */
  computeTier: ComputeTier;
  /** Provider env for model selection */
  providerEnv?: AIProviderEnv;
  /** Max retries for failed steps */
  maxRetries?: number;
  /** Max execution time in ms */
  timeoutMs?: number;
  /** Temperature for LLM calls */
  temperature?: number;
  /** Max tokens for LLM responses */
  maxTokens?: number;
  /** Tools that require human approval before execution */
  requireApprovalFor?: string[];
  /** Callback for streaming events */
  onEvent?: (event: AgentEvent) => void;
}

// ── Specialist Agent Types ───────────────────────────────────────

export const TechReportSchema = z.object({
  name: z.string(),
  category: z.enum([
    "framework",
    "library",
    "runtime",
    "database",
    "ai",
    "infrastructure",
    "tooling",
    "other",
  ]),
  description: z.string(),
  maturity: z.enum(["experimental", "early-adopter", "mainstream", "legacy"]),
  relevanceScore: z.number().min(0).max(1),
  recommendation: z.enum(["adopt", "evaluate", "monitor", "ignore"]),
  reasoning: z.string(),
  links: z.array(z.string()),
});

export type TechReport = z.infer<typeof TechReportSchema>;

export const SiteArchitectureSchema = z.object({
  title: z.string(),
  description: z.string(),
  pages: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      description: z.string(),
      layout: z.enum(["default", "full-width", "sidebar", "centered"]),
      components: z.array(z.string()).describe("Component names from catalog"),
    }),
  ),
  navigation: z.array(
    z.object({
      label: z.string(),
      path: z.string(),
      children: z
        .array(z.object({ label: z.string(), path: z.string() }))
        .optional(),
    }),
  ),
  designDecisions: z.array(z.string()),
});

export type SiteArchitecture = z.infer<typeof SiteArchitectureSchema>;

export const VideoSceneSchema = z.object({
  id: z.string(),
  description: z.string(),
  durationMs: z.number().positive(),
  transition: z.enum(["cut", "fade", "dissolve", "wipe", "slide"]).default("cut"),
  assets: z.array(
    z.object({
      type: z.enum(["video", "image", "audio", "text-overlay", "shape"]),
      src: z.string().optional(),
      content: z.string().optional(),
      position: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
        .optional(),
      startMs: z.number().default(0),
      endMs: z.number().optional(),
    }),
  ),
});

export type VideoScene = z.infer<typeof VideoSceneSchema>;

export const VideoProjectSchema = z.object({
  title: z.string(),
  description: z.string(),
  resolution: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  fps: z.number().positive().default(30),
  scenes: z.array(VideoSceneSchema),
  totalDurationMs: z.number().positive(),
  audioTrack: z
    .object({
      src: z.string().optional(),
      description: z.string(),
    })
    .optional(),
  style: z.object({
    colorPalette: z.array(z.string()).optional(),
    fontFamily: z.string().optional(),
    mood: z.string().optional(),
  }),
});

export type VideoProject = z.infer<typeof VideoProjectSchema>;
