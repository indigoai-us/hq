import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright E2E config for HQ Cloud web app.
 *
 * - baseURL: http://localhost:3000 (Next.js web app)
 * - Starts BOTH the API (port 3001) and the web app (port 3000) as webServers
 * - Global setup runs clerkSetup() for @clerk/testing authentication
 *
 * Required env vars (in .env.e2e or process.env):
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  - Clerk publishable key
 *   CLERK_SECRET_KEY                   - Clerk secret key (for clerkSetup)
 *   E2E_TEST_EMAIL                     - Test account email
 *   E2E_TEST_PASSWORD                  - Test account password
 *
 * For live E2E tests against ECS containers, also set:
 *   ECS_API_URL in api/.env to the ngrok tunnel URL
 */

const apiDir = path.resolve(__dirname, "..", "api");
const tsxBin = path.join(apiDir, "node_modules", ".bin", "tsx.CMD");
const apiEntry = path.join(apiDir, "src", "index.ts");

export default defineConfig({
  testDir: "./e2e",
  /* Ignore integration tests — those use playwright.integration.config.ts */
  testIgnore: ["**/integration/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `"${tsxBin}" --env-file=.env "${apiEntry}"`,
      cwd: apiDir,
      url: "http://localhost:3001/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        PORT: "3001",
        HOST: "0.0.0.0",
        NODE_ENV: "test",
      },
    },
    {
      command: "npx next dev -p 3000",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
