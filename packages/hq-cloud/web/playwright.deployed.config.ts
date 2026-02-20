import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for testing the deployed HQ Cloud app.
 *
 * Usage:
 *   npx playwright test --config playwright.deployed.config.ts e2e/smoke.spec.ts
 *
 * No local servers needed — tests run against the live deployment.
 *
 * Required env vars (from .env.e2e and .env.local):
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 *   CLERK_SECRET_KEY
 *   E2E_TEST_EMAIL
 *   E2E_TEST_PASSWORD
 */

const DEPLOYED_URL = process.env.E2E_BASE_URL || "https://app.hq.getindigo.ai";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: [["list"], ["html", { open: "never" }]],

  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: DEPLOYED_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* No webServer — we're testing the live deployment */
});
