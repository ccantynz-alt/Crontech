import { describe, expect, it } from "bun:test";
import {
  analyzeThreat,
  ThreatAnalysisSchema,
  ReleaseInputSchema,
  type ThreatLevel,
} from "./threat-analyzer.js";

describe("Threat Analyzer", () => {
  describe("analyzeThreat (keyword fallback)", () => {
    it("should return a valid ThreatAnalysis for a competitor release", async () => {
      const result = await analyzeThreat({
        repo: "vercel/next.js",
        version: "v15.0.0",
        notes: "Major release with improved performance and streaming support.",
      });

      const parsed = ThreatAnalysisSchema.parse(result);
      expect(parsed.repo).toBe("vercel/next.js");
      expect(parsed.version).toBe("v15.0.0");
      expect(["critical", "high", "medium", "low"]).toContain(
        parsed.threatLevel,
      );
      expect(parsed.summary).toBeTruthy();
      expect(parsed.impactAreas.length).toBeGreaterThan(0);
      expect(parsed.recommendedResponse).toBeTruthy();
      expect(parsed.analyzedAt).toBeTruthy();
    });

    it("should rate high-threat keywords as elevated", async () => {
      const result = await analyzeThreat({
        repo: "vercel/next.js",
        version: "v16.0.0",
        notes:
          "Added WebGPU support, CRDT-based real-time collaboration, and client-side inference with breaking changes in the major release.",
      });

      // Should be critical or high due to multiple high-threat keywords
      expect(["critical", "high"]).toContain(result.threatLevel);
    });

    it("should rate dependency releases higher", async () => {
      const result = await analyzeThreat({
        repo: "honojs/hono",
        version: "v4.1.0",
        notes: "Minor bug fixes and improvements.",
      });

      // Dependencies get bumped up from low -> medium
      expect(["medium", "high"]).toContain(result.threatLevel);
    });

    it("should rate low-impact releases as low/medium", async () => {
      const result = await analyzeThreat({
        repo: "withastro/astro",
        version: "v4.5.1",
        notes: "Fixed a bug in the markdown parser. Updated documentation links.",
      });

      expect(["low", "medium"]).toContain(result.threatLevel);
    });

    it("should identify relevant impact areas from keywords", async () => {
      const result = await analyzeThreat({
        repo: "vercel/next.js",
        version: "v15.0.0",
        notes: "New edge runtime with AI integration and WebGPU compute shaders.",
      });

      // Should identify multiple impact areas
      expect(result.impactAreas.length).toBeGreaterThan(0);
    });

    it("should validate input with Zod schema", () => {
      expect(() =>
        ReleaseInputSchema.parse({
          repo: "test/repo",
          version: "v1.0.0",
          notes: "Some notes",
        }),
      ).not.toThrow();

      expect(() =>
        ReleaseInputSchema.parse({
          repo: "",
          version: "",
          notes: "",
        }),
      ).not.toThrow(); // Empty strings are valid (Zod string() allows them)
    });

    it("should handle empty release notes", async () => {
      const result = await analyzeThreat({
        repo: "QwikDev/qwik",
        version: "v2.0.0",
        notes: "",
      });

      expect(result).toBeDefined();
      expect(result.threatLevel).toBeTruthy();
    });

    it("should provide actionable recommendations", async () => {
      const result = await analyzeThreat({
        repo: "solidjs/solid",
        version: "v2.0.0",
        notes: "Major rewrite with new reactivity engine and breaking API changes.",
      });

      // This is our own dependency - should recommend compatibility check
      expect(result.recommendedResponse).toBeTruthy();
      expect(result.recommendedResponse.length).toBeGreaterThan(10);
    });
  });
});
