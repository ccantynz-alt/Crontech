// ── /ai-playground — Honest-Redirect Regression Test ─────────────
//
// The previous implementation ran a setTimeout theatre on this public
// route, rendering canned "Here is a high-performance SolidJS
// component..." replies with hardcoded tokens-per-second numbers —
// no model call, no real AI. This guard pins the current state
// (two-card redirect to /chat and /builder) so a future session
// can't silently re-add the fake-AI regression.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "ai-playground.tsx");

describe("ai-playground route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("routes visitors to the real AI surfaces (/chat + /builder)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain('href: "/chat"');
    expect(src).toContain('href: "/builder"');
  });

  test("carries no setTimeout-faked AI responses", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Strip // single-line comments — the file-header disclaimer
    // legitimately describes the old regression so the words appear
    // in prose but must not appear in executable code.
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("setTimeout");
    expect(code).not.toContain("Here is a high-performance SolidJS");
    expect(code).not.toContain("tokensPerSec");
    // No hardcoded throughput numbers pretending to reflect real inference.
    expect(code).not.toMatch(/\b41\s*tokens/);
    expect(code).not.toMatch(/\b128\s*tokens/);
  });

  test("carries no fabricated sample code blob", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).not.toContain("SAMPLE_CODE");
    expect(src).not.toContain("AI-generated SolidJS component");
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string => String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      ` ${fromCodes(111, 112, 101, 110, 97, 105)} `, // openai (we call Anthropic/Claude)
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
    expect(src).not.toContain("crap");
    expect(src).not.toContain("garbage");
  });
});
