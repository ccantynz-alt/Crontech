// ── Transformers.js Integration ──────────────────────────────────────
// Client-side ML inference via @huggingface/transformers (v3+).
// Lazy-loaded to keep it out of the initial bundle.
// Provides task-specific pipelines: embeddings, classification,
// summarization, and sentiment analysis. All $0/token.

// ── Types ────────────────────────────────────────────────────────────

export interface EmbeddingResult {
  /** The embedding vector */
  embedding: number[];
  /** Dimensionality of the embedding */
  dimensions: number;
}

export interface ClassificationResult {
  /** The predicted label */
  label: string;
  /** Confidence score 0-1 */
  score: number;
}

export interface SummarizationResult {
  /** The generated summary */
  summary: string;
}

export interface SentimentResult {
  /** Sentiment label: POSITIVE, NEGATIVE, NEUTRAL */
  label: string;
  /** Confidence score 0-1 */
  score: number;
}

// ── Errors ──────────────────────────────────────────────────────────

export class TransformersError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "LOAD_FAILED"
      | "PIPELINE_FAILED"
      | "INFERENCE_FAILED"
      | "UNSUPPORTED",
  ) {
    super(message);
    this.name = "TransformersError";
  }
}

// ── Lazy Module Loading ─────────────────────────────────────────────

// Pipeline function type from @huggingface/transformers
type PipelineFunction = (
  task: string,
  model?: string,
  options?: Record<string, unknown>,
) => Promise<PipelineInstance>;

interface PipelineInstance {
  (
    input: string | string[],
    options?: Record<string, unknown>,
  ): Promise<PipelineOutput>;
  dispose?: () => Promise<void>;
}

// Output types vary by pipeline task
type PipelineOutput =
  | EmbeddingPipelineOutput
  | ClassificationPipelineOutput
  | SummarizationPipelineOutput
  | SentimentPipelineOutput;

interface EmbeddingPipelineOutput {
  tolist: () => number[][];
  dims: number[];
}

interface ClassificationPipelineOutput extends Array<{
  label: string;
  score: number;
}> {}

interface SummarizationPipelineOutput extends Array<{
  summary_text: string;
}> {}

interface SentimentPipelineOutput extends Array<{
  label: string;
  score: number;
}> {}

let pipelineFn: PipelineFunction | null = null;

async function getPipeline(): Promise<PipelineFunction> {
  if (pipelineFn) return pipelineFn;

  try {
    const mod = await import("@huggingface/transformers");
    pipelineFn = mod.pipeline as unknown as PipelineFunction;
    return pipelineFn;
  } catch (error) {
    throw new TransformersError(
      `Failed to load @huggingface/transformers: ${error instanceof Error ? error.message : String(error)}`,
      "LOAD_FAILED",
    );
  }
}

// ── Pipeline Cache ──────────────────────────────────────────────────
// Cache loaded pipelines to avoid re-downloading models.
// Key is `${task}:${model}`.

const pipelineCache = new Map<string, PipelineInstance>();

async function getCachedPipeline(
  task: string,
  model: string,
  options?: Record<string, unknown>,
): Promise<PipelineInstance> {
  const cacheKey = `${task}:${model}`;

  const cached = pipelineCache.get(cacheKey);
  if (cached) return cached;

  const pipeline = await getPipeline();

  try {
    const instance = await pipeline(task, model, options);
    pipelineCache.set(cacheKey, instance);
    return instance;
  } catch (error) {
    throw new TransformersError(
      `Failed to create ${task} pipeline with model ${model}: ${error instanceof Error ? error.message : String(error)}`,
      "PIPELINE_FAILED",
    );
  }
}

// ── Default Models ──────────────────────────────────────────────────

const DEFAULT_MODELS = {
  embedding: "Xenova/all-MiniLM-L6-v2",
  classification: "Xenova/nli-deberta-v3-xsmall",
  summarization: "Xenova/distilbart-cnn-6-6",
  sentiment: "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
} as const;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Generate a text embedding vector using a feature-extraction pipeline.
 * Uses Xenova/all-MiniLM-L6-v2 by default (384 dimensions).
 *
 * @param text - The text to embed
 * @param model - Optional model override
 * @returns Embedding vector and its dimensionality
 */
export async function generateEmbedding(
  text: string,
  model?: string,
): Promise<EmbeddingResult> {
  const modelId = model ?? DEFAULT_MODELS.embedding;

  try {
    const pipe = await getCachedPipeline("feature-extraction", modelId, {
      dtype: "fp32",
    });

    const output = await pipe(text, {
      pooling: "mean",
      normalize: true,
    });

    // Output is a Tensor with tolist() method
    const tensorOutput = output as EmbeddingPipelineOutput;
    const vectors = tensorOutput.tolist();
    const embedding = vectors[0];

    if (!embedding) {
      throw new TransformersError(
        "Embedding pipeline returned empty result",
        "INFERENCE_FAILED",
      );
    }

    return {
      embedding,
      dimensions: embedding.length,
    };
  } catch (error) {
    if (error instanceof TransformersError) throw error;
    throw new TransformersError(
      `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`,
      "INFERENCE_FAILED",
    );
  }
}

/**
 * Classify text into one of the provided candidate labels using
 * a zero-shot classification pipeline.
 *
 * @param text - The text to classify
 * @param labels - Candidate labels to classify against
 * @param model - Optional model override
 * @returns Array of classification results sorted by score descending
 */
export async function classifyText(
  text: string,
  labels: string[],
  model?: string,
): Promise<ClassificationResult[]> {
  if (labels.length === 0) {
    throw new TransformersError(
      "At least one candidate label is required",
      "INFERENCE_FAILED",
    );
  }

  const modelId = model ?? DEFAULT_MODELS.classification;

  try {
    const pipe = await getCachedPipeline("zero-shot-classification", modelId);

    const output = await pipe(text, {
      candidate_labels: labels,
    });

    // Zero-shot classification returns { labels: string[], scores: number[] }
    const result = output as unknown as {
      labels: string[];
      scores: number[];
    };

    const results: ClassificationResult[] = result.labels.map(
      (label: string, idx: number) => ({
        label,
        score: result.scores[idx] ?? 0,
      }),
    );

    // Sort descending by score
    results.sort((a, b) => b.score - a.score);

    return results;
  } catch (error) {
    if (error instanceof TransformersError) throw error;
    throw new TransformersError(
      `Classification failed: ${error instanceof Error ? error.message : String(error)}`,
      "INFERENCE_FAILED",
    );
  }
}

/**
 * Summarize text using a summarization pipeline.
 *
 * @param text - The text to summarize
 * @param model - Optional model override
 * @returns The generated summary
 */
export async function summarizeText(
  text: string,
  model?: string,
): Promise<SummarizationResult> {
  const modelId = model ?? DEFAULT_MODELS.summarization;

  try {
    const pipe = await getCachedPipeline("summarization", modelId);

    const output = await pipe(text, {
      max_new_tokens: 128,
      min_length: 30,
    });

    const results = output as SummarizationPipelineOutput;
    const first = results[0];

    if (!first) {
      throw new TransformersError(
        "Summarization pipeline returned empty result",
        "INFERENCE_FAILED",
      );
    }

    return {
      summary: first.summary_text,
    };
  } catch (error) {
    if (error instanceof TransformersError) throw error;
    throw new TransformersError(
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
      "INFERENCE_FAILED",
    );
  }
}

/**
 * Extract sentiment from text using a sentiment analysis pipeline.
 *
 * @param text - The text to analyze
 * @param model - Optional model override
 * @returns Sentiment label and confidence score
 */
export async function extractSentiment(
  text: string,
  model?: string,
): Promise<SentimentResult> {
  const modelId = model ?? DEFAULT_MODELS.sentiment;

  try {
    const pipe = await getCachedPipeline("sentiment-analysis", modelId);

    const output = await pipe(text);
    const results = output as SentimentPipelineOutput;
    const first = results[0];

    if (!first) {
      throw new TransformersError(
        "Sentiment analysis returned empty result",
        "INFERENCE_FAILED",
      );
    }

    return {
      label: first.label,
      score: first.score,
    };
  } catch (error) {
    if (error instanceof TransformersError) throw error;
    throw new TransformersError(
      `Sentiment analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      "INFERENCE_FAILED",
    );
  }
}

/**
 * Dispose all cached pipelines and free memory.
 * Call this when the AI features are no longer needed.
 */
export async function disposePipelines(): Promise<void> {
  const disposals: Promise<void>[] = [];

  for (const [key, pipe] of pipelineCache.entries()) {
    if (pipe.dispose) {
      disposals.push(
        pipe.dispose().catch(() => {
          // Best-effort cleanup
        }),
      );
    }
    pipelineCache.delete(key);
  }

  await Promise.all(disposals);
}

/**
 * Check if a specific pipeline is already cached and ready.
 *
 * @param task - The pipeline task type
 * @param model - The model identifier (uses default if not specified)
 * @returns true if the pipeline is cached
 */
export function isPipelineCached(
  task: keyof typeof DEFAULT_MODELS,
  model?: string,
): boolean {
  const modelId = model ?? DEFAULT_MODELS[task];
  return pipelineCache.has(`${task}:${modelId}`);
}
