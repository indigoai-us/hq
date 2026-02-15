import type { Page } from "@playwright/test";
import type { Agent, AgentMessage } from "../../src/types/agent";
import type { WorkerDefinition, SpawnWorkerResponse } from "../../src/types/worker";
import type { NavigatorTreeResponse } from "../../src/types/navigator";
import type { FileContentResponse } from "../../src/services/files";

const API_BASE = "**/api";

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

/** Intercept auth validation endpoint */
export async function mockAuthApi(
  page: Page,
  valid = true,
): Promise<void> {
  await page.route(`${API_BASE}/auth/validate`, (route) =>
    route.fulfill(json({ valid })),
  );
}

/** Intercept agents list, detail, and messages endpoints */
export async function mockAgentsApi(
  page: Page,
  agents: Agent[],
  messages: AgentMessage[] = [],
): Promise<void> {
  // GET /api/agents
  await page.route(`${API_BASE}/agents`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json(agents));
    }
    return route.continue();
  });

  // GET /api/agents/:id
  await page.route(`${API_BASE}/agents/*`, (route) => {
    const url = route.request().url();
    // Skip sub-paths like /messages, /questions, /permissions
    if (/\/agents\/[^/]+\/(messages|questions|permissions)/.test(url)) {
      return route.continue();
    }
    if (route.request().method() !== "GET") return route.continue();

    const id = url.split("/agents/").pop()?.split("?")[0];
    const agent = agents.find((a) => a.id === id);
    if (agent) return route.fulfill(json(agent));
    return route.fulfill(json({ error: "Not found" }, 404));
  });

  // GET /api/agents/:id/messages
  await page.route(`${API_BASE}/agents/*/messages`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json(messages));
    }
    // POST /api/agents/:id/messages (send message)
    return route.fulfill(json({ ok: true }));
  });

  // POST /api/agents/:id/questions/:qid/answer
  await page.route(`${API_BASE}/agents/*/questions/*/answer`, (route) =>
    route.fulfill(json({ ok: true })),
  );

  // POST /api/agents/:id/permissions/:pid/respond
  await page.route(`${API_BASE}/agents/*/permissions/*/respond`, (route) =>
    route.fulfill(json({ ok: true })),
  );

  // POST /api/messages (global message)
  await page.route(`${API_BASE}/messages`, (route) =>
    route.fulfill(json({ ok: true })),
  );
}

/** Intercept workers list and spawn endpoints */
export async function mockWorkersApi(
  page: Page,
  workers: WorkerDefinition[],
  spawnResult?: SpawnWorkerResponse,
): Promise<void> {
  // GET /api/workers
  await page.route(`${API_BASE}/workers`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json(workers));
    }
    return route.continue();
  });

  // POST /api/workers/spawn
  await page.route(`${API_BASE}/workers/spawn`, (route) =>
    route.fulfill(
      json(
        spawnResult ?? {
          agentId: "spawned-agent-1",
          agentName: "New Agent",
          status: "running",
        },
      ),
    ),
  );
}

/** Intercept navigator tree endpoint */
export async function mockNavigatorApi(
  page: Page,
  tree: NavigatorTreeResponse,
): Promise<void> {
  await page.route(`${API_BASE}/navigator/tree`, (route) =>
    route.fulfill(json(tree)),
  );
}

/** Intercept file content endpoint */
export async function mockFilesApi(
  page: Page,
  fileContents: Record<string, FileContentResponse>,
): Promise<void> {
  await page.route(`${API_BASE}/files/content*`, (route) => {
    const url = new URL(route.request().url());
    const filePath = url.searchParams.get("path") ?? "";
    const file = fileContents[filePath];
    if (file) return route.fulfill(json(file));
    return route.fulfill(json({ error: "File not found" }, 404));
  });
}
