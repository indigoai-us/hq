import { test, expect } from "./fixtures/auth";
import { mockAgentsApi, mockWorkersApi } from "./fixtures/api-mocks";
import { makeAgent, makeAgentMessage, makeWorker } from "./fixtures/mock-data";
import type { Agent } from "../src/types/agent";

test.describe("Agents list", () => {
  test("shows agent cards with name, status, and progress", async ({
    authenticatedPage: page,
  }) => {
    const agents: Agent[] = [
      makeAgent({ id: "a1", name: "Frontend Worker", status: "running" }),
      makeAgent({
        id: "a2",
        name: "Backend Worker",
        status: "completed",
        progress: { completed: 10, total: 10 },
      }),
    ];
    await mockAgentsApi(page, agents);
    await page.goto("/agents");

    await expect(page.getByText("Frontend Worker")).toBeVisible();
    await expect(page.getByText("Backend Worker")).toBeVisible();
  });

  test("empty state shows 'No agents running' with spawn link", async ({
    authenticatedPage: page,
  }) => {
    await mockAgentsApi(page, []);
    await mockWorkersApi(page, [makeWorker()]);
    await page.goto("/agents");

    await expect(page.getByText("No agents running")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Spawn Worker" }),
    ).toBeVisible();
  });

  test("empty state spawn button navigates to /spawn", async ({
    authenticatedPage: page,
  }) => {
    await mockAgentsApi(page, []);
    await mockWorkersApi(page, [makeWorker()]);
    await page.goto("/agents");

    await expect(page.getByText("No agents running")).toBeVisible();
    await page.getByRole("button", { name: "Spawn Worker" }).click();
    await expect(page).toHaveURL(/\/spawn/);
  });

  test("click agent card navigates to detail page", async ({
    authenticatedPage: page,
  }) => {
    const agent = makeAgent({ id: "agent-123", name: "My Agent" });
    const messages = [makeAgentMessage({ content: "Starting task..." })];
    await mockAgentsApi(page, [agent], messages);
    await page.goto("/agents");

    await page.getByText("My Agent").click();
    await expect(page).toHaveURL(/\/agents\/agent-123/);
  });
});

test.describe("Agent detail", () => {
  test("shows chat messages", async ({ authenticatedPage: page }) => {
    const agent = makeAgent({ id: "a1", name: "Chat Agent" });
    const messages = [
      makeAgentMessage({ role: "agent", content: "Hello, I'm working on it" }),
      makeAgentMessage({ role: "user", content: "Thanks!" }),
      makeAgentMessage({ role: "system", content: "Task started" }),
    ];
    await mockAgentsApi(page, [agent], messages);
    await page.goto("/agents/a1");

    await expect(page.getByText("Hello, I'm working on it")).toBeVisible();
    await expect(page.getByText("Thanks!")).toBeVisible();
    await expect(page.getByText("Task started")).toBeVisible();
  });

  test("can type and send a message", async ({
    authenticatedPage: page,
  }) => {
    const agent = makeAgent({ id: "a1", name: "Chat Agent" });
    await mockAgentsApi(page, [agent], []);
    await page.goto("/agents/a1");

    const input = page.getByPlaceholder("Send a message...");
    await expect(input).toBeVisible();

    await input.fill("Hello agent");
    await input.press("Enter");

    // Verify the input was cleared after send
    await expect(input).toHaveValue("");
  });

  test("agent with question shows option buttons", async ({
    authenticatedPage: page,
  }) => {
    const agent = makeAgent({
      id: "a1",
      name: "Question Agent",
      status: "waiting_input",
      currentQuestion: {
        id: "q1",
        text: "Which approach do you prefer?",
        options: ["Approach A", "Approach B", "Approach C"],
        askedAt: new Date().toISOString(),
      },
    });
    await mockAgentsApi(page, [agent], []);
    await page.goto("/agents/a1");

    await expect(page.getByText("Approach A")).toBeVisible();
    await expect(page.getByText("Approach B")).toBeVisible();
    await expect(page.getByText("Approach C")).toBeVisible();
  });

  test("agent with permission shows Allow/Deny", async ({
    authenticatedPage: page,
  }) => {
    const agent = makeAgent({
      id: "a1",
      name: "Permission Agent",
      status: "waiting_input",
      currentPermission: {
        id: "p1",
        tool: "file_write",
        description: "Write to config.json",
        requestedAt: new Date().toISOString(),
      },
    });
    await mockAgentsApi(page, [agent], []);
    await page.goto("/agents/a1");

    await expect(page.getByText("file_write", { exact: false })).toBeVisible();
    await expect(page.getByText("Write to config.json")).toBeVisible();
    await expect(page.getByRole("button", { name: /allow/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /deny/i })).toBeVisible();
  });
});
