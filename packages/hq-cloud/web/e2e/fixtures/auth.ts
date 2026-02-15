import { test as base, type Page } from "@playwright/test";
import { mockAuthApi } from "./api-mocks";

const API_KEY = "hq_test_e2e_key";
const API_URL = "http://localhost:3001";

/**
 * Authenticate a page by:
 * 1. Setting localStorage keys via addInitScript (runs before any page JS)
 * 2. Mocking the /api/auth/validate endpoint to return { valid: true }
 */
async function authenticate(page: Page): Promise<void> {
  // Set localStorage before the page loads
  await page.addInitScript(
    ({ key, url }: { key: string; url: string }) => {
      localStorage.setItem("hq_cloud_api_key", key);
      localStorage.setItem("hq_cloud_api_url", url);
    },
    { key: API_KEY, url: API_URL },
  );

  // Mock auth validation
  await mockAuthApi(page, true);
}

/**
 * Extended test fixture providing an authenticated page.
 * Use `authenticatedPage` in your tests to get a page that's
 * pre-configured with auth credentials and mocked validation.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await authenticate(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
