// ── /status — Honest Status Regression Guard ───────────────────────
//
// The status page is the most over-claimed surface on a pre-launch
// platform — the temptation to ship 99.99% uptime numbers is strong.
// This guard pins the current honest-edition shape: reads live data
// from the API's health endpoint, no hardcoded uptime percentages,
// no Math.random() bars, no made-up response times.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "status.tsx");

describe("status route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("no Math.random in executable code (guards against fake uptime bars)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("Math.random");
  });

  test("no fabricated 99.x% uptime claims", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    // Any "99.X%" as a literal string is suspicious on a pre-launch
    // platform. Uptime percentages on this page must be computed
    // from the retained health history window, not hardcoded.
    expect(code).not.toMatch(/"99\.9[0-9]*%"/);
    expect(code).not.toMatch(/"99\.99%"/);
  });

  test("pulls from a real health endpoint", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The page must read from /health/monitor (or equivalent) rather
    // than fabricating a snapshot in the browser.
    expect(src).toContain("createResource");
    expect(src.toLowerCase()).toContain("health");
  });
});
