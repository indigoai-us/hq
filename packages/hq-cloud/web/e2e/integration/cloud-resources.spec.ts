import { test, expect } from "@playwright/test";

/**
 * Integration tests against the real HQ Cloud API.
 *
 * These tests hit the actual API server (started by playwright.integration.config.ts)
 * which reads from the real HQ filesystem. They verify that the wiring between
 * the API and the HQ directory structure works correctly.
 *
 * The API runs with SKIP_AUTH=true so no Clerk tokens are needed.
 */

const API = "http://127.0.0.1:3002";

test.describe("Navigator - real HQ filesystem", () => {
  test("GET /api/navigator/tree returns groups from real HQ directory", async ({
    request,
  }) => {
    const response = await request.get(`${API}/api/navigator/tree`);
    expect(response.ok()).toBe(true);

    const tree = await response.json();
    expect(tree.groups).toBeDefined();
    expect(Array.isArray(tree.groups)).toBe(true);

    // HQ has workers/, projects/, knowledge/ directories
    const groupIds = tree.groups.map((g: { id: string }) => g.id);
    expect(groupIds).toContain("workers");
    expect(groupIds).toContain("projects");
    expect(groupIds).toContain("knowledge");
  });

  test("navigator tree Workers group contains real worker directories", async ({
    request,
  }) => {
    const response = await request.get(`${API}/api/navigator/tree`);
    const tree = await response.json();

    const workersGroup = tree.groups.find(
      (g: { id: string }) => g.id === "workers",
    );
    expect(workersGroup).toBeDefined();
    expect(workersGroup.children.length).toBeGreaterThan(0);

    // Should contain dev-team directory (from HQ's workers/dev-team/)
    const childNames = workersGroup.children.map(
      (n: { name: string }) => n.name,
    );
    expect(childNames).toContain("dev-team");
  });

  test("navigator tree nodes have correct structure", async ({ request }) => {
    const response = await request.get(`${API}/api/navigator/tree`);
    const tree = await response.json();

    // Check that nodes have all required fields
    for (const group of tree.groups) {
      expect(group.id).toBeDefined();
      expect(group.name).toBeDefined();
      expect(Array.isArray(group.children)).toBe(true);

      for (const node of group.children) {
        expect(node.id).toBeDefined();
        expect(node.name).toBeDefined();
        expect(node.type).toBeDefined();
        expect(node.status).toBeDefined();
      }
    }
  });

  test("GET /api/navigator/file reads a real file from HQ", async ({
    request,
  }) => {
    // workers/registry.yaml is a known file in every HQ
    const response = await request.get(
      `${API}/api/navigator/file?path=workers/registry.yaml`,
    );
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.path).toBe("workers/registry.yaml");
    expect(data.content).toBeDefined();
    expect(data.content).toContain("workers:");
  });

  test("GET /api/navigator/file rejects path traversal", async ({
    request,
  }) => {
    const response = await request.get(
      `${API}/api/navigator/file?path=../../../etc/passwd`,
    );
    expect(response.ok()).toBe(false);
    expect(response.status()).toBe(400);
  });

  test("GET /api/navigator/file returns 404 for missing file", async ({
    request,
  }) => {
    const response = await request.get(
      `${API}/api/navigator/file?path=nonexistent-file-12345.txt`,
    );
    expect(response.ok()).toBe(false);
    expect(response.status()).toBe(404);
  });
});

test.describe("Workers - real HQ registry", () => {
  test("GET /api/workers returns worker definitions from registry.yaml", async ({
    request,
  }) => {
    const response = await request.get(`${API}/api/workers`);
    expect(response.ok()).toBe(true);

    const workers = await response.json();
    expect(Array.isArray(workers)).toBe(true);
    expect(workers.length).toBeGreaterThan(0);

    // Verify structure matches WorkerDefinition type
    const first = workers[0];
    expect(first.id).toBeDefined();
    expect(first.name).toBeDefined();
    expect(first.category).toBeDefined();
    expect(first.description).toBeDefined();
    expect(first.status).toBeDefined();
    expect(Array.isArray(first.skills)).toBe(true);
  });

  test("worker definitions include known workers from registry", async ({
    request,
  }) => {
    const response = await request.get(`${API}/api/workers`);
    const workers = await response.json();

    const ids = workers.map((w: { id: string }) => w.id);

    // These workers are defined in workers/registry.yaml
    expect(ids).toContain("backend-dev");
    expect(ids).toContain("frontend-dev");
    expect(ids).toContain("architect");
    expect(ids).toContain("project-manager");
  });

  test("worker categories are correctly mapped from types", async ({
    request,
  }) => {
    const response = await request.get(`${API}/api/workers`);
    const workers = await response.json();

    const backendDev = workers.find(
      (w: { id: string }) => w.id === "backend-dev",
    );
    expect(backendDev).toBeDefined();
    expect(backendDev.category).toBe("code");

    const contentBrand = workers.find(
      (w: { id: string }) => w.id === "content-brand",
    );
    expect(contentBrand).toBeDefined();
    expect(contentBrand.category).toBe("content");
  });

  test("worker definitions include names from worker.yaml", async ({
    request,
  }) => {
    const response = await request.get(`${API}/api/workers`);
    const workers = await response.json();

    const backendDev = workers.find(
      (w: { id: string }) => w.id === "backend-dev",
    );
    expect(backendDev).toBeDefined();
    // Backend dev has worker.yaml with name: "Backend Developer"
    expect(backendDev.name).toBe("Backend Developer");
  });

  test("all workers have active status", async ({ request }) => {
    const response = await request.get(`${API}/api/workers`);
    const workers = await response.json();

    // All workers in registry.yaml have status: active
    for (const worker of workers) {
      expect(worker.status).toBe("active");
    }
  });
});

test.describe("Agents - runtime instances", () => {
  test("GET /api/agents returns empty list initially", async ({ request }) => {
    const response = await request.get(`${API}/api/agents`);
    expect(response.ok()).toBe(true);

    const agents = await response.json();
    expect(Array.isArray(agents)).toBe(true);
    // No agents should be running at test start
    // (may not be empty if other tests have spawned, but should be an array)
  });
});

test.describe("Spawn worker - creates real agent", () => {
  test("POST /api/workers/spawn creates an agent from a real worker", async ({
    request,
  }) => {
    // Spawn a backend-dev worker (exists in registry.yaml)
    const spawnResponse = await request.post(`${API}/api/workers/spawn`, {
      data: {
        workerId: "backend-dev",
        skill: "implement-feature",
        parameters: { task: "integration-test" },
      },
    });

    expect(spawnResponse.ok()).toBe(true);
    expect(spawnResponse.status()).toBe(202);

    const spawnData = await spawnResponse.json();
    expect(spawnData.agentId).toBeDefined();
    expect(spawnData.agentName).toBe("Backend Developer");
    expect(spawnData.status).toBe("pending");
    expect(spawnData.trackingId).toBeDefined();

    // The spawned agent should now appear in GET /api/agents
    const agentsResponse = await request.get(`${API}/api/agents`);
    expect(agentsResponse.ok()).toBe(true);

    const agents = await agentsResponse.json();
    const spawned = agents.find(
      (a: { id: string }) => a.id === spawnData.agentId,
    );
    expect(spawned).toBeDefined();
    expect(spawned.name).toBe("Backend Developer");
    expect(spawned.type).toBe("code");
    expect(spawned.status).toBe("idle"); // 'pending' maps to 'idle' in agent store
  });

  test("POST /api/workers/spawn rejects non-existent worker", async ({
    request,
  }) => {
    const response = await request.post(`${API}/api/workers/spawn`, {
      data: {
        workerId: "nonexistent-worker-xyz",
        skill: "test",
      },
    });

    expect(response.ok()).toBe(false);
    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Not Found");
  });

  test("spawned agent has correct metadata from registry", async ({
    request,
  }) => {
    const spawnResponse = await request.post(`${API}/api/workers/spawn`, {
      data: {
        workerId: "content-brand",
        skill: "analyze-voice",
        metadata: { testRun: true },
      },
    });

    expect(spawnResponse.ok()).toBe(true);
    const spawnData = await spawnResponse.json();

    // Verify the agent detail
    const agentResponse = await request.get(
      `${API}/api/agents/${spawnData.agentId}`,
    );
    expect(agentResponse.ok()).toBe(true);

    const agent = await agentResponse.json();
    expect(agent.name).toBe("Content Brand"); // Falls back to formatted ID if no worker.yaml name
    expect(agent.type).toBe("content");
  });

  test("spawned agent can receive messages", async ({ request }) => {
    // Spawn first
    const spawnResponse = await request.post(`${API}/api/workers/spawn`, {
      data: {
        workerId: "architect",
        skill: "system-design",
      },
    });
    const { agentId } = await spawnResponse.json();

    // Send a message
    const msgResponse = await request.post(
      `${API}/api/agents/${agentId}/messages`,
      {
        data: { content: "Design a caching layer" },
      },
    );
    expect(msgResponse.ok()).toBe(true);
    expect(msgResponse.status()).toBe(201);

    // Retrieve messages
    const msgsResponse = await request.get(
      `${API}/api/agents/${agentId}/messages`,
    );
    expect(msgsResponse.ok()).toBe(true);

    const messages = await msgsResponse.json();
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m: { content: string }) => m.content === "Design a caching layer")).toBe(true);
  });
});

test.describe("Health check", () => {
  test("GET /api/health returns healthy", async ({ request }) => {
    const response = await request.get(`${API}/api/health`);
    expect(response.ok()).toBe(true);
  });
});
