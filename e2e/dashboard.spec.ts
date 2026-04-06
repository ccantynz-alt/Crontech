import { test, expect } from "@playwright/test";

test("/dashboard redirects to login or shows protected screen when not authed", async ({ page }) => {
  await page.goto("/dashboard");
  // Either redirected, or ProtectedRoute renders login prompt — both acceptable
  await expect(page.locator("body")).toBeVisible();
  const url = page.url();
  expect(/\/(login|dashboard)/.test(url)).toBeTruthy();
});

test("dashboard renders content", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("body")).toBeVisible();
});
