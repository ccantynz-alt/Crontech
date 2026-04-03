/**
 * Type definitions for the Sentinel competitive intelligence engine.
 *
 * All types are defined as Zod schemas in ./schemas/index.ts and
 * re-exported here for backward compatibility with existing code.
 */
export type {
  Release,
  PackageVersion,
  AlertSeverity,
  SlackMessage,
  SentinelConfig,
  HackerNewsItem,
  ArxivPaper,
  TechNewsItem,
  DiscordMessage,
  AlertTarget,
  AlertPayload,
  CollectorStatus,
  DeadManSwitchConfig,
  ThreatLevel,
  IntelligenceItem,
  WeeklyBrief,
} from "./schemas/index.js";
