// ── /dashboard — Primary Authed-Surface Regression Guard ──────────
//
// Pins the dashboard structure: real tRPC data sources (not mocks),
// honest onboarding copy (updated in session 24e4f87 so step 2 no
// longer lies about /database being a DB config page), and the five
// quick-action tiles pointing to real routes.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "dashboard.tsx");

describe("dashboard route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("wrapped in ProtectedRoute (dashboard requires auth)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("ProtectedRoute");
  });

  test("reads real platform data, not hardcoded numbers", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Every stat/list on the dashboard comes from a real tRPC query.
    // Search for the canonical four: health, analytics, notifications,
    // projects.
    expect(src).toContain("trpc.health");
    expect(src).toContain("trpc.analytics");
    expect(src).toContain("trpc.notifications");
    expect(src).toContain("trpc.projects");
  });

  test("onboarding step 2 copy matches the honest /database state (not 'ready in seconds')", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // 24e4f87 softened this from "Your data layer is ready in seconds"
    // (a lie while BLK-012 inspector was still in preview) to an
    // honest description. Don't let the old copy come back.
    expect(src).not.toContain("Your data layer is ready in seconds");
  });

  test("all quick-action hrefs point to routes that exist on the file system", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // A subset of the canonical quick-action targets — each must
    // have a corresponding route file. The link checker already
    // guards hrefs written as JSX literals; this test covers href
    // strings inside JS arrays (which the link checker's regex
    // misses).
    const ROUTES_DIR = resolve(import.meta.dir);
    for (const href of [
      "/projects/new",
      "/docs",
      "/deployments",
      "/builder",
      "/chat",
      "/repos",
      "/templates",
      "/ops",
    ]) {
      expect(src).toContain(`href: "${href}"`);
      // Route file lookup — handle `/foo/bar` → `foo/bar.tsx`.
      const rel = href.slice(1);
      const direct = resolve(ROUTES_DIR, `${rel}.tsx`);
      const index = resolve(ROUTES_DIR, rel, "index.tsx");
      expect(existsSync(direct) || existsSync(index)).toBe(true);
    }
  });
});
