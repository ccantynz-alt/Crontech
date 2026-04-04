import { describe, expect, it, mock } from "bun:test";
import {
  checkNpmVersions,
  TRACKED_PACKAGES,
  NpmPackageInfoSchema,
  NpmCollectorResultSchema,
} from "./npm-monitor.js";

describe("npm Monitor", () => {
  describe("checkNpmVersions", () => {
    it("should return a valid NpmCollectorResult structure", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (_url: string | URL | Request) => {
        return new Response(
          JSON.stringify({
            name: "test-package",
            description: "A test package",
            "dist-tags": { latest: "2.0.0" },
            time: { "2.0.0": "2024-06-01T00:00:00.000Z" },
            homepage: "https://example.com",
          }),
          { status: 200 },
        );
      }) as typeof fetch;

      try {
        const result = await checkNpmVersions(["test-package"]);

        const parsed = NpmCollectorResultSchema.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.packages).toHaveLength(1);
        expect(parsed.packages[0]?.name).toBe("test-package");
        expect(parsed.packages[0]?.latestVersion).toBe("2.0.0");
        expect(parsed.errors).toHaveLength(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle registry errors gracefully", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response("Internal Server Error", { status: 500 });
      }) as typeof fetch;

      try {
        const result = await checkNpmVersions(["failing-package"]);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]?.package).toBe("failing-package");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle network failures gracefully", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        throw new Error("DNS resolution failed");
      }) as typeof fetch;

      try {
        const result = await checkNpmVersions(["unreachable-package"]);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should process multiple packages", async () => {
      const originalFetch = globalThis.fetch;
      let callIndex = 0;
      const packages = ["pkg-a", "pkg-b", "pkg-c"];

      globalThis.fetch = mock(async () => {
        const name = packages[callIndex] ?? "unknown";
        callIndex++;
        return new Response(
          JSON.stringify({
            name,
            "dist-tags": { latest: "1.0.0" },
            time: { "1.0.0": "2024-01-01T00:00:00.000Z" },
          }),
          { status: 200 },
        );
      }) as typeof fetch;

      try {
        const result = await checkNpmVersions(packages);
        expect(result.packages).toHaveLength(3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should handle missing optional fields", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            name: "minimal-package",
            "dist-tags": { latest: "0.1.0" },
          }),
          { status: 200 },
        );
      }) as typeof fetch;

      try {
        const result = await checkNpmVersions(["minimal-package"]);
        expect(result.success).toBe(true);
        expect(result.packages[0]?.description).toBeNull();
        expect(result.packages[0]?.homepage).toBeNull();
        expect(result.packages[0]?.lastPublished).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should validate package info against schema", () => {
      const validInfo = {
        name: "test",
        latestVersion: "1.0.0",
        description: "desc",
        lastPublished: "2024-01-01T00:00:00.000Z",
        homepage: "https://test.com",
      };
      expect(() => NpmPackageInfoSchema.parse(validInfo)).not.toThrow();
    });

    it("should have correct default tracked packages", () => {
      expect(TRACKED_PACKAGES).toContain("next");
      expect(TRACKED_PACKAGES).toContain("hono");
      expect(TRACKED_PACKAGES).toContain("solid-js");
      expect(TRACKED_PACKAGES).toContain("zod");
      expect(TRACKED_PACKAGES.length).toBeGreaterThanOrEqual(10);
    });
  });
});
