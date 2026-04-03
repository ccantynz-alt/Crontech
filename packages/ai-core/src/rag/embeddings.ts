// ── Embedding Generation ─────────────────────────────────────────
// Provides a unified interface for generating vector embeddings.
// Supports multiple providers: OpenAI, Transformers.js (local),
// and deterministic pseudo-embeddings for dev/testing.

import { z } from "zod";

// ── Environment Access ───────────────────────────────────────────

/**
 * Reads a single env var, returning undefined when absent.
 * Works in Bun, Node, and Cloudflare Workers without requiring @types/node.
 */
function env(key: string): string | undefined {
  try {
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env[key] ?? undefined;
  } catch {
    return undefined;
  }
}

// ── Schemas ──────────────────────────────────────────────────────

export const EmbeddingResultSchema = z.object({
  /** The embedding vector */
  vector: z.array(z.number()),
  /** Dimensionality of the vector */
  dimensions: z.number().int().min(1),
  /** Which provider produced this embedding */
  provider: z.string(),
});

export type EmbeddingResult = z.infer<typeof EmbeddingResultSchema>;

// ── Provider Interface ───────────────────────────────────────────

/**
 * Interface that all embedding providers must implement.
 * Providers generate vector representations of text for semantic search.
 */
export interface EmbeddingProvider {
  /** Human-readable name of this provider */
  readonly name: string;
  /** Dimensionality of vectors this provider produces */
  readonly dimensions: number;
  /** Generate an embedding for a single text */
  embed(text: string): Promise<EmbeddingResult>;
  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}

// ── Deterministic Pseudo-Embedding Provider (Dev / Testing) ──────

/**
 * Generates deterministic pseudo-embeddings from text using hash functions.
 * Produces consistent vectors: the same input always yields the same output.
 *
 * This is NOT suitable for production semantic search -- it does not capture
 * meaning. Use it for development, testing, and when no API key is available.
 */
export class DevEmbeddingProvider implements EmbeddingProvider {
  readonly name = "dev-pseudo";
  readonly dimensions: number;

  constructor(dimensions: number = 384) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const vector = generatePseudoVector(text, this.dimensions);
    return { vector, dimensions: this.dimensions, provider: this.name };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

/**
 * Generates a deterministic pseudo-vector from a string.
 * Uses a simple hash-and-sin approach to produce values in [-1, 1].
 * Same algorithm as tools.ts generatePseudoVector for consistency.
 */
function generatePseudoVector(text: string, dimensions: number): number[] {
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    let hash = 0;
    const seed = `${text}-${i}`;
    for (let j = 0; j < seed.length; j++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(j)) | 0;
    }
    vector.push(Math.sin(hash));
  }
  return vector;
}

// ── OpenAI Embedding Provider (Placeholder) ──────────────────────

/**
 * Generates embeddings using the OpenAI embeddings API.
 *
 * Requires OPENAI_API_KEY environment variable.
 * Uses text-embedding-3-small by default (1536 dimensions).
 *
 * TODO: Integrate with @ai-sdk/openai or direct fetch to
 * https://api.openai.com/v1/embeddings once API keys are configured.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions: number;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(options?: {
    model?: string;
    dimensions?: number;
    apiKey?: string;
    baseURL?: string;
  }) {
    this.model = options?.model ?? "text-embedding-3-small";
    this.dimensions = options?.dimensions ?? 1536;
    this.apiKey = options?.apiKey ?? env("OPENAI_API_KEY") ?? "";
    this.baseURL = options?.baseURL ?? "https://api.openai.com/v1";
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    const first = results[0];
    if (!first) {
      throw new Error("OpenAI embedding returned no results");
    }
    return first;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Cannot use OpenAI embedding provider.",
      );
    }

    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI embeddings API error (${response.status}): ${errorText}`,
      );
    }

    const body = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return body.data
      .sort((a, b) => a.index - b.index)
      .map((item) => ({
        vector: item.embedding,
        dimensions: this.dimensions,
        provider: this.name,
      }));
  }
}

// ── Transformers.js Local Embedding Provider (Placeholder) ───────

/**
 * Generates embeddings locally using Transformers.js v4.
 * Runs entirely in the browser or in Bun/Node -- zero API costs.
 *
 * TODO: Integrate @xenova/transformers (or @huggingface/transformers v4)
 * once the package is added to dependencies. Suggested model:
 * Xenova/all-MiniLM-L6-v2 (384 dimensions, fast, good quality).
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local-transformers";
  readonly dimensions: number;
  readonly modelName: string;

  constructor(options?: { model?: string; dimensions?: number }) {
    this.modelName = options?.model ?? "Xenova/all-MiniLM-L6-v2";
    this.dimensions = options?.dimensions ?? 384;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    // TODO: Replace with actual Transformers.js pipeline:
    //   const { pipeline } = await import("@xenova/transformers");
    //   const extractor = await pipeline("feature-extraction", this.modelName);
    //   const output = await extractor(text, { pooling: "mean", normalize: true });
    //   const vector = Array.from(output.data as Float32Array);

    // Fallback to pseudo-embeddings until Transformers.js is integrated
    const vector = generatePseudoVector(text, this.dimensions);
    return { vector, dimensions: this.dimensions, provider: this.name };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Transformers.js supports batching natively; for now, sequential fallback
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

// ── Provider Factory ─────────────────────────────────────────────

export type EmbeddingProviderName = "openai" | "local" | "dev";

/**
 * Creates an embedding provider by name.
 * Falls back to the dev provider when API keys are not configured.
 */
export function createEmbeddingProvider(
  providerName?: EmbeddingProviderName,
): EmbeddingProvider {
  const name = providerName ?? detectBestProvider();

  switch (name) {
    case "openai":
      return new OpenAIEmbeddingProvider();
    case "local":
      return new LocalEmbeddingProvider();
    case "dev":
      return new DevEmbeddingProvider();
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown embedding provider: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Detects the best available embedding provider based on environment.
 */
function detectBestProvider(): EmbeddingProviderName {
  if (env("OPENAI_API_KEY")) {
    return "openai";
  }
  // TODO: Check for Transformers.js availability
  // if (await canLoadTransformers()) return "local";
  return "dev";
}
