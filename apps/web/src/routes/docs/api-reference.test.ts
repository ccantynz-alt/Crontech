// ── /docs/api-reference/* — Smoke test for every article in the ────
// API Reference category. Pins:
//   1. Every referenced file exists on disk.
//   2. Every article exports a default component.
//   3. Every article uses the shared DocsArticle shell.
//   4. Every article's internal hrefs resolve to files on disk.
//
// Runs on Bun's test runner so it's picked up by `bun run test`.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// This test file lives at `routes/docs/api-reference.test.ts`, so
// `import.meta.dir` is the `docs/` directory and the article paths
// below are resolved directly from it.
const ROUTES_DIR = import.meta.dir;

const ARTICLES = [
  "api-reference/index.tsx",
  "api-reference/auth.tsx",
  "api-reference/projects.tsx",
  "api-reference/billing.tsx",
  "api-reference/dns-and-domains.tsx",
  "api-reference/ai-and-chat.tsx",
  "api-reference/support.tsx",
] as const;

// Every /docs/api-reference/* href referenced inside an article must
// resolve to a file on disk. This is the same invariant the top-level
// link-checker enforces — duplicated here so a broken nextStep or
// KeyList link fails fast, close to the article.
const KNOWN_HREFS: Record<string, string> = {
  "/docs/api-reference": "api-reference/index.tsx",
  "/docs/api-reference/auth": "api-reference/auth.tsx",
  "/docs/api-reference/projects": "api-reference/projects.tsx",
  "/docs/api-reference/billing": "api-reference/billing.tsx",
  "/docs/api-reference/dns-and-domains": "api-reference/dns-and-domains.tsx",
  "/docs/api-reference/ai-and-chat": "api-reference/ai-and-chat.tsx",
  "/docs/api-reference/support": "api-reference/support.tsx",
};

describe("/docs/api-reference — smoke", () => {
  test("every article file exists on disk", () => {
    for (const rel of ARTICLES) {
      expect(existsSync(resolve(ROUTES_DIR, rel))).toBe(true);
    }
  });

  test("every article exports a default component", () => {
    for (const rel of ARTICLES) {
      const src = readFileSync(resolve(ROUTES_DIR, rel), "utf-8");
      expect(src.includes("export default function")).toBe(true);
    }
  });

  test("every article uses the shared DocsArticle shell", () => {
    for (const rel of ARTICLES) {
      const src = readFileSync(resolve(ROUTES_DIR, rel), "utf-8");
      expect(src).toContain("DocsArticle");
      expect(src).toContain('eyebrow="API Reference');
    }
  });

  test("every /docs/api-reference/* href inside an article resolves to a real file", () => {
    // Pick up hrefs of the form "/docs/api-reference/..." inside any
    // article and verify they map to an entry in KNOWN_HREFS.
    const hrefRe = /\/docs\/api-reference(?:\/[a-z0-9-]+)?/g;
    for (const rel of ARTICLES) {
      const src = readFileSync(resolve(ROUTES_DIR, rel), "utf-8");
      const matches = src.matchAll(hrefRe);
      for (const m of matches) {
        const href = m[0];
        // Trailing slash variants aren't expected, but normalise
        // defensively.
        const clean = href.replace(/\/$/, "");
        expect(KNOWN_HREFS[clean]).toBeDefined();
      }
    }
  });

  test("no article names a competitor in-line (polite-tone guard)", () => {
    // POSITIONING.md forbids naming specific competitors in public
    // copy. Technology names (Cloudflare, Stripe, OpenAI, Anthropic,
    // Google) are fine where they add credibility; named rivals are
    // not. This guard pins the two most tempting ones.
    for (const rel of ARTICLES) {
      const src = readFileSync(resolve(ROUTES_DIR, rel), "utf-8").toLowerCase();
      const fromCodes = (...codes: number[]): string => String.fromCharCode(...codes);
      const banned = [
        ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
        ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
      ];
      for (const name of banned) {
        expect(src).not.toContain(name);
      }
    }
  });
});
