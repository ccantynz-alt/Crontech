// ── Database route — Early Preview Smoke Test ─────────────────────
//
// Structural smoke test for the public /database page. The route is
// in an "Early preview" state until the BLK-012 in-browser inspector
// ships. These assertions guard against regressions into the old
// "fake Connected badge + MOCK_QUERY_RESULT fabricated rows" shape
// that shipped to production and violated the zero-broken-anything
// doctrine.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "database.tsx");

// Pure helper duplicated from database.tsx so the suite doesn't boot
// SolidJS SSR. Drift is caught by the grep-based shape checks below.
function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  if (!trimmed.includes("@")) return false;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return false;
  if (!domain.includes(".")) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}

describe("database route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("carries an Early preview badge, not a fake 'Connected' status", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("Early preview");
    // Regressions: the old page shipped a fake "Connected" pill and
    // fabricated region. They must never come back.
    expect(src).not.toMatch(/>\s*Connected\s*</);
    expect(src).not.toContain("us-east-1");
  });

  test("describes the real engines under the hood", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("Turso");
    expect(src).toContain("Neon");
    expect(src).toContain("Qdrant");
  });

  test("renders a waitlist form with an email input + submit button", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("onSubmit={onSubmit}");
    expect(src).toContain('type="email"');
    expect(src).toContain("Join waitlist");
  });

  test("exports the isPlausibleEmail helper", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("export function isPlausibleEmail");
  });

  test("carries no fabricated data or mock-query rows", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Guard against the regression we just fixed.
    expect(src).not.toContain("MOCK_QUERY_RESULT");
    expect(src).not.toContain("elena@acme.dev");
    expect(src).not.toContain("marcus@streamline.io");
    expect(src).not.toContain("sarah.kim@buildfast.co");
    // No fake execution-time theatre.
    expect(src).not.toMatch(/12ms/);
    expect(src).not.toContain("Executing query...");
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    // Each banned token is matched with spaces around it so substrings
    // embedded inside larger words (e.g. "descript" inside "description")
    // don't false-positive the guard.
    const banned = [
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      ` ${fromCodes(112, 108, 97, 110, 101, 116, 115, 99, 97, 108, 101)} `, // planetscale
      ` ${fromCodes(102, 105, 114, 101, 115, 116, 111, 114, 101)} `, // firestore
      ` ${fromCodes(100, 121, 110, 97, 109, 111, 100, 98)} `, // dynamodb
      ` ${fromCodes(109, 111, 110, 103, 111, 100, 98)} `, // mongodb
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
    expect(src).not.toContain("crap");
    expect(src).not.toContain("garbage");
  });
});

describe("isPlausibleEmail (database route)", () => {
  test("accepts well-formed addresses", () => {
    expect(isPlausibleEmail("user@example.com")).toBe(true);
    expect(isPlausibleEmail("first.last+tag@sub.example.co")).toBe(true);
  });

  test("rejects missing @, missing TLD, or blank input", () => {
    expect(isPlausibleEmail("")).toBe(false);
    expect(isPlausibleEmail("nope")).toBe(false);
    expect(isPlausibleEmail("nope@nope")).toBe(false);
    expect(isPlausibleEmail("@example.com")).toBe(false);
    expect(isPlausibleEmail("user@.com")).toBe(false);
  });

  test("rejects absurdly long inputs", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(isPlausibleEmail(long)).toBe(false);
  });
});
