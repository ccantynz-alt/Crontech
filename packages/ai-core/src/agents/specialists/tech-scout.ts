// ── Tech Scout Specialist Agent ──────────────────────────────────
// Identifies emerging technologies, evaluates relevance to the Cronix
// platform, and produces structured TechReport assessments.
// Uses tools: web search, npm registry search, GitHub trending.

import { generateObject, streamText } from "ai";
import { z } from "zod";
import { getModelForTier, getDefaultModel } from "../../providers";
import {
  TechReportSchema,
  type AgentConfig,
} from "../types";

// ── Input Schema ────────────────────────────────────────────────

export const TechScoutInputSchema = z.object({
  query: z
    .string()
    .describe("Technology or category to investigate (e.g., 'WebGPU frameworks', 'edge runtimes')"),
  categories: z
    .array(
      z.enum([
        "framework",
        "library",
        "runtime",
        "database",
        "ai",
        "infrastructure",
        "tooling",
        "other",
      ]),
    )
    .optional()
    .describe("Filter to specific technology categories"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum number of technologies to report on"),
});

export type TechScoutInput = z.infer<typeof TechScoutInputSchema>;

// ── Output Schema ───────────────────────────────────────────────

export const TechScoutOutputSchema = z.object({
  summary: z.string().describe("Executive summary of findings"),
  technologies: z.array(TechReportSchema),
  trendAnalysis: z
    .string()
    .describe("Analysis of broader trends observed during research"),
  recommendations: z.array(
    z.object({
      action: z.enum(["adopt", "evaluate", "monitor", "ignore"]),
      technology: z.string(),
      reasoning: z.string(),
      priority: z.enum(["critical", "high", "medium", "low"]),
    }),
  ),
});

export type TechScoutOutput = z.infer<typeof TechScoutOutputSchema>;

// ── System Prompt ───────────────────────────────────────────────

const TECH_SCOUT_SYSTEM_PROMPT = `You are the Tech Scout agent for the Cronix platform -- the most advanced AI-native full-stack platform.

## Your Mission
Identify emerging technologies that could strengthen or threaten Cronix's competitive position.

## Cronix Stack Context
- Runtime: Bun
- Frontend: SolidJS + SolidStart (zero HTML, component-only)
- Backend: Hono on Bun
- API: tRPC v11
- Database: Turso (edge SQLite) + Neon (serverless Postgres) + Qdrant (vector)
- AI: Vercel AI SDK 6, LangGraph, WebGPU inference, Transformers.js
- Edge: Cloudflare Workers
- Styling: Tailwind v4
- Real-time: Yjs CRDTs + WebSockets

## Evaluation Criteria
1. **Performance**: Is it faster than our current solution?
2. **Developer Experience**: Does it reduce complexity?
3. **AI Compatibility**: Does it enhance AI-native workflows?
4. **Edge Readiness**: Does it work at the edge?
5. **Maturity**: Is it production-ready or experimental?
6. **Community**: Is it actively maintained with growing adoption?

## Relevance Scoring
- 0.0-0.3: Tangentially related, not actionable
- 0.3-0.6: Interesting but not immediately relevant
- 0.6-0.8: Directly relevant, should evaluate
- 0.8-1.0: Critical -- potential game-changer or threat

## Rules
- Be objective. Do not recommend adoption of immature tech.
- Identify THREATS as well as opportunities.
- Compare against current Cronix stack components specifically.
- Include specific links when possible.
`;

// ── Tech Scout Agent Function ───────────────────────────────────

/**
 * Run the Tech Scout agent to investigate technologies.
 * Returns a structured report with findings and recommendations.
 */
export async function runTechScout(
  input: TechScoutInput,
  config: AgentConfig,
): Promise<TechScoutOutput> {
  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  const categoryFilter = input.categories
    ? `\nFocus on these categories: ${input.categories.join(", ")}`
    : "";

  const { object } = await generateObject({
    model,
    schema: TechScoutOutputSchema,
    system: TECH_SCOUT_SYSTEM_PROMPT,
    prompt: `Research the following technology area and produce a comprehensive report.

Query: ${input.query}${categoryFilter}
Max technologies to report: ${input.maxResults}

Identify the most relevant emerging technologies, evaluate each one, and provide actionable recommendations.`,
    temperature: config.temperature ?? 0.4,
  });

  // Emit events if handler is configured
  config.onEvent?.({
    type: "complete",
    finalOutput: JSON.stringify(object),
    timestamp: Date.now(),
  });

  return object;
}

/**
 * Stream the Tech Scout analysis as text output.
 * Useful for real-time display while the analysis runs.
 */
export function streamTechScout(
  input: TechScoutInput,
  config: AgentConfig,
): ReturnType<typeof streamText> {
  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  const categoryFilter = input.categories
    ? `\nFocus on these categories: ${input.categories.join(", ")}`
    : "";

  return streamText({
    model,
    system: TECH_SCOUT_SYSTEM_PROMPT,
    prompt: `Research the following technology area and provide a detailed analysis.

Query: ${input.query}${categoryFilter}
Max technologies to cover: ${input.maxResults}

For each technology found:
1. Name and category
2. Description of what it does
3. Maturity level
4. Relevance to Cronix (0-1 score with reasoning)
5. Recommendation (adopt/evaluate/monitor/ignore)

End with trend analysis and priority recommendations.`,
    maxOutputTokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.4,
  });
}
