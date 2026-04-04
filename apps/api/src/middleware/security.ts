import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import { RateLimiter, RATE_LIMIT_PRESETS, type RateLimitPreset } from "@back-to-the-future/ai-core";

// ── Security Headers Middleware ────────────────────────────────────────

/**
 * Sets comprehensive security headers per OWASP recommendations.
 * CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c: Context, next: () => Promise<void>): Promise<void> => {
    await next();

    // Content Security Policy -- strict by default
    c.res.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https: wss:",
        "media-src 'self' https:",
        "object-src 'none'",
        "frame-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
      ].join("; "),
    );

    // HTTP Strict Transport Security -- 2 years with subdomains and preload
    c.res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );

    // Prevent clickjacking
    c.res.headers.set("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    c.res.headers.set("X-Content-Type-Options", "nosniff");

    // Control referrer information
    c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions Policy -- restrict browser features
    c.res.headers.set(
      "Permissions-Policy",
      [
        "camera=(self)",
        "microphone=(self)",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "magnetometer=()",
        "gyroscope=()",
        "accelerometer=()",
      ].join(", "),
    );

    // Prevent XSS in older browsers
    c.res.headers.set("X-XSS-Protection", "0");

    // Cross-Origin policies
    c.res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    c.res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    c.res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  };
}

// ── CORS Middleware ────────────────────────────────────────────────────

export const CorsOptionsSchema = z.object({
  /** Allowed origins */
  origins: z.array(z.string()),
  /** Allowed HTTP methods */
  methods: z
    .array(z.string())
    .default(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
  /** Allowed headers */
  allowedHeaders: z
    .array(z.string())
    .default(["Content-Type", "Authorization", "X-Request-ID"]),
  /** Headers exposed to the client */
  exposedHeaders: z
    .array(z.string())
    .default(["X-Request-ID", "X-RateLimit-Remaining", "X-RateLimit-Reset"]),
  /** Allow credentials (cookies, auth headers) */
  credentials: z.boolean().default(true),
  /** Preflight cache duration in seconds */
  maxAge: z.number().int().positive().default(86400),
});

export type CorsOptions = z.infer<typeof CorsOptionsSchema>;

/**
 * CORS middleware with proper origin validation.
 * Rejects requests from unauthorized origins.
 */
export function corsMiddleware(origins: string[]): MiddlewareHandler {
  const config = CorsOptionsSchema.parse({ origins });

  return async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
    const origin = c.req.header("Origin");

    // Check if origin is allowed
    const isAllowed =
      config.origins.includes("*") ||
      (origin !== undefined && config.origins.includes(origin));

    // Handle preflight requests
    if (c.req.method === "OPTIONS") {
      const headers = new Headers();

      if (isAllowed && origin) {
        headers.set("Access-Control-Allow-Origin", origin);
      }

      headers.set(
        "Access-Control-Allow-Methods",
        config.methods.join(", "),
      );
      headers.set(
        "Access-Control-Allow-Headers",
        config.allowedHeaders.join(", "),
      );
      headers.set(
        "Access-Control-Max-Age",
        config.maxAge.toString(),
      );

      if (config.credentials) {
        headers.set("Access-Control-Allow-Credentials", "true");
      }

      return new Response(null, { status: 204, headers });
    }

    await next();

    // Set CORS headers on actual responses
    if (isAllowed && origin) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
    }

    c.res.headers.set(
      "Access-Control-Expose-Headers",
      config.exposedHeaders.join(", "),
    );

    if (config.credentials) {
      c.res.headers.set("Access-Control-Allow-Credentials", "true");
    }

    // Vary header is critical for caching correctness with CORS
    c.res.headers.append("Vary", "Origin");
  };
}

// ── Rate Limit Middleware ──────────────────────────────────────────────

export const RateLimitMiddlewareOptionsSchema = z.object({
  /** Rate limit preset to use */
  preset: z.string().default("standard"),
  /** Custom preset overrides */
  customPreset: z
    .object({
      ipLimit: z.number().int().positive(),
      ipWindowMs: z.number().int().positive(),
      userLimit: z.number().int().positive(),
      userWindowMs: z.number().int().positive(),
    })
    .optional(),
  /** Header to extract real IP from (e.g., "X-Forwarded-For", "CF-Connecting-IP") */
  ipHeader: z.string().default("X-Forwarded-For"),
  /** Function to extract user ID from context (header name or custom logic) */
  userIdHeader: z.string().default("X-User-ID"),
  /** Skip rate limiting for these IPs (e.g., health check monitors) */
  skipIPs: z.array(z.string()).default([]),
});

export type RateLimitMiddlewareOptions = z.infer<typeof RateLimitMiddlewareOptionsSchema>;

// Shared RateLimiter instance for the middleware
const _sharedRateLimiter = new RateLimiter();

/**
 * Rate limiting middleware using the sliding window rate limiter.
 * Accepts a preset name string (e.g. "ai", "auth", "standard") or a RateLimiter + options.
 */
export function rateLimitMiddleware(
  presetOrLimiter: string | RateLimiter = "standard",
  options?: Partial<RateLimitMiddlewareOptions>,
): MiddlewareHandler {
  const rateLimiter = typeof presetOrLimiter === "string" ? _sharedRateLimiter : presetOrLimiter;
  const config = RateLimitMiddlewareOptionsSchema.parse(
    typeof presetOrLimiter === "string"
      ? { ...(options ?? {}), preset: presetOrLimiter }
      : (options ?? {}),
  );

  const preset: RateLimitPreset =
    config.customPreset ??
    RATE_LIMIT_PRESETS[config.preset] ??
    RATE_LIMIT_PRESETS["standard"]!;

  return async (c: Context, next: () => Promise<void>): Promise<Response | void> => {
    // Extract client IP
    const forwardedFor = c.req.header(config.ipHeader);
    const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown";

    // Skip rate limiting for allowed IPs
    if (config.skipIPs.includes(ip)) {
      await next();
      return;
    }

    // Extract user ID if available
    const userId = c.req.header(config.userIdHeader) ?? undefined;

    // Check rate limit
    const result = rateLimiter.checkCombined(ip, userId, preset);

    // Set rate limit headers
    c.res.headers.set("X-RateLimit-Limit", preset.ipLimit.toString());
    c.res.headers.set("X-RateLimit-Remaining", result.remaining.toString());
    c.res.headers.set("X-RateLimit-Reset", result.resetAt.toString());

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      return c.json(
        {
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter,
        },
        429,
        {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": preset.ipLimit.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": result.resetAt.toString(),
        },
      );
    }

    await next();
  };
}
