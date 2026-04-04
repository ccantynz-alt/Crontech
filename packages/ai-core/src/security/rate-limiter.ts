import { z } from "zod";

// ── Zod Schemas ─────────────────────────────────────────────────────────

export const RateLimitConfigSchema = z.object({
  /** Maximum number of requests allowed in the window */
  limit: z.number().int().positive(),
  /** Window duration in milliseconds */
  windowMs: z.number().int().positive(),
  /** Optional key prefix for namespacing */
  keyPrefix: z.string().optional(),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

export const RateLimitResultSchema = z.object({
  /** Whether the request is allowed */
  allowed: z.boolean(),
  /** Number of remaining requests in the current window */
  remaining: z.number().int().min(0),
  /** Unix timestamp (ms) when the window resets */
  resetAt: z.number(),
});

export type RateLimitResult = z.infer<typeof RateLimitResultSchema>;

export const RateLimitPresetSchema = z.object({
  /** Requests per window for IP-based limiting */
  ipLimit: z.number().int().positive(),
  /** Window duration for IP-based limiting (ms) */
  ipWindowMs: z.number().int().positive(),
  /** Requests per window for user-based limiting */
  userLimit: z.number().int().positive(),
  /** Window duration for user-based limiting (ms) */
  userWindowMs: z.number().int().positive(),
});

export type RateLimitPreset = z.infer<typeof RateLimitPresetSchema>;

// ── Default Presets ─────────────────────────────────────────────────────

export const RATE_LIMIT_PRESETS: Record<string, RateLimitPreset> = {
  /** Standard API endpoints */
  standard: {
    ipLimit: 100,
    ipWindowMs: 60_000,
    userLimit: 200,
    userWindowMs: 60_000,
  },
  /** AI inference endpoints (more expensive) */
  ai: {
    ipLimit: 20,
    ipWindowMs: 60_000,
    userLimit: 50,
    userWindowMs: 60_000,
  },
  /** Authentication endpoints (strict) */
  auth: {
    ipLimit: 10,
    ipWindowMs: 300_000,
    userLimit: 10,
    userWindowMs: 300_000,
  },
  /** Public read-only endpoints (generous) */
  public: {
    ipLimit: 500,
    ipWindowMs: 60_000,
    userLimit: 1000,
    userWindowMs: 60_000,
  },
} as const;

// ── Sliding Window Entry ────────────────────────────────────────────────

interface WindowEntry {
  /** Timestamps of requests within the current and previous windows */
  timestamps: number[];
  /** Start of the current window */
  windowStart: number;
}

// ── Rate Limiter ────────────────────────────────────────────────────────

export class RateLimiter {
  private readonly store: Map<string, WindowEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of expired entries every 60 seconds
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60_000);
  }

  /**
   * Check if a request is allowed under the sliding window rate limit.
   * Uses a sliding window log algorithm for accurate rate limiting.
   */
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = this.store.get(key);

    if (!entry) {
      entry = { timestamps: [], windowStart: now };
      this.store.set(key, entry);
    }

    // Remove timestamps outside the sliding window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
    entry.windowStart = windowStart;

    const currentCount = entry.timestamps.length;

    if (currentCount >= limit) {
      // Find when the oldest timestamp in the window will expire
      const oldestInWindow = entry.timestamps[0];
      const resetAt = oldestInWindow !== undefined ? oldestInWindow + windowMs : now + windowMs;

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Allow the request and record the timestamp
    entry.timestamps.push(now);

    return {
      allowed: true,
      remaining: limit - currentCount - 1,
      resetAt: now + windowMs,
    };
  }

  /**
   * Check rate limit by IP address using a preset configuration.
   */
  checkByIP(ip: string, preset: RateLimitPreset): RateLimitResult {
    return this.check(`ip:${ip}`, preset.ipLimit, preset.ipWindowMs);
  }

  /**
   * Check rate limit by user ID using a preset configuration.
   */
  checkByUser(userId: string, preset: RateLimitPreset): RateLimitResult {
    return this.check(`user:${userId}`, preset.userLimit, preset.userWindowMs);
  }

  /**
   * Combined check: both IP and user must be within limits.
   * Returns the most restrictive result.
   */
  checkCombined(
    ip: string,
    userId: string | undefined,
    preset: RateLimitPreset,
  ): RateLimitResult {
    const ipResult = this.checkByIP(ip, preset);

    if (!ipResult.allowed) {
      return ipResult;
    }

    if (userId) {
      const userResult = this.checkByUser(userId, preset);
      if (!userResult.allowed) {
        return userResult;
      }

      // Return the more restrictive remaining count
      return userResult.remaining < ipResult.remaining ? userResult : ipResult;
    }

    return ipResult;
  }

  /**
   * Reset rate limit for a specific key.
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Reset all rate limits for an IP address.
   */
  resetIP(ip: string): void {
    this.store.delete(`ip:${ip}`);
  }

  /**
   * Reset all rate limits for a user.
   */
  resetUser(userId: string): void {
    this.store.delete(`user:${userId}`);
  }

  /**
   * Get current count for a key without incrementing.
   */
  peek(key: string, windowMs: number): number {
    const entry = this.store.get(key);
    if (!entry) return 0;

    const windowStart = Date.now() - windowMs;
    return entry.timestamps.filter((ts) => ts > windowStart).length;
  }

  /**
   * Remove expired entries from the store.
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.store) {
      // If no timestamps remain in any reasonable window (5 min max), remove
      const hasRecent = entry.timestamps.some((ts) => ts > now - 300_000);
      if (!hasRecent) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key);
    }
  }

  /**
   * Destroy the rate limiter and clear the cleanup timer.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }

  /**
   * Get the number of tracked keys (for monitoring).
   */
  get size(): number {
    return this.store.size;
  }
}
