// ── RAG Pipeline ─────────────────────────────────────────────────────
// Retrieval-Augmented Generation as a first-class primitive.
// Auto-indexes content → embeds → stores in Qdrant → retrieves for AI.

import { z } from "zod";
import {
  type SearchHit,
  createQdrantClient,
  ensureCollection,
  searchSimilar,
  upsertVectors,
} from "../vector/qdrant";

// ── Schemas ──────────────────────────────────────────────────────────

export const ContentDocumentSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.object({
    title: z.string().optional(),
    source: z.string(), // e.g., "page", "document", "component", "user-content"
    type: z.string(), // MIME type or content category
    url: z.string().optional(),
    createdAt: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export type ContentDocument = z.infer<typeof ContentDocumentSchema>;

export const RAGQuerySchema = z.object({
  query: z.string(),
  maxResults: z.number().int().min(1).max(50).default(5),
  scoreThreshold: z.number().min(0).max(1).default(0.7),
  filter: z.record(z.string(), z.unknown()).optional(),
});

export type RAGQuery = z.infer<typeof RAGQuerySchema>;

export interface RAGResult {
  context: string;
  sources: Array<{
    id: string | number;
    score: number;
    title?: string;
    source?: string;
    snippet: string;
  }>;
  totalTokensEstimate: number;
}

// ── Embedding Function Type ──────────────────────────────────────────

export type EmbedFunction = (text: string) => Promise<number[]>;

// ── RAG Pipeline Class ───────────────────────────────────────────────

export class RAGPipeline {
  private embedFn: EmbedFunction;
  private collection: string;
  private qdrantUrl: string | undefined;
  private qdrantApiKey: string | undefined;

  constructor(config: {
    embedFn: EmbedFunction;
    collection?: string;
    qdrantUrl?: string;
    qdrantApiKey?: string;
  }) {
    this.embedFn = config.embedFn;
    this.collection = config.collection ?? "rag_content";
    this.qdrantUrl = config.qdrantUrl;
    this.qdrantApiKey = config.qdrantApiKey;
  }

  private getClient() {
    const cfg: { url?: string; apiKey?: string } = {};
    if (this.qdrantUrl !== undefined) cfg.url = this.qdrantUrl;
    if (this.qdrantApiKey !== undefined) cfg.apiKey = this.qdrantApiKey;
    return createQdrantClient(cfg);
  }

  /**
   * Initialize the collection if it doesn't exist.
   */
  async initialize(vectorSize = 1536): Promise<void> {
    const client = this.getClient();
    await ensureCollection(client, this.collection, vectorSize);
  }

  /**
   * Index a document: embed its content and store in vector DB.
   */
  async indexDocument(doc: ContentDocument): Promise<void> {
    const parsed = ContentDocumentSchema.parse(doc);
    const vector = await this.embedFn(parsed.content);
    const client = this.getClient();

    await upsertVectors(
      client,
      [
        {
          id: parsed.id,
          vector,
          payload: {
            content: parsed.content,
            ...parsed.metadata,
          },
        },
      ],
      this.collection,
    );
  }

  /**
   * Index multiple documents in batch.
   */
  async indexBatch(docs: ContentDocument[]): Promise<void> {
    const parsed = docs.map((d) => ContentDocumentSchema.parse(d));

    // Embed all documents
    const embeddings = await Promise.all(parsed.map((d) => this.embedFn(d.content)));

    const client = this.getClient();
    await upsertVectors(
      client,
      parsed.map((doc, i) => ({
        id: doc.id,
        vector: embeddings[i] ?? [],
        payload: {
          content: doc.content,
          ...doc.metadata,
        },
      })),
      this.collection,
    );
  }

  /**
   * Query the RAG pipeline: embed query → search vectors → return context.
   */
  async query(input: RAGQuery): Promise<RAGResult> {
    const parsed = RAGQuerySchema.parse(input);
    const queryVector = await this.embedFn(parsed.query);
    const client = this.getClient();

    const searchOpts: {
      collection: string;
      limit: number;
      scoreThreshold: number;
      filter?: Record<string, unknown>;
    } = {
      collection: this.collection,
      limit: parsed.maxResults,
      scoreThreshold: parsed.scoreThreshold,
    };
    if (parsed.filter !== undefined) searchOpts.filter = parsed.filter;

    const hits = await searchSimilar(client, queryVector, searchOpts);

    return this.buildResult(hits);
  }

  /**
   * Build a RAG result from search hits, assembling context for the LLM.
   */
  private buildResult(hits: SearchHit[]): RAGResult {
    const sources: RAGResult["sources"] = hits.map((hit) => {
      const item: RAGResult["sources"][number] = {
        id: hit.id,
        score: hit.score,
        snippet: truncate((hit.payload.content as string | undefined) ?? "", 500),
      };
      const title = hit.payload.title;
      if (typeof title === "string") item.title = title;
      const source = hit.payload.source;
      if (typeof source === "string") item.source = source;
      return item;
    });

    // Assemble context string for LLM injection
    const contextParts = sources.map(
      (s, i) => `[Source ${i + 1}${s.title ? `: ${s.title}` : ""}]\n${s.snippet}`,
    );
    const context = contextParts.join("\n\n---\n\n");

    // Rough token estimate (~4 chars per token)
    const totalTokensEstimate = Math.ceil(context.length / 4);

    return { context, sources, totalTokensEstimate };
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

// ── Factory ──────────────────────────────────────────────────────────

export function createRAGPipeline(config: {
  embedFn: EmbedFunction;
  collection?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
}): RAGPipeline {
  return new RAGPipeline(config);
}
