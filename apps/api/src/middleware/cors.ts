import type { MiddlewareHandler } from "hono";

// ─── Configuration ──────────────────────────────────────────────────────────

interface CorsOptions {
  /** Allowed origins. Supports exact strings and RegExp patterns. */
  allowedOrigins?: readonly (string | RegExp)[];
  /** Allowed HTTP methods. Default: common set. */
  allowedMethods?: readonly string[];
  /** Allowed request headers the client may send. */
  allowedHeaders?: readonly string[];
  /** Headers the browser is allowed to read from the response. */
  exposedHeaders?: readonly string[];
  /** Whether to include Access-Control-Allow-Credentials. Default: true */
  credentials?: boolean;
  /** Preflight cache duration in seconds. Default: 86_400 (24 h) */
  maxAge?: number;
}

// ─── Environment-Based Defaults ─────────────────────────────────────────────

function getDefaultOrigins(): readonly (string | RegExp)[] {
  const env = process.env.NODE_ENV ?? "development";
  const extra = process.env.CORS_ALLOWED_ORIGINS;

  const origins: (string | RegExp)[] = [];

  if (env === "development" || env === "test") {
    origins.push(
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:4321",
      "http://localhost:5173",
    );
  }

  if (extra) {
    for (const raw of extra.split(",")) {
      const trimmed = raw.trim();
      if (trimmed) {
        origins.push(trimmed);
      }
    }
  }

  return origins;
}

// ─── Origin Matching ────────────────────────────────────────────────────────

function isOriginAllowed(
  origin: string,
  allowedOrigins: readonly (string | RegExp)[],
): boolean {
  return allowedOrigins.some((allowed) => {
    if (typeof allowed === "string") {
      return allowed === origin;
    }
    return allowed.test(origin);
  });
}

// ─── Middleware ──────────────────────────────────────────────────────────────

const DEFAULT_METHODS: readonly string[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

const DEFAULT_HEADERS: readonly string[] = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "X-CSRF-Token",
  "Accept",
  "Accept-Language",
];

const DEFAULT_EXPOSED: readonly string[] = [
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "Retry-After",
];

/**
 * Whitelist-based CORS middleware for Hono.
 *
 * - Validates the `Origin` header against a configurable allow-list
 *   (strings for exact match, RegExp for patterns).
 * - Handles preflight (`OPTIONS`) requests with proper caching.
 * - Reads additional allowed origins from `CORS_ALLOWED_ORIGINS` env
 *   (comma-separated).
 * - In development / test mode, localhost origins are allowed by default.
 */
export function corsMiddleware(opts: CorsOptions = {}): MiddlewareHandler {
  const allowedOrigins = opts.allowedOrigins ?? getDefaultOrigins();
  const allowedMethods = opts.allowedMethods ?? DEFAULT_METHODS;
  const allowedHeaders = opts.allowedHeaders ?? DEFAULT_HEADERS;
  const exposedHeaders = opts.exposedHeaders ?? DEFAULT_EXPOSED;
  const credentials = opts.credentials ?? true;
  const maxAge = opts.maxAge ?? 86_400;

  const methodsStr = allowedMethods.join(", ");
  const headersStr = allowedHeaders.join(", ");
  const exposedStr = exposedHeaders.join(", ");

  return async (c, next): Promise<Response | void> => {
    const origin = c.req.header("origin");

    // No Origin header -- not a cross-origin request; skip CORS logic.
    if (!origin) {
      await next();
      return;
    }

    const allowed = isOriginAllowed(origin, allowedOrigins);

    if (!allowed) {
      // Reject cross-origin requests from unknown origins.
      // For preflight, return 403; for simple requests, omit CORS
      // headers so the browser blocks the response.
      if (c.req.method === "OPTIONS") {
        return c.text("Origin not allowed", 403);
      }
      await next();
      return undefined;
    }

    // ── Set CORS headers ──────────────────────────────────────────
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");

    if (credentials) {
      c.header("Access-Control-Allow-Credentials", "true");
    }

    if (exposedStr) {
      c.header("Access-Control-Expose-Headers", exposedStr);
    }

    // ── Preflight handling ────────────────────────────────────────
    if (c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", methodsStr);
      c.header("Access-Control-Allow-Headers", headersStr);
      c.header("Access-Control-Max-Age", String(maxAge));
      return new Response(null, { status: 204, headers: c.res.headers });
    }

    await next();
  };
}
