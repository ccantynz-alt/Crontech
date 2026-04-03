// ── Multi-Agent Orchestrator ──────────────────────────────────────
// LangGraph-based multi-agent orchestration for complex AI workflows.
// Three agents collaborate: Planner -> Builder -> Reviewer.
// The graph conditionally loops back to Builder if review fails.

import {
  Annotation,
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";
import {
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import { generateObject, generateText } from "ai";
import { ComponentSchema } from "@back-to-the-future/schemas";
import { getDefaultModel, type AIProviderEnv } from "../providers";
import { allTools } from "../tools";
import { type ApprovalGate } from "../approval";

// ── State Schema ─────────────────────────────────────────────────

/**
 * Zod schema for a single plan step produced by the PlannerAgent.
 */
const PlanStepSchema = z.object({
  step: z.number().describe("Step number"),
  action: z.string().describe("What to do in this step"),
  componentType: z
    .string()
    .optional()
    .describe("Component type to generate, if applicable"),
  details: z.string().describe("Detailed instructions for the builder"),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

/**
 * Zod schema for the plan object.
 */
const PlanSchema = z.object({
  goal: z.string().describe("The high-level goal derived from user intent"),
  steps: z.array(PlanStepSchema).describe("Ordered steps to achieve the goal"),
});

export type Plan = z.infer<typeof PlanSchema>;

/**
 * Zod schema for a review result from the ReviewerAgent.
 */
const ReviewResultSchema = z.object({
  approved: z.boolean().describe("Whether the output passes review"),
  score: z
    .number()
    .min(0)
    .max(100)
    .describe("Quality score from 0 to 100"),
  issues: z
    .array(
      z.object({
        severity: z.enum(["error", "warning", "info"]),
        message: z.string(),
        component: z.string().optional(),
      }),
    )
    .describe("List of issues found during review"),
  suggestions: z
    .array(z.string())
    .describe("Suggestions for improvement"),
  accessibilityPassed: z
    .boolean()
    .describe("Whether accessibility checks passed"),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/**
 * Status of the orchestrator pipeline.
 */
export type OrchestratorStatus =
  | "planning"
  | "building"
  | "reviewing"
  | "completed"
  | "failed";

/**
 * LangGraph state annotation for the orchestrator.
 * Each field uses a reducer to define how concurrent updates merge.
 */
const OrchestratorState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  plan: Annotation<Plan | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  components: Annotation<z.infer<typeof ComponentSchema>[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  review: Annotation<ReviewResult | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  status: Annotation<OrchestratorStatus>({
    reducer: (_current, update) => update,
    default: () => "planning" as OrchestratorStatus,
  }),
  retryCount: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
});

type OrchestratorStateType = typeof OrchestratorState.State;

// ── Configuration ────────────────────────────────────────────────

export interface OrchestratorConfig {
  providerEnv?: AIProviderEnv;
  maxRetries?: number;
  qualityThreshold?: number;
  approvalGate?: ApprovalGate;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_QUALITY_THRESHOLD = 70;

// ── Agent Node: Planner ──────────────────────────────────────────

const PLANNER_SYSTEM_PROMPT = `You are the Planner Agent in a multi-agent website building system.
Your job is to analyze user intent and create a detailed, step-by-step plan for building UI components.

Rules:
1. Break down the user's request into discrete, actionable steps.
2. Each step should specify which component type to use (Button, Input, Card, Stack, Text, Modal, Badge, Alert, Avatar, Tabs, Select, Textarea, Spinner, Tooltip, Separator).
3. Consider layout structure: use Stack for grouping, Card for containers.
4. Keep plans concise -- no more than 10 steps for a single page.
5. Think about hierarchy: outer layout first, then inner components.
6. Consider accessibility: headings, labels, and semantic structure.`;

function createPlannerNode(config: OrchestratorConfig) {
  return async (
    state: OrchestratorStateType,
  ): Promise<Partial<OrchestratorStateType>> => {
    const model = getDefaultModel(config.providerEnv);

    const userMessage =
      state.messages.length > 0
        ? state.messages[state.messages.length - 1]
        : null;
    const userIntent =
      typeof userMessage?.content === "string"
        ? userMessage.content
        : "Build a default page";

    const { object: plan } = await generateObject({
      model,
      schema: PlanSchema,
      system: PLANNER_SYSTEM_PROMPT,
      prompt: `Create a step-by-step plan for the following request:\n\n${userIntent}`,
      temperature: 0.7,
    });

    return {
      plan,
      status: "building",
      messages: [
        new AIMessage(
          `Plan created with ${plan.steps.length} steps: ${plan.goal}`,
        ),
      ],
    };
  };
}

// ── Agent Node: Builder ──────────────────────────────────────────

const BUILDER_SYSTEM_PROMPT = `You are the Builder Agent in a multi-agent website building system.
You receive a plan and execute each step by generating UI components.

Rules:
1. Follow the plan exactly -- do not skip or reorder steps.
2. Use the generateComponent tool for each component.
3. Use the searchContent tool if the plan references existing content.
4. Ensure proper nesting: Stack and Card support children. Button, Input, Text do not.
5. Generate valid component configurations that pass schema validation.`;

function createBuilderNode(config: OrchestratorConfig) {
  return async (
    state: OrchestratorStateType,
  ): Promise<Partial<OrchestratorStateType>> => {
    const model = getDefaultModel(config.providerEnv);
    const plan = state.plan;

    if (!plan) {
      return {
        status: "failed",
        messages: [new AIMessage("Builder: No plan available. Cannot proceed.")],
      };
    }

    // If an approval gate is configured, request approval before building
    if (config.approvalGate) {
      const stepSummary = plan.steps
        .map((s) => `${s.action}${s.componentType ? ` (${s.componentType})` : ""}`)
        .join(", ");

      const decision = await config.approvalGate.requestApproval(
        "build_components",
        "generateComponent",
        { goal: plan.goal, stepCount: plan.steps.length, steps: stepSummary },
        `Build ${plan.steps.length} component(s) for: ${plan.goal}`,
      );

      if (!decision.approved) {
        return {
          status: "failed",
          messages: [
            new AIMessage(
              `Builder: Build rejected by ${decision.approvedBy}. Reason: ${decision.reason ?? "No reason provided"}`,
            ),
          ],
        };
      }
    }

    // Build a prompt that includes the plan steps and any review feedback
    const reviewFeedback =
      state.review && !state.review.approved
        ? `\n\nPrevious review feedback to address:\n${state.review.issues
            .map((i) => `- [${i.severity}] ${i.message}`)
            .join("\n")}\n\nSuggestions:\n${state.review.suggestions.map((s) => `- ${s}`).join("\n")}`
        : "";

    const planDescription = plan.steps
      .map(
        (s) =>
          `Step ${s.step}: ${s.action}${s.componentType ? ` (${s.componentType})` : ""} - ${s.details}`,
      )
      .join("\n");

    const { text } = await generateText({
      model,
      system: BUILDER_SYSTEM_PROMPT,
      tools: allTools,
      maxRetries: plan.steps.length + 2,
      prompt: `Execute the following plan by generating components:\n\nGoal: ${plan.goal}\n\n${planDescription}${reviewFeedback}`,
      temperature: 0.5,
    });

    // Collect generated components from tool call results
    const generatedComponents: z.infer<typeof ComponentSchema>[] = [];

    // For each step that specifies a component, validate and add to output
    for (const step of plan.steps) {
      if (step.componentType) {
        const parsed = ComponentSchema.safeParse({
          component: step.componentType,
          props: {},
        });
        if (parsed.success) {
          generatedComponents.push(parsed.data);
        }
      }
    }

    return {
      components: generatedComponents,
      status: "reviewing",
      messages: [
        new AIMessage(
          `Builder: Generated ${generatedComponents.length} components. ${text}`,
        ),
      ],
    };
  };
}

// ── Agent Node: Reviewer ─────────────────────────────────────────

const REVIEWER_SYSTEM_PROMPT = `You are the Reviewer Agent in a multi-agent website building system.
You review generated UI components for quality, accessibility, and correctness.

Evaluate:
1. Component validity: Are all components properly configured with valid props?
2. Layout structure: Is the component hierarchy logical and well-organized?
3. Accessibility: Do interactive elements have labels? Is heading hierarchy correct?
4. Completeness: Does the output fulfill the original plan?
5. Quality: Are there redundant components? Missing essential elements?

Be strict but fair. Set approved=true only if the quality score is above the threshold.`;

function createReviewerNode(config: OrchestratorConfig) {
  const threshold = config.qualityThreshold ?? DEFAULT_QUALITY_THRESHOLD;

  return async (
    state: OrchestratorStateType,
  ): Promise<Partial<OrchestratorStateType>> => {
    const model = getDefaultModel(config.providerEnv);

    const componentSummary = state.components
      .map(
        (c, i) =>
          `${i + 1}. ${c.component} - ${JSON.stringify(c.props)}`,
      )
      .join("\n");

    const planSummary = state.plan
      ? `Goal: ${state.plan.goal}\nSteps: ${state.plan.steps.length}`
      : "No plan available";

    const { object: review } = await generateObject({
      model,
      schema: ReviewResultSchema,
      system: REVIEWER_SYSTEM_PROMPT,
      prompt: `Review the following generated components against the plan.

Plan:
${planSummary}

Generated Components (${state.components.length}):
${componentSummary || "No components generated."}

Quality threshold for approval: ${threshold}/100.
Set approved=true only if the score meets or exceeds the threshold.`,
      temperature: 0.3,
    });

    const statusUpdate: OrchestratorStatus = review.approved
      ? "completed"
      : "building";

    return {
      review,
      status: statusUpdate,
      retryCount: review.approved
        ? state.retryCount
        : state.retryCount + 1,
      messages: [
        new AIMessage(
          `Reviewer: Score ${review.score}/100. ${review.approved ? "APPROVED" : "NEEDS REVISION"}. ${review.issues.length} issue(s) found.`,
        ),
      ],
    };
  };
}

// ── Conditional Edge: Review Router ──────────────────────────────

function createReviewRouter(config: OrchestratorConfig) {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

  return (state: OrchestratorStateType): typeof END | "builder" => {
    // If review passed, we are done
    if (state.review?.approved) {
      return END;
    }

    // If we have exhausted retries, end anyway
    if (state.retryCount >= maxRetries) {
      return END;
    }

    // Otherwise, send back to builder for revision
    return "builder";
  };
}

// ── Graph Factory ────────────────────────────────────────────────

/**
 * Creates a compiled LangGraph orchestrator graph.
 *
 * Flow: START -> planner -> builder -> reviewer -> (builder | END)
 */
export function createOrchestratorGraph(
  config?: OrchestratorConfig,
) {
  const providerEnv = config?.providerEnv;
  const resolvedConfig: Required<Pick<OrchestratorConfig, "maxRetries" | "qualityThreshold">> & Pick<OrchestratorConfig, "providerEnv" | "approvalGate"> = {
    maxRetries: config?.maxRetries ?? DEFAULT_MAX_RETRIES,
    qualityThreshold: config?.qualityThreshold ?? DEFAULT_QUALITY_THRESHOLD,
    ...(providerEnv ? { providerEnv } : {}),
    ...(config?.approvalGate ? { approvalGate: config.approvalGate } : {}),
  };

  const graph = new StateGraph(OrchestratorState)
    .addNode("planner", createPlannerNode(resolvedConfig))
    .addNode("builder", createBuilderNode(resolvedConfig))
    .addNode("reviewer", createReviewerNode(resolvedConfig))
    .addEdge(START, "planner")
    .addEdge("planner", "builder")
    .addEdge("builder", "reviewer")
    .addConditionalEdges("reviewer", createReviewRouter(resolvedConfig));

  return graph.compile();
}

// ── Public Runner ────────────────────────────────────────────────

/**
 * The result of a full orchestrator run.
 */
export interface OrchestratorResult {
  plan: Plan | null;
  components: z.infer<typeof ComponentSchema>[];
  review: ReviewResult | null;
  status: OrchestratorStatus;
  messages: BaseMessage[];
}

/**
 * Run the full multi-agent orchestrator pipeline.
 *
 * Takes a user intent string, plans the work, builds components,
 * reviews them, and optionally loops back for revisions.
 *
 * @param input - Natural language description of what to build
 * @param config - Optional configuration for providers, retries, quality threshold
 * @returns The final orchestrator state with plan, components, review, and messages
 */
export async function runOrchestrator(
  input: string,
  config?: OrchestratorConfig,
): Promise<OrchestratorResult> {
  const graph = createOrchestratorGraph(config);

  const finalState = (await graph.invoke({
    messages: [new HumanMessage(input)],
    plan: null,
    components: [],
    review: null,
    status: "planning" as OrchestratorStatus,
    retryCount: 0,
  })) as OrchestratorStateType;

  return {
    plan: finalState.plan ?? null,
    components: finalState.components ?? [],
    review: finalState.review ?? null,
    status: finalState.status ?? "failed",
    messages: finalState.messages ?? [],
  };
}

// ── Exports ──────────────────────────────────────────────────────

export {
  OrchestratorState,
  PlanSchema,
  PlanStepSchema,
  ReviewResultSchema,
  PLANNER_SYSTEM_PROMPT,
  BUILDER_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
};
