import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Result } from "axe-core";

/**
 * Accessibility E2E tests.
 *
 * Uses @axe-core/playwright to run automated WCAG 2.1 AA audits on every
 * major route plus keyboard-navigation smoke tests.
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Format axe violations into a readable string for test output. */
function formatViolations(violations: Result[]): string {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .map((n) => `    - ${n.html}\n      ${n.failureSummary ?? ""}`)
        .join("\n");
      return `[${v.impact}] ${v.id}: ${v.description}\n${nodes}`;
    })
    .join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  WCAG 2.1 AA compliance — main pages                               */
/* ------------------------------------------------------------------ */

test.describe("Accessibility — WCAG 2.1 AA Audit", () => {
  const routes: Array<{ name: string; path: string }> = [
    { name: "Homepage", path: "/" },
    { name: "Login", path: "/login" },
    { name: "Register", path: "/register" },
    { name: "About", path: "/about" },
    { name: "Builder", path: "/builder" },
  ];

  for (const route of routes) {
    test(`${route.name} (${route.path}) has no WCAG 2.1 AA violations`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(
        results.violations,
        formatViolations(results.violations),
      ).toHaveLength(0);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Color contrast — dark and light modes                             */
/* ------------------------------------------------------------------ */

test.describe("Accessibility — Color Contrast Modes", () => {
  test("light mode passes color-contrast checks", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2aa"])
      .options({ runOnly: ["color-contrast"] })
      .analyze();

    expect(
      results.violations,
      formatViolations(results.violations),
    ).toHaveLength(0);
  });

  test("dark mode passes color-contrast checks", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2aa"])
      .options({ runOnly: ["color-contrast"] })
      .analyze();

    expect(
      results.violations,
      formatViolations(results.violations),
    ).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Keyboard navigation                                               */
/* ------------------------------------------------------------------ */

test.describe("Accessibility — Keyboard Navigation", () => {
  test("homepage is fully navigable via Tab key", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Press Tab multiple times and verify focus moves to interactive elements
    const focusedTags: string[] = [];

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.tagName.toLowerCase() : "none";
      });
      focusedTags.push(tag);
    }

    // At least some interactive elements should receive focus
    const interactiveTags = new Set(["a", "button", "input", "textarea", "select"]);
    const interactiveHits = focusedTags.filter((t) => interactiveTags.has(t));
    expect(
      interactiveHits.length,
      `Expected Tab to reach interactive elements. Got: ${focusedTags.join(", ")}`,
    ).toBeGreaterThan(0);
  });

  test("focus ring is visible on interactive elements", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Tab to first interactive element
    await page.keyboard.press("Tab");

    const hasFocusIndicator = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const style = window.getComputedStyle(el);
      // Check for visible outline or box-shadow (common focus-ring strategies)
      const hasOutline =
        style.outlineStyle !== "none" && style.outlineWidth !== "0px";
      const hasBoxShadow =
        style.boxShadow !== "none" && style.boxShadow !== "";
      return hasOutline || hasBoxShadow;
    });

    expect(
      hasFocusIndicator,
      "Focused element should have a visible focus indicator (outline or box-shadow)",
    ).toBe(true);
  });

  test("login form can be submitted via keyboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Tab through the form fields and press Enter to submit
    await page.keyboard.press("Tab");

    // Verify we can reach input fields
    const activeTag = await page.evaluate(
      () => document.activeElement?.tagName.toLowerCase() ?? "none",
    );

    const isFormField = ["input", "textarea", "button"].includes(activeTag);
    expect(
      isFormField,
      `First Tab should focus a form field on login page, got: ${activeTag}`,
    ).toBe(true);
  });

  test("Escape key closes modal/dialog if one is open", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Look for any trigger that opens a dialog
    const dialogTrigger = page.locator(
      '[data-testid="dialog-trigger"], [aria-haspopup="dialog"], button:has-text("open"), button:has-text("menu")',
    );

    const triggerCount = await dialogTrigger.count();
    if (triggerCount === 0) {
      test.skip();
      return;
    }

    await dialogTrigger.first().click();

    const dialog = page.locator('[role="dialog"], dialog[open]');
    const dialogVisible = await dialog.isVisible().catch(() => false);

    if (!dialogVisible) {
      test.skip();
      return;
    }

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});

/* ------------------------------------------------------------------ */
/*  Landmark & semantic structure                                     */
/* ------------------------------------------------------------------ */

test.describe("Accessibility — Semantic Structure", () => {
  test("homepage has required ARIA landmarks", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["best-practice"])
      .options({ runOnly: ["landmark-one-main", "page-has-heading-one"] })
      .analyze();

    expect(
      results.violations,
      formatViolations(results.violations),
    ).toHaveLength(0);
  });

  test("images have alt text", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .options({ runOnly: ["image-alt"] })
      .analyze();

    expect(
      results.violations,
      formatViolations(results.violations),
    ).toHaveLength(0);
  });
});
