// ── WebLLM Integration ──────────────────────────────────────────────
// Client-side LLM inference via WebGPU. Every token costs $0.
// Lazy-loads @mlc-ai/web-llm to avoid bloating the initial bundle.
// Provides model loading with progress, chat completion with streaming,
// and graceful fallback when WebGPU is unavailable.

import { createSignal } from "solid-js";
import type { Accessor } from "solid-js";

// ── Types ────────────────────────────────────────────────────────────

/** Supported model identifiers for client-side inference */
export type WebLLMModelId =
  | "Llama-3.1-8B-Instruct-q4f16_1-MLC"
  | "Phi-3.5-mini-instruct-q4f16_1-MLC"
  | "gemma-2-2b-it-q4f16_1-MLC"
  | (string & {});

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  /** Temperature for sampling (0-2). Default: 0.7 */
  temperature?: number;
  /** Top-p nucleus sampling. Default: 0.95 */
  topP?: number;
  /** Maximum tokens to generate. Default: 512 */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ModelLoadProgress {
  /** Current phase: downloading, loading, or ready */
  phase: "idle" | "downloading" | "loading" | "ready" | "error";
  /** Download progress 0-1 */
  progress: number;
  /** Human-readable status message */
  message: string;
  /** Time elapsed in ms */
  elapsedMs: number;
}

export interface StreamChunk {
  content: string;
  isFinished: boolean;
}

// ── Errors ──────────────────────────────────────────────────────────

export class WebLLMError extends Error {
  constructor(
    message: string,
    public readonly code: "NO_WEBGPU" | "MODEL_LOAD_FAILED" | "INFERENCE_FAILED" | "ABORTED" | "NOT_LOADED",
  ) {
    super(message);
    this.name = "WebLLMError";
  }
}

// ── Lazy Module Loading ─────────────────────────────────────────────

// WebLLM types extracted for internal use. The actual module is loaded
// dynamically to keep it out of the initial bundle.
interface WebLLMEngine {
  reload: (modelId: string) => Promise<void>;
  chat: {
    completions: {
      create: (params: {
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        top_p?: number;
        max_tokens?: number;
        stop?: string[];
        stream?: boolean;
      }) => Promise<WebLLMChatCompletion | AsyncIterable<WebLLMStreamChunk>>;
    };
  };
  unload: () => Promise<void>;
}

interface WebLLMChatCompletion {
  choices: Array<{
    message: { content: string };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface WebLLMStreamChunk {
  choices: Array<{
    delta: { content?: string };
    finish_reason: string | null;
  }>;
}

interface WebLLMModule {
  CreateMLCEngine: (
    modelId: string,
    config?: {
      initProgressCallback?: (report: { progress: number; text: string }) => void;
    },
  ) => Promise<WebLLMEngine>;
}

let webllmModule: WebLLMModule | null = null;

async function getWebLLM(): Promise<WebLLMModule> {
  if (webllmModule) return webllmModule;

  try {
    // Dynamic import keeps web-llm out of the initial bundle
    const mod = await import("@mlc-ai/web-llm");
    webllmModule = mod as unknown as WebLLMModule;
    return webllmModule;
  } catch (error) {
    throw new WebLLMError(
      `Failed to load @mlc-ai/web-llm: ${error instanceof Error ? error.message : String(error)}`,
      "MODEL_LOAD_FAILED",
    );
  }
}

// ── Engine State ────────────────────────────────────────────────────

let engine: WebLLMEngine | null = null;
let currentModelId: string | null = null;

// Reactive signals for SolidJS components
const [loadProgress, setLoadProgress] = createSignal<ModelLoadProgress>({
  phase: "idle",
  progress: 0,
  message: "No model loaded",
  elapsedMs: 0,
});

const [loadedModelId, setLoadedModelId] = createSignal<string | null>(null);

// ── WebGPU Check ────────────────────────────────────────────────────

function assertWebGPU(): void {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    throw new WebLLMError(
      "WebGPU is not available. Client-side LLM inference requires a WebGPU-capable browser.",
      "NO_WEBGPU",
    );
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Load a model into the WebLLM engine. Downloads model weights on first
 * load (cached in IndexedDB for subsequent loads). Progress is tracked
 * via the reactive `getLoadProgress()` signal.
 *
 * @param modelId - The MLC model identifier to load
 * @throws WebLLMError if WebGPU is unavailable or loading fails
 */
export async function loadModel(modelId: WebLLMModelId): Promise<void> {
  assertWebGPU();

  // Already loaded
  if (currentModelId === modelId && engine) return;

  const startTime = performance.now();

  setLoadProgress({
    phase: "downloading",
    progress: 0,
    message: `Initializing ${modelId}...`,
    elapsedMs: 0,
  });

  try {
    // Unload previous model if different
    if (engine && currentModelId !== modelId) {
      await engine.unload();
      engine = null;
      currentModelId = null;
      setLoadedModelId(null);
    }

    const webllm = await getWebLLM();

    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report: { progress: number; text: string }) => {
        const elapsed = performance.now() - startTime;
        const phase = report.progress < 1 ? "downloading" : "loading";

        setLoadProgress({
          phase,
          progress: report.progress,
          message: report.text,
          elapsedMs: elapsed,
        });
      },
    });

    currentModelId = modelId;
    setLoadedModelId(modelId);

    setLoadProgress({
      phase: "ready",
      progress: 1,
      message: `${modelId} ready`,
      elapsedMs: performance.now() - startTime,
    });
  } catch (error) {
    setLoadProgress({
      phase: "error",
      progress: 0,
      message: error instanceof Error ? error.message : String(error),
      elapsedMs: performance.now() - startTime,
    });

    throw new WebLLMError(
      `Failed to load model ${modelId}: ${error instanceof Error ? error.message : String(error)}`,
      "MODEL_LOAD_FAILED",
    );
  }
}

/**
 * Run a chat completion against the loaded model.
 * Returns the full response after generation completes.
 *
 * @param messages - Chat message history
 * @param options - Generation parameters
 * @returns Chat completion result with usage statistics
 * @throws WebLLMError if no model is loaded or inference fails
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  if (!engine || !currentModelId) {
    throw new WebLLMError("No model loaded. Call loadModel() first.", "NOT_LOADED");
  }

  if (options?.signal?.aborted) {
    throw new WebLLMError("Request was aborted", "ABORTED");
  }

  try {
    const response = await engine.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP ?? 0.95,
      max_tokens: options?.maxTokens ?? 512,
      stop: options?.stopSequences,
      stream: false,
    });

    // Non-streaming returns a ChatCompletion object
    const completion = response as WebLLMChatCompletion;
    const choice = completion.choices[0];

    if (!choice) {
      throw new WebLLMError("No completion choice returned", "INFERENCE_FAILED");
    }

    return {
      content: choice.message.content,
      usage: {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      },
    };
  } catch (error) {
    if (error instanceof WebLLMError) throw error;
    throw new WebLLMError(
      `Inference failed: ${error instanceof Error ? error.message : String(error)}`,
      "INFERENCE_FAILED",
    );
  }
}

/**
 * Stream a chat completion token-by-token. Returns an async iterator.
 * Each chunk contains the new content delta and whether generation is finished.
 *
 * @param messages - Chat message history
 * @param options - Generation parameters
 * @yields StreamChunk with incremental content
 * @throws WebLLMError if no model is loaded or inference fails
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!engine || !currentModelId) {
    throw new WebLLMError("No model loaded. Call loadModel() first.", "NOT_LOADED");
  }

  if (options?.signal?.aborted) {
    throw new WebLLMError("Request was aborted", "ABORTED");
  }

  try {
    const stream = await engine.chat.completions.create({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP ?? 0.95,
      max_tokens: options?.maxTokens ?? 512,
      stop: options?.stopSequences,
      stream: true,
    });

    const asyncStream = stream as AsyncIterable<WebLLMStreamChunk>;

    for await (const chunk of asyncStream) {
      // Check for abort between chunks
      if (options?.signal?.aborted) {
        throw new WebLLMError("Request was aborted", "ABORTED");
      }

      const choice = chunk.choices[0];
      if (!choice) continue;

      yield {
        content: choice.delta.content ?? "",
        isFinished: choice.finish_reason !== null,
      };
    }
  } catch (error) {
    if (error instanceof WebLLMError) throw error;
    throw new WebLLMError(
      `Streaming inference failed: ${error instanceof Error ? error.message : String(error)}`,
      "INFERENCE_FAILED",
    );
  }
}

/**
 * Check if a specific model is currently loaded and ready.
 *
 * @param modelId - The model identifier to check
 * @returns true if the model is loaded and ready for inference
 */
export function isModelLoaded(modelId: WebLLMModelId): boolean {
  return currentModelId === modelId && engine !== null;
}

/**
 * Get the reactive load progress signal.
 * Use this in SolidJS components to show loading UI.
 *
 * @returns Accessor for current model load progress
 */
export function getLoadProgress(): Accessor<ModelLoadProgress> {
  return loadProgress;
}

/**
 * Get the reactive signal for the currently loaded model ID.
 *
 * @returns Accessor for the loaded model ID (null if none)
 */
export function getLoadedModel(): Accessor<string | null> {
  return loadedModelId;
}

/**
 * Unload the current model and free GPU memory.
 */
export async function unloadModel(): Promise<void> {
  if (engine) {
    try {
      await engine.unload();
    } catch {
      // Best-effort cleanup
    }
    engine = null;
  }
  currentModelId = null;
  setLoadedModelId(null);
  setLoadProgress({
    phase: "idle",
    progress: 0,
    message: "No model loaded",
    elapsedMs: 0,
  });
}
