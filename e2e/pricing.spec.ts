import { test, expect } from "@playwright/test";

test("/pricing loads", async ({ page }) => {
  const r = await page.goto("/pricing");
  expect(r?.ok()).toBeTruthy();
});

test("pricing shows buttons", async ({ page }) => {
  await page.goto("/pricing");
  const buttons = page.locator("button");
  expect(await buttons.count()).toBeGreaterThan(0);
});
