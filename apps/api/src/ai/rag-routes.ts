// ── RAG API Routes (Hono) ────────────────────────────────────────
// HTTP endpoints for the RAG pipeline: indexing content, querying
// with retrieval-augmented generation, and listing collections.
// All inputs validated with Zod. Responses are JSON.

import { Hono } from "hono";
import { z } from "zod";
import {
  indexContent,
  retrieveContext,
  ragQuery,
  listCollections,
  IndexContentInputSchema,
  QueryInputSchema,
  RetrieveOptionsSchema,
} from "@back-to-the-future/ai-core";

// ── Route Definitions ────────────────────────────────────────────

export const ragRoutes = new Hono();

/**
 * POST /ai/rag/index
 * Index new content into the RAG pipeline.
 * Chunks the content, generates embeddings, and stores in Qdrant.
 */
ragRoutes.post("/index", async (c) => {
  const body = await c.req.json();
  const parsed = IndexContentInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { content, metadata, chunkOptions } = parsed.data;

  try {
    const indexOpts: { chunkOptions?: Record<string, unknown> } = {};
    if (chunkOptions !== undefined) {
      indexOpts.chunkOptions = chunkOptions;
    }
    await indexContent(content, metadata, indexOpts);

    return c.json({
      success: true,
      message: `Content indexed successfully for source "${metadata.sourceId}"`,
      metadata: {
        sourceId: metadata.sourceId,
        title: metadata.title,
        contentType: metadata.contentType,
        contentLength: content.length,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Indexing failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /ai/rag/query
 * Query the RAG pipeline. Retrieves relevant context and generates
 * an augmented response.
 */
ragRoutes.post("/query", async (c) => {
  const body = await c.req.json();
  const parsed = QueryInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { query, options } = parsed.data;

  try {
    const ragOpts: { retrieveOptions?: Record<string, unknown> } = {};
    if (options !== undefined) {
      ragOpts.retrieveOptions = options;
    }
    const result = await ragQuery(query, ragOpts);

    return c.json({
      success: true,
      answer: result.answer,
      sources: result.sources.map((s) => ({
        content: s.content,
        score: s.score,
        title: s.metadata.title,
        sourceId: s.metadata.sourceId,
        contentType: s.metadata.contentType,
        url: s.metadata.url,
        chunkIndex: s.chunkIndex,
        totalChunks: s.totalChunks,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "RAG query failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /ai/rag/retrieve
 * Retrieve relevant chunks without generation.
 * Useful when you want to do your own generation or just need context.
 */
ragRoutes.post("/retrieve", async (c) => {
  const body = await c.req.json();

  const RetrieveInputSchema = z.object({
    query: z.string().min(1, "Query must not be empty"),
    options: RetrieveOptionsSchema.partial().optional(),
  });

  const parsed = RetrieveInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { query, options } = parsed.data;

  try {
    // Strip undefined values to satisfy exactOptionalPropertyTypes
    const retrieveOpts = options !== undefined
      ? Object.fromEntries(
          Object.entries(options).filter(([, v]) => v !== undefined),
        )
      : undefined;
    const chunks = await retrieveContext(query, retrieveOpts);

    return c.json({
      success: true,
      query,
      chunks: chunks.map((chunk) => ({
        content: chunk.content,
        score: chunk.score,
        metadata: chunk.metadata,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
      })),
      count: chunks.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Retrieval failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /ai/rag/collections
 * List available RAG collections and their status.
 * Returns a list of Qdrant collection names.
 */
ragRoutes.get("/collections", async (c) => {
  try {
    const names = await listCollections();
    const collections = names.map((name) => ({ name }));

    return c.json({
      success: true,
      collections,
      count: collections.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list collections";

    // If QDRANT_URL is not set, the vector-store client will throw.
    // Return an empty list gracefully.
    if (message.includes("QDRANT_URL")) {
      return c.json({
        success: true,
        collections: [],
        count: 0,
        message: "QDRANT_URL not configured. No collections available.",
      });
    }

    return c.json({ error: message }, 500);
  }
});

export default ragRoutes;
