// ── Responder Node ───────────────────────────────────────────────
// Formats the final output for the user based on execution results.
// Supports text, UI component, and code output types.
// Designed for streaming -- emits output events as content is generated.

import { streamText } from "ai";
import { getModelForTier, getDefaultModel } from "../../providers";
import type { AgentState, AgentConfig, AgentEvent } from "../types";

// ── Responder System Prompt ─────────────────────────────────────

const RESPONDER_SYSTEM_PROMPT = `You are the Responder agent in the Cronix AI orchestration system.
Your job is to synthesize execution results into a clear, helpful response for the user.

## Your Responsibilities
1. Summarize what was accomplished based on the execution results.
2. Present results in a clear, structured format.
3. Highlight any partial failures or issues the user should know about.
4. If the results include generated components, describe them clearly.
5. If the results include search results, present the most relevant findings.

## Output Format
- Be concise but complete.
- Use markdown formatting for readability.
- If components were generated, describe their structure and how to use them.
- If errors occurred, explain what went wrong and suggest alternatives.
- Never fabricate results -- only report what the execution actually produced.
`;

// ── Responder Node Function ─────────────────────────────────────

export async function responderNode(
  state: AgentState,
  config: AgentConfig,
): Promise<Partial<AgentState>> {
  const emit = config.onEvent;

  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  // Build context for the responder
  const userRequest = state.messages
    .filter((m: { role: string; content: string }) => m.role === "user")
    .map((m: { role: string; content: string }) => m.content)
    .join("\n");

  const resultsSummary = state.results
    .map((r: { success: boolean; stepId: string; output?: unknown; error?: string; durationMs: number }) => {
      if (r.success) {
        const outputStr =
          typeof r.output === "string"
            ? r.output
            : JSON.stringify(r.output, null, 2);
        return `### Step: ${r.stepId} (SUCCESS, ${r.durationMs.toFixed(0)}ms)\n${outputStr}`;
      }
      return `### Step: ${r.stepId} (FAILED)\nError: ${r.error}`;
    })
    .join("\n\n");

  const reviewSummary = state.review
    ? `Quality Score: ${state.review.qualityScore}/1.0\nIssues: ${state.review.issues.length > 0 ? state.review.issues.join(", ") : "None"}`
    : "No review available";

  const prompt = `## User Request
${userRequest}

## Execution Results
${resultsSummary}

## Review Summary
${reviewSummary}

Synthesize these results into a clear, helpful response for the user.`;

  // Stream the response and collect it
  const result = streamText({
    model,
    system: RESPONDER_SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.5,
  });

  // Collect streamed chunks into final output
  const chunks: string[] = [];

  for await (const chunk of result.textStream) {
    chunks.push(chunk);

    const event: AgentEvent = {
      type: "output",
      content: chunk,
      timestamp: Date.now(),
    };
    emit?.(event);
  }

  const finalOutput = chunks.join("");

  const completeEvent: AgentEvent = {
    type: "complete",
    finalOutput,
    timestamp: Date.now(),
  };
  emit?.(completeEvent);

  return {
    currentStep: "complete",
    output: finalOutput,
    messages: [
      ...state.messages,
      {
        role: "assistant" as const,
        content: finalOutput,
      },
    ],
  };
}
