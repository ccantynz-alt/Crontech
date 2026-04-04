import { createMiddleware } from "hono/factory";
import { createAuditEntry } from "./hash-chain";
import type { AuditEntryData } from "./hash-chain";

type AuditAction = AuditEntryData["action"];

// ---------------------------------------------------------------------------
// Map HTTP methods to audit actions
// ---------------------------------------------------------------------------

function httpMethodToAction(method: string): AuditAction | null {
  switch (method.toUpperCase()) {
    case "POST":
      return "CREATE";
    case "PUT":
    case "PATCH":
      return "UPDATE";
    case "DELETE":
      return "DELETE";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Extract resource info from the request path
// ---------------------------------------------------------------------------

function extractResource(path: string): {
  resourceType: string;
  resourceId: string;
} {
  // Normalize path: remove leading slash, split segments
  const segments = path.replace(/^\/+/, "").split("/").filter(Boolean);

  // Pattern: /api/entity/:id or /trpc/entity.method
  if (segments.length >= 2) {
    // For tRPC-style paths like /trpc/users.create
    const lastSegment = segments[segments.length - 1] ?? "";
    if (lastSegment.includes(".")) {
      const [resourceType] = lastSegment.split(".");
      return {
        resourceType: resourceType ?? lastSegment,
        resourceId: "*",
      };
    }

    // For REST-style paths like /api/users/123
    const resourceType = segments[segments.length - 2] ?? segments[0] ?? "unknown";
    const resourceId = segments[segments.length - 1] ?? "*";
    return { resourceType, resourceId };
  }

  if (segments.length === 1) {
    return { resourceType: segments[0] ?? "unknown", resourceId: "*" };
  }

  return { resourceType: "unknown", resourceId: "*" };
}

// ---------------------------------------------------------------------------
// Audit Middleware — automatically creates hash-chained audit entries
// for mutating requests (POST, PUT, PATCH, DELETE)
// ---------------------------------------------------------------------------

export interface AuditEnv {
  Variables: {
    userId: string | null;
  };
}

export const auditMiddleware = createMiddleware<AuditEnv>(async (c, next) => {
  const method = c.req.method;
  const action = httpMethodToAction(method);

  // Only audit mutating requests
  if (!action) {
    await next();
    return;
  }

  const startTime = Date.now();

  // Run the handler first
  await next();

  // Non-blocking audit logging: fire and forget
  const userId = c.get("userId");
  const path = new URL(c.req.url).pathname;
  const { resourceType, resourceId } = extractResource(path);
  const duration = Date.now() - startTime;

  const entryData: AuditEntryData = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actorId: userId ?? "anonymous",
    actorIp: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
    actorDevice: c.req.header("user-agent") ?? null,
    action,
    resourceType,
    resourceId,
    detail: JSON.stringify({
      method,
      path,
      statusCode: c.res.status,
      durationMs: duration,
    }),
    result: c.res.status >= 200 && c.res.status < 400 ? "success" : "failure",
    sessionId: null,
  };

  // Fire-and-forget — do not await to avoid slowing down the response
  void createAuditEntry(entryData).catch((err: unknown) => {
    console.error("[audit-middleware] Failed to create audit entry:", err);
  });
});
