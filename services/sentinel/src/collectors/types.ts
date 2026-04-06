import { z } from "zod";

export type Severity = "low" | "medium" | "high" | "critical";

export const IntelligenceItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
  collectedAt: z.string(),
});

export type IntelligenceItem = z.infer<typeof IntelligenceItemSchema>;

export interface CollectorResult {
  source: string;
  items: IntelligenceItem[];
  collectedAt: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface Collector {
  name: string;
  cronExpression: string;
  intervalMs: number;
  collect(): Promise<CollectorResult>;
}

export const TRACKED_REPOS: TrackedRepo[] = [
  { owner: "vercel", repo: "next.js", displayName: "Next.js" },
  { owner: "remix-run", repo: "remix", displayName: "Remix" },
  { owner: "sveltejs", repo: "svelte", displayName: "Svelte" },
  { owner: "QwikDev", repo: "qwik", displayName: "Qwik" },
  { owner: "withastro", repo: "astro", displayName: "Astro" },
  { owner: "honojs", repo: "hono", displayName: "Hono" },
  { owner: "solidjs", repo: "solid", displayName: "SolidJS" },
  { owner: "trpc", repo: "trpc", displayName: "tRPC" },
  { owner: "vercel", repo: "ai", displayName: "Vercel AI SDK" },
  { owner: "langchain-ai", repo: "langchainjs", displayName: "LangChain" },
];

export interface TrackedRepo {
  owner: string;
  repo: string;
  displayName: string;
}

export const SEARCH_KEYWORDS = [
  "AI framework",
  "web framework",
  "WebGPU",
  "edge computing",
  "CRDT",
  "SolidJS",
  "browser AI",
  "real-time collaboration",
];

export const TRACKED_NPM_PACKAGES = [
  "next", "remix", "svelte", "@sveltejs/kit", "astro", "hono",
  "solid-js", "@solidjs/start", "@trpc/server", "@trpc/client",
  "ai", "@ai-sdk/openai", "langchain", "@langchain/core",
  "drizzle-orm", "yjs", "zod",
];
