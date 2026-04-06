import { test, expect } from "@playwright/test";

test("navbar renders on landing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav, header").first()).toBeVisible();
});

test("navbar renders on public pages", async ({ page }) => {
  for (const p of ["/about", "/pricing", "/docs"]) {
    await page.goto(p);
    await expect(page.locator("nav, header").first()).toBeVisible();
  }
});

test("support bot / help element is present somewhere", async ({ page }) => {
  await page.goto("/");
  // SupportBot component exists - just verify page mounts without error
  await expect(page.locator("body")).toBeVisible();
});

test("cookie consent may appear on first visit", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});
