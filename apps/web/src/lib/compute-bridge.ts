// ── Client-Side Compute Bridge ──────────────────────────────────────
// Bridges the browser to the three-tier compute system.
// Detects device capabilities, requests routing decisions, executes
// client-side inference when routed locally, and falls back to API
// calls for edge/cloud tiers. Uses SolidJS signals for reactive status.

import { createSignal } from "solid-js";
import { detectDeviceCapabilities } from "./device-capabilities";
import {
  initWebLLM,
  chatWithWebLLM,
  streamChatWithWebLLM,
  isWebLLMSupported,
} from "./webllm-engine";
import {
  generateEmbedding,
  classifyText,
  summarizeText,
  extractEntities,
} from "./transformers-engine";
import type {
  DeviceCapabilities,
  ComputeTier,
  ComputeTask,
  ComputeRoutingDecision,
} from "@back-to-the-future/ai-core";

// ── Status Signals ─────────────────────────────────────────────────

/** Current status of the compute bridge. */
export type ComputeBridgeStatus =
  | "idle"
  | "detecting"
  | "routing"
  | "loading-model"
  | "executing"
  | "streaming"
  | "complete"
  | "error";

/** Progress info during model loading or inference. */
export interface ComputeProgress {
  status: ComputeBridgeStatus;
  tier: ComputeTier | null;
  message: string;
  /** 0-1 progress for model loading; -1 when indeterminate. */
  progress: number;
}

const [bridgeStatus, setBridgeStatus] = createSignal<ComputeProgress>({
  status: "idle",
  tier: null,
  message: "Ready",
  progress: -1,
});

/** Reactive signal exposing the current compute bridge status. */
export { bridgeStatus };

// ── Cached Capabilities ────────────────────────────────────────────

let cachedCapabilities: DeviceCapabilities | null = null;

/**
 * Detect and cache device capabilities. Only runs the detection once;
 * subsequent calls return the cached result.
 */
export async function getDeviceCapabilities(): Promise<DeviceCapabilities> {
  if (cachedCapabilities !== null) return cachedCapabilities;

  setBridgeStatus({
    status: "detecting",
    tier: null,
    message: "Detecting device capabilities...",
    progress: -1,
  });

  cachedCapabilities = await detectDeviceCapabilities();

  setBridgeStatus({
    status: "idle",
    tier: null,
    message: "Device capabilities detected",
    progress: -1,
  });

  return cachedCapabilities;
}

/**
 * Force a re-detection of device capabilities (e.g., after a GPU
 * context loss or browser capability change).
 */
export async function refreshCapabilities(): Promise<DeviceCapabilities> {
  cachedCapabilities = null;
  return getDeviceCapabilities();
}

// ── WebLLM Engine Cache ────────────────────────────────────────────

import type { MLCEngine } from "@mlc-ai/web-llm";

let webLLMEngine: MLCEngine | null = null;
let webLLMModelId: string | null = null;

/**
 * Get or initialize the WebLLM engine for client-side chat inference.
 * The engine is cached — subsequent calls with the same model return
 * the existing instance.
 */
async function getWebLLMEngine(modelId: string): Promise<MLCEngine> {
  if (webLLMEngine !== null && webLLMModelId === modelId) {
    return webLLMEngine;
  }

  setBridgeStatus({
    status: "loading-model",
    tier: "client",
    message: `Loading model ${modelId}...`,
    progress: 0,
  });

  webLLMEngine = await initWebLLM({
    modelId,
    onProgress: (p) => {
      setBridgeStatus({
        status: "loading-model",
        tier: "client",
        message: p.text,
        progress: p.progress,
      });
    },
  });

  webLLMModelId = modelId;
  return webLLMEngine;
}

// ── Routing ────────────────────────────────────────────────────────

/**
 * Request a routing decision from the server.
 * Sends device capabilities + task description; receives which tier
 * to use and which model to load.
 *
 * @param task - The compute task to route
 * @param apiBase - Base URL for the API (defaults to "/api")
 */
export async function requestRouting(
  task: ComputeTask,
  apiBase = "/api",
): Promise<ComputeRoutingDecision> {
  const capabilities = await getDeviceCapabilities();

  setBridgeStatus({
    status: "routing",
    tier: null,
    message: "Requesting compute routing decision...",
    progress: -1,
  });

  const response = await fetch(`${apiBase}/compute/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, capabilities }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[compute-bridge] Routing request failed (${response.status}): ${errorText}`,
    );
  }

  const decision = (await response.json()) as ComputeRoutingDecision;

  setBridgeStatus({
    status: "idle",
    tier: decision.tier,
    message: `Routed to ${decision.tier}: ${decision.reason}`,
    progress: -1,
  });

  return decision;
}

/**
 * Perform client-side routing without a server round-trip.
 * Uses the local routeComputation function from ai-core.
 * Useful when offline or for latency-sensitive decisions.
 */
export async function routeLocally(
  task: ComputeTask,
): Promise<ComputeRoutingDecision> {
  const capabilities = await getDeviceCapabilities();

  // Dynamic import to keep the router code tree-shakeable
  const { routeComputation } = await import(
    "@back-to-the-future/ai-core/compute-router"
  );

  return routeComputation(task, capabilities);
}

// ── Chat Message Type ──────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Execution ──────────────────────────────────────────────────────

/** Result from a compute bridge execution. */
export interface BridgeResult {
  /** The tier that actually executed the workload. */
  tier: ComputeTier;
  /** Text result (chat/summarization). */
  text?: string | undefined;
  /** Embedding vector. */
  embedding?: Float32Array | undefined;
  /** Classification results. */
  classifications?: Array<{ label: string; score: number }> | undefined;
  /** Named entities. */
  entities?: Array<{ entity: string; type: string; score: number }> | undefined;
  /** Execution duration in ms. */
  durationMs: number;
}

/**
 * Execute an AI workload based on a routing decision.
 * If routed to client tier, runs inference locally.
 * If routed to edge/cloud, calls the API and lets the server handle it.
 *
 * @param decision - Routing decision from `requestRouting()` or `routeLocally()`
 * @param input    - Input data for the AI task
 * @param apiBase  - Base URL for the API (defaults to "/api")
 */
export async function executeBridge(
  decision: ComputeRoutingDecision,
  input: BridgeInput,
  apiBase = "/api",
): Promise<BridgeResult> {
  const start = performance.now();

  // Try the decided tier; fall back through the chain on failure
  const tiersToTry = [decision.tier, ...decision.fallbackChain.filter((t) => t !== decision.tier)];
  const errors: Array<{ tier: ComputeTier; error: Error }> = [];

  for (const tier of tiersToTry) {
    try {
      setBridgeStatus({
        status: "executing",
        tier,
        message: `Executing on ${tier}...`,
        progress: -1,
      });

      let result: BridgeResult;

      if (tier === "client") {
        result = await executeClientSide(input, decision.model, start);
      } else {
        result = await executeServerSide(tier, decision, input, apiBase, start);
      }

      setBridgeStatus({
        status: "complete",
        tier: result.tier,
        message: `Completed on ${result.tier} in ${result.durationMs}ms`,
        progress: 1,
      });

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ tier, error });
      // Continue to next tier
    }
  }

  const errorSummary = errors
    .map((e) => `${e.tier}: ${e.error.message}`)
    .join("; ");

  setBridgeStatus({
    status: "error",
    tier: null,
    message: `All tiers failed: ${errorSummary}`,
    progress: -1,
  });

  throw new Error(`[compute-bridge] All tiers exhausted. ${errorSummary}`);
}

/**
 * Execute with streaming. Streams tokens via callback for client and
 * server tiers. Falls back through the chain on failure.
 */
export async function executeBridgeStreaming(
  decision: ComputeRoutingDecision,
  input: BridgeInput,
  onChunk: (text: string) => void,
  apiBase = "/api",
): Promise<BridgeResult> {
  const start = performance.now();
  const tiersToTry = [decision.tier, ...decision.fallbackChain.filter((t) => t !== decision.tier)];
  const errors: Array<{ tier: ComputeTier; error: Error }> = [];

  for (const tier of tiersToTry) {
    try {
      setBridgeStatus({
        status: "streaming",
        tier,
        message: `Streaming from ${tier}...`,
        progress: -1,
      });

      let result: BridgeResult;

      if (tier === "client") {
        result = await executeClientSideStreaming(input, decision.model, onChunk, start);
      } else {
        result = await executeServerSideStreaming(tier, decision, input, onChunk, apiBase, start);
      }

      setBridgeStatus({
        status: "complete",
        tier: result.tier,
        message: `Streaming complete on ${result.tier} in ${result.durationMs}ms`,
        progress: 1,
      });

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ tier, error });
    }
  }

  const errorSummary = errors
    .map((e) => `${e.tier}: ${e.error.message}`)
    .join("; ");

  setBridgeStatus({
    status: "error",
    tier: null,
    message: `All tiers failed: ${errorSummary}`,
    progress: -1,
  });

  throw new Error(`[compute-bridge] All tiers exhausted (streaming). ${errorSummary}`);
}

// ── Bridge Input ───────────────────────────────────────────────────

/** Input payload for the compute bridge. */
export interface BridgeInput {
  /** Task kind (determines execution path). */
  kind: ComputeTask["kind"];
  /** Chat messages for chat tasks. */
  messages?: ChatMessage[] | undefined;
  /** Plain text for embedding/classification/NER/summarization. */
  text?: string | undefined;
  /** Labels for classification tasks. */
  labels?: string[] | undefined;
  /** Max tokens to generate. */
  maxTokens?: number | undefined;
}

// ── Client-Side Execution ──────────────────────────────────────────

async function executeClientSide(
  input: BridgeInput,
  model: string,
  startTime: number,
): Promise<BridgeResult> {
  switch (input.kind) {
    case "chat": {
      if (!isWebLLMSupported()) {
        throw new Error("WebGPU not available for client-side chat");
      }
      const engine = await getWebLLMEngine(model);
      const messages = input.messages ?? [{ role: "user" as const, content: input.text ?? "" }];
      const text = await chatWithWebLLM(engine, messages);
      return {
        tier: "client",
        text,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    case "embedding": {
      const text = input.text ?? "";
      const embedding = await generateEmbedding(text);
      return {
        tier: "client",
        embedding,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    case "classification": {
      const text = input.text ?? "";
      const labels = input.labels ?? [];
      if (labels.length === 0) {
        throw new Error("Classification requires at least one label");
      }
      const classifications = await classifyText(text, labels);
      return {
        tier: "client",
        classifications,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    case "summarization": {
      const text = input.text ?? "";
      const summary = await summarizeText(text, input.maxTokens);
      return {
        tier: "client",
        text: summary,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    case "ner": {
      const text = input.text ?? "";
      const entities = await extractEntities(text);
      return {
        tier: "client",
        entities,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    default:
      throw new Error(`[compute-bridge] Task kind "${input.kind}" not supported on client tier`);
  }
}

async function executeClientSideStreaming(
  input: BridgeInput,
  model: string,
  onChunk: (text: string) => void,
  startTime: number,
): Promise<BridgeResult> {
  if (input.kind !== "chat") {
    // Non-chat tasks don't support streaming; execute normally and emit as single chunk
    const result = await executeClientSide(input, model, startTime);
    if (result.text !== undefined) {
      onChunk(result.text);
    }
    return result;
  }

  if (!isWebLLMSupported()) {
    throw new Error("WebGPU not available for client-side streaming");
  }

  const engine = await getWebLLMEngine(model);
  const messages = input.messages ?? [{ role: "user" as const, content: input.text ?? "" }];
  const text = await streamChatWithWebLLM(engine, messages, onChunk);

  return {
    tier: "client",
    text,
    durationMs: Math.round(performance.now() - startTime),
  };
}

// ── Server-Side Execution (Edge / Cloud) ───────────────────────────

async function executeServerSide(
  tier: ComputeTier,
  decision: ComputeRoutingDecision,
  input: BridgeInput,
  apiBase: string,
  startTime: number,
): Promise<BridgeResult> {
  const response = await fetch(`${apiBase}/compute/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tier,
      model: tier === decision.tier ? decision.model : undefined,
      input,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[compute-bridge] ${tier} execution failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as ServerExecuteResponse;

  return {
    tier,
    text: data.text,
    embedding: data.embedding !== undefined ? new Float32Array(data.embedding) : undefined,
    classifications: data.classifications,
    entities: data.entities,
    durationMs: Math.round(performance.now() - startTime),
  };
}

async function executeServerSideStreaming(
  tier: ComputeTier,
  decision: ComputeRoutingDecision,
  input: BridgeInput,
  onChunk: (text: string) => void,
  apiBase: string,
  startTime: number,
): Promise<BridgeResult> {
  const response = await fetch(`${apiBase}/compute/execute/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tier,
      model: tier === decision.tier ? decision.model : undefined,
      input,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[compute-bridge] ${tier} streaming failed (${response.status}): ${errorText}`,
    );
  }

  if (response.body === null) {
    throw new Error(`[compute-bridge] ${tier} streaming returned no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onChunk(chunk);
  }

  return {
    tier,
    text: fullText,
    durationMs: Math.round(performance.now() - startTime),
  };
}

// ── Server Response Type ───────────────────────────────────────────

interface ServerExecuteResponse {
  text?: string | undefined;
  embedding?: number[] | undefined;
  classifications?: Array<{ label: string; score: number }> | undefined;
  entities?: Array<{ entity: string; type: string; score: number }> | undefined;
}

// ── Cleanup ────────────────────────────────────────────────────────

/**
 * Dispose all cached resources (WebLLM engine, pipeline caches).
 * Call this when the user navigates away or the app is shutting down.
 */
export async function disposeBridge(): Promise<void> {
  if (webLLMEngine !== null) {
    webLLMEngine = null;
    webLLMModelId = null;
  }

  cachedCapabilities = null;

  const { clearPipelineCache } = await import("./transformers-engine");
  clearPipelineCache();

  setBridgeStatus({
    status: "idle",
    tier: null,
    message: "Bridge disposed",
    progress: -1,
  });
}
