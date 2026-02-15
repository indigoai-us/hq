/**
 * SM-009: E2E Test — Session Lifecycle
 *
 * Tests the full session lifecycle flow through the web UI:
 * 1. Navigate to sessions page
 * 2. Create a new session (via New Session button or quick input)
 * 3. Session status transitions: starting -> active
 * 4. Send a prompt ("What is 2+2?")
 * 5. Receive assistant response
 * 6. Stop session via UI
 * 7. Session status goes to stopped
 * 8. Clean up
 *
 * This test runs with mocked API endpoints (no real backend needed).
 * WebSocket events are simulated by injecting messages into the page context.
 * For full integration tests with real API + mock container, see
 * e2e/integration/session-lifecycle.spec.ts
 */

import { test, expect } from "./fixtures/auth";
import {
  mockSessionsApi,
  makeSession,
  makeSessionMessage,
} from "./fixtures/session-mocks";
import { mockAuthApi } from "./fixtures/api-mocks";

test.describe("Session lifecycle (mocked API)", () => {
  test.setTimeout(60_000);

  const SESSION_ID = "test-session-lifecycle-001";

  test("full lifecycle: create session, send prompt, receive response, stop", async ({
    authenticatedPage: page,
  }) => {
    // --- Setup: Create session data ---
    const session = makeSession({
      sessionId: SESSION_ID,
      status: "starting",
      initialPrompt: "What is 2+2?",
    });

    const activeSession = {
      ...session,
      status: "active" as const,
    };

    const stoppedSession = {
      ...session,
      status: "stopped" as const,
      stoppedAt: new Date().toISOString(),
    };

    // Track which session state to return
    let currentSession = session;
    let sessionMessages: Array<{
      sessionId: string;
      sequence: number;
      timestamp: string;
      type: string;
      content: string;
      metadata: Record<string, unknown>;
    }> = [];

    // --- Mock API routes ---

    // POST /api/sessions — create
    await page.route("**/api/sessions", (route) => {
      if (route.request().method() === "POST") {
        currentSession = { ...session, status: "starting" };
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(currentSession),
        });
      }
      // GET /api/sessions — list
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([currentSession]),
      });
    });

    // GET /api/sessions/:id
    await page.route(`**/api/sessions/${SESSION_ID}`, (route) => {
      const url = route.request().url();
      // Skip sub-paths
      if (/\/messages/.test(url)) return route.continue();

      if (route.request().method() === "DELETE") {
        currentSession = stoppedSession;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, status: "stopped" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSession),
      });
    });

    // GET /api/sessions/:id/messages
    await page.route(`**/api/sessions/${SESSION_ID}/messages*`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionMessages),
      });
    });

    // Mock workers API (needed for new session sheet)
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

    // --- Step 1: Navigate to sessions page ---
    await page.goto("/agents");
    await page.waitForLoadState("networkidle");

    // --- Step 2: Create a new session ---
    // Use the quick-create input bar at the bottom
    const globalInput = page.getByPlaceholder("Start a new session...");

    // If the global input is visible, use it. Otherwise use New Session button.
    if (await globalInput.isVisible()) {
      await globalInput.fill("What is 2+2?");
      await globalInput.press("Enter");
    } else {
      // Click New Session button
      const newSessionBtn = page.getByRole("button", { name: /New Session/i });
      if (await newSessionBtn.isVisible()) {
        await newSessionBtn.click();
      }
    }

    // Wait for navigation to session detail page
    await page.waitForURL(/\/agents\//);

    // --- Step 3: Verify session is in "starting" state ---
    // The page should show "Starting..." or "Waiting for Claude Code to connect..."
    const startingIndicator = page.getByText(/Starting|Waiting for Claude/i);
    await expect(startingIndicator.first()).toBeVisible({ timeout: 5000 });

    // --- Step 4: Simulate session becoming active ---
    // Transition session to active
    currentSession = activeSession;

    // Reload to pick up new state
    // (In a real integration test, the WebSocket would push status updates)
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Verify session is active
    await expect(page.getByText("Active")).toBeVisible({ timeout: 5000 });

    // --- Step 5: Send a prompt ---
    // The ChatInput should be visible for active sessions
    const chatInput = page.getByPlaceholder("Send a message to Claude...");
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    await chatInput.fill("What is 2+2?");

    // Add the user message to mocked messages (optimistic UI will show it)
    sessionMessages.push({
      sessionId: SESSION_ID,
      sequence: 1,
      timestamp: new Date().toISOString(),
      type: "user",
      content: "What is 2+2?",
      metadata: {},
    });

    // Click send or press Enter
    const sendButton = page.getByRole("button", { name: "Send" });
    await sendButton.click();

    // The optimistic message should appear in the UI
    await expect(page.getByText("What is 2+2?")).toBeVisible({ timeout: 5000 });

    // --- Step 6: Simulate assistant response ---
    // Add the assistant response to mocked messages
    sessionMessages.push({
      sessionId: SESSION_ID,
      sequence: 2,
      timestamp: new Date().toISOString(),
      type: "assistant",
      content: "The answer is 4.",
      metadata: {},
    });

    // Reload to pick up the assistant response
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Verify assistant response appears
    await expect(page.getByText("The answer is 4.")).toBeVisible({ timeout: 5000 });

    // --- Step 7: Stop session via UI ---
    const stopButton = page.getByRole("button", { name: /Stop/i });
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await stopButton.click();

    // Wait for session to transition to stopped
    // The DELETE call sets currentSession to stoppedSession
    await page.waitForTimeout(500);

    // Reload to pick up stopped state
    await page.reload();
    await page.waitForLoadState("networkidle");

    // --- Step 8: Verify session is stopped ---
    await expect(page.getByText("Stopped")).toBeVisible({ timeout: 5000 });

    // Verify the session ended message appears
    await expect(page.getByText("This session has ended.")).toBeVisible({ timeout: 5000 });

    // Verify the chat input is no longer visible (replaced by "session ended" message)
    const chatInputAfterStop = page.getByPlaceholder("Send a message to Claude...");
    await expect(chatInputAfterStop).not.toBeVisible();
  });

  test("session list shows correct status indicators", async ({
    authenticatedPage: page,
  }) => {
    const activeSess = makeSession({
      sessionId: "sess-active",
      status: "active",
      initialPrompt: "Active task",
    });
    const startingSess = makeSession({
      sessionId: "sess-starting",
      status: "starting",
      initialPrompt: "Starting task",
    });
    const stoppedSess = makeSession({
      sessionId: "sess-stopped",
      status: "stopped",
      initialPrompt: "Stopped task",
      stoppedAt: new Date().toISOString(),
    });

    await mockSessionsApi(page, [activeSess, startingSess, stoppedSess]);

    await page.route("**/api/settings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );
    await page.route("**/api/user-settings*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );

    await page.goto("/agents");
    await page.waitForLoadState("networkidle");

    // Verify session cards are shown
    await expect(page.getByText("Active task")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Starting task")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Stopped task")).toBeVisible({ timeout: 5000 });

    // Verify status labels
    await expect(page.getByText("Active").first()).toBeVisible();
    await expect(page.getByText("Starting...")).toBeVisible();
    await expect(page.getByText("Stopped").first()).toBeVisible();
  });

  test("empty state shows start session prompt", async ({
    authenticatedPage: page,
  }) => {
    await mockSessionsApi(page, []);

    await page.route("**/api/settings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );
    await page.route("**/api/user-settings*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );

    await page.goto("/agents");
    await page.waitForLoadState("networkidle");

    // Verify empty state
    await expect(page.getByText("No sessions yet")).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("button", { name: /Start Session/i }),
    ).toBeVisible();
  });

  test("clicking session card navigates to detail page", async ({
    authenticatedPage: page,
  }) => {
    const sess = makeSession({
      sessionId: "sess-nav-test",
      status: "active",
      initialPrompt: "Navigation test session",
    });

    await mockSessionsApi(page, [sess], {
      messages: [],
    });

    await page.route("**/api/settings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );
    await page.route("**/api/user-settings*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );

    await page.goto("/agents");
    await page.waitForLoadState("networkidle");

    // Click the session card
    await page.getByText("Navigation test session").click();

    // Verify navigation to detail page
    await expect(page).toHaveURL(/\/agents\/sess-nav-test/);
  });

  test("stopped session shows ended message and no input", async ({
    authenticatedPage: page,
  }) => {
    const sess = makeSession({
      sessionId: "sess-stopped-detail",
      status: "stopped",
      initialPrompt: "Stopped session",
      stoppedAt: new Date().toISOString(),
    });

    const messages = [
      makeSessionMessage({
        sessionId: "sess-stopped-detail",
        type: "user",
        content: "What is 2+2?",
        sequence: 1,
      }),
      makeSessionMessage({
        sessionId: "sess-stopped-detail",
        type: "assistant",
        content: "The answer is 4.",
        sequence: 2,
      }),
    ];

    await mockSessionsApi(page, [sess], { messages });

    await page.route("**/api/settings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );
    await page.route("**/api/user-settings*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );

    await page.goto("/agents/sess-stopped-detail");
    await page.waitForLoadState("networkidle");

    // Verify session ended state
    await expect(page.getByText("Stopped")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("This session has ended.")).toBeVisible({ timeout: 5000 });

    // Chat input should not be visible
    const chatInput = page.getByPlaceholder("Send a message to Claude...");
    await expect(chatInput).not.toBeVisible();

    // But messages should be visible
    await expect(page.getByText("What is 2+2?")).toBeVisible();
    await expect(page.getByText("The answer is 4.")).toBeVisible();
  });

  test("active session shows Stop and Interrupt buttons", async ({
    authenticatedPage: page,
  }) => {
    const sess = makeSession({
      sessionId: "sess-active-buttons",
      status: "active",
      initialPrompt: "Active session with controls",
    });

    await mockSessionsApi(page, [sess], { messages: [] });

    await page.route("**/api/settings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );
    await page.route("**/api/user-settings*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupComplete: true }),
      }),
    );

    await page.goto("/agents/sess-active-buttons");
    await page.waitForLoadState("networkidle");

    // Verify session controls
    await expect(page.getByRole("button", { name: /Stop/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /Interrupt/i })).toBeVisible({ timeout: 5000 });

    // Verify chat input is visible
    const chatInput = page.getByPlaceholder("Send a message to Claude...");
    await expect(chatInput).toBeVisible();
  });
});
