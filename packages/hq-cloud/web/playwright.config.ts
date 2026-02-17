import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright E2E config for HQ Cloud web app.
 *
 * All E2E tests require Clerk authentication (the app uses Clerk
 * middleware which runs server-side). Tests sign in via @clerk/testing
 * email+password strategy -- no OAuth redirect needed.
 *
 * Tiers:
 *
 * 1. **CI fast** (E2E_MOCK_ONLY=true): Starts only Next.js dev server.
 *    Mock-based tests intercept API calls via page.route().
 *    No API backend needed. Excludes smoke/auth-flow/sync tests.
 *
 * 2. **CI full** (CI=true): Starts API + Next.js servers.
 *    Runs mock-based tests AND real API tests (smoke, auth flow).
 *
 * 3. **Local (default)**: Same as CI full but reuses existing servers.
 *
 * Required env vars (set as GitHub Actions secrets for CI):
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  - Clerk publishable key (public)
 *   CLERK_SECRET_KEY                   - Clerk secret key (testing token)
 *   E2E_TEST_EMAIL                     - Test account email
 *   E2E_TEST_PASSWORD                  - Test account password
 *
 * ECS tests (session-launch, session-interact, session-stop) are always
 * excluded from the default config. Run manually:
 *   npx playwright test e2e/session-launch.spec.ts
 *
 * CI artifact dirs (for GitHub Actions upload):
 *   playwright-report/   - HTML report
 *   test-results/        - Screenshots, traces, videos, JSON results
 */

const isCI = !!process.env.CI;
const hasTestCredentials = !!(
  process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD
);
const isMockOnly =
  !!process.env.E2E_MOCK_ONLY || (isCI && !hasTestCredentials);

const apiDir = path.resolve(__dirname, "..", "api");
const tsxBin = path.join(
  apiDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.CMD" : "tsx",
);
const apiEntry = path.join(apiDir, "src", "index.ts");

/**
 * Tests that require real ECS infrastructure (expensive, local-only).
 * Always excluded from the default config.
 * Run manually: npx playwright test e2e/session-launch.spec.ts
 */
const ecsTestPatterns = [
  "**/session-launch.spec.ts",
  "**/session-interact.spec.ts",
  "**/session-stop.spec.ts",
];

/**
 * Tests that require real Clerk sign-in (E2E_TEST_EMAIL/PASSWORD).
 * Excluded in mock-only mode. Mock-based tests use the Clerk testing
 * token (via setupClerkTestingToken) to bypass middleware without
 * actually signing in.
 */
const realSignInTestPatterns = [
  "**/smoke.spec.ts",
  "**/auth/**",
  "**/sync/**",
];

/**
 * Tests that reference the old pre-Clerk auth system (/login page with
 * API key input). These tests test a flow that no longer exists now
 * that auth is handled by Clerk. Excluded until they are rewritten.
 */
const deprecatedTestPatterns = ["**/login.spec.ts"];

/** Build the testIgnore list based on environment */
const testIgnore: string[] = [
  /* Integration tests always use playwright.integration.config.ts */
  "**/integration/**",
  /* ECS tests are always excluded from the default config (manual trigger only) */
  ...ecsTestPatterns,
  /* Deprecated pre-Clerk auth tests (need rewrite) */
  ...deprecatedTestPatterns,
];

if (isMockOnly) {
  /* In mock-only mode, also exclude real-sign-in tests */
  testIgnore.push(...realSignInTestPatterns);
}

/**
 * Build webServer config based on mode.
 * - Mock-only: Only Next.js (no API server; API calls are mocked via page.route)
 * - Full: Both API + Next.js servers
 */
function getWebServers() {
  const nextServer = {
    command: "npx next dev -p 3000",
    /* Use /sign-in for health check -- root (/) redirects and returns 307 */
    url: "http://localhost:3000/sign-in",
    reuseExistingServer: !isCI,
    timeout: isCI ? 180_000 : 120_000,
  };

  if (isMockOnly) {
    /* Mock-only: just the Next.js frontend (API calls intercepted by page.route) */
    return [nextServer];
  }

  /* Full: API + Next.js */
  return [
    {
      command: `"${tsxBin}" --env-file=.env "${apiEntry}"`,
      cwd: apiDir,
      url: "http://localhost:3001/api/health",
      reuseExistingServer: !isCI,
      timeout: isCI ? 60_000 : 30_000,
      env: {
        PORT: "3001",
        HOST: "0.0.0.0",
        NODE_ENV: "test",
      },
    },
    nextServer,
  ];
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore,
  fullyParallel: true,
  forbidOnly: isCI,

  /* CI: 2 retries to handle flaky browser startup; local: 0 */
  retries: isCI ? 2 : 0,

  /* CI: single worker for deterministic runs; local: auto (CPU count) */
  workers: isCI ? 1 : undefined,

  /* Timeouts: generous in CI to handle slower runners */
  timeout: isCI ? 60_000 : 30_000,
  expect: {
    timeout: isCI ? 15_000 : 10_000,
  },

  /**
   * Reporters:
   * - Always produce HTML report (for GitHub Actions artifact upload)
   * - In CI, also use list reporter for live console output
   * - JSON results for programmatic access / PR comment summaries
   */
  reporter: isCI
    ? [
        ["list"],
        [
          "html",
          {
            open: "never",
            outputFolder: "playwright-report",
          },
        ],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : [["html", { open: "on-failure" }]],

  /**
   * Global setup: runs clerkSetup() to provision a testing token.
   * Required for ALL E2E tests (Clerk middleware runs server-side).
   * Needs CLERK_SECRET_KEY or CLERK_TESTING_TOKEN env var.
   */
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: isCI ? "retain-on-failure" : "off",

    /* Longer action/navigation timeouts in CI */
    actionTimeout: isCI ? 15_000 : 10_000,
    navigationTimeout: isCI ? 30_000 : 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: getWebServers(),
});
