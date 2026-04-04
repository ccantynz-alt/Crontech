import { describe, test, expect, beforeEach } from "bun:test";
import app from "./d1-worker";

// ── Mock D1 Database ────────────────────────────────────────────────

interface D1Row {
  [key: string]: unknown;
}

class MockD1PreparedStatement {
  private sql: string;
  private boundParams: unknown[] = [];
  private db: MockD1Database;

  constructor(sql: string, db: MockD1Database) {
    this.sql = sql;
    this.db = db;
  }

  bind(...params: unknown[]): MockD1PreparedStatement {
    this.boundParams = params;
    return this;
  }

  async all(): Promise<{ results: D1Row[]; success: boolean }> {
    return this.db.executeQuery(this.sql, this.boundParams);
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    return this.db.executeRun(this.sql, this.boundParams);
  }

  async first(): Promise<D1Row | null> {
    const result = await this.all();
    return result.results[0] ?? null;
  }
}

class MockD1Database {
  private tables = new Map<string, D1Row[]>();
  private tableSchemas = new Map<string, D1Row[]>();
  private shouldFail = false;
  private failMessage = "Database error";

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(sql, this);
  }

  async batch(statements: MockD1PreparedStatement[]): Promise<Array<{ results: D1Row[]; success: boolean; meta: { changes: number } }>> {
    const results: Array<{ results: D1Row[]; success: boolean; meta: { changes: number } }> = [];
    for (const stmt of statements) {
      const queryResult = await stmt.all();
      results.push({ ...queryResult, meta: { changes: 0 } });
    }
    return results;
  }

  // Internal: simulate query execution
  executeQuery(sql: string, _params: unknown[]): { results: D1Row[]; success: boolean } {
    if (this.shouldFail) throw new Error(this.failMessage);

    const trimmed = sql.trim();

    if (trimmed === "SELECT 1") {
      return { results: [{ "1": 1 }], success: true };
    }

    if (trimmed.includes("sqlite_master")) {
      const tables: D1Row[] = [];
      for (const [name] of this.tables) {
        tables.push({ name, type: "table", sql: `CREATE TABLE ${name} (...)` });
      }
      return { results: tables, success: true };
    }

    if (trimmed.startsWith("PRAGMA table_info")) {
      const match = trimmed.match(/PRAGMA table_info\((\w+)\)/);
      if (match) {
        const schema = this.tableSchemas.get(match[1]);
        return { results: schema ?? [], success: true };
      }
      return { results: [], success: true };
    }

    if (trimmed.toUpperCase().startsWith("SELECT")) {
      // Return rows from the first referenced table, or empty
      for (const [name, rows] of this.tables) {
        if (trimmed.includes(name)) {
          return { results: rows, success: true };
        }
      }
      return { results: [], success: true };
    }

    return { results: [], success: true };
  }

  // Internal: simulate write execution
  executeRun(sql: string, _params: unknown[]): { success: boolean; meta: { changes: number } } {
    if (this.shouldFail) throw new Error(this.failMessage);
    return { success: true, meta: { changes: 1 } };
  }

  // Test helpers
  addTable(name: string, rows: D1Row[], schema?: D1Row[]): void {
    this.tables.set(name, rows);
    if (schema) {
      this.tableSchemas.set(name, schema);
    }
  }

  setFail(fail: boolean, message?: string): void {
    this.shouldFail = fail;
    if (message) this.failMessage = message;
  }

  clear(): void {
    this.tables.clear();
    this.tableSchemas.clear();
    this.shouldFail = false;
  }
}

// ── Test Helpers ────────────────────────────────────────────────────

let mockDB: MockD1Database;

async function req(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init), { DB: mockDB, ENVIRONMENT: "test" } as never);
}

function jsonPost(path: string, body: unknown): Promise<Response> {
  return req(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockDB = new MockD1Database();
});

// ── Health Check ────────────────────────────────────────────────────

describe("D1 worker - health", () => {
  test("GET /health returns ok when D1 is accessible", async () => {
    const res = await req("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; environment: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("d1-worker");
    expect(body.environment).toBe("test");
  });

  test("GET /health returns 503 when D1 is unreachable", async () => {
    mockDB.setFail(true, "Connection refused");
    const res = await req("/health");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe("error");
    expect(body.error).toBe("Connection refused");
  });
});

// ── Read-Only Query ─────────────────────────────────────────────────

describe("D1 worker - POST /query", () => {
  test("executes a read-only SELECT query", async () => {
    mockDB.addTable("users", [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);

    const res = await jsonPost("/query", { sql: "SELECT * FROM users" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ id: number; name: string }>; success: boolean };
    expect(body.success).toBe(true);
    expect(body.results.length).toBe(2);
    expect(body.results[0].name).toBe("Alice");
  });

  test("executes a query with bound params", async () => {
    mockDB.addTable("users", [{ id: 1, name: "Alice" }]);

    const res = await jsonPost("/query", {
      sql: "SELECT * FROM users WHERE id = ?",
      params: [1],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  test("rejects INSERT statements", async () => {
    const res = await jsonPost("/query", { sql: "INSERT INTO users (name) VALUES ('Eve')" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("read-only");
  });

  test("rejects UPDATE statements", async () => {
    const res = await jsonPost("/query", { sql: "UPDATE users SET name = 'Eve' WHERE id = 1" });
    expect(res.status).toBe(403);
  });

  test("rejects DELETE statements", async () => {
    const res = await jsonPost("/query", { sql: "DELETE FROM users WHERE id = 1" });
    expect(res.status).toBe(403);
  });

  test("rejects DROP statements", async () => {
    const res = await jsonPost("/query", { sql: "DROP TABLE users" });
    expect(res.status).toBe(403);
  });

  test("rejects ALTER statements", async () => {
    const res = await jsonPost("/query", { sql: "ALTER TABLE users ADD COLUMN age INTEGER" });
    expect(res.status).toBe(403);
  });

  test("rejects CREATE statements", async () => {
    const res = await jsonPost("/query", { sql: "CREATE TABLE evil (id INTEGER)" });
    expect(res.status).toBe(403);
  });

  test("rejects empty SQL", async () => {
    const res = await jsonPost("/query", { sql: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("required");
  });

  test("rejects SQL exceeding max length", async () => {
    const longSql = "SELECT " + "a".repeat(10_001);
    const res = await jsonPost("/query", { sql: longSql });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("maximum length");
  });

  test("returns 500 on database error", async () => {
    mockDB.setFail(true, "Disk I/O error");
    const res = await jsonPost("/query", { sql: "SELECT 1" });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Disk I/O error");
  });
});

// ── Write Execution ─────────────────────────────────────────────────

describe("D1 worker - POST /execute", () => {
  test("executes a write statement", async () => {
    const res = await jsonPost("/execute", {
      sql: "INSERT INTO users (name) VALUES (?)",
      params: ["Alice"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; meta: { changes: number } };
    expect(body.success).toBe(true);
    expect(body.meta.changes).toBe(1);
  });

  test("executes without params", async () => {
    const res = await jsonPost("/execute", { sql: "DELETE FROM sessions" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  test("rejects empty SQL", async () => {
    const res = await jsonPost("/execute", { sql: "   " });
    expect(res.status).toBe(400);
  });

  test("returns 500 on database error", async () => {
    mockDB.setFail(true, "Constraint violation");
    const res = await jsonPost("/execute", { sql: "INSERT INTO users (name) VALUES ('x')" });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Constraint violation");
  });
});

// ── Batch Execution ─────────────────────────────────────────────────

describe("D1 worker - POST /batch", () => {
  test("executes multiple statements", async () => {
    const res = await jsonPost("/batch", {
      statements: [
        { sql: "INSERT INTO users (name) VALUES (?)", params: ["Alice"] },
        { sql: "INSERT INTO users (name) VALUES (?)", params: ["Bob"] },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ success: boolean }> };
    expect(body.results.length).toBe(2);
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(true);
  });

  test("rejects empty statements array", async () => {
    const res = await jsonPost("/batch", { statements: [] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("must not be empty");
  });

  test("rejects missing statements field", async () => {
    const res = await jsonPost("/batch", {});
    expect(res.status).toBe(400);
  });

  test("validates each statement in the batch", async () => {
    const res = await jsonPost("/batch", {
      statements: [
        { sql: "INSERT INTO users (name) VALUES ('Alice')" },
        { sql: "" },
      ],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Statement 1");
  });

  test("returns 500 on database error", async () => {
    mockDB.setFail(true, "Transaction failed");
    const res = await jsonPost("/batch", {
      statements: [{ sql: "INSERT INTO users (name) VALUES ('x')" }],
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Transaction failed");
  });
});

// ── List Tables ─────────────────────────────────────────────────────

describe("D1 worker - GET /tables", () => {
  test("lists all tables", async () => {
    mockDB.addTable("users", []);
    mockDB.addTable("posts", []);

    const res = await req("/tables");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tables: Array<{ name: string; type: string }> };
    expect(body.tables.length).toBe(2);
    expect(body.tables.map((t) => t.name)).toContain("users");
    expect(body.tables.map((t) => t.name)).toContain("posts");
  });

  test("returns empty array when no tables exist", async () => {
    const res = await req("/tables");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tables: D1Row[] };
    expect(body.tables.length).toBe(0);
  });

  test("returns 500 on database error", async () => {
    mockDB.setFail(true, "Schema read failed");
    const res = await req("/tables");
    expect(res.status).toBe(500);
  });
});

// ── Table Schema ────────────────────────────────────────────────────

describe("D1 worker - GET /tables/:name", () => {
  test("returns table schema", async () => {
    mockDB.addTable("users", [], [
      { cid: 0, name: "id", type: "INTEGER", notnull: 1, dflt_value: null, pk: 1 },
      { cid: 1, name: "name", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 2, name: "email", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ]);

    const res = await req("/tables/users");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; columns: Array<{ name: string; type: string }> };
    expect(body.name).toBe("users");
    expect(body.columns.length).toBe(3);
    expect(body.columns[0].name).toBe("id");
    expect(body.columns[0].type).toBe("INTEGER");
    expect(body.columns[2].name).toBe("email");
  });

  test("returns 404 for non-existent table", async () => {
    const res = await req("/tables/nonexistent");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Table not found");
  });

  test("rejects invalid table names (SQL injection prevention)", async () => {
    const res = await req("/tables/users;DROP%20TABLE");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid table name");
  });

  test("rejects table names with special characters", async () => {
    const res = await req("/tables/users--comment");
    expect(res.status).toBe(400);
  });

  test("returns 500 on database error", async () => {
    mockDB.setFail(true, "PRAGMA failed");
    const res = await req("/tables/users");
    expect(res.status).toBe(500);
  });
});

// ── Security: Read-Only Bypass Attempts ─────────────────────────────

describe("D1 worker - security", () => {
  test("rejects case-insensitive write keywords in /query", async () => {
    const attacks = [
      "insert INTO users VALUES (1)",
      "INSERT into users VALUES (1)",
      "update users SET name = 'x'",
      "delete from users",
      "drop table users",
      "alter table users add column x int",
      "create table evil (id int)",
    ];

    for (const sql of attacks) {
      const res = await jsonPost("/query", { sql });
      expect(res.status).toBe(403);
    }
  });

  test("allows SELECT with keyword-like strings in quotes", async () => {
    mockDB.addTable("logs", [{ message: "user deleted the record" }]);
    const res = await jsonPost("/query", {
      sql: "SELECT * FROM logs WHERE message = 'DELETE this row'",
    });
    expect(res.status).toBe(200);
  });

  test("rejects TRUNCATE in /query", async () => {
    const res = await jsonPost("/query", { sql: "TRUNCATE TABLE users" });
    expect(res.status).toBe(403);
  });

  test("rejects REPLACE in /query", async () => {
    const res = await jsonPost("/query", { sql: "REPLACE INTO users (id, name) VALUES (1, 'Eve')" });
    expect(res.status).toBe(403);
  });
});
