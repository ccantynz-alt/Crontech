import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("/ loads", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.ok()).toBeTruthy();
  });

  test("Get Started navigates to /register", async ({ page }) => {
    await page.goto("/");
    const link = page.locator('a[href="/register"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("Pricing link navigates to /pricing", async ({ page }) => {
    await page.goto("/");
    await page.locator('a[href="/pricing"]').first().click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test("Footer legal links work", async ({ page }) => {
    for (const href of ["/legal/terms", "/legal/privacy", "/legal/cookies"]) {
      await page.goto("/");
      const link = page.locator(`a[href="${href}"]`).first();
      if (await link.count()) {
        await link.click();
        await expect(page).toHaveURL(new RegExp(href.replace(/\//g, "\\/") + "$"));
      } else {
        const r = await page.goto(href);
        expect(r?.ok()).toBeTruthy();
      }
    }
  });
});
