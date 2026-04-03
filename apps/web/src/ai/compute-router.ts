// ── Client-Side Compute Tier Router ─────────────────────────────────
// Decides where to run an AI workload: client GPU, edge, or cloud.
// Extends the server-side computeTierRouter with client-specific
// heuristics for task type, real-time requirements, and batch preferences.

import type { ComputeTier, DeviceCapabilities } from "@cronix/ai-core";
import { computeTierRouter } from "@cronix/ai-core";

// ── Types ────────────────────────────────────────────────────────────

export type TaskType =
  | "chat-completion"
  | "embedding"
  | "classification"
  | "summarization"
  | "sentiment-analysis"
  | "image-generation"
  | "video-processing"
  | "code-generation"
  | "translation"
  | "transcription";

export type TaskPriority = "realtime" | "interactive" | "background" | "batch";

export interface ComputeTask {
  /** Model size in billions of parameters */
  modelSizeBillions: number;
  /** Minimum VRAM required in MB (estimated as modelSizeBillions * 1024 if not provided) */
  minVRAMMB?: number;
  /** Maximum acceptable latency in milliseconds */
  latencyMaxMs: number;
  /** Type of AI task */
  taskType: TaskType;
  /** Priority class of the task */
  priority: TaskPriority;
  /** Whether the task requires streaming output */
  requiresStreaming?: boolean;
  /** Input size in tokens (approximate) */
  inputTokens?: number;
  /** Expected output size in tokens (approximate) */
  expectedOutputTokens?: number;
}

export interface RoutingDecision {
  /** The selected compute tier */
  tier: ComputeTier;
  /** Why this tier was selected */
  reason: string;
  /** Estimated latency for this tier in ms */
  estimatedLatencyMs: number;
  /** Whether a fallback was used */
  isFallback: boolean;
}

// ── Task-Specific VRAM Requirements ────────────────────────────────

const TASK_BASE_VRAM_MB: Record<TaskType, number> = {
  "chat-completion": 512,
  "embedding": 128,
  "classification": 256,
  "summarization": 384,
  "sentiment-analysis": 256,
  "image-generation": 4096,
  "video-processing": 4096,
  "code-generation": 1024,
  "translation": 384,
  "transcription": 512,
};

// ── Tasks that strongly prefer client-side execution ───────────────

const CLIENT_PREFERRED_TASKS: Set<TaskType> = new Set([
  "embedding",
  "classification",
  "sentiment-analysis",
]);

// ── Tasks that strongly prefer cloud execution ─────────────────────

const CLOUD_PREFERRED_TASKS: Set<TaskType> = new Set([
  "image-generation",
  "video-processing",
  "code-generation",
]);

// ── Router Implementation ──────────────────────────────────────────

/**
 * Route a computation to the optimal tier based on task requirements
 * and device capabilities.
 *
 * Rules:
 * - Models < 2B params + WebGPU available -> client
 * - Models < 7B + edge available -> edge
 * - Everything else -> cloud
 * - Real-time UI tasks prefer client
 * - Background/batch tasks prefer cloud
 *
 * @param task - The compute task to route
 * @param device - Device capabilities (from detectGPUCapabilities)
 * @returns The routing decision with tier, reason, and estimated latency
 */
export function routeComputation(
  task: ComputeTask,
  device: DeviceCapabilities,
): RoutingDecision {
  const minVRAM = task.minVRAMMB ?? Math.ceil(task.modelSizeBillions * 1024);

  // Use the core router as the baseline
  const baseTier = computeTierRouter(device, {
    parametersBillion: task.modelSizeBillions,
    minVRAMMB: minVRAM,
    latencyMaxMs: task.latencyMaxMs,
  });

  // Apply client-specific heuristics on top of the base decision

  // Rule 1: Real-time tasks with small models strongly prefer client
  if (
    task.priority === "realtime" &&
    task.modelSizeBillions <= 2 &&
    device.hasWebGPU &&
    device.vramMB >= minVRAM
  ) {
    return {
      tier: "client",
      reason: "Real-time task with small model; client GPU available",
      estimatedLatencyMs: 10,
      isFallback: false,
    };
  }

  // Rule 2: Batch/background tasks prefer cloud even if client could handle them
  if (task.priority === "batch" && task.modelSizeBillions > 0.5) {
    return {
      tier: "cloud",
      reason: "Batch task routed to cloud to preserve client GPU for interactive work",
      estimatedLatencyMs: 2000,
      isFallback: false,
    };
  }

  // Rule 3: Cloud-preferred tasks go to cloud unless very small
  if (CLOUD_PREFERRED_TASKS.has(task.taskType) && task.modelSizeBillions > 1) {
    return {
      tier: "cloud",
      reason: `${task.taskType} with ${task.modelSizeBillions}B model routed to cloud GPU`,
      estimatedLatencyMs: 2000,
      isFallback: false,
    };
  }

  // Rule 4: Client-preferred tasks stay on client when possible
  if (
    CLIENT_PREFERRED_TASKS.has(task.taskType) &&
    device.hasWebGPU &&
    device.vramMB >= (TASK_BASE_VRAM_MB[task.taskType] ?? 256)
  ) {
    return {
      tier: "client",
      reason: `${task.taskType} is lightweight; running on client GPU ($0/token)`,
      estimatedLatencyMs: 50,
      isFallback: false,
    };
  }

  // Rule 5: Interactive tasks with medium models prefer edge
  if (
    task.priority === "interactive" &&
    task.modelSizeBillions > 2 &&
    task.modelSizeBillions <= 7
  ) {
    return {
      tier: "edge",
      reason: "Interactive task with medium model; edge provides sub-50ms latency",
      estimatedLatencyMs: 50,
      isFallback: false,
    };
  }

  // Rule 6: Streaming tasks with large expected output prefer edge/cloud
  if (
    task.requiresStreaming &&
    (task.expectedOutputTokens ?? 0) > 500 &&
    baseTier === "client"
  ) {
    return {
      tier: "edge",
      reason: "Large streaming output better served by edge infrastructure",
      estimatedLatencyMs: 50,
      isFallback: false,
    };
  }

  // Fall back to the base tier router decision
  const estimatedLatency = baseTier === "client" ? 10 : baseTier === "edge" ? 50 : 2000;

  return {
    tier: baseTier,
    reason: `Base router selected ${baseTier} tier`,
    estimatedLatencyMs: estimatedLatency,
    isFallback: false,
  };
}

/**
 * Simple convenience function that returns just the tier.
 * Use routeComputation() when you need the full decision with reasoning.
 */
export function selectTier(
  task: ComputeTask,
  device: DeviceCapabilities,
): ComputeTier {
  return routeComputation(task, device).tier;
}
