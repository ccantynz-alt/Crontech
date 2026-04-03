// ── Client AI Module ────────────────────────────────────────────────
// Barrel export for all client-side AI capabilities.
// Three-tier compute: Client GPU ($0/token) -> Edge -> Cloud

// ── GPU Detection ──────────────────────────────────────────────────
export {
  detectGPUCapabilities,
  type ExtendedDeviceCapabilities,
} from "~/gpu/detect";

// ── Compute Tier Router ────────────────────────────────────────────
export {
  routeComputation,
  selectTier,
  type ComputeTask,
  type TaskType,
  type TaskPriority,
  type RoutingDecision,
} from "./compute-router";

// ── WebLLM (Client-Side LLM Inference) ─────────────────────────────
export {
  loadModel,
  chatCompletion,
  chatCompletionStream,
  isModelLoaded,
  getLoadProgress,
  getLoadedModel,
  unloadModel,
  WebLLMError,
  type WebLLMModelId,
  type ChatMessage,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type ModelLoadProgress,
  type StreamChunk,
} from "./webllm";

// ── Transformers.js (Client-Side ML Pipelines) ─────────────────────
export {
  generateEmbedding,
  classifyText,
  summarizeText,
  extractSentiment,
  disposePipelines,
  isPipelineCached,
  TransformersError,
  type EmbeddingResult,
  type ClassificationResult,
  type SummarizationResult,
  type SentimentResult,
} from "./transformers";
