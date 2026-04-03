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
  listCollections,
  initCollection,
  upsertVectors,
  searchVectors,
  type VectorPoint,
  type VectorSearchResult,
  type VectorFilter,
} from "./vector-store";

export {
  streamSiteBuilder,
  generatePageLayout,
  SITE_BUILDER_SYSTEM_PROMPT,
  PageLayoutSchema,
  type SiteBuilderConfig,
  type PageLayout,
} from "./agents/site-builder";

export {
  chunkText,
  ChunkOptionsSchema,
  TextChunkSchema,
  type ChunkOptions,
  type TextChunk,
  createEmbeddingProvider,
  DevEmbeddingProvider,
  OpenAIEmbeddingProvider,
  LocalEmbeddingProvider,
  EmbeddingResultSchema,
  type EmbeddingProvider,
  type EmbeddingProviderName,
  type EmbeddingResult,
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
} from "./rag";

export {
  streamComponents,
  type ComponentStreamEvent,
  type ComponentStartEvent,
  type ComponentUpdateEvent,
  type ComponentCompleteEvent,
  type ComponentErrorEvent,
  type StreamDoneEvent,
  type ComponentStreamConfig,
} from "./streaming/component-stream";

export {
  classifyRisk,
  createApprovalGate,
  type RiskLevel,
  type ApprovalRequest,
  type ApprovalDecision,
  type ApprovalCallback,
  type ApprovalGate,
} from "./approval";

export {
  createOrchestratorGraph,
  runOrchestrator,
  OrchestratorState,
  PlanSchema,
  PlanStepSchema,
  ReviewResultSchema,
  PLANNER_SYSTEM_PROMPT,
  BUILDER_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
  type Plan,
  type PlanStep,
  type ReviewResult,
  type OrchestratorStatus,
  type OrchestratorConfig,
  type OrchestratorResult,
} from "./agents/orchestrator";

export {
  streamWebsiteBuilder,
  buildWebsite,
  generatePage,
  analyzeIntent,
  refineWebsite,
  WEBSITE_BUILDER_SYSTEM_PROMPT,
  websiteBuilderTools,
  PageComponentsSchema,
  type WebsiteBuilderConfig,
  type BuilderEvent,
  type BuildPhase,
  type BuildResult,
  type Intent,
  type LayoutSection,
  type PageComponents,
} from "./agents/website-builder";

export {
  layoutPage,
  addSection,
  updateStyles,
  layoutTools,
  type PageLayoutResult,
  type PageSection,
  type SectionSlot,
  type LayoutToolName,
} from "./agents/tools/layout";
