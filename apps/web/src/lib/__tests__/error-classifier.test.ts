import { describe, expect, it } from "bun:test";
import { classifyError, type ClassifiedError } from "../error-classifier";

// ── Helper ───────────────────────────────────────────────────────────

function assertCategory(
  err: ClassifiedError,
  category: ClassifiedError["category"],
): void {
  expect(err.category).toBe(category);
}

// ── HTTP Status Code Classification ──────────────────────────────────

describe("classifyError — HTTP status codes", () => {
  it("classifies 400 as validation", () => {
    const err = classifyError({ message: "Bad request", statusCode: 400 });
    assertCategory(err, "validation");
    expect(err.severity).toBe("low");
    expect(err.retryable).toBe(false);
  });

  it("classifies 401 as auth", () => {
    const err = classifyError({ message: "Unauthorized", statusCode: 401 });
    assertCategory(err, "auth");
    expect(err.severity).toBe("medium");
    expect(err.retryable).toBe(false);
  });

  it("classifies 403 as auth", () => {
    const err = classifyError({ message: "Forbidden", statusCode: 403 });
    assertCategory(err, "auth");
  });

  it("classifies 404 as not_found", () => {
    const err = classifyError({ message: "Not found", statusCode: 404 });
    assertCategory(err, "not_found");
    expect(err.severity).toBe("low");
    expect(err.retryable).toBe(false);
  });

  it("classifies 429 as rate_limit", () => {
    const err = classifyError({ message: "Slow down", statusCode: 429 });
    assertCategory(err, "rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("classifies 500 as server", () => {
    const err = classifyError({ message: "Internal error", statusCode: 500 });
    assertCategory(err, "server");
    expect(err.severity).toBe("high");
    expect(err.retryable).toBe(true);
  });

  it("classifies 502 as server", () => {
    const err = classifyError({ message: "Bad gateway", statusCode: 502 });
    assertCategory(err, "server");
    expect(err.retryable).toBe(true);
  });

  it("classifies 503 as server", () => {
    const err = classifyError({ message: "Unavailable", statusCode: 503 });
    assertCategory(err, "server");
  });

  it("classifies 504 as network (timeout)", () => {
    const err = classifyError({ message: "Gateway timeout", statusCode: 504 });
    assertCategory(err, "network");
    expect(err.retryable).toBe(true);
  });

  it("extracts status from nested data.httpStatus (tRPC shape)", () => {
    const err = classifyError({
      message: "Not found",
      data: { httpStatus: 404 },
    });
    assertCategory(err, "not_found");
  });

  it("extracts status from response.status", () => {
    const err = classifyError({
      message: "Server error",
      response: { status: 500 },
    });
    assertCategory(err, "server");
  });
});

// ── Message Pattern Classification ───────────────────────────────────

describe("classifyError — message patterns", () => {
  it("classifies 'fetch failed' as network", () => {
    const err = classifyError(new Error("fetch failed"));
    assertCategory(err, "network");
  });

  it("classifies 'Failed to fetch' as network", () => {
    const err = classifyError(new Error("Failed to fetch"));
    assertCategory(err, "network");
  });

  it("classifies 'ECONNREFUSED' as network with high severity", () => {
    const err = classifyError(new Error("connect ECONNREFUSED 127.0.0.1:3001"));
    assertCategory(err, "network");
    expect(err.severity).toBe("high");
  });

  it("classifies 'ETIMEDOUT' as network", () => {
    const err = classifyError(new Error("ETIMEDOUT"));
    assertCategory(err, "network");
  });

  it("classifies 'session expired' as auth", () => {
    const err = classifyError(new Error("Your session expired"));
    assertCategory(err, "auth");
  });

  it("classifies 'token expired' as auth", () => {
    const err = classifyError(new Error("token expired"));
    assertCategory(err, "auth");
  });

  it("classifies 'token invalid' as auth", () => {
    const err = classifyError(new Error("token invalid"));
    assertCategory(err, "auth");
  });

  it("classifies 'validation error' as validation", () => {
    const err = classifyError(new Error("Validation error on field email"));
    assertCategory(err, "validation");
    expect(err.severity).toBe("low");
  });

  it("classifies 'rate limit exceeded' as rate_limit", () => {
    const err = classifyError(new Error("rate limit exceeded"));
    assertCategory(err, "rate_limit");
  });

  it("classifies 'too many requests' as rate_limit", () => {
    const err = classifyError(new Error("Too many requests"));
    assertCategory(err, "rate_limit");
  });

  it("classifies 'hydration mismatch' as render", () => {
    const err = classifyError(new Error("hydration mismatch"));
    assertCategory(err, "render");
    expect(err.severity).toBe("high");
  });

  it("classifies 'cannot read property' as render", () => {
    const err = classifyError(
      new TypeError("Cannot read properties of undefined"),
    );
    assertCategory(err, "render");
  });

  it("classifies 'internal server error' as server", () => {
    const err = classifyError(new Error("internal server error"));
    assertCategory(err, "server");
  });

  it("classifies 'database connection lost' as server/critical", () => {
    const err = classifyError(new Error("database connection lost"));
    assertCategory(err, "server");
    expect(err.severity).toBe("critical");
  });
});

// ── TypeError / ReferenceError Fallback ──────────────────────────────

describe("classifyError — native error types", () => {
  it("classifies plain TypeError as render", () => {
    const err = classifyError(new TypeError("foo is not a function"));
    assertCategory(err, "render");
  });

  it("classifies ReferenceError as render", () => {
    const err = classifyError(new ReferenceError("x is not defined"));
    assertCategory(err, "render");
    expect(err.severity).toBe("high");
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────

describe("classifyError — edge cases", () => {
  it("handles null", () => {
    const err = classifyError(null);
    assertCategory(err, "unknown");
    expect(err.message).toBe("Unknown error");
  });

  it("handles undefined", () => {
    const err = classifyError(undefined);
    assertCategory(err, "unknown");
  });

  it("handles string error", () => {
    const err = classifyError("Something went wrong");
    expect(err.message).toBe("Something went wrong");
  });

  it("handles empty object", () => {
    const err = classifyError({});
    assertCategory(err, "unknown");
  });

  it("always includes a timestamp", () => {
    const before = Date.now();
    const err = classifyError(new Error("test"));
    expect(err.timestamp).toBeGreaterThanOrEqual(before);
    expect(err.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it("always includes a user-friendly message", () => {
    const err = classifyError(new Error("crypto internal failure xyz"));
    expect(err.userMessage.length).toBeGreaterThan(0);
  });

  it("extracts tRPC path as apiEndpoint", () => {
    const err = classifyError({ message: "Error", path: "user.get" });
    expect(err.apiEndpoint).toBe("user.get");
  });

  it("status code takes priority over message pattern", () => {
    // Message says "network error" but status says 401
    const err = classifyError({
      message: "network error",
      statusCode: 401,
    });
    assertCategory(err, "auth");
  });
});

// ── Retryable ────────────────────────────────────────────────────────

describe("classifyError — retryable flag", () => {
  it("network errors are retryable", () => {
    expect(classifyError(new Error("fetch failed")).retryable).toBe(true);
  });

  it("server errors are retryable", () => {
    expect(
      classifyError({ message: "error", statusCode: 500 }).retryable,
    ).toBe(true);
  });

  it("rate_limit errors are retryable", () => {
    expect(
      classifyError({ message: "error", statusCode: 429 }).retryable,
    ).toBe(true);
  });

  it("auth errors are NOT retryable", () => {
    expect(
      classifyError({ message: "error", statusCode: 401 }).retryable,
    ).toBe(false);
  });

  it("validation errors are NOT retryable", () => {
    expect(
      classifyError({ message: "error", statusCode: 400 }).retryable,
    ).toBe(false);
  });

  it("render errors are NOT retryable", () => {
    expect(classifyError(new TypeError("oops")).retryable).toBe(false);
  });
});
