import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration Template (Reusable)
 *
 * Supports two execution modes with automatic detection:
 *   1. Browserbase (cloud) - When BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are set
 *   2. Local Playwright   - Default fallback when Browserbase credentials are absent
 *
 * SETUP:
 *   1. Copy this file to your project root (or test directory)
 *   2. Update the testDir path to point to your test files
 *   3. Set BASE_URL to your application's URL (or use the default)
 *   4. Adjust timeouts, workers, and reporters to your needs
 *
 * Environment variables:
 *   BASE_URL               - Target application URL
 *                            CUSTOMIZE: Change the default below to your app's URL
 *   BROWSERBASE_API_KEY    - Browserbase API key for cloud execution
 *   BROWSERBASE_PROJECT_ID - Browserbase project ID
 *   USE_BROWSERBASE        - Set to 'false' to force local execution
 *   CI                     - Set by most CI providers, enables CI-specific settings
 */

// Auto-detect Browserbase: enabled when both API key and project ID are present
// and USE_BROWSERBASE is not explicitly set to 'false'
const useBrowserbase = process.env.USE_BROWSERBASE !== 'false' &&
  !!process.env.BROWSERBASE_API_KEY &&
  !!process.env.BROWSERBASE_PROJECT_ID;

export default defineConfig({
  // CUSTOMIZE: Path to your test files directory
  testDir: './tests',

  // Enable parallel execution
  // Browserbase: Limited by your plan's concurrent session cap (adjust as needed)
  // Local: Uses all available CPU cores (undefined = auto)
  fullyParallel: true,
  // CUSTOMIZE: Adjust Browserbase worker count based on your plan's concurrent session limit
  workers: useBrowserbase ? 4 : undefined,

  // Fail the build if test.only() is left in code (CI safety net)
  forbidOnly: !!process.env.CI,

  // CUSTOMIZE: Retry count - higher on CI to handle flaky network/browser issues
  retries: process.env.CI ? 2 : 0,

  // Reporters: list (console), html (visual report), json (machine-readable)
  // The json reporter output is consumed by process-results.js to create agent-results.json
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],

  // CUSTOMIZE: Global test timeout
  // Browserbase sessions have network overhead, so they get a longer timeout
  timeout: useBrowserbase ? 60000 : 30000,

  // CUSTOMIZE: Assertion timeout (how long expect() waits before failing)
  expect: {
    timeout: 10000,
  },

  use: {
    // CUSTOMIZE: Set your application's base URL here.
    // Override at runtime with BASE_URL env var.
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Collect trace on first retry (helps debug flaky tests)
    trace: 'on-first-retry',

    // Screenshot on failure (helps debug what the page looked like)
    screenshot: 'only-on-failure',

    // Video on first retry (useful for debugging interactions)
    video: 'on-first-retry',

    // CUSTOMIZE: Default viewport dimensions
    viewport: { width: 1280, height: 720 },

    // CUSTOMIZE: Action timeout (clicks, fills, etc.)
    // Browserbase actions may be slower due to network latency
    actionTimeout: useBrowserbase ? 15000 : 10000,

    // CUSTOMIZE: Navigation timeout (page.goto, page.waitForURL, etc.)
    navigationTimeout: useBrowserbase ? 30000 : 15000,
  },

  // Output directory for test artifacts (screenshots, traces, videos)
  outputDir: 'test-results/',

  // Browser projects: Browserbase uses a single Chromium project via CDP,
  // Local mode can run across multiple browsers
  projects: useBrowserbase
    ? [
        // Browserbase project - uses custom fixture for CDP connection
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
        // CUSTOMIZE: Uncomment to add more local browsers for cross-browser testing:
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
