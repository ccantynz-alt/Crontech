import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }]],

  /* Snapshot / visual regression settings */
  snapshotDir: "./e2e/__snapshots__",
  snapshotPathTemplate:
    "{snapshotDir}/{testFilePath}/{testName}/{projectName}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      /** Pixel-ratio threshold: allow 0.2 % pixel diff to absorb antialiasing */
      maxDiffPixelRatio: 0.002,
      /** Animation settling time before capture */
      animations: "disabled",
    },
  },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    /* ---------- Desktop browsers ---------- */
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* ---------- Mobile viewports ---------- */
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],

  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
