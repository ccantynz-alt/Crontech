// ── /projects, /projects/new, /projects/import, /projects/[id] — Smoke
//
// Batched regression guards for the project-surface routes. Each of
// the four pages must wire to real tRPC and never ship fabricated
// project rows.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = import.meta.dir;

interface RouteSpec {
  path: string;
  mustContain: string[];
  mustNotContain?: string[];
}

const ROUTES: RouteSpec[] = [
  {
    path: "projects.tsx",
    mustContain: ["trpc.", "export default function"],
    mustNotContain: ["MOCK_PROJECTS", "SAMPLE_PROJECTS", "FAKE_PROJECTS"],
  },
  {
    path: "projects/new.tsx",
    mustContain: ["trpc.projects.create", "export default function"],
    mustNotContain: ["setTimeout(() => {", "fake wizard"],
  },
  {
    path: "projects/import.tsx",
    mustContain: [
      "trpc.import.",
      "export default function",
      "Vercel",
      "Netlify",
    ],
    // The import page *names* Vercel / Netlify because that's the
    // neutral action ("import from X") — that's allowed by
    // POSITIONING.md §2. We only ban adversarial "replaces X" framing.
    mustNotContain: ["replaces Vercel", "replaces Netlify"],
  },
  {
    path: "projects/[id].tsx",
    mustContain: ["trpc.projects.", "export default function"],
    mustNotContain: ["MOCK_DATA", "SAMPLE_DATA"],
  },
];

describe("projects routes — smoke", () => {
  for (const route of ROUTES) {
    describe(route.path, () => {
      const path = resolve(DIR, route.path);
      test("file exists", () => {
        expect(existsSync(path)).toBe(true);
      });

      test("contains required tokens (real trpc wiring + default export)", () => {
        const src = readFileSync(path, "utf-8");
        for (const needle of route.mustContain) {
          expect(src).toContain(needle);
        }
      });

      if (route.mustNotContain && route.mustNotContain.length > 0) {
        test("does not contain any banned tokens (regression guards)", () => {
          const src = readFileSync(path, "utf-8");
          const code = src
            .split("\n")
            .filter((line) => !line.trim().startsWith("//"))
            .join("\n");
          for (const needle of route.mustNotContain ?? []) {
            expect(code).not.toContain(needle);
          }
        });
      }
    });
  }
});
