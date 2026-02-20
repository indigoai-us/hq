/**
 * Auth flow diagnostic — captures network requests, redirects, and cookies
 * to debug why some accounts get bounced back to /sign-in instead of /setup.
 *
 * Usage:
 *   npx playwright test --config playwright.deployed.config.ts e2e/deployed-auth-debug.spec.ts
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import path from "path";

const screenshotDir = path.resolve(__dirname, "..", "test-results", "deployed");
const BASE = process.env.E2E_BASE_URL || "https://app.hq.getindigo.ai";

test.describe("Auth flow diagnostics", () => {
  test("trace redirect chain from / to final destination", async ({
    page,
  }) => {
    const redirects: string[] = [];
    const clerkApiCalls: { url: string; status: number; body?: string }[] = [];

    // Capture all navigation events
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    // Capture Clerk API calls
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("clerk") || url.includes("/api/")) {
        const entry: { url: string; status: number; body?: string } = {
          url: url.split("?")[0],
          status: response.status(),
        };
        try {
          if (response.status() >= 400) {
            entry.body = await response.text();
          }
        } catch {
          /* response body may not be available */
        }
        clerkApiCalls.push(entry);
      }
    });

    // Navigate to root (should redirect to /sign-in for unauthenticated)
    await page.goto("/");
    await page.waitForTimeout(3_000);

    console.log("[REDIRECTS] Chain:", JSON.stringify(redirects, null, 2));
    console.log(
      "[CLERK API] Calls:",
      JSON.stringify(clerkApiCalls, null, 2),
    );

    await page.screenshot({
      path: path.join(screenshotDir, "auth-debug-unauthenticated.png"),
      fullPage: true,
    });

    // Verify we landed on sign-in
    expect(page.url()).toContain("/sign-in");
  });

  test("trace authenticated flow — check onboarding API", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });

    const apiCalls: { url: string; status: number; method: string; body?: string }[] = [];
    const consoleMessages: string[] = [];
    const redirects: string[] = [];

    page.on("console", (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        redirects.push(frame.url());
      }
    });

    // Capture ALL API calls (our backend + Clerk)
    page.on("response", async (response) => {
      const url = response.url();
      if (
        url.includes("/api/") ||
        url.includes("clerk") ||
        url.includes("hq.getindigo.ai")
      ) {
        const entry: {
          url: string;
          status: number;
          method: string;
          body?: string;
        } = {
          url: url.split("?")[0],
          status: response.status(),
          method: response.request().method(),
        };
        try {
          if (
            response.status() >= 400 ||
            url.includes("onboarding") ||
            url.includes("settings")
          ) {
            entry.body = (await response.text()).slice(0, 500);
          }
        } catch {
          /* body not available */
        }
        apiCalls.push(entry);
      }
    });

    // Sign in with test credentials
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) {
      test.skip();
      return;
    }

    const { clerk } = await import("@clerk/testing/playwright");

    await page.goto("/");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: email,
        password: password,
      },
    });

    await page.waitForTimeout(5_000);

    console.log("[REDIRECTS]", JSON.stringify(redirects, null, 2));
    console.log("[API CALLS]", JSON.stringify(apiCalls, null, 2));
    console.log(
      "[CONSOLE]",
      consoleMessages.filter((m) => m.includes("error") || m.includes("Error") || m.includes("fail")).join("\n"),
    );
    console.log("[FINAL URL]", page.url());

    await page.screenshot({
      path: path.join(screenshotDir, "auth-debug-authenticated.png"),
      fullPage: true,
    });

    // Check cookies
    const cookies = await page.context().cookies();
    const clerkCookies = cookies.filter(
      (c) => c.name.includes("clerk") || c.name.includes("__session"),
    );
    console.log(
      "[COOKIES] Clerk-related:",
      JSON.stringify(
        clerkCookies.map((c) => ({
          name: c.name,
          domain: c.domain,
          expires: c.expires,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
        })),
        null,
        2,
      ),
    );
  });

  test("check what /agents returns without onboarding", async ({ page }) => {
    await setupClerkTestingToken({ page });

    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) {
      test.skip();
      return;
    }

    const { clerk } = await import("@clerk/testing/playwright");

    await page.goto("/");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: email,
        password: password,
      },
    });

    await page.waitForTimeout(3_000);

    // Now try to hit the onboarding check API directly
    const token = await page.evaluate(async () => {
      // @ts-ignore - access Clerk from window
      return window.Clerk?.session?.getToken();
    });

    console.log("[TOKEN] Got Clerk token:", token ? "yes" : "no");

    // Check onboarding status
    const apiBase =
      (await page.evaluate(() => localStorage.getItem("hq-cloud-api-url"))) ||
      "https://api.hq.getindigo.ai";
    console.log("[API BASE]", apiBase);

    const onboardingResp = await page.evaluate(
      async ({ apiBase, token }) => {
        try {
          const resp = await fetch(`${apiBase}/api/settings/onboarding`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return {
            status: resp.status,
            body: await resp.text(),
          };
        } catch (err) {
          return { status: -1, body: String(err) };
        }
      },
      { apiBase, token },
    );

    console.log("[ONBOARDING API]", JSON.stringify(onboardingResp, null, 2));

    await page.screenshot({
      path: path.join(screenshotDir, "auth-debug-onboarding-check.png"),
      fullPage: true,
    });
  });
});
