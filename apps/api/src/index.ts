import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { aiRoutes } from "./ai/routes";

const app = new Hono().basePath("/api");

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

const port = Number(process.env.API_PORT) || 3001;

Bun.serve({
  fetch: app.fetch,
  port,
});

console.log(`API server running on http://localhost:${port}`);

export default app;
