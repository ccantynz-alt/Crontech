// ── RAG Module Barrel Export ──────────────────────────────────────
// Re-exports all RAG pipeline types, schemas, and functions.

export {
  chunkText,
  ChunkOptionsSchema,
  TextChunkSchema,
  type ChunkOptions,
  type TextChunk,
} from "./chunker";

export {
  createEmbeddingProvider,
  DevEmbeddingProvider,
  OpenAIEmbeddingProvider,
  LocalEmbeddingProvider,
  EmbeddingResultSchema,
  type EmbeddingProvider,
  type EmbeddingProviderName,
  type EmbeddingResult,
} from "./embeddings";

export {
  indexContent,
  retrieveContext,
  generateWithContext,
  ragQuery,
  ContentMetadataSchema,
  RetrieveOptionsSchema,
  RetrievedChunkSchema,
  IndexContentInputSchema,
  QueryInputSchema,
  GenerateWithContextInputSchema,
  type ContentMetadata,
  type RetrieveOptions,
  type RetrievedChunk,
  type RAGPipelineConfig,
} from "./pipeline";
