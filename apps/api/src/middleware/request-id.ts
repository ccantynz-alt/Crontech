import type { MiddlewareHandler } from "hono";

/**
 * Request ID middleware.
 *
 * Generates a unique ID for every request using crypto.randomUUID().
 * If the incoming request already carries an X-Request-ID header
 * (forwarded from an edge proxy or load balancer), that value is reused
 * to maintain traceability across hops.
 *
 * The ID is:
 * - Set on the response via X-Request-ID header
 * - Attached to the Hono context as "requestId" for logging/tracing
 */
export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header("X-Request-ID");
  const requestId = incoming || crypto.randomUUID();

  c.set("requestId", requestId);
  c.header("X-Request-ID", requestId);

  await next();
};
