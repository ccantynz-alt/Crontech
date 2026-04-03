// ── WebLLM Client-Side AI Inference Engine ───────────────────────────
// Runs LLM inference directly on the user's GPU via WebGPU.
// Cost per token: $0. Latency: sub-10ms. No server round-trip.

import {
  CreateMLCEngine,
  type MLCEngine,
  type ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";

// ── Configuration ────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = "Llama-3.1-8B-Instruct-q4f16_1-MLC";

export interface WebLLMConfig {
  /** Model identifier from the WebLLM model catalog. */
  modelId?: string;
  /** Progress callback fired during model download and initialization. */
  onProgress?: (progress: { text: string; progress: number }) => void;
}

// ── WebGPU Support Detection ─────────────────────────────────────────

/**
 * Returns true when the current environment supports WebGPU, which is
 * the prerequisite for running WebLLM client-side inference.
 */
export function isWebLLMSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator && navigator.gpu !== undefined;
}

// ── Engine Initialization ────────────────────────────────────────────

/**
 * Initializes the WebLLM engine, downloading and compiling the model.
 *
 * This is an expensive one-time operation — the model weights are cached
 * in the browser after the first download.
 *
 * @throws Error if WebGPU is not available in the current environment.
 */
export async function initWebLLM(config?: WebLLMConfig): Promise<MLCEngine> {
  if (!isWebLLMSupported()) {
    throw new Error(
      "WebGPU is not available in this browser. " +
        "Client-side AI inference requires a WebGPU-capable browser " +
        "(Chrome 113+, Edge 113+, or Firefox Nightly with WebGPU flag enabled).",
    );
  }

  const modelId = config?.modelId ?? DEFAULT_MODEL_ID;

  const engine = await CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      config?.onProgress?.({
        text: report.text,
        progress: report.progress,
      });
    },
  });

  return engine;
}

// ── Chat Completion ──────────────────────────────────────────────────

/**
 * Runs a non-streaming chat completion on the local WebLLM engine.
 * Returns the full assistant response as a string.
 */
export async function chatWithWebLLM(
  engine: MLCEngine,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const response = await engine.chat.completions.create({
    messages: messages as ChatCompletionMessageParam[],
    stream: false,
  });

  const choice = response.choices[0];
  return choice?.message?.content ?? "";
}

// ── Streaming Chat Completion ────────────────────────────────────────

/**
 * Streams a chat completion from the local WebLLM engine.
 * Calls `onChunk` with each new text fragment as it is generated.
 * Returns the full assembled response when complete.
 */
export async function streamChatWithWebLLM(
  engine: MLCEngine,
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
): Promise<string> {
  const stream = await engine.chat.completions.create({
    messages: messages as ChatCompletionMessageParam[],
    stream: true,
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullResponse += delta;
      onChunk(delta);
    }
  }

  return fullResponse;
}
