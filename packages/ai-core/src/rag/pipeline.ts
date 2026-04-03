// ── RAG Pipeline ─────────────────────────────────────────────────
// Core Retrieval-Augmented Generation pipeline.
// Indexes content into Qdrant, retrieves relevant chunks via
// semantic search, and generates augmented responses.

import { z } from "zod";
import { generateText } from "ai";
import { initCollection, upsertVectors, searchVectors } from "../vector-store";
import { getDefaultModel, readProviderEnv } from "../providers";
import { chunkText, type TextChunk, ChunkOptionsSchema } from "./chunker";
import {
  createEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingProviderName,
} from "./embeddings";

// ── Schemas ──────────────────────────────────────────────────────

export const ContentMetadataSchema = z.object({
  /** Unique identifier for the content source */
  sourceId: z.string(),
  /** Human-readable title */
  title: z.string(),
  /** Content type for filtering */
  contentType: z.enum(["page", "component", "document", "media", "code"]),
  /** URL or path to the original content */
  url: z.string().default(""),
  /** ISO timestamp of when the content was created or last modified */
  updatedAt: z.string().default(""),
  /** Arbitrary key-value metadata to store alongside vectors */
  tags: z.array(z.string()).default([]),
});

export type ContentMetadata = z.infer<typeof ContentMetadataSchema>;

export const RetrieveOptionsSchema = z.object({
  /** Maximum number of chunks to retrieve */
  limit: z.number().int().min(1).max(100).default(5),
  /** Minimum similarity score threshold (0-1) */
  scoreThreshold: z.number().min(0).max(1).default(0.5),
  /** Filter by content type */
  contentType: z
    .enum(["page", "component", "document", "media", "code"])
    .optional(),
  /** Filter by source ID */
  sourceId: z.string().optional(),
  /** Filter by tags (any match) */
  tags: z.array(z.string()).optional(),
});

export type RetrieveOptions = z.infer<typeof RetrieveOptionsSchema>;

export const RetrievedChunkSchema = z.object({
  /** The text content of this chunk */
  content: z.string(),
  /** Similarity score (0-1, higher is more relevant) */
  score: z.number(),
  /** Source metadata */
  metadata: ContentMetadataSchema,
  /** Chunk index within the original document */
  chunkIndex: z.number().int().min(0),
  /** Total chunks from this source */
  totalChunks: z.number().int().min(1),
});

export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;

export const IndexContentInputSchema = z.object({
  content: z.string().min(1, "Content must not be empty"),
  metadata: ContentMetadataSchema,
  chunkOptions: ChunkOptionsSchema.partial().optional(),
});

export const QueryInputSchema = z.object({
  query: z.string().min(1, "Query must not be empty"),
  options: RetrieveOptionsSchema.partial().optional(),
});

export const GenerateWithContextInputSchema = z.object({
  query: z.string().min(1, "Query must not be empty"),
  context: z.array(RetrievedChunkSchema).min(1, "At least one context chunk required"),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().int().min(1).max(16384).default(2048),
  temperature: z.number().min(0).max(2).default(0.7),
});

// ── Pipeline Configuration ───────────────────────────────────────

export interface RAGPipelineConfig {
  /** Qdrant collection name for this pipeline */
  collectionName: string;
  /** Embedding provider to use */
  embeddingProvider: EmbeddingProviderName;
  /** Default chunk options */
  defaultChunkOptions: Partial<z.infer<typeof ChunkOptionsSchema>>;
}

const DEFAULT_COLLECTION = "rag_content";

// ── Core Pipeline Functions ──────────────────────────────────────

/**
 * Index content into the RAG pipeline.
 *
 * 1. Chunks the content using configurable sliding window
 * 2. Generates embeddings for each chunk
 * 3. Stores vectors + metadata in Qdrant
 */
export async function indexContent(
  content: string,
  metadata: ContentMetadata,
  options?: {
    chunkOptions?: Partial<z.infer<typeof ChunkOptionsSchema>>;
    collectionName?: string;
    embeddingProvider?: EmbeddingProvider;
  },
): Promise<void> {
  const validatedMetadata = ContentMetadataSchema.parse(metadata);

  const collection = options?.collectionName ?? DEFAULT_COLLECTION;
  const provider = options?.embeddingProvider ?? createEmbeddingProvider();

  // Ensure the collection exists with the right vector dimensions
  await initCollection(collection, provider.dimensions);

  // Chunk the content
  const chunks = chunkText(content, options?.chunkOptions);

  if (chunks.length === 0) {
    return;
  }

  // Generate embeddings for all chunks
  const texts = chunks.map((c) => c.content);
  const embeddings = await provider.embedBatch(texts);

  // Build vector points with metadata
  const points = chunks.map((chunk: TextChunk, index: number) => {
    const embedding = embeddings[index];
    if (!embedding) {
      throw new Error(`Missing embedding for chunk ${index}`);
    }

    return {
      id: generateChunkId(validatedMetadata.sourceId, chunk.index),
      vector: embedding.vector,
      payload: {
        content: chunk.content,
        sourceId: validatedMetadata.sourceId,
        title: validatedMetadata.title,
        contentType: validatedMetadata.contentType,
        url: validatedMetadata.url,
        updatedAt: validatedMetadata.updatedAt,
        tags: validatedMetadata.tags,
        chunkIndex: chunk.index,
        totalChunks: chunk.totalChunks,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      },
    };
  });

  // Upsert into Qdrant
  await upsertVectors(collection, points);
}

/**
 * Retrieve relevant context chunks for a query.
 *
 * 1. Generates an embedding for the query
 * 2. Searches Qdrant for similar vectors
 * 3. Filters by score threshold and metadata
 * 4. Returns ranked chunks with metadata
 */
export async function retrieveContext(
  query: string,
  options?: Partial<RetrieveOptions>,
  pipelineOptions?: {
    collectionName?: string;
    embeddingProvider?: EmbeddingProvider;
  },
): Promise<RetrievedChunk[]> {
  const opts = RetrieveOptionsSchema.parse(options ?? {});
  const collection = pipelineOptions?.collectionName ?? DEFAULT_COLLECTION;
  const provider =
    pipelineOptions?.embeddingProvider ?? createEmbeddingProvider();

  // Generate query embedding
  const queryEmbedding = await provider.embed(query);

  // Build Qdrant filter from options
  const mustConditions: Array<{
    key: string;
    match: { value: string | number | boolean };
  }> = [];

  if (opts.contentType !== undefined) {
    mustConditions.push({
      key: "contentType",
      match: { value: opts.contentType },
    });
  }

  if (opts.sourceId !== undefined) {
    mustConditions.push({
      key: "sourceId",
      match: { value: opts.sourceId },
    });
  }

  const filter =
    mustConditions.length > 0 ? { must: mustConditions } : undefined;

  // Search Qdrant
  let results;
  try {
    results = await searchVectors(
      collection,
      queryEmbedding.vector,
      opts.limit,
      filter,
    );
  } catch {
    // Collection may not exist yet -- return empty results gracefully
    return [];
  }

  // Filter by score threshold and map to RetrievedChunk
  return results
    .filter((r) => r.score >= opts.scoreThreshold)
    .map((r) => ({
      content: (r.payload["content"] as string) ?? "",
      score: r.score,
      metadata: {
        sourceId: (r.payload["sourceId"] as string) ?? "",
        title: (r.payload["title"] as string) ?? "",
        contentType: (r.payload["contentType"] as ContentMetadata["contentType"]) ?? "document",
        url: (r.payload["url"] as string) ?? "",
        updatedAt: (r.payload["updatedAt"] as string) ?? "",
        tags: (r.payload["tags"] as string[]) ?? [],
      },
      chunkIndex: (r.payload["chunkIndex"] as number) ?? 0,
      totalChunks: (r.payload["totalChunks"] as number) ?? 1,
    }));
}

/**
 * Generate a response augmented with retrieved context.
 *
 * Constructs a prompt with the retrieved chunks as context
 * and generates a response using the configured AI model.
 */
export async function generateWithContext(
  query: string,
  context: RetrievedChunk[],
  options?: {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
  },
): Promise<string> {
  const systemPrompt =
    options?.systemPrompt ?? RAG_SYSTEM_PROMPT;
  const maxTokens = options?.maxTokens ?? 2048;
  const temperature = options?.temperature ?? 0.7;

  // Format context chunks into a structured prompt section
  const contextBlock = context
    .map(
      (chunk, i) =>
        `[Source ${i + 1}: "${chunk.metadata.title}" (score: ${chunk.score.toFixed(3)})]
${chunk.content}`,
    )
    .join("\n\n---\n\n");

  const providerEnv = readProviderEnv();
  const model = getDefaultModel(providerEnv);

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: `Context from knowledge base:

${contextBlock}

---

User question: ${query}

Answer based on the context above. If the context does not contain enough information to answer, say so clearly.`,
    maxOutputTokens: maxTokens,
    temperature,
  });

  return result.text;
}

// ── Convenience: Full RAG Query ──────────────────────────────────

/**
 * End-to-end RAG query: retrieve context then generate a response.
 * Combines retrieveContext and generateWithContext into a single call.
 */
export async function ragQuery(
  query: string,
  options?: {
    retrieveOptions?: Partial<RetrieveOptions>;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    collectionName?: string;
    embeddingProvider?: EmbeddingProvider;
  },
): Promise<{ answer: string; sources: RetrievedChunk[] }> {
  const retrieveExtra: { collectionName?: string; embeddingProvider?: EmbeddingProvider } = {};
  if (options?.collectionName) {
    retrieveExtra.collectionName = options.collectionName;
  }
  if (options?.embeddingProvider) {
    retrieveExtra.embeddingProvider = options.embeddingProvider;
  }
  const context = await retrieveContext(query, options?.retrieveOptions, retrieveExtra);

  if (context.length === 0) {
    return {
      answer:
        "I could not find any relevant information in the knowledge base to answer your question.",
      sources: [],
    };
  }

  const genOpts: { systemPrompt?: string; maxTokens?: number; temperature?: number } = {};
  if (options?.systemPrompt) {
    genOpts.systemPrompt = options.systemPrompt;
  }
  if (options?.maxTokens !== undefined) {
    genOpts.maxTokens = options.maxTokens;
  }
  if (options?.temperature !== undefined) {
    genOpts.temperature = options.temperature;
  }
  const answer = await generateWithContext(query, context, genOpts);

  return { answer, sources: context };
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Generate a deterministic numeric ID for a chunk.
 * Qdrant requires integer or UUID IDs.
 */
function generateChunkId(sourceId: string, chunkIndex: number): number {
  let hash = 0;
  const key = `${sourceId}:${chunkIndex}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  // Ensure positive integer
  return Math.abs(hash);
}

const RAG_SYSTEM_PROMPT = `You are an AI assistant with access to a knowledge base. Answer questions accurately based on the provided context. Follow these rules:

1. Base your answers on the provided context chunks.
2. If the context contains the answer, provide it clearly and concisely.
3. If the context is insufficient, explicitly state what information is missing.
4. Cite sources by referencing their titles when relevant.
5. Do not make up information that is not in the context.
6. If multiple sources provide different information, acknowledge the differences.`;
