export { computeTierRouter, type ComputeTier, type DeviceCapabilities } from "./compute-tier";
export type { ModelRequirements } from "./compute-tier";

export {
  readProviderEnv,
  getModelForTier,
  getFallbackModel,
  getDefaultModel,
  type AIProviderConfig,
  type AIProviderEnv,
} from "./providers";

export {
  searchContent,
  generateComponent,
  analyzeCode,
  allTools,
  type SearchResult,
  type GenerateComponentResult,
  type CodeIssue,
  type CodeAnalysisResult,
  type ToolName,
} from "./tools";

export {
  streamSiteBuilder,
  generatePageLayout,
  SITE_BUILDER_SYSTEM_PROMPT,
  PageLayoutSchema,
  type SiteBuilderConfig,
  type PageLayout,
} from "./agents/site-builder";

export {
  createQdrantClient,
  ensureCollection,
  upsertVectors,
  searchSimilar,
  deleteVectors,
  checkQdrantHealth,
  type QdrantConfig,
  type VectorPoint,
  type SearchOptions,
  type SearchHit,
} from "./vector/qdrant";

export {
  RAGPipeline,
  createRAGPipeline,
  ContentDocumentSchema,
  RAGQuerySchema,
  type ContentDocument,
  type RAGQuery,
  type RAGResult,
  type EmbedFunction,
} from "./rag/pipeline";

export {
  describeComponentCatalog,
  buildGenerativeUIPrompt,
  validateComponentTree,
  processGenerativeUIOutput,
  type GenerativeUIRequest,
  type GenerativeUIResult,
} from "./generative-ui/renderer";
