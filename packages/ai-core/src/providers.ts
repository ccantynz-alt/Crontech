// ── AI Provider Factory ───────────────────────────────────────────
// Creates AI providers based on compute tier and environment config.
// Supports OpenAI-compatible endpoints (OpenAI, Azure, local, etc.)

import { createOpenAI, type OpenAIProviderSettings } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { ComputeTier } from "./compute-tier";

// ── Environment Configuration Schema ──────────────────────────────

export interface AIProviderConfig {
  apiKey: string;
  baseURL: string | undefined;
  model: string;
  organization: string | undefined;
}

export interface AIProviderEnv {
  /** Primary provider (cloud tier) - typically OpenAI GPT-4 class */
  cloud: AIProviderConfig;
  /** Edge provider - lighter model for fast inference */
  edge: AIProviderConfig;
  /** Fallback model when primary is unavailable */
  fallback: AIProviderConfig | undefined;
}

/**
 * Reads a single env var, returning undefined (not "") when absent.
 */
function env(key: string): string | undefined {
  // Works in Bun, Node, and Cloudflare Workers
  try {
    // biome-ignore lint/complexity/useLiteralKeys: dynamic env access
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env[key] ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads AI provider configuration from environment variables.
 * All keys are optional at read time -- validated at usage time.
 */
export function readProviderEnv(): AIProviderEnv {
  return {
    cloud: {
      apiKey: env("OPENAI_API_KEY") ?? "",
      baseURL: env("OPENAI_BASE_URL"),
      model: env("AI_CLOUD_MODEL") ?? "gpt-4o",
      organization: env("OPENAI_ORG_ID"),
    },
    edge: {
      apiKey: env("AI_EDGE_API_KEY") ?? env("OPENAI_API_KEY") ?? "",
      baseURL: env("AI_EDGE_BASE_URL") ?? env("OPENAI_BASE_URL"),
      model: env("AI_EDGE_MODEL") ?? "gpt-4o-mini",
      organization: env("OPENAI_ORG_ID"),
    },
    fallback: env("AI_FALLBACK_API_KEY")
      ? {
          apiKey: env("AI_FALLBACK_API_KEY") ?? "",
          baseURL: env("AI_FALLBACK_BASE_URL"),
          model: env("AI_FALLBACK_MODEL") ?? "gpt-4o-mini",
          organization: undefined,
        }
      : undefined,
  };
}

// ── Provider Factory ──────────────────────────────────────────────

/**
 * Creates an OpenAI-compatible provider instance from config.
 * Works with OpenAI, Azure OpenAI, Together AI, Groq, local models, etc.
 *
 * Handles `exactOptionalPropertyTypes` by only including defined values.
 */
function createProviderFromConfig(
  config: AIProviderConfig,
): ReturnType<typeof createOpenAI> {
  const settings: OpenAIProviderSettings = {
    apiKey: config.apiKey,
  };
  if (config.baseURL !== undefined) {
    settings.baseURL = config.baseURL;
  }
  if (config.organization !== undefined) {
    settings.organization = config.organization;
  }
  return createOpenAI(settings);
}

/**
 * Returns a language model for the given compute tier.
 * Cloud tier gets the most capable model. Edge tier gets the fastest.
 * Client tier is handled browser-side (WebLLM) -- not managed here.
 */
export function getModelForTier(
  tier: ComputeTier,
  providerEnv?: AIProviderEnv,
): LanguageModel {
  const config = providerEnv ?? readProviderEnv();

  switch (tier) {
    case "cloud": {
      const provider = createProviderFromConfig(config.cloud);
      return provider(config.cloud.model);
    }
    case "edge": {
      const provider = createProviderFromConfig(config.edge);
      return provider(config.edge.model);
    }
    case "client": {
      // Client-side inference is handled by WebLLM in the browser.
      // If this is called server-side, fall back to edge tier.
      const edgeProvider = createProviderFromConfig(config.edge);
      return edgeProvider(config.edge.model);
    }
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unknown compute tier: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Returns a fallback model when the primary provider fails.
 * Returns undefined if no fallback is configured.
 */
export function getFallbackModel(
  providerEnv?: AIProviderEnv,
): LanguageModel | undefined {
  const config = providerEnv ?? readProviderEnv();
  if (!config.fallback) return undefined;

  const provider = createProviderFromConfig(config.fallback);
  return provider(config.fallback.model);
}

/**
 * Returns the default model (cloud tier) for general-purpose use.
 */
export function getDefaultModel(providerEnv?: AIProviderEnv): LanguageModel {
  return getModelForTier("cloud", providerEnv);
}
