// ── Reviewer Node ────────────────────────────────────────────────
// Validates executor results against the original user intent.
// Produces a quality score and decides: accept, retry, or replan.

import { generateObject } from "ai";
import { getModelForTier, getDefaultModel } from "../../providers";
import { ReviewVerdictSchema, type AgentState, type AgentConfig, type AgentEvent } from "../types";

// ── Reviewer System Prompt ───────────────────────────────────────

const REVIEWER_SYSTEM_PROMPT = `You are the Reviewer agent in the Cronix AI orchestration system.
Your job is to evaluate execution results against the original user request.

## Your Responsibilities
1. Check if the results fully satisfy the user's intent.
2. Identify any issues, missing pieces, or errors.
3. Score the quality from 0.0 (complete failure) to 1.0 (perfect).
4. Decide the next action:
   - "accept": Results are good enough. Proceed to response.
   - "retry": Some steps failed but the plan is sound. Re-execute failed steps.
   - "replan": The plan itself was wrong. Need a new plan.

## Scoring Guidelines
- 0.0-0.3: Major failures. Most steps failed or results are irrelevant.
- 0.3-0.6: Partial success. Some useful results but gaps remain.
- 0.6-0.8: Good. Results address the request with minor issues.
- 0.8-1.0: Excellent. Results fully satisfy the request.

## Rules
- If quality score >= 0.7 and no critical errors, recommend "accept".
- If quality score >= 0.4 and retry count is below max, recommend "retry".
- If quality score < 0.4, recommend "replan".
- Always list specific issues, even if recommending "accept".
`;

// ── Reviewer Node Function ───────────────────────────────────────

export async function reviewerNode(
  state: AgentState,
  config: AgentConfig,
): Promise<Partial<AgentState>> {
  const emit = config.onEvent;

  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  // Build context for the reviewer
  const userRequest = state.messages
    .filter((m: { role: string; content: string }) => m.role === "user")
    .map((m: { role: string; content: string }) => m.content)
    .join("\n");

  const planSummary = state.plan
    ? state.plan.map((s: { id: string; action: string; tool: string }) => `- [${s.id}] ${s.action} (tool: ${s.tool})`).join("\n")
    : "No plan";

  const resultsSummary = state.results
    .map((r: { success: boolean; stepId: string; output?: unknown; error?: string; durationMs: number }) => {
      if (r.success) {
        const outputStr =
          typeof r.output === "string"
            ? r.output.slice(0, 500)
            : JSON.stringify(r.output).slice(0, 500);
        return `- [${r.stepId}] SUCCESS (${r.durationMs.toFixed(0)}ms): ${outputStr}`;
      }
      return `- [${r.stepId}] FAILED: ${r.error}`;
    })
    .join("\n");

  const errorsSummary =
    state.errors.length > 0 ? `\nErrors:\n${state.errors.join("\n")}` : "";

  const { object: verdict } = await generateObject({
    model,
    schema: ReviewVerdictSchema,
    system: REVIEWER_SYSTEM_PROMPT,
    prompt: `## User Request
${userRequest}

## Execution Plan
${planSummary}

## Results
${resultsSummary}
${errorsSummary}

## Retry Count
${state.retryCount} of ${state.maxRetries} max retries used.

Evaluate these results and provide your verdict.`,
    temperature: config.temperature ?? 0.2,
  });

  const event: AgentEvent = {
    type: "review_completed",
    verdict,
    timestamp: Date.now(),
  };
  emit?.(event);

  // Determine next step based on verdict
  if (verdict.action === "accept") {
    return {
      currentStep: "responding",
      review: verdict,
    };
  }

  if (verdict.action === "retry" && state.retryCount < state.maxRetries) {
    return {
      currentStep: "executing",
      review: verdict,
      retryCount: state.retryCount + 1,
      // Keep only failed steps in the plan for retry
      plan: state.plan?.filter((step: { id: string }) => {
        const result = state.results.find((r: { stepId: string }) => r.stepId === step.id);
        return !result || !result.success;
      }) ?? null,
      // Clear failed results so executor re-runs them
      results: state.results.filter((r: { success: boolean }) => r.success),
      errors: [],
    };
  }

  if (verdict.action === "replan" && state.retryCount < state.maxRetries) {
    return {
      currentStep: "planning",
      review: verdict,
      retryCount: state.retryCount + 1,
      plan: null,
      results: [],
      errors: verdict.issues,
    };
  }

  // Max retries exceeded -- force respond with what we have
  return {
    currentStep: "responding",
    review: verdict,
  };
}
