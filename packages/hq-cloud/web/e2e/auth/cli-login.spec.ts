/**
 * E2E-FC-002: Auth flow — CLI login token exchange
 *
 * Verifies the full CLI authentication lifecycle:
 * 1. Navigate to /cli-callback?callback_url=http://127.0.0.1:{port}/callback
 * 2. Authenticate via Clerk (reusing clerk-auth fixture)
 * 3. Page calls POST /api/auth/cli-token with a valid Bearer token
 * 4. Page redirects to callback_url with token, user_id, expires_at params
 * 5. The returned CLI token is valid (verified via GET /api/auth/cli-verify)
 * 6. CLI token format starts with 'hqcli_'
 *
 * Prerequisites:
 * - clerkSetup() ran in global-setup.ts
 * - E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars set
 * - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY in .env.local
 * - API server running on port 3001, web app on port 3000
 */

import { test as base, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/* ---------- constants ---------- */

/** Simulated CLI callback port. No real server — we intercept the redirect. */
const CLI_CALLBACK_PORT = 19876;
const CLI_CALLBACK_URL = `http://127.0.0.1:${CLI_CALLBACK_PORT}/callback`;
const API_BASE = "http://localhost:3001";

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
 * Test suite: CLI Login Token Exchange
 * ================================================================ */

test.describe("Auth: CLI login token exchange", () => {
  // Skip entire suite when Clerk credentials are not configured
  test.skip(
    () => !hasClerkCredentials(),
    "Skipping: E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set",
  );

  /* ----------------------------------------------------------
   * AC-1 + AC-2 + AC-3 + AC-4 + AC-5 + AC-6:
   * Full CLI token exchange flow end-to-end
   *
   * Tests the complete flow:
   * - Navigate to /cli-callback with callback_url
   * - Clerk auth triggers (already signed in via fixture)
   * - Page calls POST /api/auth/cli-token with Bearer token
   * - Page redirects to callback_url with token, user_id, expires_at
   * - CLI token starts with 'hqcli_'
   * - CLI token is valid (verifiable via /api/auth/cli-verify)
   * ---------------------------------------------------------- */
  test("CLI callback page exchanges Clerk token for CLI token and redirects", async ({
    signedInPage: page,
  }) => {
    // Track the POST /api/auth/cli-token request and response
    let cliTokenRequestAuth = "";
    let cliTokenResponseBody: {
      token?: string;
      userId?: string;
      expiresIn?: string;
    } = {};

    // Intercept POST /api/auth/cli-token to observe it (let it pass through)
    page.on("request", (request) => {
      if (
        request.url().includes("/api/auth/cli-token") &&
        request.method() === "POST"
      ) {
        cliTokenRequestAuth = request.headers()["authorization"] ?? "";
      }
    });

    page.on("response", async (response) => {
      if (
        response.url().includes("/api/auth/cli-token") &&
        response.request().method() === "POST"
      ) {
        try {
          cliTokenResponseBody = (await response.json()) as typeof cliTokenResponseBody;
        } catch {
          // Response may not be JSON if there was an error
        }
      }
    });

    // Intercept the redirect to the CLI callback URL (localhost)
    // Since there's no actual server running, we need to catch this navigation
    let callbackRedirectUrl = "";

    await page.route(`http://127.0.0.1:${CLI_CALLBACK_PORT}/**`, (route) => {
      callbackRedirectUrl = route.request().url();
      // Fulfill with a simple response so the page doesn't hang
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>CLI callback received</body></html>",
      });
    });

    // Navigate to the CLI callback page with our simulated callback URL
    await page.goto(
      `/cli-callback?callback_url=${encodeURIComponent(CLI_CALLBACK_URL)}`,
    );

    // Wait for the redirect to the CLI callback URL (the token exchange may take a moment)
    await page.waitForURL(
      new RegExp(`127\\.0\\.0\\.1:${CLI_CALLBACK_PORT}`),
      { timeout: 30_000 },
    );

    // --- AC-3: Verify POST /api/auth/cli-token was called with Bearer token ---
    expect(cliTokenRequestAuth).toBeTruthy();
    expect(cliTokenRequestAuth).toMatch(/^Bearer .+/);

    // --- AC-4: Verify redirect to callback_url includes required params ---
    expect(callbackRedirectUrl).toBeTruthy();
    const redirectParsed = new URL(callbackRedirectUrl);

    const tokenParam = redirectParsed.searchParams.get("token");
    const userIdParam = redirectParsed.searchParams.get("user_id");
    const expiresAtParam = redirectParsed.searchParams.get("expires_at");

    expect(tokenParam).toBeTruthy();
    expect(userIdParam).toBeTruthy();
    expect(expiresAtParam).toBeTruthy();

    // --- AC-6: Verify CLI token format starts with 'hqcli_' ---
    expect(tokenParam!).toMatch(/^hqcli_/);

    // Verify expires_at is a valid ISO date in the future
    const expiresAtDate = new Date(expiresAtParam!);
    expect(expiresAtDate.getTime()).toBeGreaterThan(Date.now());

    // --- AC-3 (cont): Verify the API response body matches redirect params ---
    expect(cliTokenResponseBody.token).toBe(tokenParam);
    expect(cliTokenResponseBody.userId).toBe(userIdParam);
    expect(cliTokenResponseBody.expiresIn).toBe("30d");

    // --- AC-5: Verify the CLI token is valid by calling GET /api/auth/cli-verify ---
    const verifyResult = await page.evaluate(
      async ({ token, apiBase }) => {
        const resp = await fetch(`${apiBase}/api/auth/cli-verify`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        return {
          status: resp.status,
          body: await resp.json(),
        };
      },
      { token: tokenParam!, apiBase: API_BASE },
    );

    expect(verifyResult.status).toBe(200);
    expect(
      (verifyResult.body as { valid?: boolean }).valid,
    ).toBe(true);
    expect(
      (verifyResult.body as { userId?: string }).userId,
    ).toBe(userIdParam);
  });

  /* ----------------------------------------------------------
   * AC-6 (format): CLI token has correct structure
   *
   * Verifies the CLI token format:
   *   hqcli_<base64url(payload)>.<base64url(signature)>
   * ---------------------------------------------------------- */
  test("CLI token has correct hqcli_ prefix and dot-separated structure", async ({
    signedInPage: page,
  }) => {
    // Capture the CLI token from the token exchange
    let capturedToken = "";

    await page.route(`http://127.0.0.1:${CLI_CALLBACK_PORT}/**`, (route) => {
      const url = new URL(route.request().url());
      capturedToken = url.searchParams.get("token") ?? "";
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>OK</body></html>",
      });
    });

    await page.goto(
      `/cli-callback?callback_url=${encodeURIComponent(CLI_CALLBACK_URL)}`,
    );

    await page.waitForURL(
      new RegExp(`127\\.0\\.0\\.1:${CLI_CALLBACK_PORT}`),
      { timeout: 30_000 },
    );

    // Token must start with hqcli_
    expect(capturedToken).toMatch(/^hqcli_/);

    // After removing the prefix, there should be a dot separating payload and signature
    const tokenBody = capturedToken.slice("hqcli_".length);
    const parts = tokenBody.split(".");
    expect(parts).toHaveLength(2);

    // Both parts should be non-empty base64url strings
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);

    // Decode the payload part to verify it contains expected fields
    const payloadJson = Buffer.from(parts[0]!, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson) as {
      sub?: string;
      sid?: string;
      iat?: number;
      exp?: number;
      typ?: string;
    };

    expect(payload.sub).toBeTruthy(); // userId
    expect(payload.sid).toBeTruthy(); // sessionId
    expect(payload.iat).toBeGreaterThan(0); // issued at
    expect(payload.exp).toBeGreaterThan(payload.iat!); // expires after issued
    expect(payload.typ).toBe("hq-cli"); // token type
  });

  /* ----------------------------------------------------------
   * Error case: Missing callback_url shows error
   * ---------------------------------------------------------- */
  test("CLI callback page shows error when callback_url is missing", async ({
    signedInPage: page,
  }) => {
    // Navigate without callback_url
    await page.goto("/cli-callback");

    // Should show an error message about missing callback_url
    await expect(
      page.getByText("Missing callback_url parameter", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });

  /* ----------------------------------------------------------
   * Error case: Non-localhost callback_url is rejected
   * ---------------------------------------------------------- */
  test("CLI callback page rejects non-localhost callback_url", async ({
    signedInPage: page,
  }) => {
    // Try with an external URL
    await page.goto(
      `/cli-callback?callback_url=${encodeURIComponent("https://evil.example.com/steal-token")}`,
    );

    // Should show an error message about invalid callback URL
    await expect(
      page.getByText("Invalid callback URL", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });

  /* ----------------------------------------------------------
   * Verify CLI token can be verified independently
   *
   * This test exchanges the token, then verifies it in a
   * separate API call (not through the page context).
   * ---------------------------------------------------------- */
  test("CLI token can be verified via GET /api/auth/cli-verify", async ({
    signedInPage: page,
  }) => {
    let capturedToken = "";
    let capturedUserId = "";

    await page.route(`http://127.0.0.1:${CLI_CALLBACK_PORT}/**`, (route) => {
      const url = new URL(route.request().url());
      capturedToken = url.searchParams.get("token") ?? "";
      capturedUserId = url.searchParams.get("user_id") ?? "";
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>OK</body></html>",
      });
    });

    await page.goto(
      `/cli-callback?callback_url=${encodeURIComponent(CLI_CALLBACK_URL)}`,
    );

    await page.waitForURL(
      new RegExp(`127\\.0\\.0\\.1:${CLI_CALLBACK_PORT}`),
      { timeout: 30_000 },
    );

    expect(capturedToken).toBeTruthy();
    expect(capturedToken).toMatch(/^hqcli_/);

    // Use page.evaluate to call cli-verify directly (simulating what the CLI would do)
    const verifyResult = await page.evaluate(
      async ({ token, apiBase }) => {
        const resp = await fetch(`${apiBase}/api/auth/cli-verify`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        return {
          status: resp.status,
          body: await resp.json(),
        };
      },
      { token: capturedToken, apiBase: API_BASE },
    );

    expect(verifyResult.status).toBe(200);

    const body = verifyResult.body as {
      valid?: boolean;
      userId?: string;
      sessionId?: string;
    };
    expect(body.valid).toBe(true);
    expect(body.userId).toBe(capturedUserId);
    expect(body.sessionId).toBeTruthy();
  });
});
