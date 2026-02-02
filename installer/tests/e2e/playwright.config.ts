import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for HQ Installer E2E tests.
 *
 * Supports two execution modes:
 *   1. Browserbase (cloud) - Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID
 *   2. Local - Default fallback when Browserbase credentials not present
 *
 * Environment variables:
 *   BASE_URL - Target URL (default: https://hq-installer.vercel.app)
 *   BROWSERBASE_API_KEY - Browserbase API key for cloud execution
 *   BROWSERBASE_PROJECT_ID - Browserbase project ID
 *   USE_BROWSERBASE - Set to 'false' to force local execution
 *   CI - Set by GitHub Actions, enables CI-specific settings
 */

const useBrowserbase = process.env.USE_BROWSERBASE !== 'false' &&
  !!process.env.BROWSERBASE_API_KEY &&
  !!process.env.BROWSERBASE_PROJECT_ID;

export default defineConfig({
  testDir: './tests',

  // Enable parallel execution
  // Browserbase: Use their concurrent session limit (configurable in dashboard)
  // Local: Use all available CPU cores
  fullyParallel: true,
  workers: useBrowserbase ? 4 : undefined, // Browserbase parallel sessions

  // Fail the build on test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI
  retries: process.env.CI ? 2 : 0,

  // Reporters
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],

  // Global test timeout
  timeout: useBrowserbase ? 60000 : 30000, // Longer timeout for cloud execution

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  use: {
    // Base URL from environment or default to production
    baseURL: process.env.BASE_URL || 'https://hq-installer.vercel.app',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure (useful for debugging)
    video: 'on-first-retry',

    // Default viewport
    viewport: { width: 1280, height: 720 },

    // Action timeout
    actionTimeout: useBrowserbase ? 15000 : 10000,

    // Navigation timeout
    navigationTimeout: useBrowserbase ? 30000 : 15000,
  },

  // Output directory for test artifacts
  outputDir: 'test-results/',

  projects: useBrowserbase
    ? [
        // Browserbase project - uses custom fixture
        {
          name: 'browserbase-chromium',
          testDir: './tests',
          use: {
            ...devices['Desktop Chrome'],
          },
        },
      ]
    : [
        // Local Chromium project
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
        // Uncomment to add more local browsers:
        // {
        //   name: 'firefox',
        //   use: { ...devices['Desktop Firefox'] },
        // },
        // {
        //   name: 'webkit',
        //   use: { ...devices['Desktop Safari'] },
        // },
      ],
});
