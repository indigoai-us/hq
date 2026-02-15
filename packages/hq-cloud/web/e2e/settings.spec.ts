import { test, expect } from "./fixtures/auth";
import { mockAgentsApi } from "./fixtures/api-mocks";

test.describe("Notification settings", () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockAgentsApi(page, []);
  });

  test("shows notification toggles", async ({ authenticatedPage: page }) => {
    await page.goto("/settings/notifications");

    await expect(
      page.getByRole("switch", { name: /Push Notifications/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /Questions/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /Permission Requests/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /Status Updates/i }),
    ).toBeVisible();
  });

  test("toggle states update on click", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/settings/notifications");

    const masterToggle = page.getByRole("switch", {
      name: /Push Notifications/i,
    });
    await expect(masterToggle).toBeVisible();

    const initialChecked = await masterToggle.getAttribute("aria-checked");

    await masterToggle.click();

    const newChecked = await masterToggle.getAttribute("aria-checked");
    expect(newChecked).not.toBe(initialChecked);
  });

  test("navigating back returns to previous page", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/agents");
    await expect(page.getByText("No agents running")).toBeVisible();

    // Navigate to settings via sidebar link
    await page.locator("aside a[href='/settings/notifications']").click();
    await expect(page).toHaveURL(/\/settings\/notifications/);

    // Go back via browser
    await page.goBack();
    await expect(page).toHaveURL(/\/agents/);
  });
});
