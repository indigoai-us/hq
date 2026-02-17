import { test as base, type Page, type BrowserContext } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Multi-user Playwright fixture for cross-user isolation E2E tests.
 *
 * Provides two independently authenticated Clerk sessions (userA and userB)
 * running in separate browser contexts. Each user has its own cookies,
 * localStorage, and Clerk session -- ensuring complete isolation.
 *
 * Usage:
 *   import { test, expect } from "./fixtures/multi-user-auth";
 *
 *   test("user A cannot see user B files", async ({ userAPage, userBPage }) => {
 *     // userAPage is signed in as E2E_TEST_EMAIL (user A)
 *     // userBPage is signed in as E2E_TEST_EMAIL_B (user B)
 *     await userAPage.goto("/navigator");
 *     await userBPage.goto("/navigator");
 *     // ... assert isolation
 *   });
 *
 * Requires:
 *   - clerkSetup() called in global-setup.ts
 *   - E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars (user A)
 *   - E2E_TEST_EMAIL_B and E2E_TEST_PASSWORD_B env vars (user B)
 *
 * Both accounts must exist in the Clerk dev instance with email+password
 * auth enabled and have distinct Clerk userIds (different S3 prefixes).
 */

// ── Helpers ──────────────────────────────────────────────────────────

interface ClerkCredentials {
  email: string;
  password: string;
  label: string;
}

function getUserACredentials(): ClerkCredentials {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars are required for user A. " +
        "Set them in .env.e2e or export them before running tests.",
    );
  }

  return { email, password, label: "User A" };
}

function getUserBCredentials(): ClerkCredentials {
  const email = process.env.E2E_TEST_EMAIL_B;
  const password = process.env.E2E_TEST_PASSWORD_B;

  if (!email || !password) {
    throw new Error(
      "E2E_TEST_EMAIL_B and E2E_TEST_PASSWORD_B env vars are required for user B. " +
        "Set them in .env.e2e or export them before running tests. " +
        "See e2e/README.md for multi-account setup instructions.",
    );
  }

  return { email, password, label: "User B" };
}

/**
 * Sign in to Clerk in the given page using the provided credentials.
 * Returns the page after successful authentication.
 */
async function signInAsUser(page: Page, creds: ClerkCredentials): Promise<void> {
  await setupClerkTestingToken({ page });

  // Navigate to the app so Clerk JS loads
  await page.goto("/");

  // Sign in using Clerk's testing helpers
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: creds.email,
      password: creds.password,
    },
  });

  // Wait for auth to settle and redirect to complete
  await page.waitForURL(/\/(agents|sessions|setup)/, { timeout: 15_000 });
}

/**
 * Best-effort sign out. Swallows errors if the page is already closed.
 */
async function signOutSafely(page: Page): Promise<void> {
  try {
    await clerk.signOut({ page });
  } catch {
    // Page may already be closed or navigated away
  }
}

// ── Fixture types ────────────────────────────────────────────────────

export interface MultiUserFixtures {
  /** Page signed in as user A (E2E_TEST_EMAIL) */
  userAPage: Page;
  /** Page signed in as user B (E2E_TEST_EMAIL_B) */
  userBPage: Page;
  /** Isolated browser context for user A */
  userAContext: BrowserContext;
  /** Isolated browser context for user B */
  userBContext: BrowserContext;
}

// ── Test extension ───────────────────────────────────────────────────

export const test = base.extend<MultiUserFixtures>({
  userAContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },

  userBContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },

  userAPage: async ({ userAContext }, use) => {
    const page = await userAContext.newPage();
    const creds = getUserACredentials();

    await signInAsUser(page, creds);
    await use(page);
    await signOutSafely(page);
  },

  userBPage: async ({ userBContext }, use) => {
    const page = await userBContext.newPage();
    const creds = getUserBCredentials();

    await signInAsUser(page, creds);
    await use(page);
    await signOutSafely(page);
  },
});

export { expect } from "@playwright/test";

// ── Standalone helpers (for advanced use) ────────────────────────────

/**
 * Factory function for creating a Clerk-authenticated page with
 * arbitrary credentials. Useful when you need more than two users
 * or want fine-grained control.
 *
 * Usage:
 *   const context = await browser.newContext();
 *   const page = await context.newPage();
 *   await createClerkAuth({ page, email: "...", password: "..." });
 *   // page is now signed in
 */
export async function createClerkAuth(opts: {
  page: Page;
  email: string;
  password: string;
}): Promise<void> {
  await signInAsUser(opts.page, {
    email: opts.email,
    password: opts.password,
    label: "custom",
  });
}
