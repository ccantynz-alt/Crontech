// ── ML Pipeline Store ────────────────────────────────────────────────
// SolidJS reactive store wrapping in-browser Transformers.js inference.
// Exposes loading / error state alongside the pipeline functions.

import { createSignal } from "solid-js";
import {
  generateEmbedding,
  classifyText,
  summarizeText,
  extractEntities,
  clearPipelineCache,
} from "~/lib/transformers-engine";

export interface MLPipelines {
  /** Generate a text embedding vector. */
  embedding: (text: string) => Promise<Float32Array>;
  /** Zero-shot text classification. */
  classify: (
    text: string,
    labels: string[],
  ) => Promise<Array<{ label: string; score: number }>>;
  /** Summarize text. */
  summarize: (text: string, maxLength?: number) => Promise<string>;
  /** Named entity recognition. */
  extractEntities: (
    text: string,
  ) => Promise<Array<{ entity: string; type: string; score: number }>>;
  /** Whether any pipeline is currently loading or running. */
  loading: () => boolean;
  /** The last error that occurred, or null. */
  error: () => string | null;
  /** Free all cached pipelines. */
  clearCache: () => void;
}

/**
 * Reactive hook that exposes in-browser ML pipelines with shared
 * loading / error signals.
 *
 * Usage:
 * ```tsx
 * const ml = useMLPipelines();
 * const vec = await ml.embedding("hello world");
 * ```
 */
export function useMLPipelines(): MLPipelines {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  /** Wrap an async pipeline call with loading / error tracking. */
  async function tracked<T>(fn: () => Promise<T>): Promise<T> {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    embedding: (text: string) => tracked(() => generateEmbedding(text)),

    classify: (text: string, labels: string[]) =>
      tracked(() => classifyText(text, labels)),

    summarize: (text: string, maxLength?: number) =>
      tracked(() => summarizeText(text, maxLength)),

    extractEntities: (text: string) =>
      tracked(() => extractEntities(text)),

    loading,
    error,

    clearCache: clearPipelineCache,
  };
}
