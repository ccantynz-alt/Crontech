import { z } from "zod";
import {
  type Collector,
  type CollectorResult,
  type IntelligenceItem,
  type Severity,
  SEARCH_KEYWORDS,
} from "./types";
import { fetchWithRetry } from "../utils/fetch";

const HNSearchResponseSchema = z.object({
  hits: z.array(z.object({
    objectID: z.string(),
    title: z.string().nullable(),
    url: z.string().nullable(),
    points: z.number().nullable(),
    num_comments: z.number().nullable(),
    created_at: z.string(),
    author: z.string().nullable(),
  })),
});

const seenStoryIds = new Set<string>();
const MIN_POINTS = 100;

function classifySeverity(points: number): Severity {
  if (points >= 500) return "critical";
  if (points >= 300) return "high";
  if (points >= 150) return "medium";
  return "low";
}

async function searchHN(keyword: string): Promise<IntelligenceItem[]> {
  const encodedQuery = encodeURIComponent(keyword);
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  const url = `https://hn.algolia.com/api/v1/search?query=${encodedQuery}&tags=story&numericFilters=points>=${MIN_POINTS},created_at_i>${cutoff}&hitsPerPage=10`;

  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`HN API returned ${response.status}`);

  const parsed = HNSearchResponseSchema.parse(await response.json());
  const items: IntelligenceItem[] = [];

  for (const hit of parsed.hits) {
    if (seenStoryIds.has(hit.objectID)) continue;
    seenStoryIds.add(hit.objectID);
    const points = hit.points ?? 0;

    items.push({
      id: `hn-${hit.objectID}`,
      source: "hackernews",
      title: `[HN ${points}pts] ${hit.title ?? "Untitled"}`,
      description: `Hacker News story with ${points} points and ${hit.num_comments ?? 0} comments.`,
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      severity: classifySeverity(points),
      tags: [keyword.toLowerCase(), "hackernews"],
      metadata: { objectID: hit.objectID, points, author: hit.author },
      collectedAt: new Date().toISOString(),
    });
  }
  return items;
}

export const hackernewsCollector: Collector = {
  name: "hackernews",
  cronExpression: "0 */6 * * *",
  intervalMs: 6 * 60 * 60 * 1000,

  async collect(): Promise<CollectorResult> {
    const start = performance.now();
    const allItems: IntelligenceItem[] = [];
    const errors: string[] = [];

    for (const keyword of SEARCH_KEYWORDS) {
      try {
        allItems.push(...await searchHN(keyword));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Error searching "${keyword}"`);
      }
    }

    // Deduplicate
    const unique = new Map<string, IntelligenceItem>();
    for (const item of allItems) {
      if (!unique.has(item.id)) unique.set(item.id, item);
    }

    return {
      source: "hackernews",
      items: [...unique.values()],
      collectedAt: new Date().toISOString(),
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      durationMs: Math.round(performance.now() - start),
    };
  },
};
