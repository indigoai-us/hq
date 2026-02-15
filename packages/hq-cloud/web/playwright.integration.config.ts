import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Integration tests that hit the real API server.
 * The API reads from the actual HQ filesystem.
 *
 * Run with: npx playwright test --config=playwright.integration.config.ts
 */
const apiDir = path.resolve(__dirname, "..", "api");
const tsxBin = path.join(apiDir, "node_modules", ".bin", "tsx.CMD");
const apiEntry = path.join(apiDir, "src", "index.ts");

export default defineConfig({
  testDir: "./e2e/integration",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "integration",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `"${tsxBin}" "${apiEntry}"`,
    url: "http://127.0.0.1:3002/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: "3002",
      HOST: "127.0.0.1",
      SKIP_AUTH: "true",
      LOG_LEVEL: "warn",
      NODE_ENV: "test",
    },
  },
});
