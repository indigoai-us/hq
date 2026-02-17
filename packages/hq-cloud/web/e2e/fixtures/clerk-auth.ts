import { test as base, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Extended Playwright test fixture that provides Clerk authentication.
 *
 * Fixtures:
 *   clerkPage  — signed in as user A (E2E_TEST_EMAIL / E2E_TEST_PASSWORD)
 *   clerkPageB — signed in as user B (E2E_TEST_EMAIL_B / E2E_TEST_PASSWORD_B)
 *
 * Usage:
 *   import { test, expect } from "./fixtures/clerk-auth";
 *
 *   // Single-user test (user A — default)
 *   test("my test", async ({ clerkPage }) => {
 *     await clerkPage.goto("/agents");
 *   });
 *
 *   // User B test (same browser context — use multi-user-auth.ts for isolation)
 *   test("user B test", async ({ clerkPageB }) => {
 *     await clerkPageB.goto("/agents");
 *   });
 *
 * Requires:
 *   - clerkSetup() called in global-setup.ts
 *   - E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars set (user A)
 *   - E2E_TEST_EMAIL_B and E2E_TEST_PASSWORD_B env vars set (user B, optional)
 */

/**
 * Sign in to Clerk on the given page using email+password strategy.
 */
async function clerkSignIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
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
}

export const test = base.extend<{ clerkPage: Page; clerkPageB: Page }>({
  clerkPage: async ({ page }, use) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;

    if (!email || !password) {
      throw new Error(
        "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars are required. " +
          "Set them in .env.e2e or export them before running tests.",
      );
    }

    await clerkSignIn(page, email, password);
    await use(page);

    // Sign out after the test
    try {
      await clerk.signOut({ page });
    } catch {
      // Best effort — page may already be closed
    }
  },

  clerkPageB: async ({ page }, use) => {
    const email = process.env.E2E_TEST_EMAIL_B;
    const password = process.env.E2E_TEST_PASSWORD_B;

    if (!email || !password) {
      throw new Error(
        "E2E_TEST_EMAIL_B and E2E_TEST_PASSWORD_B env vars are required for user B. " +
          "Set them in .env.e2e or export them before running tests. " +
          "See e2e/README.md for multi-account setup instructions.",
      );
    }

    await clerkSignIn(page, email, password);
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
