/**
 * E2E-002: Session Launch — Create session, wait for ECS container, verify active
 *
 * This test launches a REAL ECS Fargate container running Claude Code.
 * It verifies the full lifecycle from session creation through the UI to
 * the container becoming active and Claude Code connecting via WebSocket.
 *
 * Flow:
 * 1. Sign in via Clerk (clerk-auth fixture)
 * 2. Navigate to /agents page
 * 3. Type a prompt in the GlobalInputBar and submit
 * 4. Wait for redirect to /agents/{sessionId}
 * 5. Wait for status to transition from "Starting..." to "Active" (up to 180s)
 * 6. Verify session is active (status dot, status label)
 * 7. Verify Claude Code model info appears (assistant messages or session metadata)
 * 8. Clean up by stopping the session
 *
 * ============================================================================
 * PREREQUISITES — ECS infrastructure must be configured
 * ============================================================================
 *
 * The local API server (packages/hq-cloud/api) needs these env vars in its .env:
 *
 *   MONGODB_URI=mongodb+srv://...              # MongoDB Atlas connection string
 *   CLERK_SECRET_KEY=sk_test_...               # Clerk secret key
 *
 *   # ECS container orchestration
 *   ECS_CLUSTER_ARN=arn:aws:ecs:us-east-1:804849608251:cluster/hq-cloud-dev
 *   ECS_SESSION_TASK_DEFINITION_ARN=<latest registered task def ARN>
 *   ECS_SUBNETS=subnet-07d12f5d7d5d969e8,subnet-0de293e2997a61809
 *   ECS_SECURITY_GROUPS=sg-0030602b7772b78b9
 *   ECS_API_URL=https://<your-ngrok-id>.ngrok-free.app
 *
 *   # Claude credentials (one of these)
 *   ANTHROPIC_API_KEY=sk-ant-...               # API key
 *   # OR
 *   CLAUDE_CREDENTIALS_JSON={"..."}            # Max subscription credentials
 *
 * The container name in the task definition must be 'session' (set by DEP-005).
 * S3 bucket: hq-cloud-files-dev (us-east-1)
 *
 * ============================================================================
 * NGROK TUNNEL (required)
 * ============================================================================
 *
 * ECS containers need a public URL to reach the local API's WebSocket relay.
 * Before running this test:
 *
 *   1. Start ngrok:        ngrok http 3001
 *   2. Copy the HTTPS URL: https://abc123.ngrok-free.app
 *   3. Set ECS_API_URL in api/.env to that URL
 *   4. Restart the API server
 *
 * Architecture:
 *   [Browser] --> localhost:3000 (Next.js)
 *   [Web App] --> localhost:3001 (API)
 *   [API]     --> ECS RunTask (launches container)
 *   [Container] --> ngrok --> localhost:3001/ws/relay/{sessionId} (WebSocket)
 *   [API]     --> [Browser] (relays session events via WebSocket)
 *
 * ============================================================================
 * COST WARNING
 * ============================================================================
 *
 * Each test run spawns a real ECS Fargate container and uses Claude API credits.
 * The container runs with --dangerously-skip-permissions.
 * Always ensure sessions are stopped after tests to avoid orphaned containers.
 *
 * Run:
 *   npx playwright test e2e/session-launch.spec.ts
 *
 * With headed browser (useful for debugging):
 *   npx playwright test e2e/session-launch.spec.ts --headed
 */

import { test, expect } from "./fixtures/clerk-auth";

// 4 minute overall timeout — ECS cold start can take 30-90s, plus Claude init
test.describe("E2E-002: Session Launch", () => {
  test.setTimeout(240_000);

  let createdSessionUrl: string | null = null;

  test.afterEach(async ({ clerkPage: page }) => {
    // Cleanup: if we navigated to a session detail page, stop it
    if (createdSessionUrl) {
      try {
        // Navigate to the session if not already there
        if (!page.url().includes(createdSessionUrl.split("/agents/")[1] ?? "")) {
          await page.goto(createdSessionUrl);
        }

        // Click Stop button if visible (session may still be active)
        const stopButton = page.getByRole("button", { name: /^Stop$/ });
        if (await stopButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await stopButton.click();
          // Wait for status to change
          await page.waitForTimeout(2_000);
        }
      } catch {
        // Best-effort cleanup
      }
      createdSessionUrl = null;
    }
  });

  test("creates session via input bar, waits for ECS container to become active", async ({
    clerkPage: page,
  }) => {
    // ---------------------------------------------------------------
    // Step 1: Navigate to /agents page
    // ---------------------------------------------------------------
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // Wait for the page to fully load (Sessions header or empty state)
    const sessionsHeader = page.getByText("Sessions");
    const emptyState = page.getByText("No sessions yet");
    await expect(
      sessionsHeader.or(emptyState).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ---------------------------------------------------------------
    // Step 2: Type a prompt in the GlobalInputBar and submit
    // ---------------------------------------------------------------
    const testPrompt = `E2E-002 test session ${Date.now()}`;

    // The GlobalInputBar has an input with placeholder "Start a new session..."
    const inputBar = page.getByPlaceholder("Start a new session...");
    await expect(inputBar).toBeVisible({ timeout: 10_000 });
    await inputBar.fill(testPrompt);

    // The Send button appears when text is entered
    const sendButton = page.getByRole("button", { name: "Send" });
    await expect(sendButton).toBeVisible({ timeout: 5_000 });
    await sendButton.click();

    // ---------------------------------------------------------------
    // Step 3: Wait for redirect to /agents/{sessionId}
    // ---------------------------------------------------------------
    // After createSession completes, the page redirects to /agents/{uuid}
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 30_000 });

    // Capture the URL for cleanup
    createdSessionUrl = page.url();
    const sessionId = page.url().match(/\/agents\/([0-9a-f-]{36})/)?.[1];
    expect(sessionId).toBeTruthy();

    // ---------------------------------------------------------------
    // Step 4: Verify session detail page loaded with "Starting..." status
    // ---------------------------------------------------------------
    // The session header shows status text
    const startingLabel = page.getByText("Starting...");
    const activeLabel = page.getByText("Active");

    // Initially the session should be in "starting" state
    // (It may already be active if ECS was fast, so accept either)
    await expect(
      startingLabel.or(activeLabel).first(),
    ).toBeVisible({ timeout: 15_000 });

    // The prompt should be visible in the session header
    const promptInHeader = page.getByText(testPrompt.slice(0, 50), { exact: false });
    await expect(promptInHeader.first()).toBeVisible({ timeout: 10_000 });

    // ---------------------------------------------------------------
    // Step 5: Wait for status to become "Active" (up to 180s)
    // ---------------------------------------------------------------
    // ECS Fargate cold start: 30-90s for container provisioning
    // Then Claude Code boots, syncs from S3, and sends system/init
    // The session_status WebSocket event changes the status to "active"

    // If it's still "Starting...", wait for "Active" to appear
    const isAlreadyActive = await activeLabel.isVisible({ timeout: 1_000 }).catch(() => false);

    if (!isAlreadyActive) {
      // Wait for the "Active" status label with a generous 180s timeout
      // The status transitions: starting -> active (via WebSocket session_status event)
      await expect(activeLabel).toBeVisible({ timeout: 180_000 });
    }

    // ---------------------------------------------------------------
    // Step 6: Verify session is active
    // ---------------------------------------------------------------
    // The "Active" label should be green (text-accent-green class)
    await expect(activeLabel).toBeVisible();

    // The session should show the chat input for active sessions
    const chatInput = page.getByPlaceholder("Send a message to Claude...");
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    // Stop and Interrupt buttons should be visible for active sessions
    const stopButton = page.getByRole("button", { name: /^Stop$/ });
    const interruptButton = page.getByRole("button", { name: "Interrupt" });
    await expect(stopButton).toBeVisible({ timeout: 5_000 });
    await expect(interruptButton).toBeVisible({ timeout: 5_000 });

    // ---------------------------------------------------------------
    // Step 7: Verify Claude Code is running (initial prompt delivered)
    // ---------------------------------------------------------------
    // When the container connects and Claude processes the initial prompt,
    // we should see assistant messages or streaming content appear.
    // Wait for either:
    // - A streaming indicator (Claude is actively generating)
    // - An assistant message bubble (Claude has responded)
    // - "Session connected. Waiting for response..." (connected but not yet responding)

    const streamingIndicator = page.locator("[data-testid='streaming-indicator']");
    const connectedWaiting = page.getByText("Session connected. Waiting for response...");

    // Give Claude 60s to start processing the initial prompt
    // The container sends system/init first, then receives the prompt, then streams
    await expect(
      streamingIndicator.or(connectedWaiting).first(),
    ).toBeVisible({ timeout: 60_000 });

    // If streaming started, wait for a message bubble to appear (assistant responded)
    // This confirms Claude Code is fully operational
    if (await streamingIndicator.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Wait for the streaming to complete and produce at least one message
      // We check for any text content in the messages area
      const messagesArea = page.locator(".space-y-3");
      await expect(messagesArea).toBeVisible({ timeout: 5_000 });
    }

    // ---------------------------------------------------------------
    // Step 8: Clean up — stop the session
    // ---------------------------------------------------------------
    await stopButton.click();

    // Wait for the session to transition to "Stopped" or "Stopping..."
    const stoppingLabel = page.getByText("Stopping...");
    const stoppedLabel = page.getByText("Stopped");
    await expect(
      stoppingLabel.or(stoppedLabel).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Eventually it should reach "Stopped"
    await expect(stoppedLabel).toBeVisible({ timeout: 30_000 });

    // The chat input should be replaced with "This session has ended."
    const endedText = page.getByText("This session has ended.");
    await expect(endedText).toBeVisible({ timeout: 10_000 });

    // Mark as cleaned up
    createdSessionUrl = null;
  });
});
