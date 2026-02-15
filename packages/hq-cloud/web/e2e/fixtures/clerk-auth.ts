import { test as base, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Extended Playwright test fixture that provides Clerk authentication.
 *
 * Usage:
 *   import { test, expect } from "./fixtures/clerk-auth";
 *
 *   test("my test", async ({ clerkPage }) => {
 *     // clerkPage is already signed in via Clerk
 *     await clerkPage.goto("/agents");
 *     ...
 *   });
 *
 * Requires:
 *   - clerkSetup() called in global-setup.ts
 *   - E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars set
 */

export const test = base.extend<{ clerkPage: Page }>({
  clerkPage: async ({ page }, use) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;

    if (!email || !password) {
      throw new Error(
        "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars are required. " +
          "Set them in .env.e2e or export them before running tests.",
      );
    }

    // Set up the Clerk testing token (bypasses CAPTCHA / bot detection)
    await setupClerkTestingToken({ page });

    // Navigate to the app so Clerk JS loads
    await page.goto("/");

    // Sign in using Clerk's testing helpers (no OAuth redirect needed)
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: email,
        password: password,
      },
    });

    // Wait for auth to settle and redirect to complete
    await page.waitForURL(/\/(agents|sessions|setup)/, { timeout: 15_000 });

    await use(page);

    // Sign out after the test
    try {
      await clerk.signOut({ page });
    } catch {
      // Best effort — page may already be closed
    }
  },
});

export { expect } from "@playwright/test";
