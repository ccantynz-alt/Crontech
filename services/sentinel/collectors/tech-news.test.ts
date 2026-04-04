import { describe, expect, it, mock } from "bun:test";
import {
  checkHackerNews,
  checkArxiv,
  HackerNewsStorySchema,
  ArxivPaperSchema,
  HnCollectorResultSchema,
  ArxivCollectorResultSchema,
} from "./tech-news.js";

describe("Tech News Monitor", () => {
  describe("checkHackerNews", () => {
    it("should return valid HnCollectorResult with stories above threshold", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (_url: string | URL | Request) => {
        const url = typeof _url === "string" ? _url : _url.toString();

        if (url.includes("topstories")) {
          return new Response(JSON.stringify([1, 2, 3]), { status: 200 });
        }
        if (url.includes("/item/1.json")) {
          return new Response(
            JSON.stringify({
              id: 1,
              title: "High scoring story",
              url: "https://example.com/story1",
              score: 200,
              by: "user1",
              time: 1700000000,
              type: "story",
              descendants: 50,
            }),
            { status: 200 },
          );
        }
        if (url.includes("/item/2.json")) {
          return new Response(
            JSON.stringify({
              id: 2,
              title: "Low scoring story",
              url: "https://example.com/story2",
              score: 30,
              by: "user2",
              time: 1700000001,
              type: "story",
            }),
            { status: 200 },
          );
        }
        if (url.includes("/item/3.json")) {
          return new Response(
            JSON.stringify({
              id: 3,
              title: "Another high story",
              url: "https://example.com/story3",
              score: 150,
              by: "user3",
              time: 1700000002,
              type: "story",
              descendants: 25,
            }),
            { status: 200 },
          );
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      try {
        const result = await checkHackerNews(100);
        const parsed = HnCollectorResultSchema.parse(result);

        expect(parsed.success).toBe(true);
        // Only stories with score >= 100 should be included
        expect(parsed.stories).toHaveLength(2);
        expect(parsed.stories[0]?.score).toBeGreaterThanOrEqual(100);
        expect(parsed.stories[1]?.score).toBeGreaterThanOrEqual(100);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle API errors gracefully", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response("Server Error", { status: 500 });
      }) as typeof fetch;

      try {
        const result = await checkHackerNews(100);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.stories).toHaveLength(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle network failures", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        throw new Error("Connection refused");
      }) as typeof fetch;

      try {
        const result = await checkHackerNews(100);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should include hnUrl for each story", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (_url: string | URL | Request) => {
        const url = typeof _url === "string" ? _url : _url.toString();
        if (url.includes("topstories")) {
          return new Response(JSON.stringify([42]), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            id: 42,
            title: "Test",
            score: 500,
            by: "tester",
            time: 1700000000,
            type: "story",
          }),
          { status: 200 },
        );
      }) as typeof fetch;

      try {
        const result = await checkHackerNews(100);
        expect(result.stories[0]?.hnUrl).toBe(
          "https://news.ycombinator.com/item?id=42",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should validate story schema", () => {
      const validStory = {
        id: 1,
        title: "Test Story",
        url: "https://example.com",
        score: 100,
        by: "user",
        time: 1700000000,
        hnUrl: "https://news.ycombinator.com/item?id=1",
      };
      expect(() => HackerNewsStorySchema.parse(validStory)).not.toThrow();
    });
  });

  describe("checkArxiv", () => {
    it("should return valid ArxivCollectorResult", async () => {
      const originalFetch = globalThis.fetch;
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <title>Test Paper on AI</title>
    <summary>This is a test paper about artificial intelligence.</summary>
    <author><name>John Doe</name></author>
    <author><name>Jane Smith</name></author>
    <published>2024-01-01T00:00:00Z</published>
    <category term="cs.AI" />
    <category term="cs.LG" />
    <link title="pdf" href="https://arxiv.org/pdf/2401.00001v1" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2401.00002v1</id>
    <title>Another ML Paper</title>
    <summary>Machine learning research.</summary>
    <author><name>Alice</name></author>
    <published>2024-01-02T00:00:00Z</published>
    <category term="cs.LG" />
    <link title="pdf" href="https://arxiv.org/pdf/2401.00002v1" />
  </entry>
</feed>`;

      globalThis.fetch = mock(async () => {
        return new Response(mockXml, { status: 200 });
      }) as typeof fetch;

      try {
        const result = await checkArxiv(["cs.AI", "cs.LG"]);
        const parsed = ArxivCollectorResultSchema.parse(result);

        expect(parsed.success).toBe(true);
        expect(parsed.papers).toHaveLength(2);
        expect(parsed.papers[0]?.title).toBe("Test Paper on AI");
        expect(parsed.papers[0]?.authors).toContain("John Doe");
        expect(parsed.papers[0]?.categories).toContain("cs.AI");
        expect(parsed.papers[1]?.title).toBe("Another ML Paper");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle API errors gracefully", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response("Service Unavailable", { status: 503 });
      }) as typeof fetch;

      try {
        const result = await checkArxiv(["cs.AI"]);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.papers).toHaveLength(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle network failures", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        throw new Error("Network timeout");
      }) as typeof fetch;

      try {
        const result = await checkArxiv(["cs.AI"]);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should validate paper schema", () => {
      const validPaper = {
        id: "http://arxiv.org/abs/2401.00001v1",
        title: "Test Paper",
        summary: "Summary",
        authors: ["Author One"],
        published: "2024-01-01T00:00:00Z",
        categories: ["cs.AI"],
        pdfUrl: "https://arxiv.org/pdf/2401.00001v1",
      };
      expect(() => ArxivPaperSchema.parse(validPaper)).not.toThrow();
    });

    it("should deduplicate papers by ID", async () => {
      const originalFetch = globalThis.fetch;
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <title>Duplicate Paper</title>
    <summary>Summary</summary>
    <author><name>Author</name></author>
    <published>2024-01-01T00:00:00Z</published>
    <category term="cs.AI" />
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <title>Duplicate Paper</title>
    <summary>Summary</summary>
    <author><name>Author</name></author>
    <published>2024-01-01T00:00:00Z</published>
    <category term="cs.AI" />
  </entry>
</feed>`;

      globalThis.fetch = mock(async () => {
        return new Response(mockXml, { status: 200 });
      }) as typeof fetch;

      try {
        const result = await checkArxiv(["cs.AI"]);
        expect(result.papers).toHaveLength(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
