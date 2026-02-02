import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for HQ Installer E2E tests.
 *
 * Designed for cloud execution (GitHub Actions + Browserbase).
 * Can also run locally for development.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],

  // Global test timeout
  timeout: 30000,

  // Expect timeout
  expect: {
    timeout: 5000,
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
  },

  // Output directory for test artifacts
  outputDir: 'test-results/',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Add more browsers as needed:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
    // Mobile viewports:
    // {
    //   name: 'mobile-chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],
});
