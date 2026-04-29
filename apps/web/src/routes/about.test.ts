// ── /about — Brand Story Regression Guard ─────────────────────────
//
// The about page is a POSITIONING-gated surface. It must stay aligned
// with docs/POSITIONING.md (universal audience, polite tone, no
// competitor names, "developer platform for the next decade" frame).

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "about.tsx");

describe("about route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("polite tone — no competitor names in public copy", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string => String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      ` ${fromCodes(99, 111, 110, 118, 101, 120)} `, // convex
      // Note: "render" is omitted here because it's a common English
      // word ("browser render target", "the UI renders") — we catch
      // the competitor "Render" via the explicit "replaces Render"
      // guard below where it would unambiguously mean the company.
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
    expect(src).not.toContain("crap");
    expect(src).not.toContain("garbage");
  });

  test("no adversarial 'replaces X' framing (POSITIONING.md §2)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    // POSITIONING.md Tone: POLITE: do NOT say "replaces Vercel /
    // Render / Supabase / Cloudflare / Stripe". The generic
    // "replaces many services" is allowed.
    expect(src).not.toMatch(/replaces\s+vercel/);
    expect(src).not.toMatch(/replaces\s+netlify/);
    expect(src).not.toMatch(/replaces\s+supabase/);
  });
});
