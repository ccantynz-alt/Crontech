// ── /support — Real-Submission Regression Guard ────────────────────
//
// The support form used to ship a setTimeout(1200) fake submission
// that discarded prospect messages. This guard pins the real-tRPC
// wiring so a future session can't silently re-introduce the
// theatre.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "support.tsx");

describe("support route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("submits to the real trpc.support.submitPublic mutation", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.support.submitPublic");
  });

  test("no setTimeout-faked submission in executable code", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    // The old theatre was `setTimeout(() => { setSubmitted(true) }, 1200)`
    // inside handleSubmit — must never return.
    expect(code).not.toMatch(/setTimeout\([^)]*setSubmitted/);
  });

  test("surfaces the six canonical ticket categories", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // These six are the CategoryEnum on the tRPC side minus 'spam'.
    for (const cat of ["technical", "billing", "bug", "feature", "sales", "other"]) {
      expect(src).toContain(cat);
    }
  });

  test("validates email client-side before submit", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain(".includes(\"@\")");
  });
});
