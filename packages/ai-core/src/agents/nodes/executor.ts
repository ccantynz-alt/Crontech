// ── Executor Node ────────────────────────────────────────────────
// Executes plan steps, respecting dependency ordering.
// Independent steps run in parallel. Results and errors are captured per step.

import { allTools, type ToolName } from "../../tools";
import type { AgentState, AgentConfig, AgentEvent, StepResult, PlanStep } from "../types";

// ── Step Execution ───────────────────────────────────────────────

async function executeStep(
  step: PlanStep,
  config: AgentConfig,
  previousResults: Map<string, StepResult>,
): Promise<StepResult> {
  const start = performance.now();

  // Check if tool requires approval
  if (config.requireApprovalFor?.includes(step.tool)) {
    return {
      stepId: step.id,
      success: false,
      error: `Tool "${step.tool}" requires human approval before execution`,
      durationMs: performance.now() - start,
    };
  }

  // Validate tool exists
  if (!(step.tool in allTools)) {
    return {
      stepId: step.id,
      success: false,
      error: `Unknown tool: "${step.tool}". Available tools: ${Object.keys(allTools).join(", ")}`,
      durationMs: performance.now() - start,
    };
  }

  const toolFn = allTools[step.tool as ToolName];

  try {
    // Resolve any references to previous step outputs in args
    const resolvedArgs = resolveArgs(step.args, previousResults);

    // Execute the tool
    const output = await toolFn.execute(resolvedArgs, {
      toolCallId: step.id,
      messages: [],
    });

    return {
      stepId: step.id,
      success: true,
      output,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Step execution failed";
    return {
      stepId: step.id,
      success: false,
      error: message,
      durationMs: performance.now() - start,
    };
  }
}

/**
 * Resolves argument values that reference outputs from previous steps.
 * Convention: a string value like "$ref:step-id" pulls the output from that step.
 */
function resolveArgs(
  args: Record<string, unknown>,
  previousResults: Map<string, StepResult>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("$ref:")) {
      const refStepId = value.slice(5);
      const refResult = previousResults.get(refStepId);
      if (refResult?.success && refResult.output !== undefined) {
        resolved[key] = refResult.output;
      } else {
        resolved[key] = value; // Keep original if ref not found
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

// ── Topological Sort for Dependency-Aware Execution ──────────────

function getExecutionBatches(steps: PlanStep[]): PlanStep[][] {
  const batches: PlanStep[][] = [];
  const completed = new Set<string>();
  const remaining = [...steps];

  while (remaining.length > 0) {
    const batch: PlanStep[] = [];
    const nextRemaining: PlanStep[] = [];

    for (const step of remaining) {
      const depsResolved = step.dependsOn.every((dep: string) => completed.has(dep));
      if (depsResolved) {
        batch.push(step);
      } else {
        nextRemaining.push(step);
      }
    }

    if (batch.length === 0) {
      // Circular dependency or missing dependency -- execute remaining sequentially
      for (const step of nextRemaining) {
        batches.push([step]);
        completed.add(step.id);
      }
      break;
    }

    batches.push(batch);
    for (const step of batch) {
      completed.add(step.id);
    }

    remaining.length = 0;
    remaining.push(...nextRemaining);
  }

  return batches;
}

// ── Executor Node Function ───────────────────────────────────────

export async function executorNode(
  state: AgentState,
  config: AgentConfig,
): Promise<Partial<AgentState>> {
  const emit = config.onEvent;
  const plan = state.plan;

  if (!plan || plan.length === 0) {
    return {
      currentStep: "error",
      errors: [...state.errors, "No plan to execute"],
    };
  }

  const results: StepResult[] = [];
  const resultMap = new Map<string, StepResult>();
  const errors: string[] = [];

  const batches = getExecutionBatches(plan);

  for (const batch of batches) {
    // Emit start events for all steps in this batch
    for (const step of batch) {
      const startEvent: AgentEvent = {
        type: "step_started",
        stepId: step.id,
        action: step.action,
        timestamp: Date.now(),
      };
      emit?.(startEvent);
    }

    // Execute all steps in the batch in parallel
    const batchResults = await Promise.all(
      batch.map((step) => executeStep(step, config, resultMap)),
    );

    // Process results
    for (const result of batchResults) {
      results.push(result);
      resultMap.set(result.stepId, result);

      const completedEvent: AgentEvent = {
        type: "step_completed",
        result,
        timestamp: Date.now(),
      };
      emit?.(completedEvent);

      if (!result.success && result.error) {
        errors.push(`Step "${result.stepId}" failed: ${result.error}`);
      }
    }
  }

  return {
    currentStep: "reviewing",
    results: [...state.results, ...results],
    errors: [...state.errors, ...errors],
  };
}
