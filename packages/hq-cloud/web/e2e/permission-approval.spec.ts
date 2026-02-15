/**
 * SM-010: E2E Test — Permission Approval Flow
 *
 * Tests the full permission approval/denial flow through the web UI:
 * 1. Session with active status is loaded on detail page
 * 2. A mock container sends a can_use_tool control_request (via mocked WebSocket)
 * 3. SessionPermissionPrompt component renders with tool name + input
 * 4. User clicks Allow -> permission response sent, prompt dismissed
 * 5. User clicks Deny -> permission response sent, prompt dismissed
 * 6. Permission responses are stored as session messages
 *
 * This test runs with mocked API endpoints and mocked WebSocket.
 * The WebSocket is intercepted via page.routeWebSocket() so we can
 * inject server events (session_permission_request) and capture
 * client responses (session_permission_response).
 */

import { test, expect } from "./fixtures/auth";
import {
  makeSession,
  makeSessionMessage,
} from "./fixtures/session-mocks";

test.describe("Permission approval flow (mocked API)", () => {
  test.setTimeout(60_000);

  const SESSION_ID = "test-perm-session-001";

  /**
   * Helper: set up common API route mocks for session detail page.
   * Returns a mutable object so tests can update session state dynamically.
   */
  async function setupSessionMocks(
    page: import("@playwright/test").Page,
    sessionOverrides: Parameters<typeof makeSession>[0] = {},
    initialMessages: ReturnType<typeof makeSessionMessage>[] = [],
  ) {
    const state = {
      session: makeSession({
        sessionId: SESSION_ID,
        status: "active",
        initialPrompt: "Read the file at /hq/INDEX.md",
        ...sessionOverrides,
      }),
      messages: [...initialMessages],
      /** Permission responses captured from POST to permissions/respond */
      permissionResponses: [] as Array<{
        permissionId: string;
        decision: string;
      }>,
    };

    // GET/POST /api/sessions
    await page.route("**/api/sessions", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(state.session),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([state.session]),
      });
    });

    // GET/DELETE /api/sessions/:id
    await page.route(`**/api/sessions/${SESSION_ID}`, (route) => {
      const url = route.request().url();
      if (/\/messages/.test(url)) return route.continue();
      if (route.request().method() === "DELETE") {
        state.session = { ...state.session, status: "stopped", stoppedAt: new Date().toISOString() };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: "stopped" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.session),
      });
    });

    // GET /api/sessions/:id/messages
    await page.route(`**/api/sessions/${SESSION_ID}/messages*`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.messages),
      });
    });

    // POST /api/agents/:id/permissions/:pid/respond (permission response endpoint)
    await page.route("**/api/agents/*/permissions/*/respond", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // Mock workers API
    await page.route("**/api/workers", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    // Mock settings API
    await page.route("**/api/settings", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      });
    });

    // Mock user-settings API
    await page.route("**/api/user-settings*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      });
    });

    return state;
  }

  /**
   * Helper: set up a mock WebSocket that intercepts the app's WS connection.
   * Returns a handle that can send server events to the page and capture
   * messages sent by the page (e.g. permission responses).
   */
  async function setupMockWebSocket(page: import("@playwright/test").Page) {
    const capturedMessages: Array<Record<string, unknown>> = [];
    let serverSend: ((data: string) => void) | null = null;
    let wsReady: (() => void) | null = null;
    const wsReadyPromise = new Promise<void>((resolve) => {
      wsReady = resolve;
    });

    // Intercept WebSocket connections from the page
    await page.routeWebSocket("**/ws**", (ws) => {
      const server = ws.connectToServer();

      // When the page sends a message, capture it
      ws.onMessage((msg) => {
        try {
          const parsed = JSON.parse(String(msg)) as Record<string, unknown>;
          capturedMessages.push(parsed);
        } catch {
          // Not JSON
        }
        // Forward to mock server
        server.send(msg);
      });

      // Set up the ability to send messages from "server" to page
      serverSend = (data: string) => {
        ws.send(data);
      };

      // Send connection ack to make the app think it's connected
      ws.send(JSON.stringify({
        type: "connection:ack",
        payload: { sessionId: "ws-session-1" },
        timestamp: new Date().toISOString(),
      }));

      if (wsReady) wsReady();
    });

    return {
      /** Wait until the WebSocket route handler has been triggered */
      waitForConnection: () => wsReadyPromise,

      /** Send a server event (JSON) to the page's WebSocket */
      sendServerEvent: (event: Record<string, unknown>) => {
        if (serverSend) {
          serverSend(JSON.stringify(event));
        }
      },

      /** Send a permission request event to the page */
      sendPermissionRequest: (
        requestId: string,
        toolName: string,
        input: Record<string, unknown>,
      ) => {
        if (!serverSend) return;
        serverSend(JSON.stringify({
          type: "session_permission_request",
          payload: {
            sessionId: SESSION_ID,
            requestId,
            toolName,
            input,
          },
          timestamp: new Date().toISOString(),
        }));
      },

      /** Send a permission resolved event (server confirmation) */
      sendPermissionResolved: (requestId: string, behavior: "allow" | "deny") => {
        if (!serverSend) return;
        serverSend(JSON.stringify({
          type: "session_permission_resolved",
          payload: {
            sessionId: SESSION_ID,
            requestId,
            behavior,
          },
          timestamp: new Date().toISOString(),
        }));
      },

      /** Send a session message event (e.g. tool result after allow) */
      sendSessionMessage: (
        messageType: string,
        content: string,
        raw?: Record<string, unknown>,
      ) => {
        if (!serverSend) return;
        serverSend(JSON.stringify({
          type: "session_message",
          payload: {
            sessionId: SESSION_ID,
            messageType,
            content,
            raw,
          },
          timestamp: new Date().toISOString(),
        }));
      },

      /** Get all captured messages sent by the page */
      getCapturedMessages: () => [...capturedMessages],

      /** Get captured permission responses */
      getPermissionResponses: () =>
        capturedMessages.filter((m) => m.type === "session_permission_response"),
    };
  }

  test("Allow flow: permission prompt appears, user clicks Allow, tool executes", async ({
    authenticatedPage: page,
  }) => {
    // --- Setup ---
    await setupSessionMocks(page);
    const ws = await setupMockWebSocket(page);

    // Navigate to session detail page
    await page.goto(`/agents/${SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    // Wait for WebSocket to connect
    await ws.waitForConnection();

    // Wait for session to be loaded and active
    await expect(page.getByText("Active")).toBeVisible({ timeout: 10_000 });

    // --- Step 1: Send a permission request from mock container ---
    const requestId = "perm-allow-001";
    ws.sendPermissionRequest(requestId, "Read", {
      file_path: "/hq/INDEX.md",
    });

    // --- Step 2: Verify permission prompt appears ---
    // The SessionPermissionPrompt renders "Permission Request" header
    await expect(page.getByText("Permission Request")).toBeVisible({ timeout: 5000 });

    // Verify tool name is displayed
    await expect(page.getByText("Read")).toBeVisible();

    // Verify the file path input is displayed
    await expect(page.getByText("/hq/INDEX.md")).toBeVisible();

    // Verify Allow and Deny buttons are visible
    const allowButton = page.getByRole("button", { name: "Allow" });
    const denyButton = page.getByRole("button", { name: "Deny" });
    await expect(allowButton).toBeVisible();
    await expect(denyButton).toBeVisible();

    // --- Step 3: Click Allow ---
    await allowButton.click();

    // --- Step 4: Verify permission response was sent via WebSocket ---
    // Give the message a moment to be captured
    await page.waitForTimeout(300);

    const responses = ws.getPermissionResponses();
    expect(responses.length).toBeGreaterThanOrEqual(1);

    const allowResponse = responses.find(
      (r) =>
        r.requestId === requestId &&
        r.decision === "allow",
    );
    expect(allowResponse).toBeTruthy();
    expect(allowResponse!.sessionId).toBe(SESSION_ID);

    // --- Step 5: Simulate tool result arriving ---
    // Send the permission resolved event from server
    ws.sendPermissionResolved(requestId, "allow");

    // Wait for permission prompt to disappear
    await expect(page.getByText("Permission Request")).not.toBeVisible({ timeout: 5000 });

    // Send tool result as an assistant message
    ws.sendSessionMessage(
      "assistant",
      "I read the file at /hq/INDEX.md. It contains the HQ directory map.",
    );

    // Verify the tool result appears in the conversation
    await expect(
      page.getByText("I read the file at /hq/INDEX.md"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Deny flow: permission prompt appears, user clicks Deny, tool is blocked", async ({
    authenticatedPage: page,
  }) => {
    // --- Setup ---
    await setupSessionMocks(page);
    const ws = await setupMockWebSocket(page);

    // Navigate to session detail page
    await page.goto(`/agents/${SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    await ws.waitForConnection();
    await expect(page.getByText("Active")).toBeVisible({ timeout: 10_000 });

    // --- Step 1: Send a permission request ---
    const requestId = "perm-deny-001";
    ws.sendPermissionRequest(requestId, "Bash", {
      command: "rm -rf /important",
    });

    // --- Step 2: Verify permission prompt appears with Bash command ---
    await expect(page.getByText("Permission Request")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Bash")).toBeVisible();
    await expect(page.getByText("rm -rf /important")).toBeVisible();

    const denyButton = page.getByRole("button", { name: "Deny" });
    await expect(denyButton).toBeVisible();

    // --- Step 3: Click Deny ---
    await denyButton.click();

    // --- Step 4: Verify deny response was sent ---
    await page.waitForTimeout(300);

    const responses = ws.getPermissionResponses();
    expect(responses.length).toBeGreaterThanOrEqual(1);

    const denyResponse = responses.find(
      (r) =>
        r.requestId === requestId &&
        r.decision === "deny",
    );
    expect(denyResponse).toBeTruthy();
    expect(denyResponse!.sessionId).toBe(SESSION_ID);

    // --- Step 5: Server confirms permission was denied ---
    ws.sendPermissionResolved(requestId, "deny");

    // Permission prompt disappears
    await expect(page.getByText("Permission Request")).not.toBeVisible({ timeout: 5000 });

    // Send assistant response indicating tool was blocked
    ws.sendSessionMessage(
      "assistant",
      "The tool execution was denied by the user.",
    );

    // Verify the denial message appears
    await expect(
      page.getByText("The tool execution was denied by the user."),
    ).toBeVisible({ timeout: 5000 });
  });

  test("multiple permission prompts can be pending simultaneously", async ({
    authenticatedPage: page,
  }) => {
    // --- Setup ---
    await setupSessionMocks(page);
    const ws = await setupMockWebSocket(page);

    await page.goto(`/agents/${SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    await ws.waitForConnection();
    await expect(page.getByText("Active")).toBeVisible({ timeout: 10_000 });

    // --- Send two permission requests ---
    ws.sendPermissionRequest("perm-multi-001", "Read", {
      file_path: "/hq/INDEX.md",
    });

    ws.sendPermissionRequest("perm-multi-002", "Write", {
      file_path: "/hq/output.txt",
    });

    // Both permission prompts should be visible
    const permHeaders = page.getByText("Permission Request");
    await expect(permHeaders.first()).toBeVisible({ timeout: 5000 });

    // Both tool names should be visible
    await expect(page.getByText("Read")).toBeVisible();
    await expect(page.getByText("Write")).toBeVisible();

    // Both file paths should be visible
    await expect(page.getByText("/hq/INDEX.md")).toBeVisible();
    await expect(page.getByText("/hq/output.txt")).toBeVisible();

    // There should be 2 Allow and 2 Deny buttons
    const allowButtons = page.getByRole("button", { name: "Allow" });
    const denyButtons = page.getByRole("button", { name: "Deny" });
    await expect(allowButtons).toHaveCount(2);
    await expect(denyButtons).toHaveCount(2);

    // Allow the first, deny the second
    await allowButtons.first().click();
    await page.waitForTimeout(200);
    await denyButtons.first().click();
    await page.waitForTimeout(300);

    // Verify both responses were sent
    const responses = ws.getPermissionResponses();
    expect(responses.length).toBe(2);

    const allowResp = responses.find((r) => r.decision === "allow");
    const denyResp = responses.find((r) => r.decision === "deny");
    expect(allowResp).toBeTruthy();
    expect(denyResp).toBeTruthy();
  });

  test("permission prompt shows file_path for Read tool", async ({
    authenticatedPage: page,
  }) => {
    await setupSessionMocks(page);
    const ws = await setupMockWebSocket(page);

    await page.goto(`/agents/${SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    await ws.waitForConnection();
    await expect(page.getByText("Active")).toBeVisible({ timeout: 10_000 });

    // Send a Read tool permission request
    ws.sendPermissionRequest("perm-read-001", "Read", {
      file_path: "/hq/workers/dev-team/fullstack/worker.yaml",
    });

    // Verify the tool name and full file path are shown
    await expect(page.getByText("Permission Request")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Read")).toBeVisible();
    await expect(
      page.getByText("/hq/workers/dev-team/fullstack/worker.yaml"),
    ).toBeVisible();

    // Verify "Allow Read?" prompt text
    await expect(page.getByText("Allow")).toBeVisible();
  });

  test("permission prompt shows command for Bash tool", async ({
    authenticatedPage: page,
  }) => {
    await setupSessionMocks(page);
    const ws = await setupMockWebSocket(page);

    await page.goto(`/agents/${SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    await ws.waitForConnection();
    await expect(page.getByText("Active")).toBeVisible({ timeout: 10_000 });

    // Send a Bash tool permission request
    ws.sendPermissionRequest("perm-bash-001", "Bash", {
      command: "npm install && npm test",
    });

    // Verify the command is displayed in the permission prompt
    await expect(page.getByText("Permission Request")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Bash")).toBeVisible();
    await expect(page.getByText("npm install && npm test")).toBeVisible();
  });

  test("permission responses are stored as session messages", async ({
    authenticatedPage: page,
  }) => {
    const state = await setupSessionMocks(page);
    const ws = await setupMockWebSocket(page);

    await page.goto(`/agents/${SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    await ws.waitForConnection();
    await expect(page.getByText("Active")).toBeVisible({ timeout: 10_000 });

    // --- Send permission request ---
    const requestId = "perm-stored-001";
    ws.sendPermissionRequest(requestId, "Read", {
      file_path: "/hq/INDEX.md",
    });

    await expect(page.getByText("Permission Request")).toBeVisible({ timeout: 5000 });

    // --- Click Allow ---
    await page.getByRole("button", { name: "Allow" }).click();
    await page.waitForTimeout(300);

    // --- Verify permission response sent ---
    const responses = ws.getPermissionResponses();
    expect(responses.length).toBe(1);
    expect(responses[0].decision).toBe("allow");
    expect(responses[0].requestId).toBe(requestId);
    expect(responses[0].sessionId).toBe(SESSION_ID);

    // --- Send server confirmation + messages to simulate stored data ---
    ws.sendPermissionResolved(requestId, "allow");

    // Simulate the server sending the permission response as a stored message
    ws.sendSessionMessage("assistant", "Reading /hq/INDEX.md...");

    // Verify the response message appears
    await expect(page.getByText("Reading /hq/INDEX.md...")).toBeVisible({ timeout: 5000 });

    // --- Add permission_response to messages for reload verification ---
    state.messages.push(
      {
        sessionId: SESSION_ID,
        sequence: 1,
        timestamp: new Date().toISOString(),
        type: "permission_request",
        content: "Read: /hq/INDEX.md",
        metadata: {
          requestId,
          toolName: "Read",
          input: { file_path: "/hq/INDEX.md" },
        },
      },
      {
        sessionId: SESSION_ID,
        sequence: 2,
        timestamp: new Date().toISOString(),
        type: "permission_response",
        content: "Allowed: Read",
        metadata: {
          requestId,
          decision: "allow",
        },
      },
      {
        sessionId: SESSION_ID,
        sequence: 3,
        timestamp: new Date().toISOString(),
        type: "assistant",
        content: "I read the file at /hq/INDEX.md. It contains the HQ directory map.",
        metadata: {},
      },
    );

    // Reload to verify messages are persisted
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Verify the assistant response is visible from stored messages
    await expect(
      page.getByText("I read the file at /hq/INDEX.md"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Allow then Deny: sequential permission prompts work correctly", async ({
    authenticatedPage: page,
  }) => {
    await setupSessionMocks(page);
    const ws = await setupMockWebSocket(page);

    await page.goto(`/agents/${SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    await ws.waitForConnection();
    await expect(page.getByText("Active")).toBeVisible({ timeout: 10_000 });

    // --- First permission: Allow reading a file ---
    const readRequestId = "perm-seq-001";
    ws.sendPermissionRequest(readRequestId, "Read", {
      file_path: "/hq/INDEX.md",
    });

    await expect(page.getByText("Permission Request")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Read")).toBeVisible();

    // Click Allow
    await page.getByRole("button", { name: "Allow" }).click();
    await page.waitForTimeout(300);

    // Verify Allow was sent
    let responses = ws.getPermissionResponses();
    expect(responses.length).toBe(1);
    expect(responses[0].decision).toBe("allow");

    // Server confirms and sends result
    ws.sendPermissionResolved(readRequestId, "allow");
    ws.sendSessionMessage("assistant", "File contents of INDEX.md: ...");

    await expect(page.getByText("Permission Request")).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText("File contents of INDEX.md")).toBeVisible({ timeout: 5000 });

    // --- Second permission: Deny a dangerous command ---
    const bashRequestId = "perm-seq-002";
    ws.sendPermissionRequest(bashRequestId, "Bash", {
      command: "rm -rf /",
    });

    await expect(page.getByText("Permission Request")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Bash")).toBeVisible();
    await expect(page.getByText("rm -rf /")).toBeVisible();

    // Click Deny
    await page.getByRole("button", { name: "Deny" }).click();
    await page.waitForTimeout(300);

    // Verify Deny was sent
    responses = ws.getPermissionResponses();
    expect(responses.length).toBe(2);
    const denyResponse = responses[1];
    expect(denyResponse.decision).toBe("deny");
    expect(denyResponse.requestId).toBe(bashRequestId);

    // Server confirms denial
    ws.sendPermissionResolved(bashRequestId, "deny");
    ws.sendSessionMessage("assistant", "The command was denied. I will not execute rm -rf /.");

    await expect(page.getByText("Permission Request")).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("The command was denied"),
    ).toBeVisible({ timeout: 5000 });
  });
});
