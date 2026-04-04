import { describe, test, expect } from "bun:test";
import {
  users,
  credentials,
  sessions,
  auditLogs,
  sites,
  deployments,
} from "./schema";
import { getTableName, getTableColumns } from "drizzle-orm";

// ── users table ──────────────────────────────────────────────────────

describe("users table schema", () => {
  test("table is named 'users'", () => {
    expect(getTableName(users)).toBe("users");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(users);
    const columnNames = Object.keys(columns);
    const expected = [
      "id",
      "email",
      "displayName",
      "role",
      "createdAt",
      "updatedAt",
    ];
    for (const col of expected) {
      expect(columnNames).toContain(col);
    }
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(users);
    expect(columns.id.primary).toBe(true);
  });

  test("email is not nullable and unique", () => {
    const columns = getTableColumns(users);
    expect(columns.email.notNull).toBe(true);
    expect(columns.email.isUnique).toBe(true);
  });

  test("displayName is not nullable", () => {
    const columns = getTableColumns(users);
    expect(columns.displayName.notNull).toBe(true);
  });

  test("role is not nullable and has a default", () => {
    const columns = getTableColumns(users);
    expect(columns.role.notNull).toBe(true);
    expect(columns.role.hasDefault).toBe(true);
  });

  test("createdAt and updatedAt are not nullable", () => {
    const columns = getTableColumns(users);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
  });

  test("has exactly 6 columns", () => {
    const columns = getTableColumns(users);
    expect(Object.keys(columns).length).toBe(6);
  });
});

// ── credentials table ────────────────────────────────────────────────

describe("credentials table schema", () => {
  test("table is named 'credentials'", () => {
    expect(getTableName(credentials)).toBe("credentials");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(credentials);
    const expected = [
      "id",
      "userId",
      "credentialId",
      "publicKey",
      "counter",
      "deviceType",
      "backedUp",
      "transports",
      "createdAt",
    ];
    for (const col of expected) {
      expect(Object.keys(columns)).toContain(col);
    }
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(credentials);
    expect(columns.id.primary).toBe(true);
  });

  test("userId is not nullable", () => {
    const columns = getTableColumns(credentials);
    expect(columns.userId.notNull).toBe(true);
  });

  test("credentialId is not nullable and unique", () => {
    const columns = getTableColumns(credentials);
    expect(columns.credentialId.notNull).toBe(true);
    expect(columns.credentialId.isUnique).toBe(true);
  });

  test("publicKey is not nullable", () => {
    const columns = getTableColumns(credentials);
    expect(columns.publicKey.notNull).toBe(true);
  });

  test("counter is not nullable and has a default", () => {
    const columns = getTableColumns(credentials);
    expect(columns.counter.notNull).toBe(true);
    expect(columns.counter.hasDefault).toBe(true);
  });

  test("deviceType is not nullable", () => {
    const columns = getTableColumns(credentials);
    expect(columns.deviceType.notNull).toBe(true);
  });

  test("backedUp is not nullable and has a default", () => {
    const columns = getTableColumns(credentials);
    expect(columns.backedUp.notNull).toBe(true);
    expect(columns.backedUp.hasDefault).toBe(true);
  });

  test("transports is nullable", () => {
    const columns = getTableColumns(credentials);
    expect(columns.transports.notNull).toBe(false);
  });

  test("has exactly 9 columns", () => {
    const columns = getTableColumns(credentials);
    expect(Object.keys(columns).length).toBe(9);
  });
});

// ── sessions table ───────────────────────────────────────────────────

describe("sessions table schema", () => {
  test("table is named 'sessions'", () => {
    expect(getTableName(sessions)).toBe("sessions");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(sessions);
    const expected = ["id", "userId", "token", "expiresAt", "createdAt"];
    for (const col of expected) {
      expect(Object.keys(columns)).toContain(col);
    }
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(sessions);
    expect(columns.id.primary).toBe(true);
  });

  test("userId is not nullable", () => {
    const columns = getTableColumns(sessions);
    expect(columns.userId.notNull).toBe(true);
  });

  test("token is not nullable and unique", () => {
    const columns = getTableColumns(sessions);
    expect(columns.token.notNull).toBe(true);
    expect(columns.token.isUnique).toBe(true);
  });

  test("expiresAt is not nullable", () => {
    const columns = getTableColumns(sessions);
    expect(columns.expiresAt.notNull).toBe(true);
  });

  test("has exactly 5 columns", () => {
    const columns = getTableColumns(sessions);
    expect(Object.keys(columns).length).toBe(5);
  });
});

// ── auditLogs table ──────────────────────────────────────────────────

describe("auditLogs table schema", () => {
  test("table is named 'audit_logs'", () => {
    expect(getTableName(auditLogs)).toBe("audit_logs");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(auditLogs);
    const expected = [
      "id",
      "userId",
      "action",
      "resource",
      "detail",
      "ip",
      "userAgent",
      "createdAt",
    ];
    for (const col of expected) {
      expect(Object.keys(columns)).toContain(col);
    }
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(auditLogs);
    expect(columns.id.primary).toBe(true);
  });

  test("required fields are not nullable", () => {
    const columns = getTableColumns(auditLogs);
    expect(columns.id.notNull).toBe(true);
    expect(columns.action.notNull).toBe(true);
    expect(columns.resource.notNull).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
  });

  test("optional fields are nullable", () => {
    const columns = getTableColumns(auditLogs);
    expect(columns.userId.notNull).toBe(false);
    expect(columns.detail.notNull).toBe(false);
    expect(columns.ip.notNull).toBe(false);
    expect(columns.userAgent.notNull).toBe(false);
  });

  test("has exactly 8 columns", () => {
    const columns = getTableColumns(auditLogs);
    expect(Object.keys(columns).length).toBe(8);
  });
});

// ── sites table ──────────────────────────────────────────────────────

describe("sites table schema", () => {
  test("table is named 'sites'", () => {
    expect(getTableName(sites)).toBe("sites");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(sites);
    const expected = [
      "id",
      "userId",
      "name",
      "slug",
      "description",
      "pageLayout",
      "cloudflareProjectId",
      "subdomain",
      "customDomain",
      "status",
      "createdAt",
      "updatedAt",
    ];
    for (const col of expected) {
      expect(Object.keys(columns)).toContain(col);
    }
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(sites);
    expect(columns.id.primary).toBe(true);
  });

  test("userId is not nullable", () => {
    const columns = getTableColumns(sites);
    expect(columns.userId.notNull).toBe(true);
  });

  test("name is not nullable", () => {
    const columns = getTableColumns(sites);
    expect(columns.name.notNull).toBe(true);
  });

  test("slug is not nullable and unique", () => {
    const columns = getTableColumns(sites);
    expect(columns.slug.notNull).toBe(true);
    expect(columns.slug.isUnique).toBe(true);
  });

  test("description is nullable", () => {
    const columns = getTableColumns(sites);
    expect(columns.description.notNull).toBe(false);
  });

  test("pageLayout is nullable", () => {
    const columns = getTableColumns(sites);
    expect(columns.pageLayout.notNull).toBe(false);
  });

  test("cloudflareProjectId is nullable", () => {
    const columns = getTableColumns(sites);
    expect(columns.cloudflareProjectId.notNull).toBe(false);
  });

  test("subdomain is nullable and unique", () => {
    const columns = getTableColumns(sites);
    expect(columns.subdomain.notNull).toBe(false);
    expect(columns.subdomain.isUnique).toBe(true);
  });

  test("customDomain is nullable and unique", () => {
    const columns = getTableColumns(sites);
    expect(columns.customDomain.notNull).toBe(false);
    expect(columns.customDomain.isUnique).toBe(true);
  });

  test("status is not nullable and has a default", () => {
    const columns = getTableColumns(sites);
    expect(columns.status.notNull).toBe(true);
    expect(columns.status.hasDefault).toBe(true);
  });

  test("has exactly 12 columns", () => {
    const columns = getTableColumns(sites);
    expect(Object.keys(columns).length).toBe(12);
  });
});

// ── deployments table ────────────────────────────────────────────────

describe("deployments table schema", () => {
  test("table is named 'deployments'", () => {
    expect(getTableName(deployments)).toBe("deployments");
  });

  test("has all expected columns", () => {
    const columns = getTableColumns(deployments);
    const expected = [
      "id",
      "siteId",
      "userId",
      "cloudflareDeploymentId",
      "status",
      "url",
      "createdAt",
    ];
    for (const col of expected) {
      expect(Object.keys(columns)).toContain(col);
    }
  });

  test("id is the primary key", () => {
    const columns = getTableColumns(deployments);
    expect(columns.id.primary).toBe(true);
  });

  test("siteId is not nullable", () => {
    const columns = getTableColumns(deployments);
    expect(columns.siteId.notNull).toBe(true);
  });

  test("userId is not nullable", () => {
    const columns = getTableColumns(deployments);
    expect(columns.userId.notNull).toBe(true);
  });

  test("cloudflareDeploymentId is nullable", () => {
    const columns = getTableColumns(deployments);
    expect(columns.cloudflareDeploymentId.notNull).toBe(false);
  });

  test("status is not nullable and has a default", () => {
    const columns = getTableColumns(deployments);
    expect(columns.status.notNull).toBe(true);
    expect(columns.status.hasDefault).toBe(true);
  });

  test("url is nullable", () => {
    const columns = getTableColumns(deployments);
    expect(columns.url.notNull).toBe(false);
  });

  test("has exactly 7 columns", () => {
    const columns = getTableColumns(deployments);
    expect(Object.keys(columns).length).toBe(7);
  });
});

// ── Cross-table verification ─────────────────────────────────────────

describe("all tables exist", () => {
  test("all 6 required tables are exported", () => {
    expect(users).toBeDefined();
    expect(credentials).toBeDefined();
    expect(sessions).toBeDefined();
    expect(auditLogs).toBeDefined();
    expect(sites).toBeDefined();
    expect(deployments).toBeDefined();
  });
});
