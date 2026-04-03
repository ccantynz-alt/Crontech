// ── Smart Compute Router ────────────────────────────────────────────
// Routes AI workloads to the cheapest tier that meets all constraints.
// Fallback chain: Client GPU ($0) → Edge (sub-50ms) → Cloud (full power).
// Never drops a request — always falls through to cloud as last resort.

import type { ComputeTier, DeviceCapabilities } from "./compute-tier";

// ── Task Types ─────────────────────────────────────────────────────

/**
 * The kind of AI work to be performed. Determines which execution
 * path is used within each tier.
 */
export type ComputeTaskKind =
  | "chat"
  | "embedding"
  | "classification"
  | "summarization"
  | "ner"
  | "image-generation"
  | "video-processing"
  | "custom";

/**
 * Latency sensitivity for a compute task.
 * - "realtime": UI-blocking, must respond in <200ms
 * - "interactive": user-facing, must respond in <2s
 * - "background": can tolerate seconds to minutes
 */
export type LatencySensitivity = "realtime" | "interactive" | "background";

/**
 * Describes an AI workload to be routed to the optimal compute tier.
 */
export interface ComputeTask {
  /** What kind of AI work this is. */
  kind: ComputeTaskKind;
  /** Model size in billions of parameters. 0 for non-LLM tasks. */
  modelSizeBillions: number;
  /** Minimum VRAM required in MB. 0 if unknown / not applicable. */
  minVRAMMB: number;
  /** How latency-sensitive this task is. */
  latency: LatencySensitivity;
  /** Whether the response must be streamed token-by-token. */
  streaming: boolean;
  /** Preferred tier override. The router will try this tier first. */
  preferredTier?: ComputeTier | undefined;
  /** Estimated input size in tokens (used for cost/time estimation). */
  estimatedTokens?: number | undefined;
}

// ── Routing Decision ───────────────────────────────────────────────

/**
 * The router's decision: which tier to use, why, and which model.
 */
export interface ComputeRoutingDecision {
  /** The selected compute tier. */
  tier: ComputeTier;
  /** Human-readable explanation for the routing decision. */
  reason: string;
  /** Suggested model identifier for the selected tier. */
  model: string;
  /** The full fallback chain in priority order (most preferred first). */
  fallbackChain: readonly ComputeTier[];
  /** Estimated latency in milliseconds for this tier. */
  estimatedLatencyMs: number;
  /** Estimated cost per 1K tokens (0 for client tier). */
  estimatedCostPer1KTokens: number;
}

// ── Tier Thresholds ────────────────────────────────────────────────

/** Maximum model size (in billions of params) that can run on client GPU. */
const CLIENT_MAX_PARAMS_B = 2;

/** Maximum model size (in billions of params) for edge inference. */
const EDGE_MAX_PARAMS_B = 7;

/** Minimum VRAM (MB) required for any meaningful client-side inference. */
const CLIENT_MIN_VRAM_MB = 512;

/** Minimum device memory (GB) for client-side inference. */
const CLIENT_MIN_DEVICE_MEMORY_GB = 4;

/** Latency budget per tier in ms. */
const TIER_LATENCY: Record<ComputeTier, number> = {
  client: 10,
  edge: 50,
  cloud: 2000,
};

/** Cost per 1K tokens per tier (approximate). */
const TIER_COST: Record<ComputeTier, number> = {
  client: 0,
  edge: 0.0002,
  cloud: 0.003,
};

/** Default model IDs per tier. */
const DEFAULT_MODELS: Record<ComputeTier, string> = {
  client: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
  edge: "gpt-4o-mini",
  cloud: "gpt-4o",
};

/** Model mappings by task kind for client tier (Transformers.js models). */
const CLIENT_TASK_MODELS: Partial<Record<ComputeTaskKind, string>> = {
  embedding: "Xenova/all-MiniLM-L6-v2",
  classification: "Xenova/nli-deberta-v3-xsmall",
  summarization: "Xenova/distilbart-cnn-6-6",
  ner: "Xenova/bert-base-NER",
};

// ── Connection Quality ─────────────────────────────────────────────

/** Connection types that are too slow for edge/cloud round-trips. */
const POOR_CONNECTIONS = new Set<DeviceCapabilities["connectionType"]>([
  "slow-2g",
  "2g",
]);

// ── Routing Logic ──────────────────────────────────────────────────

/**
 * Determines whether the client GPU can handle the given task.
 */
function canRunOnClient(
  task: ComputeTask,
  capabilities: DeviceCapabilities,
): boolean {
  // No WebGPU = no client-side GPU inference
  if (!capabilities.hasWebGPU) return false;

  // Not enough VRAM
  if (capabilities.vramMB < CLIENT_MIN_VRAM_MB) return false;
  if (task.minVRAMMB > 0 && capabilities.vramMB < task.minVRAMMB) return false;

  // Not enough device memory
  if (capabilities.deviceMemoryGB < CLIENT_MIN_DEVICE_MEMORY_GB) return false;

  // Model too large for client
  if (task.modelSizeBillions > CLIENT_MAX_PARAMS_B) return false;

  // Some tasks always need server-side processing
  if (task.kind === "video-processing" || task.kind === "image-generation") {
    return false;
  }

  // Transformers.js tasks (embedding, classification, etc.) have lower requirements
  if (CLIENT_TASK_MODELS[task.kind] !== undefined) {
    return true;
  }

  // Chat/custom tasks need WebLLM with sufficient VRAM
  return capabilities.vramMB >= task.minVRAMMB;
}

/**
 * Determines whether the edge tier can handle the given task.
 */
function canRunOnEdge(task: ComputeTask): boolean {
  // Model too large for edge
  if (task.modelSizeBillions > EDGE_MAX_PARAMS_B) return false;

  // Video processing and image generation require cloud GPUs
  if (task.kind === "video-processing" || task.kind === "image-generation") {
    return false;
  }

  return true;
}

/**
 * Resolves the model identifier for a given tier and task.
 */
function resolveModel(tier: ComputeTier, task: ComputeTask): string {
  if (tier === "client") {
    const taskModel = CLIENT_TASK_MODELS[task.kind];
    if (taskModel !== undefined) {
      return taskModel;
    }
    return DEFAULT_MODELS.client;
  }

  return DEFAULT_MODELS[tier];
}

/**
 * Routes an AI workload to the optimal compute tier based on task
 * requirements and device capabilities.
 *
 * Decision logic:
 * 1. If a preferred tier is set and viable, use it.
 * 2. Try client GPU first (free, lowest latency).
 * 3. Try edge next (cheap, low latency).
 * 4. Fall back to cloud (always available).
 *
 * The fallback chain is always included so the executor can retry
 * on a different tier if the chosen one fails.
 */
export function routeComputation(
  task: ComputeTask,
  capabilities: DeviceCapabilities,
): ComputeRoutingDecision {
  // Build the fallback chain based on what is viable
  const fallbackChain: ComputeTier[] = [];
  const clientViable = canRunOnClient(task, capabilities);
  const edgeViable = canRunOnEdge(task);

  if (clientViable) fallbackChain.push("client");
  if (edgeViable) fallbackChain.push("edge");
  fallbackChain.push("cloud"); // Cloud is always the final fallback

  // Check for poor connectivity — prefer client if available
  const poorConnection = POOR_CONNECTIONS.has(capabilities.connectionType);

  // 1. Honour preferred tier if viable
  if (task.preferredTier !== undefined) {
    const preferred = task.preferredTier;
    if (preferred === "client" && clientViable) {
      return buildDecision("client", "Preferred tier (client) is viable", task, fallbackChain);
    }
    if (preferred === "edge" && edgeViable && !poorConnection) {
      return buildDecision("edge", "Preferred tier (edge) is viable", task, fallbackChain);
    }
    if (preferred === "cloud") {
      return buildDecision("cloud", "Preferred tier (cloud) requested", task, fallbackChain);
    }
    // Preferred tier not viable — fall through to automatic routing
  }

  // 2. Poor connectivity: prefer client to avoid network round-trips
  if (poorConnection && clientViable) {
    return buildDecision(
      "client",
      `Poor connection (${capabilities.connectionType}); routing to client GPU to avoid network latency`,
      task,
      fallbackChain,
    );
  }

  // 3. Realtime latency: client GPU is the only tier under 10ms
  if (task.latency === "realtime" && clientViable) {
    return buildDecision(
      "client",
      "Realtime latency required; client GPU provides sub-10ms response",
      task,
      fallbackChain,
    );
  }

  // 4. Try client GPU (free tier)
  if (clientViable) {
    return buildDecision(
      "client",
      `Model (${task.modelSizeBillions}B params) fits client GPU (${capabilities.vramMB}MB VRAM); $0/token`,
      task,
      fallbackChain,
    );
  }

  // 5. Try edge tier
  if (edgeViable && !poorConnection) {
    return buildDecision(
      "edge",
      `Model (${task.modelSizeBillions}B params) exceeds client capability; routing to edge for sub-50ms latency`,
      task,
      fallbackChain,
    );
  }

  // 6. Cloud is the final fallback — always available, never drops
  return buildDecision(
    "cloud",
    `Model (${task.modelSizeBillions}B params) requires cloud GPU; full H100 power`,
    task,
    fallbackChain,
  );
}

/**
 * Helper to construct a ComputeRoutingDecision with consistent fields.
 */
function buildDecision(
  tier: ComputeTier,
  reason: string,
  task: ComputeTask,
  fallbackChain: readonly ComputeTier[],
): ComputeRoutingDecision {
  return {
    tier,
    reason,
    model: resolveModel(tier, task),
    fallbackChain,
    estimatedLatencyMs: TIER_LATENCY[tier],
    estimatedCostPer1KTokens: TIER_COST[tier],
  };
}
