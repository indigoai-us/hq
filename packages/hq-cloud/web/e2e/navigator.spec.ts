import { test, expect } from "./fixtures/auth";
import { mockNavigatorApi, mockFilesApi, mockAgentsApi } from "./fixtures/api-mocks";
import { makeNavigatorTree } from "./fixtures/mock-data";

test.describe("Navigator - file browser", () => {
  const tree = makeNavigatorTree();

  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockNavigatorApi(page, tree);
    await mockAgentsApi(page, []);
  });

  test("shows tree groups on load", async ({ authenticatedPage: page }) => {
    await page.goto("/navigator");

    // Group names are rendered as uppercase text in group headers
    await expect(page.getByText("COMPANIES")).toBeVisible();
    await expect(page.getByText("PROJECTS")).toBeVisible();
    await expect(page.getByText("WORKERS")).toBeVisible();
  });

  test("expand and collapse tree nodes", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/navigator");

    // "Acme Corp" is a tree node; click to expand
    await page.getByRole("button", { name: /Acme Corp/i }).click();

    // Child file should become visible
    await expect(page.getByText("README.md")).toBeVisible();

    // Click again to collapse
    await page.getByRole("button", { name: /Acme Corp/i }).click();

    // Child should be hidden
    await expect(page.getByText("README.md")).not.toBeVisible();
  });

  test("click file navigates to viewer", async ({
    authenticatedPage: page,
  }) => {
    const mdContent = "# Acme Corp\n\nWelcome to Acme Corp.";
    await mockFilesApi(page, {
      "companies/acme/README.md": {
        path: "companies/acme/README.md",
        content: mdContent,
        size: mdContent.length,
      },
    });

    await page.goto("/navigator");

    // Expand the Acme Corp node to reveal child files
    await page.getByRole("button", { name: /Acme Corp/i }).click();
    await expect(page.getByText("README.md")).toBeVisible();

    // Click the file node and wait for navigation
    const [response] = await Promise.all([
      page.waitForURL(/\/navigator\/viewer/, { timeout: 10_000 }),
      page.getByRole("button", { name: /README\.md/i }).click(),
    ]);

    await expect(page).toHaveURL(/\/navigator\/viewer/);
  });
});

test.describe("Navigator - file viewer", () => {
  test("viewer shows file content with type badge", async ({
    authenticatedPage: page,
  }) => {
    const mdContent = "# Hello World\n\nSome content here.";
    await mockAgentsApi(page, []);
    await mockFilesApi(page, {
      "docs/hello.md": {
        path: "docs/hello.md",
        content: mdContent,
        size: mdContent.length,
      },
    });

    await page.goto(
      "/navigator/viewer?path=" + encodeURIComponent("docs/hello.md"),
    );

    // Should show the MARKDOWN badge
    await expect(page.getByText("MARKDOWN")).toBeVisible();
    // Should show the file path
    await expect(page.getByText("docs/hello.md")).toBeVisible();
  });

  test("markdown files render properly", async ({
    authenticatedPage: page,
  }) => {
    const mdContent = "# My Heading\n\nA paragraph with **bold** text.";
    await mockAgentsApi(page, []);
    await mockFilesApi(page, {
      "test.md": {
        path: "test.md",
        content: mdContent,
        size: mdContent.length,
      },
    });

    await page.goto(
      "/navigator/viewer?path=" + encodeURIComponent("test.md"),
    );

    await expect(page.getByRole("heading", { name: "My Heading" })).toBeVisible();
    await expect(page.getByText("bold")).toBeVisible();
  });
});
