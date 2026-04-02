// ── Telemetry MUST be initialized before any other imports ───────
import { shutdown as shutdownTelemetry, telemetryMiddleware } from "./telemetry";

import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { aiRoutes } from "./ai/routes";
import { wsApp, websocket, sseApp } from "./realtime";
import { inngestApp } from "./workflows/serve";

const app = new Hono().basePath("/api");

// OpenTelemetry tracing on every request
app.use("*", telemetryMiddleware);

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Mount AI routes (raw Hono -- streaming works better outside tRPC)
app.route("/ai", aiRoutes);

app.use("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c),
  });
  return response;
});

// Inngest durable workflows — AI pipelines, video processing, site building
app.route("/", inngestApp);

// Real-Time: WebSocket upgrade at /api/ws
app.route("/", wsApp);

// Real-Time: SSE + REST endpoints
app.route("/", sseApp);

// Only start Bun.serve when running directly (not in Cloudflare Workers)
if (typeof Bun !== "undefined" && Bun.serve) {
  const port = Number(process.env.API_PORT) || 3001;

  Bun.serve({
    fetch: app.fetch,
    port,
    websocket,
  });

  console.log(`API server running on http://localhost:${port}`);
  console.log(`  WebSocket: ws://localhost:${port}/api/ws`);
  console.log(`  SSE: http://localhost:${port}/api/realtime/events/:roomId`);
}

// ── Graceful shutdown ────────────────────────────────────────────
const handleShutdown = async (): Promise<void> => {
  console.log("Shutting down — flushing telemetry…");
  await shutdownTelemetry();
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

export default app;
