// ── Telemetry Middleware (Hono) ──────────────────────────────────
// Creates a span for every HTTP request with method, path, status,
// duration, user agent, and optional userId attributes.

import { trace, SpanKind, SpanStatusCode, type Span } from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_PATH,
  ATTR_USER_AGENT_ORIGINAL,
} from "@opentelemetry/semantic-conventions";
import type { MiddlewareHandler } from "hono";

const tracer = trace.getTracer("cronix-api", "0.0.1");

/**
 * Hono middleware that wraps every request in an OpenTelemetry span.
 *
 * Recorded attributes:
 *  - http.request.method
 *  - url.path
 *  - http.response.status_code
 *  - user_agent.original
 *  - http.duration_ms (custom)
 *  - enduser.id (if present on context)
 */
export const telemetryMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;

  const span: Span = tracer.startSpan(`${method} ${path}`, {
    kind: SpanKind.SERVER,
    attributes: {
      [ATTR_HTTP_REQUEST_METHOD]: method,
      [ATTR_URL_PATH]: path,
      [ATTR_USER_AGENT_ORIGINAL]: c.req.header("user-agent") ?? "unknown",
    },
  });

  const start = performance.now();

  try {
    await next();

    const status = c.res.status;
    const durationMs = performance.now() - start;

    span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, status);
    span.setAttribute("http.duration_ms", Math.round(durationMs * 100) / 100);

    // Attach userId if the handler set it on the context
    const userId = c.get("userId" as never) as string | undefined;
    if (userId) {
      span.setAttribute("enduser.id", userId);
    }

    if (status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
  } catch (err) {
    const durationMs = performance.now() - start;
    span.setAttribute("http.duration_ms", Math.round(durationMs * 100) / 100);

    const message = err instanceof Error ? err.message : "Unknown error";
    span.setStatus({ code: SpanStatusCode.ERROR, message });
    span.recordException(err instanceof Error ? err : new Error(message));

    throw err;
  } finally {
    span.end();
  }
};
