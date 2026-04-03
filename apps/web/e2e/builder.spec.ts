import { expect, test } from "@playwright/test";

test.describe("Builder", () => {
  test("builder page loads", async ({ page }) => {
    await page.goto("/builder");
    await expect(page).toHaveURL(/\/builder/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("builder has chat input area", async ({ page }) => {
    await page.goto("/builder");
    // The builder should have some form of text input for the AI chat
    const chatInput = page.locator(
      'textarea, input[type="text"], [contenteditable="true"], [role="textbox"]',
    );
    await expect(chatInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test.skip("component generation from AI prompt", async ({ page }) => {
    // Placeholder: will be implemented when the AI builder agent is functional
    await page.goto("/builder");
    // Future: type a prompt, verify a component is generated in the preview area
    // const chatInput = page.locator('textarea, input[type="text"]');
    // await chatInput.fill('Create a hero section with a headline and CTA button');
    // await page.keyboard.press('Enter');
    // await expect(page.locator('[data-testid="builder-preview"]')).toBeVisible();
  });
});
