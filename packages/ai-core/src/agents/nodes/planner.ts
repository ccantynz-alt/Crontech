// ── Planner Node ─────────────────────────────────────────────────
// Takes user intent + context and produces a structured execution plan.
// The plan defines what tools to call, in what order, and with what args.

import { generateObject } from "ai";
import { z } from "zod";
import { getModelForTier, getDefaultModel } from "../../providers";
import { allTools } from "../../tools";
import type { AgentState, AgentConfig, AgentEvent, PlanStep } from "../types";
import { PlanStepSchema } from "../types";

// ── Plan Output Schema ───────────────────────────────────────────

const PlanOutputSchema = z.object({
  reasoning: z.string().describe("Brief explanation of the planning decisions"),
  steps: z
    .array(PlanStepSchema)
    .min(1)
    .describe("Ordered list of execution steps"),
});

// ── System Prompt ────────────────────────────────────────────────

function buildPlannerPrompt(): string {
  const toolDescriptions = Object.entries(allTools)
    .map(([name, t]) => `- **${name}**: ${t.description}`)
    .join("\n");

  return `You are the Planner agent in the Cronix AI orchestration system.
Your job is to analyze the user's request and create an execution plan.

## Available Tools
${toolDescriptions}

## Rules
1. Break the request into discrete, actionable steps.
2. Each step must use one of the available tools.
3. Use the "dependsOn" field to express dependencies between steps.
4. Steps without dependencies can run in parallel.
5. Keep plans concise -- minimize steps while covering the full request.
6. The "args" field must match the tool's input schema.
7. Each step needs a unique "id" (use short descriptive names like "search-1", "generate-hero").

## Important
- If the request is simple (single tool call), create a single-step plan.
- If the request requires multiple tools, chain them with dependencies.
- Always validate that tool names match the available tools exactly.
`;
}

// ── Planner Node Function ────────────────────────────────────────

export async function plannerNode(
  state: AgentState,
  config: AgentConfig,
): Promise<Partial<AgentState>> {
  const emit = config.onEvent;

  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  // Extract user messages for context
  const userMessages = state.messages
    .filter((m: { role: string; content: string }) => m.role === "user")
    .map((m: { role: string; content: string }) => m.content)
    .join("\n");

  // If this is a replan (retry), include previous errors
  const errorContext =
    state.errors.length > 0
      ? `\n\n## Previous Errors (replan requested)\n${state.errors.join("\n")}`
      : "";

  const { object } = await generateObject({
    model,
    schema: PlanOutputSchema,
    prompt: `${buildPlannerPrompt()}${errorContext}

## User Request
${userMessages}

Create an execution plan to fulfill this request.`,
    temperature: config.temperature ?? 0.3,
  });

  const plan: PlanStep[] = object.steps;

  const event: AgentEvent = {
    type: "plan_created",
    plan,
    timestamp: Date.now(),
  };
  emit?.(event);

  return {
    currentStep: "executing",
    plan,
    messages: [
      ...state.messages,
      {
        role: "assistant" as const,
        content: `Plan created: ${object.reasoning}`,
      },
    ],
  };
}
