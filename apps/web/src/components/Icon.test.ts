import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Icon Component Smoke Test ───────────────────────────────────────
//
// Verifies that the Icon component exists, exports the expected API,
// and maps the three sample icons the landing page relies on
// (`zap`, `database`, `lock`). Runs as a static source-level check
// plus a module-import check so it works inside Bun's test runner
// without needing a JSDOM / SolidJS render harness (the rest of the
// web package does not ship one).

const ICON_TSX = resolve(import.meta.dir, "Icon.tsx");

describe("Smoke: Icon component source", () => {
  test("Icon.tsx exists", () => {
    expect(existsSync(ICON_TSX)).toBe(true);
  });

  test("Icon.tsx exports Icon component and IconName type", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toContain("export function Icon");
    expect(src).toContain("export type IconName");
    expect(src).toContain("export default Icon");
  });

  test("Icon registry maps `zap` to a solid-icons component", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    // The registry line should look like: `zap: FiZap,`
    expect(src).toMatch(/zap:\s*Fi[A-Z]\w+/);
  });

  test("Icon registry maps `database` to a solid-icons component", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toMatch(/database:\s*Fi[A-Z]\w+/);
  });

  test("Icon registry maps `lock` to a solid-icons component", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toMatch(/lock:\s*Fi[A-Z]\w+/);
  });

  test("Icon defaults to 24px size and 1.5 stroke width", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toContain("props.size ?? 24");
    expect(src).toContain('props["stroke-width"] ?? 1.5');
  });

  test("Icon imports from solid-icons/fi", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toContain('from "solid-icons/fi"');
  });
});

describe("Smoke: Icon module loads", () => {
  test("Icon module imports without throwing", async () => {
    // Verifies the file is syntactically valid, JSX parses, and
    // `solid-icons/fi` resolves at runtime. We don't render — SolidJS
    // JSX needs a DOM the web package doesn't preload in tests.
    const mod = (await import("./Icon")) as {
      Icon: unknown;
      default: unknown;
    };
    expect(typeof mod.Icon).toBe("function");
    expect(typeof mod.default).toBe("function");
  });
});
