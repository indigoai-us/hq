import { test, expect } from "@playwright/test";
import { test as authTest, expect as authExpect } from "./fixtures/auth";
import { mockAuthApi, mockAgentsApi } from "./fixtures/api-mocks";

test.describe("Login flow", () => {
  test("renders login form with title, input, and button", async ({ page }) => {
    await mockAuthApi(page, false);
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "HQ Cloud" })).toBeVisible();
    await expect(page.getByLabel("API Key")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("submit button is disabled when input is empty", async ({ page }) => {
    await mockAuthApi(page, false);
    await page.goto("/login");

    const button = page.getByRole("button", { name: "Sign In" });
    await expect(button).toBeDisabled();
  });

  test("submit button enables when input has a value", async ({ page }) => {
    await mockAuthApi(page, false);
    await page.goto("/login");

    await page.getByLabel("API Key").fill("hq_test123");
    const button = page.getByRole("button", { name: "Sign In" });
    await expect(button).toBeEnabled();
  });

  test("successful login redirects to /agents", async ({ page }) => {
    // First visit: no stored key → show login
    await mockAuthApi(page, false);
    await page.goto("/login");

    // Now mock validation to succeed for the submitted key
    await page.unrouteAll();
    await mockAuthApi(page, true);
    await mockAgentsApi(page, []);

    await page.getByLabel("API Key").fill("hq_valid_key");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/agents/);
  });

  test("failed login shows error message", async ({ page }) => {
    await mockAuthApi(page, false);
    await page.goto("/login");

    // Validation will return invalid → login throws
    await page.getByLabel("API Key").fill("hq_bad_key");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(
      page.getByText("Invalid API key", { exact: false }),
    ).toBeVisible();
  });

  test("logout returns to login page", async ({ page }) => {
    // Start authenticated
    await page.addInitScript(() => {
      localStorage.setItem("hq_cloud_api_key", "hq_test");
      localStorage.setItem("hq_cloud_api_url", "http://localhost:3001");
    });
    await mockAuthApi(page, true);
    await mockAgentsApi(page, []);
    await page.goto("/agents");

    // Wait for agent page to load (use the section header which is unique)
    await expect(
      page.locator("text=No agents running"),
    ).toBeVisible({ timeout: 10_000 });

    // Hover over sidebar to reveal logout button, then click
    await page.locator("aside").hover();
    await page.getByRole("button", { name: /Logout/i }).click();

    await expect(page).toHaveURL(/\/login/);
  });
});

authTest.describe("Login - already authenticated", () => {
  authTest(
    "redirects to /agents when already authenticated",
    async ({ authenticatedPage: page }) => {
      await mockAgentsApi(page, []);
      await page.goto("/login");

      await expect(page).toHaveURL(/\/agents/);
    },
  );
});
