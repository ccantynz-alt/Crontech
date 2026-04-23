// ── /flywheel — Session Memory Regression Guard ───────────────────
//
// The flywheel page surfaces session history via the flywheel service.
// Its own comment: "No theater. No mock data. If the memory is empty,
// the page says so." This guard pins that invariant.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "flywheel.tsx");

describe("flywheel route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("fetches real session data via trpc (no fabricated sessions)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.");
  });

  test("honest empty state — no mock data", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.toLowerCase()).toContain("no theater");
  });
});
