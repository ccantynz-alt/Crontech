import type { IntelligenceItem } from "../collectors/types";

export interface TechScoutResult {
  item: IntelligenceItem;
  relevance: "direct" | "adjacent" | "tangential";
  category: string;
  summary: string;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "AI/ML": ["llm", "transformer", "inference", "neural", "model", "ai", "machine learning"],
  "WebGPU/Graphics": ["webgpu", "webgl", "shader", "gpu", "rendering", "canvas"],
  "Edge Computing": ["edge", "cloudflare", "workers", "deno", "bun", "serverless"],
  "Real-Time": ["crdt", "websocket", "real-time", "collaboration", "sync"],
  "Frameworks": ["framework", "solid", "react", "svelte", "next", "remix"],
  "Database": ["database", "sqlite", "postgres", "vector", "embedding"],
};

export function scoutTech(items: IntelligenceItem[]): TechScoutResult[] {
  const results: TechScoutResult[] = [];

  for (const item of items) {
    const text = `${item.title} ${item.description}`.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const matches = keywords.filter((kw) => text.includes(kw));
      if (matches.length > 0) {
        const relevance = matches.length >= 3 ? "direct" : matches.length >= 2 ? "adjacent" : "tangential";
        results.push({
          item,
          relevance,
          category,
          summary: `Matches ${matches.join(", ")} in ${category}.`,
        });
        break; // Only categorize once
      }
    }
  }

  return results.sort((a, b) => {
    const order = { direct: 0, adjacent: 1, tangential: 2 };
    return order[a.relevance] - order[b.relevance];
  });
}
