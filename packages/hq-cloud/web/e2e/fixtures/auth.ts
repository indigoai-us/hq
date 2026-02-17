import { test as base, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { mockAuthApi, mockOnboardingApi } from "./api-mocks";

/**
 * Authenticate a page for mock-based E2E tests.
 *
 * Uses real Clerk sign-in (email+password strategy via @clerk/testing)
 * to establish a valid session that passes Clerk middleware. Then,
 * API calls are intercepted by page.route() mocks in each test.
 *
 * This requires:
 * - clerkSetup() run in global-setup.ts (provisions testing token)
 * - E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars
 *
 * If Clerk credentials are not available, falls back to the testing
 * token approach (which may fail if Clerk middleware is strict).
 */
async function authenticate(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  // Set up Clerk testing token (bypasses CAPTCHA / bot detection)
  await setupClerkTestingToken({ page });

  // Dismiss the onboarding card so tests see the normal empty state.
  // Uses addInitScript so it runs before any React hydration.
  // (The OnboardingCard checks localStorage for this key)
  await page.addInitScript(() => {
    localStorage.setItem("hq-cloud-onboarding-dismissed", "true");
  });

  // Mock onboarding status BEFORE navigating (the layout checks this immediately)
  await mockOnboardingApi(page, true);

  // Mock auth validation endpoint (legacy, for components that still check it)
  await mockAuthApi(page, true);

  if (email && password) {
    // Real Clerk sign-in: creates a valid session cookie that passes middleware
    await page.goto("/");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: email,
        password: password,
      },
    });
    // Wait for auth to settle
    await page.waitForURL(/\/(agents|sessions|setup)/, { timeout: 15_000 });
  }
}

/**
 * Extended test fixture providing an authenticated page.
 *
 * Use `authenticatedPage` in your tests to get a page that's
 * pre-authenticated via Clerk and ready for API mocking via page.route().
 *
 * Requires:
 * - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (in .env.local)
 * - CLERK_SECRET_KEY (in .env.local, for testing token)
 * - E2E_TEST_EMAIL / E2E_TEST_PASSWORD (for actual sign-in)
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await authenticate(page);
    await use(page);

    // Sign out after the test (best effort)
    try {
      await clerk.signOut({ page });
    } catch {
      // Page may already be closed
    }
  },
});

export { expect } from "@playwright/test";
