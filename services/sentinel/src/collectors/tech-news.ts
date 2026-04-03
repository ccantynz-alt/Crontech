import {
  HackerNewsItemSchema,
  ArxivPaperSchema,
  type HackerNewsItem,
  type ArxivPaper,
  type TechNewsItem,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Hacker News Collector
// ---------------------------------------------------------------------------

/** Keywords that indicate a post is relevant to our competitive landscape. */
const HN_KEYWORDS: readonly string[] = [
  "webgpu",
  "solidjs",
  "solid-start",
  "react server",
  "next.js",
  "remix",
  "sveltekit",
  "astro",
  "hono",
  "bun",
  "deno",
  "cloudflare workers",
  "edge computing",
  "crdt",
  "yjs",
  "ai agent",
  "llm",
  "transformers.js",
  "webllm",
  "langchain",
  "langgraph",
  "vercel ai",
  "trpc",
  "drizzle",
  "turso",
  "neon postgres",
  "qdrant",
  "vector database",
  "passkey",
  "webauthn",
  "wasm",
  "web assembly",
] as const;

interface HNTopStoriesItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number;
  type: string;
}

/**
 * Fetch top Hacker News stories above a minimum score threshold,
 * optionally filtered to items matching our keyword list.
 */
export async function fetchHackerNewsTop(
  minScore: number = 100,
  filterRelevant: boolean = true,
): Promise<HackerNewsItem[]> {
  const results: HackerNewsItem[] = [];

  try {
    const topIdsResponse = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
    );

    if (!topIdsResponse.ok) {
      console.error(
        `[sentinel] HN: top stories returned ${topIdsResponse.status.toString()}`,
      );
      return results;
    }

    const topIds = (await topIdsResponse.json()) as number[];
    // Only check the top 60 stories to keep API calls reasonable.
    const idsToCheck = topIds.slice(0, 60);

    const storyPromises = idsToCheck.map(async (id) => {
      const response = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id.toString()}.json`,
      );
      if (!response.ok) return null;
      return (await response.json()) as HNTopStoriesItem;
    });

    const stories = await Promise.all(storyPromises);

    for (const story of stories) {
      if (story === null || story.type !== "story") continue;
      if (story.score < minScore) continue;

      if (filterRelevant) {
        const titleLower = story.title.toLowerCase();
        const urlLower = (story.url ?? "").toLowerCase();
        const isRelevant = HN_KEYWORDS.some(
          (kw) => titleLower.includes(kw) || urlLower.includes(kw),
        );
        if (!isRelevant) continue;
      }

      const parsed = HackerNewsItemSchema.safeParse({
        id: story.id,
        title: story.title,
        url: story.url,
        score: story.score,
        by: story.by,
        time: story.time,
        descendants: story.descendants,
      });

      if (parsed.success) {
        results.push(parsed.data);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sentinel] HN: fetch failed — ${message}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// ArXiv Collector
// ---------------------------------------------------------------------------

/** Default ArXiv categories to monitor. */
const DEFAULT_ARXIV_CATEGORIES: readonly string[] = [
  "cs.AI",
  "cs.LG",
  "cs.CL",
  "cs.SE",
] as const;

/**
 * Parse ArXiv Atom XML feed entries.
 *
 * ArXiv exposes an Atom API at http://export.arxiv.org/api/query.
 * We parse the XML response to extract paper metadata. This is a
 * lightweight parser that avoids heavy XML dependencies.
 */
function parseArxivEntries(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch: RegExpExecArray | null;

  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entry = entryMatch[1];
    if (entry === undefined) continue;

    const id = extractTag(entry, "id") ?? "";
    const title = (extractTag(entry, "title") ?? "").replace(/\s+/g, " ").trim();
    const summary = (extractTag(entry, "summary") ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const published = extractTag(entry, "published") ?? "";

    // Extract authors
    const authors: string[] = [];
    const authorRegex = /<author>\s*<name>(.*?)<\/name>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      if (authorMatch[1] !== undefined) {
        authors.push(authorMatch[1]);
      }
    }

    // Extract categories
    const categories: string[] = [];
    const catRegex = /<category[^>]*term="([^"]+)"/g;
    let catMatch: RegExpExecArray | null;
    while ((catMatch = catRegex.exec(entry)) !== null) {
      if (catMatch[1] !== undefined) {
        categories.push(catMatch[1]);
      }
    }

    // Extract PDF link
    const pdfLinkRegex = /<link[^>]*title="pdf"[^>]*href="([^"]+)"/;
    const pdfMatch = pdfLinkRegex.exec(entry);
    const pdfUrl = pdfMatch?.[1] ?? id.replace("/abs/", "/pdf/");

    const parsed = ArxivPaperSchema.safeParse({
      id,
      title,
      summary,
      authors,
      publishedAt: published,
      pdfUrl,
      categories,
    });

    if (parsed.success) {
      papers.push(parsed.data);
    }
  }

  return papers;
}

function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s");
  const match = regex.exec(xml);
  return match?.[1];
}

/**
 * Fetch recent ArXiv papers from specified categories.
 *
 * Queries the ArXiv API for recent papers in categories relevant
 * to our competitive intelligence (AI, ML, NLP, Software Engineering).
 */
export async function fetchArxivPapers(
  categories: readonly string[] = DEFAULT_ARXIV_CATEGORIES,
  maxResults: number = 20,
): Promise<ArxivPaper[]> {
  const results: ArxivPaper[] = [];

  try {
    const categoryQuery = categories.map((c) => `cat:${c}`).join("+OR+");
    const url = `http://export.arxiv.org/api/query?search_query=${categoryQuery}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults.toString()}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "back-to-the-future-sentinel",
      },
    });

    if (!response.ok) {
      console.error(
        `[sentinel] ArXiv: API returned ${response.status.toString()}`,
      );
      return results;
    }

    const xml = await response.text();
    const papers = parseArxivEntries(xml);
    results.push(...papers);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sentinel] ArXiv: fetch failed — ${message}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Combined Tech News Collector
// ---------------------------------------------------------------------------

/**
 * Fetch tech news from all sources (Hacker News + ArXiv).
 */
export async function fetchTechNews(options?: {
  hnMinScore?: number;
  arxivCategories?: readonly string[];
}): Promise<TechNewsItem[]> {
  const [hnItems, arxivPapers] = await Promise.all([
    fetchHackerNewsTop(options?.hnMinScore ?? 100),
    fetchArxivPapers(options?.arxivCategories),
  ]);

  const results: TechNewsItem[] = [];

  for (const item of hnItems) {
    results.push({ source: "hackernews", item });
  }

  for (const item of arxivPapers) {
    results.push({ source: "arxiv", item });
  }

  return results;
}
