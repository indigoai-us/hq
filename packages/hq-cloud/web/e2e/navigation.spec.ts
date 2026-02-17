import { test, expect } from "./fixtures/auth";
import {
  mockAuthApi,
  mockAgentsApi,
  mockWorkersApi,
  mockNavigatorApi,
} from "./fixtures/api-mocks";
import { makeNavigatorTree, makeWorker } from "./fixtures/mock-data";

test.describe("Navigation & routing", () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockAgentsApi(page, []);
    await mockWorkersApi(page, [makeWorker()]);
    await mockNavigatorApi(page, makeNavigatorTree());
  });

  test("desktop sidebar shows nav items", async ({ authenticatedPage: page }) => {
    await page.goto("/agents");

    const sidebar = page.locator("aside");

    // Emojis are always visible (Sessions = speech bubble, Navigator = folder)
    await expect(sidebar.getByText("\u{1F4AC}")).toBeVisible();
    await expect(sidebar.getByText("\u{1F4C1}")).toBeVisible();

    // Hover to reveal labels
    await sidebar.hover();
    await expect(sidebar.getByText("Sessions")).toBeVisible();
    await expect(sidebar.getByText("Navigator")).toBeVisible();
  });

  test("clicking nav items navigates to correct pages", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/);

    // Navigate to Navigator and wait for page content
    await page.locator("aside a[href='/navigator']").click();
    await expect(page).toHaveURL(/\/navigator/);

    // Navigate back to Sessions (agents)
    await page.locator("aside a[href='/agents']").click();
    await expect(page).toHaveURL(/\/agents/, { timeout: 10_000 });
  });

  test("active tab is highlighted", async ({ authenticatedPage: page }) => {
    await page.goto("/agents");

    // The active link includes "bg-overlay-light" (without hover: prefix)
    // while inactive ones only have "hover:bg-overlay-light"
    const sessionsLink = page.locator("aside a[href='/agents']");
    const sessionsClass = await sessionsLink.getAttribute("class");
    // Active link has "bg-overlay-light" without a preceding "hover:" prefix
    expect(sessionsClass).toMatch(/(?<!\bhovr:)\bbg-overlay-light\b/);

    const navigatorLink = page.locator("aside a[href='/navigator']");
    const navigatorClass = await navigatorLink.getAttribute("class");
    // Inactive link should NOT have "bg-overlay-light" unless prefixed with "hover:"
    // Check: all occurrences of "bg-overlay-light" should be preceded by "hover:"
    const matches = navigatorClass?.match(/bg-overlay-light/g) ?? [];
    const hoverMatches = navigatorClass?.match(/hover:bg-overlay-light/g) ?? [];
    expect(matches.length).toBe(hoverMatches.length);
  });

  test("unauthenticated access redirects to /sign-in", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Without Clerk auth, navigating to a protected route redirects to /sign-in
    await page.goto("http://localhost:3000/agents");
    await expect(page).toHaveURL(/\/sign-in/);
    await context.close();
  });

  test("mobile bottom tabs visible at small viewport", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/agents");

    const bottomNav = page.locator("nav.fixed");
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByText("Sessions")).toBeVisible();
    await expect(bottomNav.getByText("Navigator")).toBeVisible();
  });
});
