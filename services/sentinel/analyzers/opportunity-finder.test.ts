import { describe, expect, it } from "bun:test";
import {
  findOpportunities,
  OpportunityResultSchema,
} from "./opportunity-finder.js";

describe("Opportunity Finder", () => {
  describe("findOpportunities", () => {
    it("should identify dependency update opportunities", () => {
      const result = findOpportunities([
        { repo: "honojs/hono", version: "v4.1.0" },
        { repo: "solidjs/solid", version: "v2.0.0" },
      ]);

      const parsed = OpportunityResultSchema.parse(result);
      expect(parsed.opportunities.length).toBeGreaterThan(0);

      const adoptOpps = parsed.opportunities.filter(
        (o) => o.type === "adopt",
      );
      expect(adoptOpps.length).toBeGreaterThan(0);
      expect(adoptOpps[0]?.priority).toBe("high");
    });

    it("should identify gaps in competitor releases", () => {
      const result = findOpportunities([
        { repo: "vercel/next.js", version: "v16.0.0" },
      ]);

      const gapOpps = result.opportunities.filter(
        (o) => o.type === "exploit_gap",
      );
      // v16.0.0 is a major release, should trigger gap analysis
      expect(gapOpps.length).toBeGreaterThan(0);
    });

    it("should detect ecosystem acceleration when multiple frameworks release", () => {
      const result = findOpportunities([
        { repo: "vercel/next.js", version: "v16.0.0" },
        { repo: "remix-run/remix", version: "v3.0.0" },
        { repo: "sveltejs/kit", version: "v3.0.0" },
      ]);

      const accelOpps = result.opportunities.filter(
        (o) => o.type === "accelerate",
      );
      expect(accelOpps.length).toBeGreaterThan(0);
      expect(accelOpps[0]?.priority).toBe("high");
    });

    it("should return monitor type for routine activity", () => {
      const result = findOpportunities([
        { repo: "some/unknown-repo", version: "v1.0.1" },
      ]);

      expect(result.opportunities.length).toBeGreaterThan(0);
      const monitorOpp = result.opportunities.find(
        (o) => o.type === "monitor",
      );
      expect(monitorOpp).toBeDefined();
      expect(monitorOpp!.priority).toBe("low");
    });

    it("should handle empty release list", () => {
      const result = findOpportunities([]);
      expect(result.opportunities).toHaveLength(0);
      expect(result.analyzedAt).toBeTruthy();
    });

    it("should validate output against schema", () => {
      const result = findOpportunities([
        { repo: "vercel/next.js", version: "v15.0.0" },
        { repo: "honojs/hono", version: "v4.0.0" },
      ]);

      expect(() => OpportunityResultSchema.parse(result)).not.toThrow();
    });

    it("should include action items for each opportunity", () => {
      const result = findOpportunities([
        { repo: "honojs/hono", version: "v5.0.0" },
      ]);

      for (const opp of result.opportunities) {
        expect(opp.actionItems.length).toBeGreaterThan(0);
      }
    });

    it("should include related repos for each opportunity", () => {
      const result = findOpportunities([
        { repo: "vercel/next.js", version: "v16.0.0" },
      ]);

      for (const opp of result.opportunities) {
        expect(opp.relatedRepos.length).toBeGreaterThan(0);
      }
    });

    it("should not flag patch releases of competitors as gap opportunities", () => {
      const result = findOpportunities([
        { repo: "vercel/next.js", version: "v15.2.3" },
      ]);

      const gapOpps = result.opportunities.filter(
        (o) => o.type === "exploit_gap",
      );
      // Patch release (x.x.3) should NOT trigger gap analysis
      expect(gapOpps).toHaveLength(0);
    });
  });
});
