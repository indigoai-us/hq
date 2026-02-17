/**
 * E2E-FC-003: Auth edge cases — unauthenticated access, expired tokens, 401 handling
 *
 * Verifies security behavior and user-friendly error handling:
 * 1. Unauthenticated navigation to /agents redirects to /sign-in (real Clerk middleware)
 * 2. API calls without Authorization header return 401 with clear error message
 * 3. API calls with malformed Bearer token return 401
 * 4. API calls with expired Clerk JWT return 401 "Invalid or expired token"
 * 5. Web UI shows user-friendly error (not raw JSON) when API returns 401
 * 6. Web UI doesn't leak error details (no stack traces visible)
 *
 * Structure:
 * - "unauthenticated access" tests need Clerk testing token (for Clerk JS init)
 * - "API 401 responses" tests use direct HTTP requests (no browser needed)
 * - "UI error display" tests sign in via Clerk, then mock API responses to return errors
 *
 * Prerequisites:
 * - clerkSetup() ran in global-setup.ts (needs CLERK_SECRET_KEY)
 * - E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars set
 * - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY set
 * - Web app running on port 3000
 * - API server running on port 3001
 */

import { test as base, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

const API_URL = "http://localhost:3001";

/* ---------- helpers ---------- */

const hasClerkCredentials = (): boolean => {
  return !!(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
};

/**
 * Sign in via Clerk testing helpers (same as sign-in.spec.ts).
 * Returns the page after auth settles (on /agents, /sessions, or /setup).
 */
async function clerkSignIn(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL!;
  const password = process.env.E2E_TEST_PASSWORD!;

  await setupClerkTestingToken({ page });
  await page.goto("/");

  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: email,
      password,
    },
  });

  // Wait for auth to settle — should redirect to an authenticated route
  await page.waitForURL(/\/(agents|sessions|setup)/, { timeout: 20_000 });
}

/* ---------- test fixture: signed-in page ---------- */

const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, use) => {
    await clerkSignIn(page);
    await use(page);

    // Cleanup: sign out
    try {
      await clerk.signOut({ page });
    } catch {
      // Best effort — page may already be closed
    }
  },
});

/* ================================================================
 * Test suite 1: Unauthenticated access — redirect to /sign-in
 * Requires: clerkSetup() + Clerk testing token (no sign-in needed)
 * ================================================================ */

test.describe("Auth errors: unauthenticated access", () => {
  // Skip when Clerk credentials are not configured
  test.skip(
    () => !hasClerkCredentials(),
    "Skipping: E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set",
  );

  /* ----------------------------------------------------------
   * AC-1: Direct navigation to /agents without auth redirects to /sign-in
   * ---------------------------------------------------------- */
  test(
    "unauthenticated navigation to /agents redirects to /sign-in",
    async ({ page }) => {
      await setupClerkTestingToken({ page });
      await page.goto("/agents");

      // Clerk middleware should redirect unauthenticated request to /sign-in
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
    },
  );

  test(
    "unauthenticated navigation to /navigator redirects to /sign-in",
    async ({ page }) => {
      await setupClerkTestingToken({ page });
      await page.goto("/navigator");

      await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
    },
  );

  test(
    "unauthenticated navigation to /settings/account redirects to /sign-in",
    async ({ page }) => {
      await setupClerkTestingToken({ page });
      await page.goto("/settings/account");

      await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
    },
  );
});

/* ================================================================
 * Test suite 2: API 401 responses — direct HTTP calls
 * No browser needed, just Playwright's request context.
 * ================================================================ */

base.describe("Auth errors: API 401 responses", () => {
  /* ----------------------------------------------------------
   * AC-2: API calls without Authorization header return 401
   * ---------------------------------------------------------- */
  base(
    "API returns 401 with clear message when no Authorization header",
    async ({ request }) => {
      const response = await request.get(`${API_URL}/api/sessions`);

      expect(response.status()).toBe(401);

      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toContain("Bearer token");
    },
  );

  /* ----------------------------------------------------------
   * AC-3: API calls with malformed Bearer token return 401
   * ---------------------------------------------------------- */
  base(
    "API returns 401 when Bearer token is malformed gibberish",
    async ({ request }) => {
      const response = await request.get(`${API_URL}/api/sessions`, {
        headers: {
          Authorization: "Bearer not-a-real-token-at-all",
        },
      });

      expect(response.status()).toBe(401);

      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Invalid or expired token");
    },
  );

  base(
    "API returns 401 when Bearer token is empty string",
    async ({ request }) => {
      const response = await request.get(`${API_URL}/api/sessions`, {
        headers: {
          Authorization: "Bearer ",
        },
      });

      // Empty bearer should be treated as no token
      expect(response.status()).toBe(401);
    },
  );

  base(
    "API returns 401 when Authorization header has wrong scheme",
    async ({ request }) => {
      const response = await request.get(`${API_URL}/api/sessions`, {
        headers: {
          Authorization: "Basic dXNlcjpwYXNz",
        },
      });

      expect(response.status()).toBe(401);

      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toContain("Bearer token");
    },
  );

  /* ----------------------------------------------------------
   * AC-4: API calls with expired Clerk JWT return 401
   *        "Invalid or expired token"
   * ---------------------------------------------------------- */
  base(
    "API returns 401 'Invalid or expired token' for expired/invalid JWT",
    async ({ request }) => {
      // Construct a JWT-shaped token that looks real but is expired/invalid.
      const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const payload = btoa(
        JSON.stringify({
          sub: "user_fake123",
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600,
          iss: "https://fake.clerk.accounts.dev",
        }),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const fakeSignature = "fake_signature_that_will_not_verify";

      const expiredJwt = `${header}.${payload}.${fakeSignature}`;

      const response = await request.get(`${API_URL}/api/sessions`, {
        headers: {
          Authorization: `Bearer ${expiredJwt}`,
        },
      });

      expect(response.status()).toBe(401);

      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toBe("Invalid or expired token");
    },
  );

  base(
    "API 401 response body does not contain stack traces",
    async ({ request }) => {
      const response = await request.get(`${API_URL}/api/sessions`, {
        headers: {
          Authorization: "Bearer invalid-token",
        },
      });

      expect(response.status()).toBe(401);

      const text = await response.text();

      // Must not contain stack trace indicators
      expect(text).not.toContain("at ");
      expect(text).not.toContain("node_modules");
      expect(text).not.toContain("Error:");
      expect(text).not.toContain(".ts:");
      expect(text).not.toContain(".js:");
    },
  );
});

/* ================================================================
 * Test suite 3: UI error display on 401
 *
 * These tests sign in via Clerk (to get past Next.js middleware),
 * then mock API responses to simulate 401 errors and verify the
 * UI displays user-friendly messages without leaking internals.
 *
 * After sign-in, we use page.route() to intercept API calls and
 * return 401 responses, simulating a token that expired mid-session.
 * ================================================================ */

test.describe("Auth errors: UI error display on 401", () => {
  // Skip when Clerk credentials are not configured
  test.skip(
    () => !hasClerkCredentials(),
    "Skipping: E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set",
  );

  /* ----------------------------------------------------------
   * AC-5: Web UI shows user-friendly error when API returns 401
   *
   * Sign in first, then mock the sessions API to return 401.
   * The UI should show a clean error, not raw JSON.
   * ---------------------------------------------------------- */
  test(
    "agents page shows user-friendly error when sessions API returns 401",
    async ({ signedInPage: page }) => {
      // Mock onboarding to show onboarded (prevent /setup redirect)
      await page.route("**/api/settings/onboarding-status", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ onboarded: true }),
        }),
      );

      // Mock the sessions endpoint to return 401 (simulates expired token mid-session)
      await page.route("**/api/sessions", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Unauthorized",
            message: "Invalid or expired token",
          }),
        }),
      );

      await page.goto("/agents");

      // The error state should show the API's message field (user-friendly),
      // not raw JSON like {"error":"Unauthorized","message":"..."}
      // The agents page renders: <span>{error}</span> with a Retry button
      const errorText = page.getByText("Invalid or expired token");
      const retryButton = page.getByRole("button", { name: "Retry" });

      await expect(
        errorText.or(retryButton).first(),
      ).toBeVisible({ timeout: 15_000 });

      // Verify it's NOT showing raw JSON
      const pageContent = await page.textContent("body");
      expect(pageContent).not.toContain('{"error"');
    },
  );

  /* ----------------------------------------------------------
   * AC-5 (cont): Retry button allows recovery after auth error
   * ---------------------------------------------------------- */
  test(
    "agents page shows Retry button on auth error, allowing recovery",
    async ({ signedInPage: page }) => {
      await page.route("**/api/settings/onboarding-status", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ onboarded: true }),
        }),
      );

      let callCount = 0;

      // First call returns 401, subsequent calls return success
      await page.route("**/api/sessions", (route) => {
        callCount++;
        if (callCount <= 1) {
          return route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Unauthorized",
              message: "Invalid or expired token",
            }),
          });
        }
        // After retry, return empty sessions list (success)
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });

      await page.goto("/agents");

      // Wait for the error state with Retry button
      const retryButton = page.getByRole("button", { name: "Retry" });
      await expect(retryButton).toBeVisible({ timeout: 15_000 });

      // Click retry
      await retryButton.click();

      // After retry succeeds, should show empty state or sessions header
      const emptyState = page.getByText("No sessions yet");
      const sessionsHeader = page.getByText("Sessions");
      const onboardingText = page.getByText("Start a new session");

      await expect(
        emptyState.or(sessionsHeader).or(onboardingText).first(),
      ).toBeVisible({ timeout: 15_000 });
    },
  );

  /* ----------------------------------------------------------
   * AC-5 (cont): Verify the error message comes from the API's
   * structured message field, not from raw response text.
   * ---------------------------------------------------------- */
  test(
    "UI extracts clean message from structured 401 JSON response",
    async ({ signedInPage: page }) => {
      await page.route("**/api/settings/onboarding-status", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ onboarded: true }),
        }),
      );

      await page.route("**/api/sessions", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Unauthorized",
            message:
              "Bearer token is required. Provide via Authorization: Bearer <token> header.",
          }),
        }),
      );

      await page.goto("/agents");

      // Wait for the error state
      const errorMsg = page.getByText("Bearer token is required", {
        exact: false,
      });
      const retryButton = page.getByRole("button", { name: "Retry" });

      await expect(
        errorMsg.or(retryButton).first(),
      ).toBeVisible({ timeout: 15_000 });

      // Verify no raw JSON is shown on the page
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain('{"error"');
      expect(bodyText).not.toContain('"Unauthorized"');
    },
  );

  /* ----------------------------------------------------------
   * AC-6: Web UI doesn't leak error details (no stack traces)
   * ---------------------------------------------------------- */
  test(
    "UI does not display stack traces when API returns 401 with extra details",
    async ({ signedInPage: page }) => {
      await page.route("**/api/settings/onboarding-status", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ onboarded: true }),
        }),
      );

      // Simulate a 401 that accidentally includes stack trace info
      await page.route("**/api/sessions", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Unauthorized",
            message: "Invalid or expired token",
            stack:
              "Error: Token verification failed\n    at verifyClerkToken (src/auth/clerk.ts:42:11)\n    at Object.onRequest (src/auth/middleware.ts:95:28)",
            details: {
              tokenPrefix: "eyJhbG...",
              verifierError: "jwt expired at 2026-02-16T20:00:00Z",
            },
          }),
        }),
      );

      await page.goto("/agents");

      // Wait for the error to be displayed
      const retryButton = page.getByRole("button", { name: "Retry" });
      await expect(retryButton).toBeVisible({ timeout: 15_000 });

      // Verify NO internal details are leaked to the UI
      const bodyText = await page.textContent("body");

      // No stack traces
      expect(bodyText).not.toContain("at verifyClerkToken");
      expect(bodyText).not.toContain("at Object.onRequest");
      expect(bodyText).not.toContain("src/auth/clerk.ts");
      expect(bodyText).not.toContain("src/auth/middleware.ts");

      // No internal error details
      expect(bodyText).not.toContain("verifierError");
      expect(bodyText).not.toContain("jwt expired at");
      expect(bodyText).not.toContain("tokenPrefix");

      // The user-friendly message should still be shown
      const errorText = page.getByText("Invalid or expired token");
      await expect(errorText).toBeVisible();
    },
  );

  test(
    "UI does not display raw JSON object when API returns non-JSON 401",
    async ({ signedInPage: page }) => {
      await page.route("**/api/settings/onboarding-status", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ onboarded: true }),
        }),
      );

      // Simulate a 401 that returns plain text (not JSON)
      await page.route("**/api/sessions", (route) =>
        route.fulfill({
          status: 401,
          contentType: "text/plain",
          body: "Unauthorized",
        }),
      );

      await page.goto("/agents");

      // Wait for the error state
      const retryButton = page.getByRole("button", { name: "Retry" });
      await expect(retryButton).toBeVisible({ timeout: 15_000 });

      // The page should show a clean error, not raw technical output
      const bodyText = await page.textContent("body");

      // Should not show raw JSON
      expect(bodyText).not.toMatch(/\{[\s\S]*"status"[\s\S]*\}/);
    },
  );

  test(
    "UI does not show Node.js or server internals on error",
    async ({ signedInPage: page }) => {
      await page.route("**/api/settings/onboarding-status", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ onboarded: true }),
        }),
      );

      await page.route("**/api/sessions", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Internal Server Error",
            message: "Something went wrong",
            stack:
              "TypeError: Cannot read properties of undefined\n    at /app/node_modules/fastify/lib/reply.js:123:45",
          }),
        }),
      );

      await page.goto("/agents");

      const retryButton = page.getByRole("button", { name: "Retry" });
      await expect(retryButton).toBeVisible({ timeout: 15_000 });

      const bodyText = await page.textContent("body");

      // No Node.js internals
      expect(bodyText).not.toContain("node_modules");
      expect(bodyText).not.toContain("fastify");
      expect(bodyText).not.toContain("TypeError:");
      expect(bodyText).not.toContain("Cannot read properties");

      // Should show the clean message
      const errorText = page.getByText("Something went wrong");
      await expect(errorText).toBeVisible();
    },
  );
});
