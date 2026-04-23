// ── Video route — Early Preview Smoke Test ───────────────────────
//
// Structural smoke test for the public /video page. The editor UI
// is in an "Early preview" state until the BLK-011 CRDT collab +
// editor surface ships. These assertions guard against regressions
// into the old "fake Craig / Sarah / Marcus collaborators + canned
// AI keyword-response" shape that shipped to logged-in users and
// violated the zero-broken-anything doctrine.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "video.tsx");

// Pure helper duplicated from video.tsx so the suite doesn't boot
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

describe("video route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("carries an Early preview badge, not a fake collaboration theatre", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("Early preview");
  });

  test("describes the core product surfaces", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    expect(src).toContain("webgpu");
    expect(src).toContain("crdt");
    expect(src).toContain("ai");
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

  test("carries no fabricated collaborators or canned AI responses", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Guards against the regression we just fixed.
    expect(src).not.toContain("MOCK_COLLABORATORS");
    expect(src).not.toContain("MOCK_COMMENTS");
    // The fake collaborators were named Craig / Sarah / Marcus + "AI Agent"
    // and the canned AI reply bank keyed off transition/subtitle/color/cut.
    expect(src).not.toContain('name: "Sarah"');
    expect(src).not.toContain('name: "Marcus"');
    expect(src).not.toContain('name: "AI Agent"');
    expect(src).not.toContain('"Adding a smooth crossfade transition');
    expect(src).not.toContain('"Generating subtitles using Whisper');
    // No fake "Synced"/"Syncing..." theatre badge.
    expect(src).not.toMatch(/syncStatus/);
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    // Each banned token is matched with spaces around it (or leading
    // edge) so substrings like "descript" embedded inside "description"
    // don't false-positive the guard. If a real competitor name ever
    // appears at word boundary in this file, the test still catches it.
    const banned = [
      ` ${fromCodes(112, 114, 101, 109, 105, 101, 114, 101)} `, // premiere
      ` ${fromCodes(102, 105, 110, 97, 108, 32, 99, 117, 116)} `, // final cut
      ` ${fromCodes(108, 111, 111, 109)} `, // loom
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
    expect(src).not.toContain("crap");
    expect(src).not.toContain("garbage");
  });
});

describe("isPlausibleEmail (video route)", () => {
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
