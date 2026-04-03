import { z } from "zod";

// ---------------------------------------------------------------------------
// Collector Schemas
// ---------------------------------------------------------------------------

export const ReleaseSchema = z.object({
  repo: z.string(),
  tag: z.string(),
  name: z.string(),
  publishedAt: z.string().datetime(),
  url: z.string().url(),
});

export const PackageVersionSchema = z.object({
  name: z.string(),
  version: z.string(),
  publishedAt: z.string().datetime(),
});

export const HackerNewsItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string().url().optional(),
  score: z.number(),
  by: z.string(),
  time: z.number(),
  descendants: z.number().optional(),
});

export const ArxivPaperSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  authors: z.array(z.string()),
  publishedAt: z.string().datetime(),
  pdfUrl: z.string().url(),
  categories: z.array(z.string()),
});

export const TechNewsItemSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("hackernews"),
    item: HackerNewsItemSchema,
  }),
  z.object({
    source: z.literal("arxiv"),
    item: ArxivPaperSchema,
  }),
]);

// ---------------------------------------------------------------------------
// Alert Schemas
// ---------------------------------------------------------------------------

export const AlertSeveritySchema = z.enum(["critical", "info", "weekly"]);

export const SlackMessageSchema = z.object({
  channel: z.string(),
  text: z.string(),
  severity: AlertSeveritySchema,
});

export const DiscordMessageSchema = z.object({
  content: z.string(),
  embeds: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        color: z.number().optional(),
        timestamp: z.string().datetime().optional(),
        fields: z
          .array(
            z.object({
              name: z.string(),
              value: z.string(),
              inline: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export const AlertTargetSchema = z.enum(["slack", "discord", "both"]);

export const AlertPayloadSchema = z.object({
  target: AlertTargetSchema,
  severity: AlertSeveritySchema,
  title: z.string(),
  body: z.string(),
  channel: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Dead-Man's Switch Schemas
// ---------------------------------------------------------------------------

export const CollectorStatusSchema = z.object({
  collectorName: z.string(),
  lastRunAt: z.string().datetime(),
  lastSuccessAt: z.string().datetime().optional(),
  consecutiveFailures: z.number().int().min(0),
  isHealthy: z.boolean(),
});

export const DeadManSwitchConfigSchema = z.object({
  /** Maximum allowed time (ms) between successful collector runs before alerting. */
  maxSilenceMs: z.number().positive(),
  /** Check interval (ms) for the dead-man's switch monitor. */
  checkIntervalMs: z.number().positive(),
});

// ---------------------------------------------------------------------------
// Intelligence Brief Schemas
// ---------------------------------------------------------------------------

export const ThreatLevelSchema = z.enum(["low", "medium", "high", "critical"]);

export const IntelligenceItemSchema = z.object({
  source: z.string(),
  title: z.string(),
  summary: z.string(),
  threatLevel: ThreatLevelSchema,
  relevance: z.number().min(0).max(1),
  actionRequired: z.boolean(),
  suggestedAction: z.string().optional(),
});

export const WeeklyBriefSchema = z.object({
  generatedAt: z.string().datetime(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  executiveSummary: z.string(),
  threatAssessment: z.object({
    overall: ThreatLevelSchema,
    details: z.string(),
  }),
  competitorActivity: z.array(IntelligenceItemSchema),
  technologyTrends: z.array(IntelligenceItemSchema),
  recommendations: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Sentinel Config Schema (replaces the unvalidated interface)
// ---------------------------------------------------------------------------

export const SentinelConfigSchema = z.object({
  githubIntervalMs: z.number().positive().default(6 * 60 * 60 * 1000),
  npmIntervalMs: z.number().positive().default(60 * 60 * 1000),
  techNewsIntervalMs: z.number().positive().default(6 * 60 * 60 * 1000),
  deadManCheckIntervalMs: z.number().positive().default(15 * 60 * 1000),
  deadManMaxSilenceMs: z.number().positive().default(12 * 60 * 60 * 1000),
  weeklyBriefCronDay: z.number().int().min(0).max(6).default(1), // Monday
  slackWebhookUrl: z.string().url().optional(),
  discordWebhookUrl: z.string().url().optional(),
  hnMinScore: z.number().int().min(0).default(100),
  arxivCategories: z
    .array(z.string())
    .default(["cs.AI", "cs.LG", "cs.CL", "cs.SE"]),
});

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

export type Release = z.infer<typeof ReleaseSchema>;
export type PackageVersion = z.infer<typeof PackageVersionSchema>;
export type HackerNewsItem = z.infer<typeof HackerNewsItemSchema>;
export type ArxivPaper = z.infer<typeof ArxivPaperSchema>;
export type TechNewsItem = z.infer<typeof TechNewsItemSchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type SlackMessage = z.infer<typeof SlackMessageSchema>;
export type DiscordMessage = z.infer<typeof DiscordMessageSchema>;
export type AlertTarget = z.infer<typeof AlertTargetSchema>;
export type AlertPayload = z.infer<typeof AlertPayloadSchema>;
export type CollectorStatus = z.infer<typeof CollectorStatusSchema>;
export type DeadManSwitchConfig = z.infer<typeof DeadManSwitchConfigSchema>;
export type ThreatLevel = z.infer<typeof ThreatLevelSchema>;
export type IntelligenceItem = z.infer<typeof IntelligenceItemSchema>;
export type WeeklyBrief = z.infer<typeof WeeklyBriefSchema>;
export type SentinelConfig = z.infer<typeof SentinelConfigSchema>;
