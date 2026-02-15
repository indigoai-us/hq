/**
 * E2E-001: Smoke test — Clerk auth login + /agents page loads
 *
 * Verifies:
 * 1. Clerk authentication works (real sign-in, no mocks)
 * 2. Redirect to /agents after login completes
 * 3. The agents/sessions page renders with expected UI elements
 *
 * Prerequisites:
 * - clerkSetup() ran in global-setup.ts
 * - E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars set
 * - API server running on port 3001
 * - Web app running on port 3000
 */

import { test, expect } from "./fixtures/clerk-auth";

test.describe("Smoke: Clerk auth + agents page", () => {
  test("logs in via Clerk and verifies /agents page loads", async ({
    clerkPage: page,
  }) => {
    // After Clerk sign-in (handled by fixture), we should be on /agents or /setup
    const url = page.url();

    // If redirected to /setup (onboarding), that still counts as auth success
    if (url.includes("/setup")) {
      // Verify setup page loaded (auth worked, onboarding gate triggered)
      await expect(page).toHaveURL(/\/setup/);
      // Navigate to agents manually (skip onboarding for smoke test)
      await page.goto("/agents");
    }

    // Verify we're on the agents page
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // Verify the page has loaded — look for key UI elements
    // The agents page shows "Sessions" header (SectionHeader title)
    // or "Loading sessions..." or "No sessions yet" depending on state
    const sessionsHeader = page.getByText("Sessions");
    const loadingText = page.getByText("Loading sessions...");
    const emptyState = page.getByText("No sessions yet");
    const errorState = page.getByText("Retry");

    // At least one of these should be visible — page loaded successfully
    await expect(
      sessionsHeader.or(loadingText).or(emptyState).or(errorState).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("authenticated page shows HQ branding in sidebar", async ({
    clerkPage: page,
  }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // Desktop sidebar should have "HQ" text
    const hqBrand = page.locator("aside").getByText("HQ");
    // On mobile, there might be a BrandHeader instead
    const brandHeader = page.getByText("HQ Cloud");

    await expect(hqBrand.or(brandHeader).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("navigation links are visible for authenticated user", async ({
    clerkPage: page,
  }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // Sidebar nav should have Sessions and Navigator links
    const sessionsLink = page.getByText("Sessions");
    const navigatorLink = page.getByText("Navigator");

    await expect(sessionsLink.first()).toBeVisible({ timeout: 10_000 });
    await expect(navigatorLink.first()).toBeVisible({ timeout: 10_000 });
  });
});
