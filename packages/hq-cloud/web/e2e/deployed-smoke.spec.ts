/**
 * Deployed app smoke test — tests against the live deployment at app.hq.getindigo.ai.
 *
 * Usage:
 *   npx playwright test --config playwright.deployed.config.ts e2e/deployed-smoke.spec.ts
 *
 * Unlike the local smoke tests, this test adapts to whatever state the
 * deployed app is in (onboarding, agents page, error states) and
 * captures screenshots at each step for debugging.
 */

import { test, expect } from "./fixtures/clerk-auth";
import path from "path";

const screenshotDir = path.resolve(__dirname, "..", "test-results", "deployed");

test.describe("Deployed app smoke", () => {
  test("sign in and capture app state", async ({ clerkPage: page }) => {
    // Take a screenshot of whatever page we land on after auth
    const currentUrl = page.url();
    console.log(`[AUTH] Landed on: ${currentUrl}`);

    await page.screenshot({
      path: path.join(screenshotDir, "01-after-auth.png"),
      fullPage: true,
    });

    // If we're on /setup (onboarding), complete it
    if (currentUrl.includes("/setup")) {
      console.log("[SETUP] On onboarding page — attempting to complete");

      // Look for the HQ Directory Path input and Save button
      const pathInput = page.locator('input[type="text"]').first();
      const saveButton = page.getByRole("button", {
        name: /save|continue/i,
      });

      if (await pathInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Fill in a path and save
        await pathInput.clear();
        await pathInput.fill("C:\\hq");
        await page.screenshot({
          path: path.join(screenshotDir, "02-setup-filled.png"),
          fullPage: true,
        });

        if (
          await saveButton.isVisible({ timeout: 3_000 }).catch(() => false)
        ) {
          await saveButton.click();
          // Wait for navigation after setup
          await page.waitForTimeout(3_000);
          console.log(`[SETUP] After save, URL: ${page.url()}`);
          await page.screenshot({
            path: path.join(screenshotDir, "03-after-setup.png"),
            fullPage: true,
          });
        }
      }
    }

    // Try navigating to /agents
    await page.goto("/agents");
    await page.waitForTimeout(3_000);
    console.log(`[AGENTS] URL: ${page.url()}`);

    await page.screenshot({
      path: path.join(screenshotDir, "04-agents-page.png"),
      fullPage: true,
    });

    // Capture the page content for debugging
    const bodyText = await page.locator("body").innerText();
    console.log(`[AGENTS] Page text (first 500 chars): ${bodyText.slice(0, 500)}`);

    // Basic assertion: page loaded without a hard error
    await expect(page.locator("body")).not.toHaveText(/Application error/i);
    await expect(page.locator("body")).not.toHaveText(/500 Internal/i);
  });

  test("check all main routes", async ({ clerkPage: page }) => {
    const routes = [
      { path: "/agents", name: "agents" },
      { path: "/navigator", name: "navigator" },
      { path: "/settings/account", name: "settings-account" },
      { path: "/settings/claude-token", name: "settings-token" },
      { path: "/settings/notifications", name: "settings-notifications" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await page.waitForTimeout(2_000);
      const finalUrl = page.url();
      console.log(`[ROUTE] ${route.path} → ${finalUrl}`);

      await page.screenshot({
        path: path.join(screenshotDir, `route-${route.name}.png`),
        fullPage: true,
      });

      // Assert no hard crashes
      await expect(page.locator("body")).not.toHaveText(/Application error/i);
    }
  });

  test("check API connectivity from web", async ({ clerkPage: page }) => {
    // Navigate to agents page which makes API calls
    await page.goto("/agents");
    await page.waitForTimeout(2_000);

    // Check browser console for errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Check network requests for API failures
    const failedRequests: string[] = [];
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedRequests.push(
          `${response.status()} ${response.url().split("?")[0]}`,
        );
      }
    });

    // Reload to capture fresh network activity
    await page.reload();
    await page.waitForTimeout(5_000);

    console.log(`[API] Failed requests: ${JSON.stringify(failedRequests)}`);
    console.log(`[API] Console errors: ${JSON.stringify(consoleErrors)}`);

    await page.screenshot({
      path: path.join(screenshotDir, "api-connectivity.png"),
      fullPage: true,
    });
  });
});
