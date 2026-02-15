/**
 * E2E-004: Session Stop — Create session, stop it, verify lifecycle transitions
 *
 * This test launches a REAL ECS Fargate container running Claude Code,
 * waits for it to become active, then stops it and verifies the full
 * stop lifecycle including status transitions, timestamps, and cleanup.
 *
 * Flow:
 * 1. Sign in via Clerk (clerk-auth fixture)
 * 2. Navigate to /agents page
 * 3. Type a prompt in the GlobalInputBar and submit
 * 4. Wait for redirect to /agents/{sessionId}
 * 5. Wait for status to become "Active" (up to 180s)
 * 6. Click the Stop button in session detail header
 * 7. Verify status transitions: Active -> Stopping... -> Stopped
 * 8. Verify "This session has ended." text appears
 * 9. Verify elapsed time is displayed (stoppedAt timestamp set)
 * 10. Navigate to /agents list and verify no orphaned active sessions
 *
 * ============================================================================
 * PREREQUISITES — same as E2E-002 (see session-launch.spec.ts header)
 * ============================================================================
 *
 * Run:
 *   npx playwright test e2e/session-stop.spec.ts
 *
 * With headed browser (useful for debugging):
 *   npx playwright test e2e/session-stop.spec.ts --headed
 */

import { test, expect } from "./fixtures/clerk-auth";

// Unique prefix for sessions created by this test (used for orphan detection)
const TEST_PREFIX = "E2E-004";

// 5 minute overall timeout — ECS cold start + stop lifecycle
test.describe("E2E-004: Session Stop Lifecycle", () => {
  test.setTimeout(300_000);

  let createdSessionId: string | null = null;
  let createdSessionUrl: string | null = null;

  test.afterEach(async ({ clerkPage: page }) => {
    // Safety net: if the test failed mid-way and the session is still active, stop it
    if (createdSessionUrl) {
      try {
        if (!page.url().includes(createdSessionUrl.split("/agents/")[1] ?? "")) {
          await page.goto(createdSessionUrl);
        }

        const stopButton = page.getByRole("button", { name: /^Stop$/ });
        if (await stopButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await stopButton.click();
          // Wait for stop to take effect
          const stoppedLabel = page.getByText("Stopped");
          await stoppedLabel.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
        }
      } catch {
        // Best-effort cleanup — page may be closed
      }
      createdSessionUrl = null;
      createdSessionId = null;
    }
  });

  test("stops an active session and verifies full stop lifecycle", async ({
    clerkPage: page,
  }) => {
    // ---------------------------------------------------------------
    // Step 1: Navigate to /agents page
    // ---------------------------------------------------------------
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // Wait for the page to fully load
    const sessionsHeader = page.getByText("Sessions");
    const emptyState = page.getByText("No sessions yet");
    await expect(
      sessionsHeader.or(emptyState).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ---------------------------------------------------------------
    // Step 2: Create a session via GlobalInputBar
    // ---------------------------------------------------------------
    const testPrompt = `${TEST_PREFIX} stop test ${Date.now()}`;

    const inputBar = page.getByPlaceholder("Start a new session...");
    await expect(inputBar).toBeVisible({ timeout: 10_000 });
    await inputBar.fill(testPrompt);

    const sendButton = page.getByRole("button", { name: "Send" });
    await expect(sendButton).toBeVisible({ timeout: 5_000 });
    await sendButton.click();

    // ---------------------------------------------------------------
    // Step 3: Wait for redirect to /agents/{sessionId}
    // ---------------------------------------------------------------
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 30_000 });

    createdSessionUrl = page.url();
    createdSessionId = page.url().match(/\/agents\/([0-9a-f-]{36})/)?.[1] ?? null;
    expect(createdSessionId).toBeTruthy();

    // ---------------------------------------------------------------
    // Step 4: Verify initial status is "Starting..." or "Active"
    // ---------------------------------------------------------------
    const startingLabel = page.getByText("Starting...");
    const activeLabel = page.getByText("Active");

    await expect(
      startingLabel.or(activeLabel).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Verify the prompt appears in the session header
    const promptInHeader = page.getByText(testPrompt.slice(0, 50), { exact: false });
    await expect(promptInHeader.first()).toBeVisible({ timeout: 10_000 });

    // ---------------------------------------------------------------
    // Step 5: Wait for session to become "Active" (up to 180s)
    // ---------------------------------------------------------------
    const isAlreadyActive = await activeLabel.isVisible({ timeout: 1_000 }).catch(() => false);

    if (!isAlreadyActive) {
      // Wait for the "Active" status label — ECS cold start can take 30-90s
      await expect(activeLabel).toBeVisible({ timeout: 180_000 });
    }

    // Confirm the Stop button is visible before clicking
    const stopButton = page.getByRole("button", { name: /^Stop$/ });
    await expect(stopButton).toBeVisible({ timeout: 5_000 });

    // The chat input should be visible for an active session
    const chatInput = page.getByPlaceholder("Send a message to Claude...");
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    // ---------------------------------------------------------------
    // Step 6: Click the Stop button
    // ---------------------------------------------------------------
    await stopButton.click();

    // ---------------------------------------------------------------
    // Step 7: Verify status transitions: Active -> Stopping... -> Stopped
    // ---------------------------------------------------------------
    // After clicking Stop, the button label briefly shows "Stopping..."
    // and the session status should transition through "Stopping..." to "Stopped"
    const stoppingLabel = page.getByText("Stopping...");
    const stoppedLabel = page.getByText("Stopped");

    // First, verify we see either "Stopping..." or "Stopped"
    // (the transition through "Stopping..." may be very fast)
    await expect(
      stoppingLabel.or(stoppedLabel).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Eventually, the session must reach "Stopped"
    await expect(stoppedLabel).toBeVisible({ timeout: 30_000 });

    // ---------------------------------------------------------------
    // Step 8: Verify "This session has ended." text appears
    // ---------------------------------------------------------------
    const endedText = page.getByText("This session has ended.");
    await expect(endedText).toBeVisible({ timeout: 10_000 });

    // The chat input should no longer be visible (replaced by ended message)
    await expect(chatInput).not.toBeVisible();

    // The Stop and Interrupt buttons should no longer be visible
    await expect(stopButton).not.toBeVisible();
    const interruptButton = page.getByRole("button", { name: "Interrupt" });
    await expect(interruptButton).not.toBeVisible();

    // ---------------------------------------------------------------
    // Step 9: Verify elapsed time is displayed (stoppedAt is set)
    // ---------------------------------------------------------------
    // When a session is stopped, the formatElapsed function uses stoppedAt
    // instead of Date.now(), producing a fixed elapsed time string.
    // The elapsed time appears as "Xs", "Xm", or "Xh Ym" in the header.
    // We verify it's present by checking for the time pattern.
    const elapsedTimePattern = page.locator("text=/\\d+[smh]/");
    await expect(elapsedTimePattern.first()).toBeVisible({ timeout: 5_000 });

    // ---------------------------------------------------------------
    // Step 10: Navigate back to sessions list and verify no orphans
    // ---------------------------------------------------------------
    // Go back to the sessions list
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    // Wait for page to load
    await expect(
      page.getByText("Sessions").or(page.getByText("No sessions yet")).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Check that there are no active sessions from this test run
    // The "Active" section heading shows count: "Active (N)"
    // Our test session should be in the "Recent" section now, not "Active"
    const activeSection = page.locator("text=/Active \\(\\d+\\)/");

    if (await activeSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // If there's an Active section, verify our test session isn't in it
      // by checking that no active session card contains our test prefix
      const activeSessionCards = page.locator(
        `text=${TEST_PREFIX}`
      ).locator("xpath=ancestor::*[contains(@class, 'space-y-3')]//preceding-sibling::*[contains(text(), 'Active')]");

      // This is a best-effort check — if the card text is visible in the Active
      // section, there's an orphan
      const orphanCount = await activeSessionCards.count().catch(() => 0);
      expect(orphanCount).toBe(0);
    }

    // The stopped session should appear in the "Recent" section
    const stoppedSessionCard = page.getByText(testPrompt.slice(0, 50), { exact: false });
    await expect(stoppedSessionCard.first()).toBeVisible({ timeout: 10_000 });

    // Mark cleanup as done — session is already stopped
    createdSessionUrl = null;
    createdSessionId = null;
  });
});
