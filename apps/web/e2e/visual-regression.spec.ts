import { expect, test } from "@playwright/test";

/**
 * Visual regression tests.
 *
 * On first run Playwright creates reference screenshots in __snapshots__.
 * Subsequent runs compare against those baselines and fail when the diff
 * exceeds the threshold configured in playwright.config.ts.
 *
 * To update baselines after intentional UI changes:
 *   bunx playwright test --update-snapshots
 */

/* ------------------------------------------------------------------ */
/*  Homepage                                                          */
/* ------------------------------------------------------------------ */

test.describe("Visual Regression — Homepage", () => {
  test("homepage matches baseline screenshot", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("homepage-full.png", {
      fullPage: true,
    });
  });

  test("homepage above-the-fold matches baseline", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("homepage-above-fold.png");
  });
});

/* ------------------------------------------------------------------ */
/*  Component rendering                                               */
/* ------------------------------------------------------------------ */

test.describe("Visual Regression — Component Rendering", () => {
  test("login page renders consistently", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login-page.png", {
      fullPage: true,
    });
  });

  test("register page renders consistently", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("register-page.png", {
      fullPage: true,
    });
  });

  test("about page renders consistently", async ({ page }) => {
    await page.goto("/about");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("about-page.png", {
      fullPage: true,
    });
  });

  test("builder page renders consistently", async ({ page }) => {
    await page.goto("/builder");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("builder-page.png", {
      fullPage: true,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Dark / Light mode                                                 */
/* ------------------------------------------------------------------ */

test.describe("Visual Regression — Dark / Light Mode", () => {
  test("homepage in light mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("homepage-light.png", {
      fullPage: true,
    });
  });

  test("homepage in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("homepage-dark.png", {
      fullPage: true,
    });
  });

  test("login page in light mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login-light.png", {
      fullPage: true,
    });
  });

  test("login page in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login-dark.png", {
      fullPage: true,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Mobile viewport                                                   */
/* ------------------------------------------------------------------ */

test.describe("Visual Regression — Mobile Viewport", () => {
  test("homepage mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("homepage-mobile.png", {
      fullPage: true,
    });
  });

  test("login page mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login-mobile.png", {
      fullPage: true,
    });
  });

  test("builder page mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/builder");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("builder-mobile.png", {
      fullPage: true,
    });
  });

  test("tablet viewport homepage", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("homepage-tablet.png", {
      fullPage: true,
    });
  });
});
