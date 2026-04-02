import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

/**
 * Parse allowed origins from CORS_ORIGINS env var (comma-separated)
 * or fall back to localhost:3000 for development.
 */
function getAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(",").map((o) => o.trim());
  }
  return ["http://localhost:3000"];
}

/**
 * CORS middleware for cross-origin requests.
 *
 * - Origins configurable via CORS_ORIGINS env (comma-separated)
 * - Credentials enabled for cookie/session auth
 * - Preflight cached for 24 hours (86400s)
 * - Exposes X-Request-ID and Server-Timing for client observability
 */
export const corsMiddleware: MiddlewareHandler = cors({
  origin: (origin: string): string | undefined => {
    const allowed = getAllowedOrigins();
    // Allow requests with no origin (same-origin, curl, etc.)
    if (!origin) return allowed[0];
    return allowed.includes(origin) ? origin : undefined;
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposeHeaders: ["X-Request-ID", "Server-Timing"],
  maxAge: 86400,
  credentials: true,
});
