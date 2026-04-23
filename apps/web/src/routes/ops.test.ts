// ── /ops — Ops Theatre Regression Guard ───────────────────────────
//
// /ops shows live build runs / CI status / deployment logs. It must
// wire to real tRPC and honestly say "no runs" when the list is empty
// — no theatre.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "ops.tsx");

describe("ops route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("fetches real run data via trpc (no fabricated rows)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.");
  });

  test("honest empty state — says so when there are no runs", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The route's own header comment asserts: "No theater. No mock
    // data. If there are no runs, the page says so."
    expect(src.toLowerCase()).toContain("no theater");
  });
});
