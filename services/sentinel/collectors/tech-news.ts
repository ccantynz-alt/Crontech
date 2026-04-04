import { z } from "zod";

// --- Zod Schemas ---

export const HackerNewsStorySchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string().nullable(),
  score: z.number(),
  by: z.string(),
  time: z.number(),
  descendants: z.number().optional(),
  hnUrl: z.string(),
});

export type HackerNewsStory = z.infer<typeof HackerNewsStorySchema>;

export const HnCollectorResultSchema = z.object({
  success: z.boolean(),
  stories: z.array(HackerNewsStorySchema),
  errors: z.array(z.string()),
  collectedAt: z.string().datetime(),
});

export type HnCollectorResult = z.infer<typeof HnCollectorResultSchema>;

export const ArxivPaperSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  authors: z.array(z.string()),
  published: z.string(),
  categories: z.array(z.string()),
  pdfUrl: z.string(),
});

export type ArxivPaper = z.infer<typeof ArxivPaperSchema>;

export const ArxivCollectorResultSchema = z.object({
  success: z.boolean(),
  papers: z.array(ArxivPaperSchema),
  errors: z.array(z.string()),
  collectedAt: z.string().datetime(),
});

export type ArxivCollectorResult = z.infer<typeof ArxivCollectorResultSchema>;

// HN API item schema (partial)
const HnItemSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  url: z.string().optional(),
  score: z.number().optional(),
  by: z.string().optional(),
  time: z.number().optional(),
  type: z.string().optional(),
  descendants: z.number().optional(),
});

// --- Hacker News ---

/**
 * Fetch top stories from Hacker News that meet minimum point threshold.
 * Uses the official HN Firebase API.
 */
export async function checkHackerNews(
  minPoints: number = 100,
): Promise<HnCollectorResult> {
  const errors: string[] = [];
  const stories: HackerNewsStory[] = [];

  try {
    const topStoriesResponse = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
      {
        headers: { "User-Agent": "btf-sentinel/1.0" },
      },
    );

    if (!topStoriesResponse.ok) {
      throw new Error(
        `HN API error: ${topStoriesResponse.status} ${topStoriesResponse.statusText}`,
      );
    }

    const topStoryIds = z
      .array(z.number())
      .parse(await topStoriesResponse.json());

    // Fetch top 30 stories (reasonable batch to check scores)
    const storyBatch = topStoryIds.slice(0, 30);

    const settled = await Promise.allSettled(
      storyBatch.map(async (id) => {
        const res = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          {
            headers: { "User-Agent": "btf-sentinel/1.0" },
          },
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch HN item ${id}: ${res.status}`);
        }
        return HnItemSchema.parse(await res.json());
      }),
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        const item = result.value;
        const score = item.score ?? 0;
        if (
          score >= minPoints &&
          item.title !== undefined &&
          item.by !== undefined &&
          item.time !== undefined
        ) {
          stories.push({
            id: item.id,
            title: item.title,
            url: item.url ?? null,
            score,
            by: item.by,
            time: item.time,
            descendants: item.descendants,
            hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
          });
        }
      } else {
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        errors.push(msg);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
  }

  return HnCollectorResultSchema.parse({
    success: errors.length === 0,
    stories,
    errors,
    collectedAt: new Date().toISOString(),
  });
}

// --- ArXiv ---

/**
 * Parse ArXiv Atom XML response into structured paper data.
 * Minimal XML parsing without external dependencies.
 */
function parseArxivXml(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // Split by <entry> tags
  const entries = xml.split("<entry>");

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    if (entry === undefined) continue;
    const endIdx = entry.indexOf("</entry>");
    const entryContent = endIdx >= 0 ? entry.substring(0, endIdx) : entry;

    const getId = (text: string): string => {
      const match = text.match(/<id>([^<]+)<\/id>/);
      return match?.[1]?.trim() ?? "";
    };

    const getTitle = (text: string): string => {
      const match = text.match(/<title>([^<]+)<\/title>/);
      return match?.[1]?.trim().replace(/\s+/g, " ") ?? "";
    };

    const getSummary = (text: string): string => {
      const match = text.match(/<summary>([\s\S]*?)<\/summary>/);
      return match?.[1]?.trim().replace(/\s+/g, " ") ?? "";
    };

    const getAuthors = (text: string): string[] => {
      const authors: string[] = [];
      const authorMatches = text.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
      for (const m of authorMatches) {
        if (m[1]) authors.push(m[1].trim());
      }
      return authors;
    };

    const getPublished = (text: string): string => {
      const match = text.match(/<published>([^<]+)<\/published>/);
      return match?.[1]?.trim() ?? "";
    };

    const getCategories = (text: string): string[] => {
      const cats: string[] = [];
      const catMatches = text.matchAll(/category[^>]*term="([^"]+)"/g);
      for (const m of catMatches) {
        if (m[1]) cats.push(m[1]);
      }
      return cats;
    };

    const getPdfUrl = (text: string): string => {
      const match = text.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/);
      if (match?.[1]) return match[1];
      // Fallback: construct from ID
      const id = getId(text);
      const idMatch = id.match(/abs\/(.+)/);
      if (idMatch?.[1]) return `https://arxiv.org/pdf/${idMatch[1]}`;
      return id.replace("abs", "pdf");
    };

    const id = getId(entryContent);
    const title = getTitle(entryContent);

    if (id && title) {
      papers.push({
        id,
        title,
        summary: getSummary(entryContent),
        authors: getAuthors(entryContent),
        published: getPublished(entryContent),
        categories: getCategories(entryContent),
        pdfUrl: getPdfUrl(entryContent),
      });
    }
  }

  return papers;
}

/**
 * Check ArXiv for recent papers in specified categories.
 * Uses the ArXiv API (Atom feed).
 */
export async function checkArxiv(
  categories: string[] = ["cs.AI", "cs.LG", "cs.CL"],
): Promise<ArxivCollectorResult> {
  const errors: string[] = [];
  const allPapers: ArxivPaper[] = [];
  const seenIds = new Set<string>();

  try {
    // Build query: search for papers in any of the specified categories
    const categoryQuery = categories
      .map((cat) => `cat:${cat}`)
      .join("+OR+");

    const url = `https://export.arxiv.org/api/query?search_query=${categoryQuery}&sortBy=submittedDate&sortOrder=descending&max_results=20`;

    const response = await fetch(url, {
      headers: { "User-Agent": "btf-sentinel/1.0" },
    });

    if (!response.ok) {
      throw new Error(
        `ArXiv API error: ${response.status} ${response.statusText}`,
      );
    }

    const xml = await response.text();
    const papers = parseArxivXml(xml);

    for (const paper of papers) {
      if (!seenIds.has(paper.id)) {
        seenIds.add(paper.id);
        allPapers.push(paper);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
  }

  return ArxivCollectorResultSchema.parse({
    success: errors.length === 0,
    papers: allPapers,
    errors,
    collectedAt: new Date().toISOString(),
  });
}
