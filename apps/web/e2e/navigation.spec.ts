import { expect, test } from "@playwright/test";

test.describe("Navigation", () => {
  test("home page loads and has title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Back to the Future/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("navigates to /login", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("navigates to /register", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("navigates to /about", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveURL(/\/about/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("shows 404 page for unknown routes", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");
    // Either a 404 status or a custom not-found page
    const is404 =
      response?.status() === 404 ||
      (await page.getByText(/not found|404/i).isVisible().catch(() => false));
    expect(is404).toBeTruthy();
  });

  test("/dashboard redirects or shows auth prompt when not authenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // Should either redirect to login or show an authentication prompt
    const redirectedToLogin = page.url().includes("/login");
    const showsAuthPrompt = await page
      .getByText(/sign in|log in|authenticate|unauthorized/i)
      .isVisible()
      .catch(() => false);
    expect(redirectedToLogin || showsAuthPrompt).toBeTruthy();
  });
});
