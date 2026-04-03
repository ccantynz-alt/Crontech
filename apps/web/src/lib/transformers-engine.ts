// ── In-Browser ML Inference via Transformers.js ─────────────────────
// Lazy-loads HuggingFace pipelines on first call and caches them.
// All functions are SSR-safe: they bail out when running on the server.

import type {
  FeatureExtractionPipeline,
  ZeroShotClassificationPipeline,
  SummarizationPipeline,
  TokenClassificationPipeline,
} from "@huggingface/transformers";

// ── Pipeline Cache ──────────────────────────────────────────────────

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let classificationPipeline: ZeroShotClassificationPipeline | null = null;
let summarizationPipeline: SummarizationPipeline | null = null;
let nerPipeline: TokenClassificationPipeline | null = null;

const isServer = typeof window === "undefined";

/**
 * Dynamically import the `pipeline` factory from Transformers.js.
 * This keeps the heavy WASM/ONNX runtime out of the server bundle.
 */
async function loadPipeline() {
  const { pipeline } = await import("@huggingface/transformers");
  return pipeline;
}

// ── Embedding ───────────────────────────────────────────────────────

/**
 * Generate a text embedding using a small model running entirely
 * in the browser via ONNX Runtime + WASM/WebGPU.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (~23 MB)
 */
export async function generateEmbedding(
  text: string,
): Promise<Float32Array> {
  if (isServer) {
    throw new Error(
      "[transformers-engine] generateEmbedding is not available during SSR. " +
        "Call this function only in the browser.",
    );
  }

  try {
    if (!embeddingPipeline) {
      const pipelineFactory = await loadPipeline();
      embeddingPipeline = (await pipelineFactory(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        { dtype: "fp32" },
      )) as FeatureExtractionPipeline;
    }

    const output = await embeddingPipeline(text, {
      pooling: "mean",
      normalize: true,
    });

    // output.data is a typed array backing the tensor
    return new Float32Array(output.data as ArrayLike<number>);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `[transformers-engine] Embedding generation failed: ${message}`,
    );
  }
}

// ── Zero-Shot Classification ────────────────────────────────────────

/**
 * Classify text against a set of candidate labels using zero-shot
 * classification (no fine-tuning required).
 *
 * Model: Xenova/nli-deberta-v3-xsmall (~50 MB)
 */
export async function classifyText(
  text: string,
  labels: string[],
): Promise<Array<{ label: string; score: number }>> {
  if (isServer) {
    throw new Error(
      "[transformers-engine] classifyText is not available during SSR. " +
        "Call this function only in the browser.",
    );
  }

  if (labels.length === 0) {
    throw new Error(
      "[transformers-engine] classifyText requires at least one label.",
    );
  }

  try {
    if (!classificationPipeline) {
      const pipelineFactory = await loadPipeline();
      classificationPipeline = (await pipelineFactory(
        "zero-shot-classification",
        "Xenova/nli-deberta-v3-xsmall",
      )) as ZeroShotClassificationPipeline;
    }

    const result = await classificationPipeline(text, labels);

    // The pipeline returns { labels: string[], scores: number[] }
    const output = result as unknown as {
      labels: string[];
      scores: number[];
    };

    return output.labels.map((label: string, i: number) => ({
      label,
      score: output.scores[i] ?? 0,
    }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `[transformers-engine] Text classification failed: ${message}`,
    );
  }
}

// ── Summarization ───────────────────────────────────────────────────

/**
 * Summarize text using a small seq2seq model in the browser.
 *
 * Model: Xenova/distilbart-cnn-6-6 (~300 MB — heavier, loaded on demand)
 */
export async function summarizeText(
  text: string,
  maxLength = 150,
): Promise<string> {
  if (isServer) {
    throw new Error(
      "[transformers-engine] summarizeText is not available during SSR. " +
        "Call this function only in the browser.",
    );
  }

  try {
    if (!summarizationPipeline) {
      const pipelineFactory = await loadPipeline();
      summarizationPipeline = (await pipelineFactory(
        "summarization",
        "Xenova/distilbart-cnn-6-6",
      )) as SummarizationPipeline;
    }

    const result = await summarizationPipeline(text, {
      max_new_tokens: maxLength,
    });

    // Pipeline returns an array of { summary_text: string }
    const output = result as Array<{ summary_text: string }>;
    return output[0]?.summary_text ?? "";
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `[transformers-engine] Text summarization failed: ${message}`,
    );
  }
}

// ── Named Entity Recognition ────────────────────────────────────────

/**
 * Extract named entities (persons, locations, organizations, etc.)
 * from the given text.
 *
 * Model: Xenova/bert-base-NER (~170 MB)
 */
export async function extractEntities(
  text: string,
): Promise<Array<{ entity: string; type: string; score: number }>> {
  if (isServer) {
    throw new Error(
      "[transformers-engine] extractEntities is not available during SSR. " +
        "Call this function only in the browser.",
    );
  }

  try {
    if (!nerPipeline) {
      const pipelineFactory = await loadPipeline();
      nerPipeline = (await pipelineFactory(
        "token-classification",
        "Xenova/bert-base-NER",
      )) as TokenClassificationPipeline;
    }

    const result = await nerPipeline(text);

    const tokens = result as Array<{
      word: string;
      entity: string;
      score: number;
    }>;

    return tokens.map((token) => ({
      entity: token.word,
      type: token.entity,
      score: token.score,
    }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `[transformers-engine] Entity extraction failed: ${message}`,
    );
  }
}

// ── Cache Management ────────────────────────────────────────────────

/**
 * Dispose all cached pipelines to free memory (WASM heaps, ONNX
 * sessions, etc.). Pipelines will be lazily re-created on next call.
 */
export function clearPipelineCache(): void {
  embeddingPipeline = null;
  classificationPipeline = null;
  summarizationPipeline = null;
  nerPipeline = null;
}
