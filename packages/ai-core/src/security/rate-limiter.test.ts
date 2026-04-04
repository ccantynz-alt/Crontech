import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { RateLimiter, RATE_LIMIT_PRESETS, RateLimitConfigSchema, RateLimitPresetSchema } from "./rate-limiter";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe("check()", () => {
    test("allows requests within the limit", () => {
      const result = limiter.check("test-key", 5, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    test("decrements remaining count with each request", () => {
      limiter.check("test-key", 5, 1000);
      limiter.check("test-key", 5, 1000);
      const result = limiter.check("test-key", 5, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    test("blocks requests when limit is reached", () => {
      for (let i = 0; i < 5; i++) {
        limiter.check("test-key", 5, 1000);
      }
      const result = limiter.check("test-key", 5, 1000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("provides resetAt timestamp", () => {
      const before = Date.now();
      const result = limiter.check("test-key", 5, 60000);
      expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000);
    });

    test("sliding window expires old entries", async () => {
      // Use a very short window
      for (let i = 0; i < 3; i++) {
        limiter.check("test-key", 3, 50);
      }
      // Should be blocked now
      expect(limiter.check("test-key", 3, 50).allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Should be allowed again
      const result = limiter.check("test-key", 3, 50);
      expect(result.allowed).toBe(true);
    });

    test("different keys are independent", () => {
      for (let i = 0; i < 5; i++) {
        limiter.check("key-a", 5, 1000);
      }
      expect(limiter.check("key-a", 5, 1000).allowed).toBe(false);
      expect(limiter.check("key-b", 5, 1000).allowed).toBe(true);
    });
  });

  describe("checkByIP()", () => {
    test("uses IP prefix and preset ip limits", () => {
      const preset = RATE_LIMIT_PRESETS["auth"]!;
      const result = limiter.checkByIP("192.168.1.1", preset);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(preset.ipLimit - 1);
    });

    test("blocks IP after exceeding limit", () => {
      const preset = { ipLimit: 3, ipWindowMs: 1000, userLimit: 10, userWindowMs: 1000 };
      for (let i = 0; i < 3; i++) {
        limiter.checkByIP("10.0.0.1", preset);
      }
      expect(limiter.checkByIP("10.0.0.1", preset).allowed).toBe(false);
    });
  });

  describe("checkByUser()", () => {
    test("uses user prefix and preset user limits", () => {
      const preset = RATE_LIMIT_PRESETS["standard"]!;
      const result = limiter.checkByUser("user-123", preset);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(preset.userLimit - 1);
    });
  });

  describe("checkCombined()", () => {
    test("checks both IP and user limits", () => {
      const preset = { ipLimit: 5, ipWindowMs: 1000, userLimit: 3, userWindowMs: 1000 };

      // Exhaust user limit
      for (let i = 0; i < 3; i++) {
        limiter.checkCombined("10.0.0.1", "user-1", preset);
      }

      // IP still has capacity, but user is exhausted
      const result = limiter.checkCombined("10.0.0.1", "user-1", preset);
      expect(result.allowed).toBe(false);
    });

    test("works without user ID (IP only)", () => {
      const preset = RATE_LIMIT_PRESETS["standard"]!;
      const result = limiter.checkCombined("10.0.0.1", undefined, preset);
      expect(result.allowed).toBe(true);
    });

    test("returns most restrictive result", () => {
      const preset = { ipLimit: 10, ipWindowMs: 1000, userLimit: 3, userWindowMs: 1000 };

      // Make 2 requests (user has 1 remaining, IP has 8 remaining)
      limiter.checkCombined("10.0.0.1", "user-1", preset);
      const result = limiter.checkCombined("10.0.0.1", "user-1", preset);

      // Should return user's remaining (lower)
      expect(result.remaining).toBe(1);
    });
  });

  describe("reset()", () => {
    test("clears rate limit for a key", () => {
      for (let i = 0; i < 5; i++) {
        limiter.check("test-key", 5, 1000);
      }
      expect(limiter.check("test-key", 5, 1000).allowed).toBe(false);

      limiter.reset("test-key");
      expect(limiter.check("test-key", 5, 1000).allowed).toBe(true);
    });
  });

  describe("resetIP() and resetUser()", () => {
    test("resets IP-specific limits", () => {
      const preset = { ipLimit: 2, ipWindowMs: 1000, userLimit: 10, userWindowMs: 1000 };
      limiter.checkByIP("1.2.3.4", preset);
      limiter.checkByIP("1.2.3.4", preset);
      expect(limiter.checkByIP("1.2.3.4", preset).allowed).toBe(false);

      limiter.resetIP("1.2.3.4");
      expect(limiter.checkByIP("1.2.3.4", preset).allowed).toBe(true);
    });

    test("resets user-specific limits", () => {
      const preset = { ipLimit: 10, ipWindowMs: 1000, userLimit: 2, userWindowMs: 1000 };
      limiter.checkByUser("u1", preset);
      limiter.checkByUser("u1", preset);
      expect(limiter.checkByUser("u1", preset).allowed).toBe(false);

      limiter.resetUser("u1");
      expect(limiter.checkByUser("u1", preset).allowed).toBe(true);
    });
  });

  describe("peek()", () => {
    test("returns count without incrementing", () => {
      limiter.check("key", 10, 1000);
      limiter.check("key", 10, 1000);

      expect(limiter.peek("key", 1000)).toBe(2);

      // peek should not increment
      expect(limiter.peek("key", 1000)).toBe(2);
    });

    test("returns 0 for unknown key", () => {
      expect(limiter.peek("nonexistent", 1000)).toBe(0);
    });
  });

  describe("size", () => {
    test("tracks number of keys", () => {
      expect(limiter.size).toBe(0);
      limiter.check("a", 10, 1000);
      limiter.check("b", 10, 1000);
      expect(limiter.size).toBe(2);
    });
  });

  describe("Zod schemas", () => {
    test("RateLimitConfigSchema validates correctly", () => {
      const valid = RateLimitConfigSchema.parse({ limit: 100, windowMs: 60000 });
      expect(valid.limit).toBe(100);

      expect(() => RateLimitConfigSchema.parse({ limit: -1, windowMs: 60000 })).toThrow();
      expect(() => RateLimitConfigSchema.parse({ limit: 100, windowMs: 0 })).toThrow();
    });

    test("RateLimitPresetSchema validates correctly", () => {
      const valid = RateLimitPresetSchema.parse({
        ipLimit: 100,
        ipWindowMs: 60000,
        userLimit: 200,
        userWindowMs: 60000,
      });
      expect(valid.ipLimit).toBe(100);
    });
  });

  describe("RATE_LIMIT_PRESETS", () => {
    test("all presets are defined", () => {
      expect(RATE_LIMIT_PRESETS["standard"]).toBeDefined();
      expect(RATE_LIMIT_PRESETS["ai"]).toBeDefined();
      expect(RATE_LIMIT_PRESETS["auth"]).toBeDefined();
      expect(RATE_LIMIT_PRESETS["public"]).toBeDefined();
    });

    test("ai preset is more restrictive than standard", () => {
      expect(RATE_LIMIT_PRESETS["ai"]!.ipLimit).toBeLessThan(
        RATE_LIMIT_PRESETS["standard"]!.ipLimit,
      );
    });

    test("auth preset is most restrictive", () => {
      expect(RATE_LIMIT_PRESETS["auth"]!.ipLimit).toBeLessThanOrEqual(
        RATE_LIMIT_PRESETS["ai"]!.ipLimit,
      );
    });
  });
});
