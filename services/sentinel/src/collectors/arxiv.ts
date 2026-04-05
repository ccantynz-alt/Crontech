import {
  type Collector,
  type CollectorResult,
  type IntelligenceItem,
  type Severity,
} from "./types";
import { fetchWithRetry } from "../utils/fetch";

const ARXIV_SEARCH_TERMS = [
  "WebGPU machine learning",
  "browser inference",
  "edge computing AI",
  "real-time collaboration AI",
  "client-side neural network",
];

const seenPaperIds = new Set<string>();

function parseArxivXml(xml: string): Array<{
  id: string;
  title: string;
  summary: string;
  published: string;
  link: string;
  categories: string[];
}> {
  const entries: Array<{
    id: string; title: string; summary: string; published: string; link: string; categories: string[];
  }> = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match = entryRegex.exec(xml);

  while (match) {
    const e = match[1] ?? "";
    const id = /<id>(.*?)<\/id>/.exec(e)?.[1] ?? "";
    const title = /<title>([\s\S]*?)<\/title>/.exec(e)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(e)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const published = /<published>(.*?)<\/published>/.exec(e)?.[1] ?? "";

    const categories: string[] = [];
    const catRegex = /<category[^>]*term="([^"]*)"[^>]*\/>/g;
    let catMatch = catRegex.exec(e);
    while (catMatch) {
      if (catMatch[1]) categories.push(catMatch[1]);
      catMatch = catRegex.exec(e);
    }

    if (id && title) {
      entries.push({ id, title, summary, published, link: id, categories });
    }
    match = entryRegex.exec(xml);
  }
  return entries;
}

function classifyPaper(title: string, summary: string): Severity {
  const text = `${title} ${summary}`.toLowerCase();
  if (text.includes("webgpu") || text.includes("browser inference")) return "high";
  if (text.includes("edge computing") || text.includes("crdt")) return "medium";
  return "low";
}

export const arxivCollector: Collector = {
  name: "arxiv",
  cronExpression: "0 */6 * * *",
  intervalMs: 6 * 60 * 60 * 1000,

  async collect(): Promise<CollectorResult> {
    const start = performance.now();
    const allItems: IntelligenceItem[] = [];
    const errors: string[] = [];

    for (const term of ARXIV_SEARCH_TERMS) {
      try {
        const encoded = encodeURIComponent(term);
        const url = `https://export.arxiv.org/api/query?search_query=all:${encoded}&sortBy=submittedDate&sortOrder=descending&max_results=5`;
        const res = await fetchWithRetry(url);
        if (!res.ok) throw new Error(`ArXiv returned ${res.status}`);

        const xml = await res.text();
        const entries = parseArxivXml(xml);

        for (const entry of entries) {
          if (seenPaperIds.has(entry.id)) continue;
          seenPaperIds.add(entry.id);

          allItems.push({
            id: `arxiv-${entry.id.replace(/[^a-zA-Z0-9.]/g, "-")}`,
            source: "arxiv",
            title: `[ArXiv] ${entry.title}`,
            description: entry.summary.slice(0, 500),
            url: entry.link,
            severity: classifyPaper(entry.title, entry.summary),
            tags: [...entry.categories, "arxiv", "research"],
            metadata: { arxivId: entry.id, published: entry.published },
            collectedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Error for "${term}"`);
      }
    }

    return {
      source: "arxiv",
      items: allItems,
      collectedAt: new Date().toISOString(),
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      durationMs: Math.round(performance.now() - start),
    };
  },
};
