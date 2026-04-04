import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import {
  checkGitHubReleases,
  TRACKED_REPOS,
  GitHubReleaseSchema,
  CollectorResultSchema,
} from "./github-monitor.js";

describe("GitHub Monitor", () => {
  describe("checkGitHubReleases", () => {
    it("should return a valid CollectorResult structure", async () => {
      // Use a minimal mock to avoid hitting the real API in tests
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (_url: string | URL | Request) => {
        const url = typeof _url === "string" ? _url : _url.toString();
        if (url.includes("api.github.com")) {
          return new Response(
            JSON.stringify({
              tag_name: "v1.0.0",
              name: "Release 1.0.0",
              body: "Test release notes",
              published_at: "2024-01-01T00:00:00Z",
              html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
              prerelease: false,
              draft: false,
            }),
            { status: 200 },
          );
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      try {
        const result = await checkGitHubReleases(["test/repo"]);

        // Validate against schema
        const parsed = CollectorResultSchema.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.releases).toHaveLength(1);
        expect(parsed.releases[0]?.repo).toBe("test/repo");
        expect(parsed.releases[0]?.tagName).toBe("v1.0.0");
        expect(parsed.errors).toHaveLength(0);
        expect(parsed.collectedAt).toBeTruthy();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle 404 responses gracefully (no releases)", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      try {
        const result = await checkGitHubReleases(["nonexistent/repo"]);
        expect(result.success).toBe(true);
        expect(result.releases).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle API errors gracefully", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response("Rate limit exceeded", { status: 403 });
      }) as typeof fetch;

      try {
        const result = await checkGitHubReleases(["test/repo"]);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle network failures gracefully", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        throw new Error("Network error");
      }) as typeof fetch;

      try {
        const result = await checkGitHubReleases(["test/repo"]);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should process multiple repos in parallel", async () => {
      const originalFetch = globalThis.fetch;
      let fetchCount = 0;
      globalThis.fetch = mock(async (_url: string | URL | Request) => {
        fetchCount++;
        return new Response(
          JSON.stringify({
            tag_name: `v${fetchCount}.0.0`,
            name: `Release ${fetchCount}`,
            body: "notes",
            published_at: "2024-01-01T00:00:00Z",
            html_url: `https://github.com/test/repo${fetchCount}/releases/tag/v${fetchCount}.0.0`,
            prerelease: false,
            draft: false,
          }),
          { status: 200 },
        );
      }) as typeof fetch;

      try {
        const result = await checkGitHubReleases([
          "test/repo1",
          "test/repo2",
          "test/repo3",
        ]);
        expect(result.releases).toHaveLength(3);
        expect(fetchCount).toBe(3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should validate release data against schema", () => {
      const validRelease = {
        repo: "vercel/next.js",
        tagName: "v14.0.0",
        name: "Next.js 14",
        body: "Release notes here",
        publishedAt: "2024-01-01T00:00:00Z",
        htmlUrl: "https://github.com/vercel/next.js/releases/tag/v14.0.0",
        prerelease: false,
        draft: false,
      };

      expect(() => GitHubReleaseSchema.parse(validRelease)).not.toThrow();
    });

    it("should reject invalid repo format in schema", () => {
      const invalidRelease = {
        repo: "invalid-no-slash",
        tagName: "v1.0.0",
        name: null,
        body: null,
        publishedAt: null,
        htmlUrl: "https://example.com",
        prerelease: false,
        draft: false,
      };

      expect(() => GitHubReleaseSchema.parse(invalidRelease)).toThrow();
    });

    it("should have correct default tracked repos", () => {
      expect(TRACKED_REPOS).toContain("vercel/next.js");
      expect(TRACKED_REPOS).toContain("honojs/hono");
      expect(TRACKED_REPOS).toContain("solidjs/solid");
      expect(TRACKED_REPOS).toContain("trpc/trpc");
      expect(TRACKED_REPOS).toContain("vercel/ai");
      expect(TRACKED_REPOS.length).toBeGreaterThanOrEqual(10);
    });
  });
});
