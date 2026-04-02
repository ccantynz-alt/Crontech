import type { MiddlewareHandler } from "hono";

interface LogEntry {
  level: "info" | "warn" | "error";
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string;
  userAgent: string;
  ip: string;
}

/**
 * Structured JSON logging middleware.
 *
 * Emits one log line per request with method, path, status, duration,
 * request ID, user agent, and client IP. Log level is determined by
 * response status code:
 *   - 2xx/3xx -> info
 *   - 4xx     -> warn
 *   - 5xx     -> error
 *
 * Health check requests (GET /api/health) are skipped to reduce noise.
 */
export const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  // Skip health checks -- too noisy in production
  if (c.req.method === "GET" && c.req.path === "/api/health") {
    await next();
    return;
  }

  const start = performance.now();

  await next();

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const status = c.res.status;

  let level: LogEntry["level"] = "info";
  if (status >= 500) level = "error";
  else if (status >= 400) level = "warn";

  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    status,
    durationMs,
    requestId: c.get("requestId") ?? "unknown",
    userAgent: c.req.header("user-agent") ?? "",
    ip:
      c.req.header("x-forwarded-for") ||
      c.req.header("cf-connecting-ip") ||
      "unknown",
  };

  // Add Server-Timing header for client-side performance observability
  c.header("Server-Timing", `total;dur=${durationMs}`);

  // Structured JSON to stdout -- consumed by Loki/Grafana pipeline
  console[level](JSON.stringify(entry));
};
