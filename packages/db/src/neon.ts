import { type NeonQueryFunction, Pool, neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tursoSchema from "./schema";

// ── Neon PostgreSQL ──────────────────────────────────────────────────
// Secondary DB: complex queries, full-text search, pgvector embeddings.
//
// Transport: WebSocket (persistent pool) instead of HTTP round-trips.
// Bun exposes WebSocket as a built-in global — no `ws` package needed.
// Under high agent concurrency the pool keeps connections warm and avoids
// the TLS+TCP handshake cost on every query.
neonConfig.webSocketConstructor = WebSocket;

export { tursoSchema };

type NeonDb = ReturnType<typeof drizzle>;

// Module-level singleton — one pool per process, shared across all
// requests. Explicit databaseUrl overrides (e.g. per-tenant Neon
// projects) get their own pool and are not cached here.
let _pool: Pool | null = null;
let _db: NeonDb | null = null;

export function createNeonClient(databaseUrl?: string): {
  db: NeonDb;
  sql: NeonQueryFunction<false, false>;
  pool: Pool;
} {
  const url = databaseUrl ?? process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new Error(
      "NEON_DATABASE_URL is required. Set it in your environment or pass it directly.",
    );
  }

  // Reuse singleton for the default (non-tenant-overridden) URL.
  if (!databaseUrl && _pool && _db) {
    return { db: _db, sql: neon(url) as NeonQueryFunction<false, false>, pool: _pool };
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool });
  const sql = neon(url) as NeonQueryFunction<false, false>;

  if (!databaseUrl) {
    _pool = pool;
    _db = db;
  }

  return { db, pool, sql };
}

// ── Health Check ─────────────────────────────────────────────────────

export async function checkNeonHealth(databaseUrl?: string): Promise<{
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const { pool } = createNeonClient(databaseUrl);
    await pool.query("SELECT 1 as health_check");
    return {
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
