import { test, expect } from "@playwright/test";

const pages = [
  "/about",
  "/docs",
  "/status",
  "/templates",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/dmca",
  "/legal/acceptable-use",
];

for (const path of pages) {
  test(`${path} loads`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });
}

test("invalid route shows 404 page", async ({ page }) => {
  await page.goto("/this-route-absolutely-does-not-exist-xyz");
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).toContainText(/404|not found/i);
});
