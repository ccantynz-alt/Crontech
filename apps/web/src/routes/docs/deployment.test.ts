// ── /docs/deployment/** — article smoke tests ────────────────────────
//
// Pins the shape of the four Deployment articles so a future session
// can't silently drop one back to "Coming soon" without turning the
// suite red. Mirrors the pattern established by the Getting Started
// tests on docs.test.ts.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEPLOYMENT_DIR = resolve(import.meta.dir, "deployment");

const ARTICLES = [
  { file: "index.tsx", href: "/docs/deployment" },
  { file: "how-a-deploy-runs.tsx", href: "/docs/deployment/how-a-deploy-runs" },
  {
    file: "environment-variables.tsx",
    href: "/docs/deployment/environment-variables",
  },
  { file: "custom-domains.tsx", href: "/docs/deployment/custom-domains" },
] as const;

describe("docs/deployment — four-article series", () => {
  test("every article file exists on disk", () => {
    for (const { file } of ARTICLES) {
      const abs = resolve(DEPLOYMENT_DIR, file);
      expect(existsSync(abs)).toBe(true);
    }
  });

  test("every article exports a default component", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(DEPLOYMENT_DIR, file), "utf-8");
      expect(src.includes("export default function")).toBe(true);
    }
  });

  test("every article uses the shared DocsArticle shell", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(DEPLOYMENT_DIR, file), "utf-8");
      expect(src).toContain("DocsArticle");
    }
  });

  test("every article declares the Deployment eyebrow", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(DEPLOYMENT_DIR, file), "utf-8");
      expect(src).toContain('eyebrow="Deployment"');
    }
  });

  test("every article sets a canonical path via SEOHead matching its route", () => {
    for (const { file, href } of ARTICLES) {
      const src = readFileSync(resolve(DEPLOYMENT_DIR, file), "utf-8");
      expect(src).toContain(`path="${href}"`);
    }
  });

  test("polite tone — no competitor names in deployment articles", () => {
    // Match the landing-page regression guard: competitor brand names
    // must not appear in any deployment article. Names are assembled
    // from char codes so this test's source is itself clean.
    const fromCodes = (...codes: number[]): string => String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      ` ${fromCodes(114, 101, 110, 100, 101, 114)} `, // render
    ];
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(DEPLOYMENT_DIR, file), "utf-8").toLowerCase();
      for (const name of banned) {
        expect(src).not.toContain(name);
      }
    }
  });

  test("how-a-deploy-runs describes the real sandbox primitives", () => {
    const src = readFileSync(resolve(DEPLOYMENT_DIR, "how-a-deploy-runs.tsx"), "utf-8");
    // The article must be honest about the real sandbox posture — if
    // a future session waters down the security claims, the suite
    // catches it.
    expect(src).toContain("cap-drop=ALL");
    expect(src).toContain("no-new-privileges");
    expect(src).toContain("bun install");
  });

  test("custom-domains cross-links to the Getting Started article", () => {
    const src = readFileSync(resolve(DEPLOYMENT_DIR, "custom-domains.tsx"), "utf-8");
    expect(src).toContain("/docs/getting-started/custom-domain");
  });
});
