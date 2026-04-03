// ── Unified Compute Executor ────────────────────────────────────────
// Executes AI workloads on the tier chosen by the compute router.
// Routes to client (WebLLM/Transformers.js), edge (Workers AI), or
// cloud (Modal/OpenAI). Supports streaming on all tiers. Automatic
// retry with tier fallback on failure — never drops a request.

import type { ComputeTier } from "./compute-tier";
import type { ComputeRoutingDecision, ComputeTaskKind } from "./compute-router";

// ── Input / Output Types ───────────────────────────────────────────

/** A single message in a chat conversation. */
export interface ComputeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Input payload for the executor. */
export interface ComputeInput {
  /** The task kind (determines execution path). */
  kind: ComputeTaskKind;
  /** Chat messages for chat/summarization tasks. */
  messages?: ComputeMessage[] | undefined;
  /** Plain text input for embedding/classification/NER tasks. */
  text?: string | undefined;
  /** Labels for classification tasks. */
  labels?: string[] | undefined;
  /** Maximum tokens to generate (chat/summarization). */
  maxTokens?: number | undefined;
}

/** The result of a compute execution. */
export interface ComputeOutput {
  /** The tier that actually executed the workload. */
  executedOnTier: ComputeTier;
  /** The model that was used. */
  model: string;
  /** Text result (chat completions, summarization). */
  text?: string | undefined;
  /** Embedding vector result. */
  embedding?: Float32Array | undefined;
  /** Classification results. */
  classifications?: Array<{ label: string; score: number }> | undefined;
  /** Named entity results. */
  entities?: Array<{ entity: string; type: string; score: number }> | undefined;
  /** Execution time in milliseconds. */
  durationMs: number;
  /** Number of tiers attempted before success. */
  attemptsCount: number;
}

/** Callback for streaming token chunks. */
export type StreamCallback = (chunk: string) => void;

// ── Tier-Specific Handlers (Pluggable) ─────────────────────────────

/**
 * Handler interface for executing workloads on a specific tier.
 * Each tier provides its own implementation.
 */
export interface TierHandler {
  /** Execute a non-streaming workload. */
  execute(input: ComputeInput, model: string): Promise<TierResult>;
  /** Execute a streaming workload. Returns the full text when done. */
  executeStreaming(
    input: ComputeInput,
    model: string,
    onChunk: StreamCallback,
  ): Promise<TierResult>;
}

/** Raw result from a tier handler before wrapping. */
export interface TierResult {
  text?: string | undefined;
  embedding?: Float32Array | undefined;
  classifications?: Array<{ label: string; score: number }> | undefined;
  entities?: Array<{ entity: string; type: string; score: number }> | undefined;
}

// ── Executor Error ─────────────────────────────────────────────────

/**
 * Error thrown when all tiers in the fallback chain have been exhausted.
 * Contains the individual error from each tier attempt.
 */
export class ComputeExhaustionError extends Error {
  public readonly tierErrors: ReadonlyMap<ComputeTier, Error>;

  constructor(tierErrors: Map<ComputeTier, Error>) {
    const summary = Array.from(tierErrors.entries())
      .map(([tier, err]) => `  ${tier}: ${err.message}`)
      .join("\n");
    super(`All compute tiers exhausted. Errors:\n${summary}`);
    this.name = "ComputeExhaustionError";
    this.tierErrors = tierErrors;
  }
}

// ── Handler Registry ───────────────────────────────────────────────

const tierHandlers = new Map<ComputeTier, TierHandler>();

/**
 * Register a handler for a specific compute tier.
 * Call this at application startup to wire up the actual implementations.
 *
 * Example:
 * ```ts
 * registerTierHandler("client", clientGPUHandler);
 * registerTierHandler("edge", edgeWorkerHandler);
 * registerTierHandler("cloud", cloudGPUHandler);
 * ```
 */
export function registerTierHandler(
  tier: ComputeTier,
  handler: TierHandler,
): void {
  tierHandlers.set(tier, handler);
}

/**
 * Remove a previously registered tier handler.
 */
export function unregisterTierHandler(tier: ComputeTier): void {
  tierHandlers.delete(tier);
}

/**
 * Returns the handler for a tier, or undefined if not registered.
 */
function getHandler(tier: ComputeTier): TierHandler | undefined {
  return tierHandlers.get(tier);
}

// ── Core Executor ──────────────────────────────────────────────────

/**
 * Execute an AI workload on the tier selected by the compute router.
 * If the selected tier fails, automatically retries on the next tier
 * in the fallback chain. Never drops a request.
 *
 * @param decision - The routing decision from `routeComputation()`
 * @param input    - The input payload for the AI task
 * @returns The compute output including which tier actually executed
 * @throws {ComputeExhaustionError} if all tiers in the chain fail
 */
export async function executeOnTier(
  decision: ComputeRoutingDecision,
  input: ComputeInput,
): Promise<ComputeOutput> {
  return executeWithFallback(decision, input, false, undefined);
}

/**
 * Execute an AI workload with streaming. Streams token chunks via the
 * callback as they arrive. Falls back through the tier chain on failure.
 *
 * @param decision - The routing decision from `routeComputation()`
 * @param input    - The input payload for the AI task
 * @param onChunk  - Called with each text chunk as it streams in
 * @returns The compute output (text field contains full assembled response)
 * @throws {ComputeExhaustionError} if all tiers in the chain fail
 */
export async function executeOnTierStreaming(
  decision: ComputeRoutingDecision,
  input: ComputeInput,
  onChunk: StreamCallback,
): Promise<ComputeOutput> {
  return executeWithFallback(decision, input, true, onChunk);
}

/**
 * Internal: attempts execution on each tier in the fallback chain,
 * collecting errors as it goes. Returns the first successful result.
 */
async function executeWithFallback(
  decision: ComputeRoutingDecision,
  input: ComputeInput,
  streaming: boolean,
  onChunk: StreamCallback | undefined,
): Promise<ComputeOutput> {
  const tierErrors = new Map<ComputeTier, Error>();

  // Build ordered attempt list: selected tier first, then remaining fallbacks
  const attemptOrder = buildAttemptOrder(decision.tier, decision.fallbackChain);

  let attemptsCount = 0;

  for (const tier of attemptOrder) {
    attemptsCount++;
    const handler = getHandler(tier);

    if (handler === undefined) {
      tierErrors.set(tier, new Error(`No handler registered for tier "${tier}"`));
      continue;
    }

    const model = tier === decision.tier ? decision.model : getDefaultModelForTier(tier);
    const start = performance.now();

    try {
      let result: TierResult;

      if (streaming && onChunk !== undefined) {
        result = await handler.executeStreaming(input, model, onChunk);
      } else {
        result = await handler.execute(input, model);
      }

      const durationMs = Math.round(performance.now() - start);

      return {
        executedOnTier: tier,
        model,
        text: result.text,
        embedding: result.embedding,
        classifications: result.classifications,
        entities: result.entities,
        durationMs,
        attemptsCount,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      tierErrors.set(tier, error);
      // Continue to next tier in fallback chain
    }
  }

  throw new ComputeExhaustionError(tierErrors);
}

/**
 * Builds the ordered list of tiers to attempt: the primary tier first,
 * then remaining tiers from the fallback chain (deduped).
 */
function buildAttemptOrder(
  primary: ComputeTier,
  fallbackChain: readonly ComputeTier[],
): ComputeTier[] {
  const seen = new Set<ComputeTier>();
  const order: ComputeTier[] = [];

  // Primary first
  order.push(primary);
  seen.add(primary);

  // Then the rest of the fallback chain
  for (const tier of fallbackChain) {
    if (!seen.has(tier)) {
      order.push(tier);
      seen.add(tier);
    }
  }

  // Ensure cloud is always in the chain as final fallback
  if (!seen.has("cloud")) {
    order.push("cloud");
  }

  return order;
}

/** Default model IDs per tier (mirrors compute-router constants). */
const DEFAULT_TIER_MODELS: Record<ComputeTier, string> = {
  client: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
  edge: "gpt-4o-mini",
  cloud: "gpt-4o",
};

function getDefaultModelForTier(tier: ComputeTier): string {
  return DEFAULT_TIER_MODELS[tier];
}
