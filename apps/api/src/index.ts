// OpenTelemetry must be initialized before all other imports
import { initTelemetry } from "@back-to-the-future/config/otel";
initTelemetry("back-to-the-future-api");

import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { aiRoutes } from "./ai/routes";
import { streamUIRoutes } from "./ai/stream";
import { builderRoutes } from "./ai/builder-routes";
import { ragRoutes } from "./ai/rag-routes";
import { wsApp, websocket, sseApp } from "./realtime";
import { rateLimiter } from "./middleware/rate-limit";
import { telemetryMiddleware } from "./middleware/telemetry";
import { privacyHeaders } from "./middleware/privacy";
import { securityHeaders, csrfProtection } from "./middleware/security";
import { sanitizeMiddleware } from "./middleware/sanitize";
import { corsMiddleware } from "./middleware/cors";
import { cspReportRoutes } from "./security/csp-report";
import { createGDPRHandler } from "./privacy/gdpr";
import { openApiDocument } from "./docs/openapi";
import { getSSOConfig, createSSOHandler } from "./auth/sso";
import { passkeyRoutes } from "./auth/passkey";
import { videoRoutes } from "./video/routes";

const app = new Hono().basePath("/api");

// Trace every request with OpenTelemetry
app.use("*", telemetryMiddleware);

// CORS -- must run before other middleware so preflight is handled early
app.use("*", corsMiddleware());

// Comprehensive security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use("*", securityHeaders());

// Privacy and security response headers (GDPR compliance)
app.use("*", privacyHeaders());

// Input sanitization -- blocks SQL injection / path traversal patterns
app.use("*", sanitizeMiddleware());

// CSRF protection (double-submit cookie) -- skip safe methods & specific paths
app.use(
  "*",
  csrfProtection({
    excludePaths: [
      "/api/security/csp-report",
      "/api/health",
      "/api/trpc",
      "/api/openapi.json",
      "/api/docs",
    ],
  }),
);

// Global rate limit: 100 requests per minute per IP
app.use("*", rateLimiter({ limit: 100, windowMs: 60_000 }));

// Stricter rate limit on auth endpoints: 10 requests per minute per IP
app.use("/auth/*", rateLimiter({ limit: 10, windowMs: 60_000 }));

// ── API Documentation ────────────────────────────────────────────
app.get("/openapi.json", (c) => {
  return c.json(openApiDocument);
});

app.get(
  "/docs",
  swaggerUI({
    url: "/api/openapi.json",
  }),
);

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Mount CSP violation reporting endpoint
app.route("/security", cspReportRoutes);

// Mount AI routes (raw Hono -- streaming works better outside tRPC)
app.route("/ai", aiRoutes);

// Mount generative UI streaming routes (SSE)
app.route("/ai", streamUIRoutes);

// Mount AI website builder routes (SSE streaming)
app.route("/ai", builderRoutes);

// Mount RAG pipeline routes
app.route("/ai/rag", ragRoutes);

// Mount Passkey/WebAuthn authentication routes
app.route("/auth/passkey", passkeyRoutes);

// Mount video processing routes
app.route("/video", videoRoutes);

// Mount GDPR privacy routes
app.route("/privacy", createGDPRHandler());

// ── Enterprise SSO ──────────────────────────────────────────────
const ssoConfig = getSSOConfig();
if (ssoConfig) {
  app.route("/sso", createSSOHandler(ssoConfig));
}

app.use("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c),
  });
  return response;
});

// Real-Time: WebSocket upgrade at /api/ws
app.route("/", wsApp);

// Real-Time: SSE + REST endpoints
app.route("/", sseApp);

const port = Number(process.env.API_PORT) || 3001;

Bun.serve({
  fetch: app.fetch,
  port,
  websocket,
});

console.log(`API server running on http://localhost:${port}`);
console.log(`  WebSocket: ws://localhost:${port}/api/ws`);
console.log(`  SSE: http://localhost:${port}/api/realtime/events/:roomId`);

export default app;
