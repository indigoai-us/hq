/**
 * E2E-FC-001: Auth flow — Clerk SSO sign-in through web UI
 *
 * Verifies the full Clerk authentication lifecycle:
 * 1. Unauthenticated root redirects to /sign-in
 * 2. Clerk sign-in succeeds (via @clerk/testing password strategy)
 * 3. Authenticated user lands on /agents (or /setup for first-time)
 * 4. Clerk UserButton is visible in the sidebar
 * 5. tokenGetter is set — API call to /api/auth/me returns 200 with userId
 * 6. First-time users are redirected to /setup (onboarding gate)
 *
 * Prerequisites:
 * - clerkSetup() ran in global-setup.ts
 * - E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars set
 * - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in .env.local
 * - API server running on port 3001, web app on port 3000
 */

import { test as base, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/* ---------- helpers ---------- */

const hasClerkCredentials = (): boolean => {
  return !!(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
};

/**
 * Sign in via Clerk testing helpers.
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

/* ---------- test fixture ---------- */

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
 * Test suite: Clerk SSO sign-in flow
 * ================================================================ */

test.describe("Auth: Clerk sign-in flow", () => {
  // Skip entire suite when Clerk credentials are not configured
  test.skip(
    () => !hasClerkCredentials(),
    "Skipping: E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set",
  );

  /* ----------------------------------------------------------
   * AC-1: Unauthenticated root redirects to /sign-in
   * ---------------------------------------------------------- */
  test("unauthenticated root URL redirects to /sign-in", async ({ page }) => {
    // Set up Clerk testing token so Clerk JS loads properly,
    // but do NOT sign in
    await setupClerkTestingToken({ page });
    await page.goto("/agents");

    // Clerk middleware should redirect unauthenticated request to /sign-in
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
  });

  /* ----------------------------------------------------------
   * AC-1 (cont): /sign-in page renders with Google SSO button
   * ---------------------------------------------------------- */
  test("sign-in page renders with Google SSO button", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/sign-in");

    // The sign-in page has "Sign in to HQ Cloud" title
    await expect(
      page.getByText("Sign in to HQ Cloud"),
    ).toBeVisible({ timeout: 15_000 });

    // Google SSO button should be present
    // The GoogleButton component renders a button with Google-related text
    const googleBtn = page.getByRole("button").filter({
      hasText: /google|sign in|continue/i,
    });
    await expect(googleBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  /* ----------------------------------------------------------
   * AC-2 + AC-3: Sign-in via Clerk redirects to /agents
   * ---------------------------------------------------------- */
  test("sign-in via Clerk lands on /agents or /setup", async ({
    signedInPage: page,
  }) => {
    const url = page.url();

    // After Clerk sign-in, user lands on /agents (onboarded) or /setup (new)
    expect(url).toMatch(/\/(agents|setup)/);
  });

  /* ----------------------------------------------------------
   * AC-3: After sign-in, /agents page loads with expected UI
   * ---------------------------------------------------------- */
  test("after sign-in, /agents page shows session list UI", async ({
    signedInPage: page,
  }) => {
    // Navigate to /agents explicitly (in case we landed on /setup)
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // The agents page should show one of these states:
    // "Sessions" header, "Loading sessions...", "No sessions yet", or "Retry"
    const sessionsHeader = page.getByText("Sessions");
    const loadingText = page.getByText("Loading sessions...");
    const emptyState = page.getByText("No sessions yet");
    const errorState = page.getByText("Retry");

    await expect(
      sessionsHeader.or(loadingText).or(emptyState).or(errorState).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  /* ----------------------------------------------------------
   * AC-4: Clerk UserButton is visible in the sidebar
   * ---------------------------------------------------------- */
  test("sidebar shows Clerk UserButton (avatar)", async ({
    signedInPage: page,
  }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // The sidebar contains a UserButton component from Clerk.
    // Clerk's UserButton renders as a <button> with an img (avatar)
    // inside the sidebar's bottom section.
    const sidebar = page.locator("aside");

    // Look for the Clerk UserButton — it renders as a button with an avatar img
    const userButton = sidebar.locator(".cl-userButtonTrigger, [data-clerk-component] button, button:has(img)");

    // On desktop viewport, sidebar should be visible with the user button
    await expect(userButton.first()).toBeVisible({ timeout: 15_000 });
  });

  /* ----------------------------------------------------------
   * AC-5: tokenGetter is set — API call to /api/auth/me returns 200
   *
   * This catches the race condition where tokenGetter was not set
   * before the first API call, causing "Bearer token required".
   * ---------------------------------------------------------- */
  test("API /auth/me returns 200 with userId after sign-in", async ({
    signedInPage: page,
  }) => {
    // Intercept the /api/auth/me call to verify it succeeds
    const authMePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/auth/me") ||
        resp.url().includes("/api/settings/onboarding-status"),
      { timeout: 20_000 },
    );

    // Navigate to a page that triggers an authenticated API call
    await page.goto("/agents");

    // The app makes API calls on page load (onboarding check, agents list).
    // Wait for one of these to complete successfully.
    const response = await authMePromise;

    // The response should be 200 (not 401 "Bearer token required")
    expect(response.status()).toBe(200);

    // If it was /auth/me, verify the response body has userId
    if (response.url().includes("/api/auth/me")) {
      const body = (await response.json()) as { userId?: string };
      expect(body.userId).toBeTruthy();
    }
  });

  /* ----------------------------------------------------------
   * AC-5 (explicit): Make a direct fetch to /api/auth/me from
   * the authenticated page context to prove the token works
   * ---------------------------------------------------------- */
  test("direct API call to /auth/me succeeds with valid Bearer token", async ({
    signedInPage: page,
  }) => {
    // Wait for the page to be fully loaded on an authenticated route
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // Use page.evaluate to call /api/auth/me from the browser context,
    // using the same token-fetching mechanism as the app
    const result = await page.evaluate(async () => {
      // The app's api-client uses a tokenGetter set by AuthContext.
      // We can replicate this by getting the Clerk token directly.
      const clerkInstance = (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string> } } }).Clerk;
      if (!clerkInstance?.session) {
        return { error: "No Clerk session found" };
      }

      const token = await clerkInstance.session.getToken();
      if (!token) {
        return { error: "No token returned from Clerk" };
      }

      const resp = await fetch("http://localhost:3001/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      return {
        status: resp.status,
        body: await resp.json(),
      };
    });

    // Verify the API accepted the token
    expect(result).not.toHaveProperty("error");
    expect((result as { status: number }).status).toBe(200);

    const body = (result as { body: { userId?: string } }).body;
    expect(body.userId).toBeTruthy();
    expect(typeof body.userId).toBe("string");
  });

  /* ----------------------------------------------------------
   * AC-6: First-time user redirect to /setup
   *
   * This test mocks the onboarding-status API to simulate a
   * new user who hasn't completed setup. It verifies that the
   * authenticated layout redirects to /setup.
   * ---------------------------------------------------------- */
  test("first-time user is redirected to /setup", async ({
    signedInPage: page,
  }) => {
    // Mock the onboarding status to return { onboarded: false }
    // This simulates a first-time user who hasn't completed setup
    await page.route("**/api/settings/onboarding-status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ onboarded: false }),
      }),
    );

    // Navigate to /agents — the authenticated layout should redirect to /setup
    await page.goto("/agents");

    // Should end up on /setup due to the onboarding gate
    await expect(page).toHaveURL(/\/setup/, { timeout: 15_000 });

    // Verify the setup page loaded with expected content
    await expect(
      page.getByText("Welcome to HQ Cloud"),
    ).toBeVisible({ timeout: 10_000 });

    // Verify the HQ Directory Path input is present
    await expect(page.getByLabel("HQ Directory Path")).toBeVisible();

    // Verify the submit button exists
    await expect(
      page.getByRole("button", { name: /Save & Continue/i }),
    ).toBeVisible();
  });

  /* ----------------------------------------------------------
   * AC-6 (cont): Onboarded user skips /setup and lands on /agents
   * ---------------------------------------------------------- */
  test("onboarded user skips /setup and stays on /agents", async ({
    signedInPage: page,
  }) => {
    // Mock the onboarding status to return { onboarded: true }
    await page.route("**/api/settings/onboarding-status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ onboarded: true }),
      }),
    );

    await page.goto("/agents");

    // Should stay on /agents (not redirected to /setup)
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // Verify the agents page content loaded (not setup page)
    const agentsContent = page.getByText("Sessions").or(page.getByText("No sessions yet"));
    await expect(agentsContent.first()).toBeVisible({ timeout: 10_000 });
  });

  /* ----------------------------------------------------------
   * Bonus: Verify that the auth token is included in API calls
   * made by the app (catches the Bearer token race condition)
   * ---------------------------------------------------------- */
  test("app API calls include Authorization Bearer header", async ({
    signedInPage: page,
  }) => {
    // Listen for API requests to verify they have auth headers
    const apiRequests: { url: string; hasAuth: boolean }[] = [];

    page.on("request", (request) => {
      if (request.url().includes("/api/") && !request.url().includes("_next")) {
        apiRequests.push({
          url: request.url(),
          hasAuth: !!request.headers()["authorization"],
        });
      }
    });

    await page.goto("/agents");

    // Wait for the page to make at least one API call
    await page.waitForTimeout(3_000);

    // Filter to authenticated API calls (exclude static/health)
    const authApiCalls = apiRequests.filter(
      (r) =>
        r.url.includes("/api/settings") ||
        r.url.includes("/api/agents") ||
        r.url.includes("/api/auth/me"),
    );

    // At least one API call should have been made
    expect(authApiCalls.length).toBeGreaterThan(0);

    // ALL authenticated API calls should have the Authorization header
    for (const call of authApiCalls) {
      expect(call.hasAuth).toBe(true);
    }
  });
});
