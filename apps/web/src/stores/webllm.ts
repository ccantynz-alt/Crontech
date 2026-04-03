// ── WebLLM Reactive Store ────────────────────────────────────────────
// SolidJS signal-based store for managing WebLLM engine lifecycle.
// Provides reactive state for loading progress, readiness, and errors.

import { createSignal } from "solid-js";
import type { MLCEngine } from "@mlc-ai/web-llm";
import {
  initWebLLM,
  chatWithWebLLM,
  streamChatWithWebLLM,
  type WebLLMConfig,
} from "~/lib/webllm-engine";

// ── Signals ──────────────────────────────────────────────────────────

const [engine, setEngine] = createSignal<MLCEngine | null>(null);
const [loading, setLoading] = createSignal(false);
const [progress, setProgress] = createSignal(0);
const [progressText, setProgressText] = createSignal("");
const [ready, setReady] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);

// ── Actions ──────────────────────────────────────────────────────────

/**
 * Initialize the WebLLM engine. Downloads and compiles the model on
 * first call; subsequent calls are no-ops if the engine is already ready.
 */
async function init(config?: WebLLMConfig): Promise<void> {
  // Avoid re-initialization
  if (ready() || loading()) return;

  setLoading(true);
  setError(null);
  setProgress(0);
  setProgressText("Initializing WebLLM...");

  try {
    const mlcEngine = await initWebLLM({
      ...config,
      onProgress: (p) => {
        setProgress(p.progress);
        setProgressText(p.text);
        config?.onProgress?.(p);
      },
    });

    setEngine(mlcEngine);
    setReady(true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
  } finally {
    setLoading(false);
  }
}

/**
 * Run a non-streaming chat completion against the local engine.
 * @throws Error if the engine has not been initialized.
 */
async function chat(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const currentEngine = engine();
  if (!currentEngine) {
    throw new Error(
      "WebLLM engine is not initialized. Call init() before chat().",
    );
  }
  return chatWithWebLLM(currentEngine, messages);
}

/**
 * Stream a chat completion, calling `onChunk` with each text fragment.
 * Returns the full response when streaming completes.
 * @throws Error if the engine has not been initialized.
 */
async function streamChat(
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
): Promise<string> {
  const currentEngine = engine();
  if (!currentEngine) {
    throw new Error(
      "WebLLM engine is not initialized. Call init() before streamChat().",
    );
  }
  return streamChatWithWebLLM(currentEngine, messages, onChunk);
}

// ── Public Hook ──────────────────────────────────────────────────────

export interface UseWebLLMReturn {
  engine: typeof engine;
  loading: typeof loading;
  progress: typeof progress;
  progressText: typeof progressText;
  ready: typeof ready;
  error: typeof error;
  init: typeof init;
  chat: typeof chat;
  streamChat: typeof streamChat;
}

/**
 * Returns reactive WebLLM state and control functions.
 *
 * Usage:
 * ```tsx
 * const { init, chat, streamChat, loading, ready, progress } = useWebLLM();
 *
 * // Initialize (downloads model on first call)
 * await init();
 *
 * // Non-streaming completion
 * const response = await chat([{ role: "user", content: "Hello!" }]);
 *
 * // Streaming completion
 * await streamChat(
 *   [{ role: "user", content: "Tell me a story." }],
 *   (chunk) => console.log(chunk),
 * );
 * ```
 */
export function useWebLLM(): UseWebLLMReturn {
  return {
    engine,
    loading,
    progress,
    progressText,
    ready,
    error,
    init,
    chat,
    streamChat,
  };
}
