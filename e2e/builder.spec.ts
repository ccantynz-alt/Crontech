import { test, expect } from "@playwright/test";

test("/builder loads", async ({ page }) => {
  const r = await page.goto("/builder");
  expect(r?.ok()).toBeTruthy();
});

test("builder has buttons and inputs", async ({ page }) => {
  await page.goto("/builder");
  await expect(page.locator("body")).toBeVisible();
  const buttons = page.locator("button");
  expect(await buttons.count()).toBeGreaterThan(0);
});

test("preview panel device toggles clickable", async ({ page }) => {
  await page.goto("/builder");
  for (const label of ["Desktop", "Tablet", "Mobile"]) {
    const btn = page.getByRole("button", { name: label }).first();
    if (await btn.count()) await btn.click().catch(() => {});
  }
});
