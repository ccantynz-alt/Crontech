// ── D1 Edge Database Worker ──────────────────────────────────────────
// Edge-deployed D1 worker for SQL query execution against Cloudflare D1.
// Supports read-only queries, write executions, batch transactions,
// and schema introspection with security validation.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

// ── Cloudflare Bindings ──────────────────────────────────────────────

export interface D1Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

// ── SQL Security ─────────────────────────────────────────────────────

const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|MERGE)\b/i;

function isReadOnly(sql: string): boolean {
  // Strip string literals and comments to avoid false positives
  const stripped = sql
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return !WRITE_KEYWORDS.test(stripped);
}

function validateSql(sql: string): string | null {
  if (!sql || typeof sql !== "string") return "SQL statement is required";
  if (sql.trim().length === 0) return "SQL statement cannot be empty";
  if (sql.length > 10_000) return "SQL statement exceeds maximum length (10000 chars)";
  return null;
}

// ── Worker App ───────────────────────────────────────────────────────

const app = new Hono<{ Bindings: D1Env }>();

// Security headers
app.use("*", secureHeaders());

// CORS
app.use(
  "*",
  cors({
    origin: ["https://backtothefuture.dev", "http://localhost:3000"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  }),
);

// ── Health Check ─────────────────────────────────────────────────────

app.get("/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({
      status: "ok",
      service: "d1-worker",
      environment: c.env.ENVIRONMENT,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        status: "error",
        service: "d1-worker",
        error: error instanceof Error ? error.message : "D1 unreachable",
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
});

// ── Read-Only Query ──────────────────────────────────────────────────

app.post("/query", async (c) => {
  const body = await c.req.json<{ sql: string; params?: unknown[] }>();

  const validationError = validateSql(body.sql);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  if (!isReadOnly(body.sql)) {
    return c.json({ error: "Only read-only queries are allowed on this endpoint" }, 403);
  }

  try {
    const stmt = c.env.DB.prepare(body.sql);
    const bound = body.params?.length ? stmt.bind(...body.params) : stmt;
    const result = await bound.all();

    return c.json({
      results: result.results,
      success: result.success,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Query execution failed" },
      500,
    );
  }
});

// ── Write Execution ──────────────────────────────────────────────────

app.post("/execute", async (c) => {
  const body = await c.req.json<{ sql: string; params?: unknown[] }>();

  const validationError = validateSql(body.sql);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  try {
    const stmt = c.env.DB.prepare(body.sql);
    const bound = body.params?.length ? stmt.bind(...body.params) : stmt;
    const result = await bound.run();

    return c.json({
      success: result.success,
      meta: result.meta,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Execution failed" },
      500,
    );
  }
});

// ── Batch Execution (Transaction) ────────────────────────────────────

app.post("/batch", async (c) => {
  const body = await c.req.json<{
    statements: Array<{ sql: string; params?: unknown[] }>;
  }>();

  if (!body.statements || !Array.isArray(body.statements) || body.statements.length === 0) {
    return c.json({ error: "Statements array is required and must not be empty" }, 400);
  }

  for (let i = 0; i < body.statements.length; i++) {
    const validationError = validateSql(body.statements[i].sql);
    if (validationError) {
      return c.json({ error: `Statement ${i}: ${validationError}` }, 400);
    }
  }

  try {
    const prepared = body.statements.map((s) => {
      const stmt = c.env.DB.prepare(s.sql);
      return s.params?.length ? stmt.bind(...s.params) : stmt;
    });

    const results = await c.env.DB.batch(prepared);

    return c.json({
      results: results.map((r) => ({
        success: r.success,
        results: r.results,
        meta: r.meta,
      })),
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Batch execution failed" },
      500,
    );
  }
});

// ── List Tables ──────────────────────────────────────────────────────

app.get("/tables", async (c) => {
  try {
    const result = await c.env.DB.prepare(
      "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all();

    return c.json({
      tables: result.results,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to list tables" },
      500,
    );
  }
});

// ── Table Schema ─────────────────────────────────────────────────────

app.get("/tables/:name", async (c) => {
  const name = c.req.param("name");

  // Validate table name: alphanumeric + underscores only
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return c.json({ error: "Invalid table name" }, 400);
  }

  try {
    const columns = await c.env.DB.prepare(`PRAGMA table_info(${name})`).all();

    if (!columns.results || columns.results.length === 0) {
      return c.json({ error: "Table not found" }, 404);
    }

    return c.json({
      name,
      columns: columns.results,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get table schema" },
      500,
    );
  }
});

export default app;
