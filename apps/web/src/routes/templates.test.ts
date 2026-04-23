// ── /templates — Scaffold-Flow Regression Guard ────────────────────
//
// The Use-Template + Customize-with-AI buttons used to route to a
// dead /builder?template=X path (builder doesn't read the param).
// This guard pins the corrected wiring: both CTAs now land on
// /projects/new?template=X which actually scaffolds the project.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "templates.tsx");

describe("templates route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("Use-Template + Customize-with-AI both navigate to /projects/new (not /builder)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    // The canonical destination after the templates fix:
    expect(code).toContain("/projects/new?template=");
    // The old dead destination must never come back:
    expect(code).not.toMatch(/navigate\(\s*`\/builder\?template=/);
  });

  test("uses projectTemplates as the single source of truth for starters", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // lib/project-templates.ts is the catalog consumed by
    // /projects/new too — importing from it keeps the two pages in
    // sync and avoids a second mocked list here.
    expect(src).toContain("projectTemplates");
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
  });
});
