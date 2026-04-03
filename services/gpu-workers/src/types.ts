// ── GPU Worker Type Definitions ──────────────────────────────────────
// Core types for Modal.com GPU worker job definitions.

export interface GPUJob {
  id: string;
  type: "inference" | "training" | "video-render" | "embedding";
  status: "queued" | "running" | "completed" | "failed";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
  gpuType: "A100" | "H100";
}

export interface GPUWorkerConfig {
  gpuType: "A100" | "H100";
  maxConcurrent: number;
  timeout: number;
}
