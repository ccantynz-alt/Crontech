import { z } from "zod";

// --- Zod Schemas ---

export const ThreatLevelSchema = z.enum(["critical", "high", "medium", "low"]);
export type ThreatLevel = z.infer<typeof ThreatLevelSchema>;

export const ReleaseInputSchema = z.object({
  repo: z.string(),
  version: z.string(),
  notes: z.string(),
});

export type ReleaseInput = z.infer<typeof ReleaseInputSchema>;

export const ThreatAnalysisSchema = z.object({
  repo: z.string(),
  version: z.string(),
  threatLevel: ThreatLevelSchema,
  summary: z.string(),
  impactAreas: z.array(z.string()),
  recommendedResponse: z.string(),
  analyzedAt: z.string().datetime(),
});

export type ThreatAnalysis = z.infer<typeof ThreatAnalysisSchema>;

// --- Competitor context for analysis ---

const COMPETITOR_CONTEXT: Record<string, string> = {
  "vercel/next.js":
    "Primary competitor framework. React-based. Strong in SSR/SSG. Lacks WebGPU, CRDTs, client-side AI.",
  "remix-run/remix":
    "React framework focused on web standards. Acquired by Shopify. Server-centric architecture.",
  "sveltejs/kit":
    "Compiler-based framework. Strong DX. Growing ecosystem. No AI integration.",
  "QwikDev/qwik":
    "Resumability model. Novel hydration approach. Small ecosystem.",
  "withastro/astro":
    "Content-focused. Island architecture. Multi-framework support. No real-time.",
  "honojs/hono":
    "We USE this. Any major change directly affects our stack. Monitor closely.",
  "solidjs/solid":
    "We USE this as our primary frontend. Any release directly impacts us. Critical to track.",
  "trpc/trpc":
    "We USE this for API layer. Breaking changes directly affect our type-safe pipeline.",
  "vercel/ai":
    "We USE the AI SDK. Changes affect our AI orchestration layer directly.",
  "langchain-ai/langchainjs":
    "Competitor AI framework. We use LangGraph. Changes in LangChain ecosystem matter.",
};

// --- Keyword-based threat scoring (fallback when no LLM available) ---

const HIGH_THREAT_KEYWORDS = [
  "webgpu",
  "crdt",
  "real-time collaboration",
  "edge ai",
  "client-side inference",
  "wasm",
  "web worker",
  "signals",
  "fine-grained reactivity",
  "zero bundle",
  "breaking change",
  "major release",
  "rewrite",
  "v2",
  "v3",
  "v4",
];

const MEDIUM_THREAT_KEYWORDS = [
  "performance",
  "streaming",
  "server components",
  "middleware",
  "ai",
  "llm",
  "agent",
  "vector",
  "embedding",
  "ssr",
  "edge",
  "worker",
  "typescript",
];

function scoreThreatFromKeywords(notes: string): {
  level: ThreatLevel;
  matchedKeywords: string[];
} {
  const lower = notes.toLowerCase();
  const matchedHigh: string[] = [];
  const matchedMedium: string[] = [];

  for (const keyword of HIGH_THREAT_KEYWORDS) {
    if (lower.includes(keyword)) {
      matchedHigh.push(keyword);
    }
  }

  for (const keyword of MEDIUM_THREAT_KEYWORDS) {
    if (lower.includes(keyword)) {
      matchedMedium.push(keyword);
    }
  }

  let level: ThreatLevel;
  if (matchedHigh.length >= 3) {
    level = "critical";
  } else if (matchedHigh.length >= 1) {
    level = "high";
  } else if (matchedMedium.length >= 2) {
    level = "medium";
  } else {
    level = "low";
  }

  return { level, matchedKeywords: [...matchedHigh, ...matchedMedium] };
}

/**
 * Analyze whether a competitor release threatens our position.
 *
 * Attempts to use Vercel AI SDK with an LLM for deep analysis.
 * Falls back to keyword-based scoring if no LLM/API key is available.
 */
export async function analyzeThreat(
  release: ReleaseInput,
): Promise<ThreatAnalysis> {
  const validated = ReleaseInputSchema.parse(release);

  const competitorInfo =
    COMPETITOR_CONTEXT[validated.repo] ?? "Unknown competitor.";
  const isDependency =
    validated.repo.includes("hono") ||
    validated.repo.includes("solid") ||
    validated.repo.includes("trpc") ||
    validated.repo.includes("vercel/ai");

  // Try LLM-based analysis first
  const aiApiKey =
    process.env["OPENAI_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"];

  if (aiApiKey) {
    try {
      return await analyzeThreatWithLlm(validated, competitorInfo, isDependency);
    } catch (_err) {
      // Fall through to keyword-based analysis
    }
  }

  // Fallback: keyword-based threat scoring
  return analyzeThreatWithKeywords(validated, competitorInfo, isDependency);
}

/**
 * LLM-powered threat analysis using Vercel AI SDK pattern.
 * Sends a structured prompt and parses the response.
 */
async function analyzeThreatWithLlm(
  release: ReleaseInput,
  competitorInfo: string,
  isDependency: boolean,
): Promise<ThreatAnalysis> {
  // Dynamic import to avoid hard dependency on AI SDK
  const { generateText } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");

  const prompt = `You are a competitive intelligence analyst for an advanced full-stack platform called "Back to the Future."

Our platform: AI-native, edge-first, zero-HTML, SolidJS + Hono + tRPC + WebGPU + CRDTs.

Analyze this competitor release:
- Repository: ${release.repo}
- Version: ${release.version}
- Context: ${competitorInfo}
- Is this a dependency we use? ${isDependency ? "YES - direct impact on our stack" : "No"}
- Release notes: ${release.notes.slice(0, 3000)}

Respond in JSON format:
{
  "threatLevel": "critical" | "high" | "medium" | "low",
  "summary": "One paragraph summary of the threat",
  "impactAreas": ["area1", "area2"],
  "recommendedResponse": "Specific action we should take"
}`;

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    prompt,
    maxTokens: 500,
  });

  const parsed = JSON.parse(result.text) as {
    threatLevel: string;
    summary: string;
    impactAreas: string[];
    recommendedResponse: string;
  };

  return ThreatAnalysisSchema.parse({
    repo: release.repo,
    version: release.version,
    threatLevel: parsed.threatLevel,
    summary: parsed.summary,
    impactAreas: parsed.impactAreas,
    recommendedResponse: parsed.recommendedResponse,
    analyzedAt: new Date().toISOString(),
  });
}

/**
 * Keyword-based threat analysis. Used when no LLM is available.
 */
function analyzeThreatWithKeywords(
  release: ReleaseInput,
  competitorInfo: string,
  isDependency: boolean,
): ThreatAnalysis {
  const { level, matchedKeywords } = scoreThreatFromKeywords(release.notes);

  // Bump threat level up for dependencies
  let finalLevel: ThreatLevel = level;
  if (isDependency && level === "low") {
    finalLevel = "medium";
  } else if (isDependency && level === "medium") {
    finalLevel = "high";
  }

  const impactAreas: string[] = [];
  if (matchedKeywords.some((k) => k.includes("webgpu") || k.includes("gpu"))) {
    impactAreas.push("GPU compute layer");
  }
  if (matchedKeywords.some((k) => k.includes("ai") || k.includes("llm"))) {
    impactAreas.push("AI integration");
  }
  if (matchedKeywords.some((k) => k.includes("edge") || k.includes("worker"))) {
    impactAreas.push("Edge compute");
  }
  if (matchedKeywords.some((k) => k.includes("crdt") || k.includes("real-time"))) {
    impactAreas.push("Real-time collaboration");
  }
  if (matchedKeywords.some((k) => k.includes("performance") || k.includes("streaming"))) {
    impactAreas.push("Performance");
  }
  if (impactAreas.length === 0) {
    impactAreas.push("General ecosystem");
  }

  const summary = isDependency
    ? `Dependency ${release.repo} released ${release.version}. ${competitorInfo} Matched keywords: ${matchedKeywords.join(", ") || "none"}.`
    : `Competitor ${release.repo} released ${release.version}. ${competitorInfo} Matched threat keywords: ${matchedKeywords.join(", ") || "none"}.`;

  const recommendedResponse = isDependency
    ? `Review changelog for ${release.version} and test compatibility. Update dependency if no breaking changes.`
    : finalLevel === "critical" || finalLevel === "high"
      ? `Investigate ${release.repo} ${release.version} immediately. Assess feature parity and identify gaps.`
      : `Monitor ${release.repo} for continued development in matched areas.`;

  return ThreatAnalysisSchema.parse({
    repo: release.repo,
    version: release.version,
    threatLevel: finalLevel,
    summary,
    impactAreas,
    recommendedResponse,
    analyzedAt: new Date().toISOString(),
  });
}
