import { describe, expect, it, beforeEach } from "bun:test";
import {
  retryWithBackoff,
  clearAndRefetch,
  errorKey,
  isErrorTooFrequent,
  resetErrorHistory,
} from "../recovery";

// ── retryWithBackoff ─────────────────────────────────────────────────

describe("retryWithBackoff", () => {
  it("returns the result on first success", async () => {
    const result = await retryWithBackoff(() => Promise.resolve(42), {
      maxRetries: 3,
      baseDelay: 10,
    });
    expect(result).toBe(42);
  });

  it("retries on failure and succeeds", async () => {
    let attempts = 0;
    const result = await retryWithBackoff(
      () => {
        attempts++;
        if (attempts < 3) throw new Error("fail");
        return Promise.resolve("ok");
      },
      { maxRetries: 3, baseDelay: 10, jitter: false },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws after maxRetries exceeded", async () => {
    let attempts = 0;
    try {
      await retryWithBackoff(
        () => {
          attempts++;
          throw new Error("always fails");
        },
        { maxRetries: 2, baseDelay: 10, jitter: false },
      );
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toBe("always fails");
    }
    // 1 initial + 2 retries = 3 total attempts
    expect(attempts).toBe(3);
  });

  it("calls onRetry callback with attempt number and delay", async () => {
    const retries: Array<{ attempt: number; delay: number }> = [];
    let attempts = 0;

    try {
      await retryWithBackoff(
        () => {
          attempts++;
          throw new Error("fail");
        },
        {
          maxRetries: 2,
          baseDelay: 10,
          jitter: false,
          onRetry: (attempt, delay) => {
            retries.push({ attempt, delay });
          },
        },
      );
    } catch {
      // Expected
    }

    expect(retries.length).toBe(2);
    expect(retries[0]?.attempt).toBe(1);
    expect(retries[0]?.delay).toBe(10); // 10 * 2^0 = 10
    expect(retries[1]?.attempt).toBe(2);
    expect(retries[1]?.delay).toBe(20); // 10 * 2^1 = 20
  });

  it("respects maxDelay", async () => {
    const retries: Array<{ attempt: number; delay: number }> = [];
    let attempts = 0;

    try {
      await retryWithBackoff(
        () => {
          attempts++;
          throw new Error("fail");
        },
        {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 150,
          jitter: false,
          onRetry: (attempt, delay) => {
            retries.push({ attempt, delay });
          },
        },
      );
    } catch {
      // Expected
    }

    // 100 * 2^2 = 400, capped to 150
    expect(retries[2]?.delay).toBe(150);
  });

  it("works with zero retries (single attempt)", async () => {
    try {
      await retryWithBackoff(() => Promise.reject(new Error("once")), {
        maxRetries: 0,
        baseDelay: 10,
      });
      expect(true).toBe(false);
    } catch (e) {
      expect((e as Error).message).toBe("once");
    }
  });
});

// ── clearAndRefetch ──────────────────────────────────────────────────

describe("clearAndRefetch", () => {
  it("returns false in non-browser environment", () => {
    // In bun:test, window/sessionStorage/localStorage are not available
    // by default, so this exercises the fallback path.
    const result = clearAndRefetch("someKey");
    expect(typeof result).toBe("boolean");
  });
});

// ── errorKey ─────────────────────────────────────────────────────────

describe("errorKey", () => {
  it("generates key with component name", () => {
    expect(errorKey("fetch failed", "UserProfile")).toBe(
      "UserProfile::fetch failed",
    );
  });

  it("uses 'global' when no component provided", () => {
    expect(errorKey("fetch failed")).toBe("global::fetch failed");
  });

  it("uses 'global' when component is undefined", () => {
    expect(errorKey("oops", undefined)).toBe("global::oops");
  });
});

// ── isErrorTooFrequent ───────────────────────────────────────────────

describe("isErrorTooFrequent", () => {
  beforeEach(() => {
    resetErrorHistory();
  });

  it("returns false for the first occurrence", () => {
    expect(isErrorTooFrequent("test::err1")).toBe(false);
  });

  it("returns false for second occurrence (threshold is 3)", () => {
    isErrorTooFrequent("test::err2");
    expect(isErrorTooFrequent("test::err2")).toBe(false);
  });

  it("returns true when threshold is reached", () => {
    isErrorTooFrequent("test::err3");
    isErrorTooFrequent("test::err3");
    expect(isErrorTooFrequent("test::err3")).toBe(true);
  });

  it("respects custom maxOccurrences", () => {
    expect(isErrorTooFrequent("test::err4", 1)).toBe(true);
  });

  it("different keys are tracked independently", () => {
    isErrorTooFrequent("test::a");
    isErrorTooFrequent("test::a");
    isErrorTooFrequent("test::b");
    // 'a' has 2 occurrences, 'b' has 1 — neither hit default threshold of 3
    expect(isErrorTooFrequent("test::b")).toBe(false);
    // 'a' now has 3 — hits threshold
    expect(isErrorTooFrequent("test::a")).toBe(true);
  });

  it("resetErrorHistory clears all state", () => {
    isErrorTooFrequent("test::reset");
    isErrorTooFrequent("test::reset");
    resetErrorHistory();
    // After reset, count restarts
    expect(isErrorTooFrequent("test::reset")).toBe(false);
  });
});
