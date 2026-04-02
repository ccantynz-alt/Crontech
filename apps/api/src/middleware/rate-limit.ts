import type { Context, MiddlewareHandler } from "hono";

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window */
  max: number;
  /** Function to derive the rate-limit key (defaults to IP) */
  keyGenerator?: (c: Context) => string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter middleware.
 *
 * NOTE: This is suitable for single-process deployments and development.
 * In production on Cloudflare Workers, replace with Cloudflare Rate Limiting
 * or a Durable Object-backed counter for distributed enforcement.
 *
 * Returns 429 Too Many Requests with a Retry-After header when the limit
 * is exceeded. Stale entries are pruned on each request to prevent leaks.
 */
export function rateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, max, keyGenerator } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries (every 60s)
  let lastCleanup = Date.now();
  const CLEANUP_INTERVAL = 60_000;

  function cleanup(now: number): void {
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }

  return async (c, next) => {
    const now = Date.now();
    cleanup(now);

    const key = keyGenerator
      ? keyGenerator(c)
      : c.req.header("x-forwarded-for") ||
        c.req.header("cf-connecting-ip") ||
        "unknown";

    const entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      // New window
      store.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfterSec));
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
      return c.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${retryAfterSec}s.`,
          retryAfter: retryAfterSec,
        },
        429,
      );
    }

    // Set informational rate-limit headers
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(max - entry.count));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    await next();
  };
}

// ── Presets ─────────────────────────────────────────────────────────

/** 100 requests per minute -- general API endpoints */
export const apiRateLimit: MiddlewareHandler = rateLimiter({
  windowMs: 60_000,
  max: 100,
});

/** 10 requests per minute -- auth endpoints (brute-force protection) */
export const authRateLimit: MiddlewareHandler = rateLimiter({
  windowMs: 60_000,
  max: 10,
});

/** 20 requests per minute -- AI endpoints (expensive compute) */
export const aiRateLimit: MiddlewareHandler = rateLimiter({
  windowMs: 60_000,
  max: 20,
});
