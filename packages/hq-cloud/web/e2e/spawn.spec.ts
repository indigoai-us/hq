import { test, expect } from "./fixtures/auth";
import { mockWorkersApi, mockAgentsApi } from "./fixtures/api-mocks";
import { makeWorker, makeAgent, makeAgentMessage } from "./fixtures/mock-data";

test.describe("Spawn wizard", () => {
  const worker = makeWorker({
    id: "w1",
    name: "Code Worker",
    skills: [
      {
        id: "skill-implement",
        name: "Implement Feature",
        description: "Implement a new feature",
        parameters: [
          {
            name: "description",
            label: "Description",
            type: "string",
            required: true,
            placeholder: "Describe the feature...",
          },
          {
            name: "priority",
            label: "Priority",
            type: "select",
            options: ["low", "medium", "high"],
            defaultValue: "medium",
          },
        ],
      },
      {
        id: "skill-fix",
        name: "Fix Bug",
        description: "Fix a bug in the codebase",
      },
    ],
  });

  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockWorkersApi(page, [worker], {
      agentId: "spawned-1",
      agentName: "Spawned Agent",
      status: "running",
    });
    await mockAgentsApi(
      page,
      [makeAgent({ id: "spawned-1", name: "Spawned Agent" })],
      [makeAgentMessage({ content: "Starting..." })],
    );
  });

  test("shows worker list on load", async ({ authenticatedPage: page }) => {
    await page.goto("/spawn");

    await expect(
      page.getByRole("heading", { name: "Select Worker" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Code Worker/i }),
    ).toBeVisible();
  });

  test("select worker advances to skill selection", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/spawn");

    await page.getByRole("button", { name: /Code Worker/i }).click();

    await expect(
      page.getByRole("heading", { name: "Select Skill" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Implement Feature/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Fix Bug/i }),
    ).toBeVisible();
  });

  test("select skill advances to configuration", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/spawn");

    await page.getByRole("button", { name: /Code Worker/i }).click();
    await page.getByRole("button", { name: /Implement Feature/i }).click();

    await expect(
      page.getByRole("heading", { name: "Configure" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Describe the feature...")).toBeVisible();
  });

  test("fill parameters enables Continue button", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/spawn");

    await page.getByRole("button", { name: /Code Worker/i }).click();
    await page.getByRole("button", { name: /Implement Feature/i }).click();

    await page.getByPlaceholder("Describe the feature...").fill("Add dark mode");

    const continueBtn = page.getByRole("button", { name: "Continue" });
    await expect(continueBtn).toBeEnabled();
  });

  test("confirm page shows summary", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/spawn");

    await page.getByRole("button", { name: /Code Worker/i }).click();
    await page.getByRole("button", { name: /Implement Feature/i }).click();
    await page.getByPlaceholder("Describe the feature...").fill("Add dark mode");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: "Confirm" }),
    ).toBeVisible();
    await expect(page.getByText("Code Worker", { exact: false })).toBeVisible();
    await expect(
      page.getByText("Implement Feature", { exact: false }),
    ).toBeVisible();
  });

  test("spawn button calls API and redirects to agent detail", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/spawn");

    await page.getByRole("button", { name: /Code Worker/i }).click();
    await page.getByRole("button", { name: /Implement Feature/i }).click();
    await page.getByPlaceholder("Describe the feature...").fill("Add dark mode");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Spawn Worker" }).click();

    await expect(page).toHaveURL(/\/agents\/spawned-1/);
  });
});
