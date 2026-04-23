// ── /projects/[id]/metrics — Honest Preview Regression Test ───────
//
// The previous implementation was 468 lines of `Math.random()` theatre
// — fabricated CPU / memory / bandwidth / request graphs with gaussian
// spikes and simulated GC drops, plus a hardcoded Record<string,string>
// for project names. Every number a logged-in user saw was invented
// in the browser.
//
// This guard pins the current honest-preview state so a future session
// can't silently re-add the Math.random generators without the test
// turning red.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "metrics.tsx");

describe("projects/[id]/metrics route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("carries no Math.random fake-metric generators", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Strip single-line comments (the file-header disclaimer describes
    // the regression we just fixed, so a plain toContain would always
    // match the word "Math.random" inside that explanation).
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("Math.random");
    // None of the specific generator names from the old implementation
    // should ever return.
    expect(code).not.toContain("generateCpuData");
    expect(code).not.toContain("generateMemoryData");
    expect(code).not.toContain("generateBandwidthData");
    expect(code).not.toContain("generateRequestsData");
  });

  test("reads project name from real tRPC (not a hardcoded map)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.projects.getById");
    // The old implementation mapped "proj-1" → "crontech-web" etc.
    expect(src).not.toContain('"proj-1"');
    expect(src).not.toContain('"proj-2"');
    expect(src).not.toContain('"proj-3"');
  });

  test("states the metrics pipeline honestly (OTel → Mimir)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The page should describe the real observability stack, not
    // pretend rows of data exist.
    expect(src).toContain("OTel");
    expect(src).toContain("Mimir");
  });

  test("is admin-gated through ProtectedRoute", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("ProtectedRoute");
  });
});
