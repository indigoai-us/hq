/**
 * E2E-003: Session Interaction — Send prompt, receive response, verify S3 file
 *
 * This test creates a REAL session with an ECS Fargate container running Claude Code,
 * sends a follow-up prompt to create a file, waits for the assistant response,
 * and then verifies the file was written to S3 with the expected content.
 *
 * Flow:
 * 1. Sign in via Clerk (clerk-auth fixture)
 * 2. Navigate to /agents page
 * 3. Create a session via GlobalInputBar (same as E2E-002)
 * 4. Wait for session to become Active (up to 180s)
 * 5. Send a follow-up prompt via ChatInput: create a file at test-e2e/verification.txt
 * 6. Wait for assistant response (SessionMessageBubble with data-testid="session-message-assistant")
 * 7. Verify assistant response indicates success (mentions file creation)
 * 8. Verify the file exists in S3 via GetObjectCommand
 * 9. Verify the file content matches expected text
 * 10. Clean up: delete the test file from S3, stop the session
 *
 * ============================================================================
 * PREREQUISITES — Same as E2E-002 (see session-launch.spec.ts)
 * ============================================================================
 *
 * Additionally requires AWS credentials configured (via env or ~/.aws/credentials)
 * for S3 read/delete access to:
 *   s3://hq-cloud-files-dev/user_2aTNqPrNvBHP5kU4pWXwW6N0SAT/hq/test-e2e/verification.txt
 *
 * Run:
 *   npx playwright test e2e/session-interact.spec.ts
 *
 * With headed browser (useful for debugging):
 *   npx playwright test e2e/session-interact.spec.ts --headed
 */

import { test, expect } from "./fixtures/clerk-auth";
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const S3_BUCKET = "hq-cloud-files-dev";
const S3_REGION = "us-east-1";
const CLERK_USER_ID = "user_2aTNqPrNvBHP5kU4pWXwW6N0SAT";
const S3_KEY_PREFIX = `${CLERK_USER_ID}/hq/test-e2e`;

const s3 = new S3Client({ region: S3_REGION });

/**
 * Helper: read an object from S3 and return its body as a string.
 * Returns null if the object does not exist.
 */
async function readS3Object(key: string): Promise<string | null> {
  try {
    const resp = await s3.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    );
    return (await resp.Body?.transformToString()) ?? null;
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "NoSuchKey"
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Helper: delete an object from S3. Silently succeeds if key does not exist.
 */
async function deleteS3Object(key: string): Promise<void> {
  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    );
  } catch {
    // Best-effort cleanup
  }
}

test.describe("E2E-003: Session Interaction", () => {
  // Overall timeout: 6 minutes (180s startup + 60s prompt + buffer)
  test.setTimeout(360_000);

  const timestamp = Date.now();
  const expectedFileContent = `e2e-test-${timestamp}`;
  const s3Key = `${S3_KEY_PREFIX}/verification.txt`;

  let createdSessionUrl: string | null = null;

  test.afterAll(async () => {
    // Clean up the test file from S3 regardless of test outcome
    await deleteS3Object(s3Key);
  });

  test.afterEach(async ({ clerkPage: page }) => {
    // Clean up: stop the session if it was created
    if (createdSessionUrl) {
      try {
        if (!page.url().includes(createdSessionUrl.split("/agents/")[1] ?? "")) {
          await page.goto(createdSessionUrl);
        }

        const stopButton = page.getByRole("button", { name: /^Stop$/ });
        if (await stopButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await stopButton.click();
          await page.waitForTimeout(2_000);
        }
      } catch {
        // Best-effort cleanup
      }
      createdSessionUrl = null;
    }
  });

  test("sends prompt to active session, receives response, verifies S3 file", async ({
    clerkPage: page,
  }) => {
    // =================================================================
    // Step 1: Navigate to /agents
    // =================================================================
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents/, { timeout: 15_000 });

    const sessionsHeader = page.getByText("Sessions");
    const emptyState = page.getByText("No sessions yet");
    await expect(
      sessionsHeader.or(emptyState).first(),
    ).toBeVisible({ timeout: 15_000 });

    // =================================================================
    // Step 2: Create a session via GlobalInputBar
    // =================================================================
    const initialPrompt = `E2E-003 interaction test ${timestamp}`;

    const inputBar = page.getByPlaceholder("Start a new session...");
    await expect(inputBar).toBeVisible({ timeout: 10_000 });
    await inputBar.fill(initialPrompt);

    const sendButton = page.getByRole("button", { name: "Send" });
    await expect(sendButton).toBeVisible({ timeout: 5_000 });
    await sendButton.click();

    // =================================================================
    // Step 3: Wait for redirect to /agents/{sessionId}
    // =================================================================
    await expect(page).toHaveURL(/\/agents\/[0-9a-f-]{36}/, { timeout: 30_000 });
    createdSessionUrl = page.url();
    const sessionId = page.url().match(/\/agents\/([0-9a-f-]{36})/)?.[1];
    expect(sessionId).toBeTruthy();

    // =================================================================
    // Step 4: Wait for session to become Active (up to 180s)
    // =================================================================
    const startingLabel = page.getByText("Starting...");
    const activeLabel = page.getByText("Active");

    await expect(
      startingLabel.or(activeLabel).first(),
    ).toBeVisible({ timeout: 15_000 });

    const isAlreadyActive = await activeLabel
      .isVisible({ timeout: 1_000 })
      .catch(() => false);

    if (!isAlreadyActive) {
      await expect(activeLabel).toBeVisible({ timeout: 180_000 });
    }

    // Wait for the chat input to appear (signals session is truly active)
    const chatInput = page.getByPlaceholder("Send a message to Claude...");
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    // =================================================================
    // Step 5: Wait for Claude to finish processing the initial prompt
    // =================================================================
    // The initial prompt was already sent when creating the session.
    // We need to wait for Claude to finish responding before sending ours.
    // Wait for at least one assistant message to appear (response to initial prompt)
    const assistantMessage = page.locator("[data-testid='session-message-assistant']");
    const streamingIndicator = page.locator("[data-testid='streaming-indicator']");

    // Wait for either streaming or a completed assistant message (up to 120s)
    await expect(
      streamingIndicator.or(assistantMessage.first()).first(),
    ).toBeVisible({ timeout: 120_000 });

    // If streaming is active, wait for it to finish (stream indicator disappears)
    // We poll: once streaming stops and an assistant message is present, we can proceed
    await page.waitForFunction(
      () => {
        const streaming = document.querySelector("[data-testid='streaming-indicator']");
        const messages = document.querySelectorAll("[data-testid='session-message-assistant']");
        return !streaming && messages.length > 0;
      },
      { timeout: 120_000 },
    );

    // =================================================================
    // Step 6: Send the file creation prompt via ChatInput
    // =================================================================
    const filePrompt =
      `Create a file at test-e2e/verification.txt with the content: ${expectedFileContent}`;

    // The ChatInput uses a textarea
    await chatInput.fill(filePrompt);

    // Click the Send button in the ChatInput (second "Send" button on the page — the one in the input area)
    const chatSendButton = page
      .locator(".border-t")
      .getByRole("button", { name: "Send" });
    await expect(chatSendButton).toBeEnabled({ timeout: 5_000 });
    await chatSendButton.click();

    // Verify our user message appeared in the chat
    const userMessage = page.locator("[data-testid='session-message-user']");
    await expect(
      userMessage.filter({ hasText: "test-e2e/verification.txt" }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // =================================================================
    // Step 7: Wait for assistant response to our file creation prompt
    // =================================================================
    // We need a NEW assistant message (after our user message).
    // Count existing assistant messages, then wait for count to increase.
    const initialAssistantCount = await assistantMessage.count();

    // Wait for a new assistant message to appear (Claude responds to our prompt)
    // This may take up to 60s as Claude processes the request
    await page.waitForFunction(
      (prevCount) => {
        const streaming = document.querySelector("[data-testid='streaming-indicator']");
        const messages = document.querySelectorAll("[data-testid='session-message-assistant']");
        return !streaming && messages.length > prevCount;
      },
      initialAssistantCount,
      { timeout: 120_000 },
    );

    // =================================================================
    // Step 8: Verify the assistant response indicates success
    // =================================================================
    // Get the last assistant message (the response to our file creation prompt)
    const lastAssistant = assistantMessage.last();
    await expect(lastAssistant).toBeVisible({ timeout: 5_000 });

    // The response should mention file creation success.
    // Claude typically says something like "created", "written", "file", etc.
    const responseText = await lastAssistant.textContent();
    expect(responseText).toBeTruthy();

    // Flexible check: response should reference the file or indicate success
    const successIndicators = [
      "created",
      "written",
      "file",
      "verification.txt",
      "test-e2e",
      "successfully",
      "done",
      "complete",
    ];
    const hasSuccessIndicator = successIndicators.some((indicator) =>
      responseText!.toLowerCase().includes(indicator),
    );
    expect(
      hasSuccessIndicator,
      `Expected assistant response to indicate file creation success. Got: "${responseText?.slice(0, 200)}"`,
    ).toBe(true);

    // =================================================================
    // Step 9: Verify file exists in S3 with correct content
    // =================================================================
    // Give S3 sync a moment to propagate (file-sync writes on container exit or periodically)
    // The container writes directly to S3, so it should be near-instant.
    // We retry a few times with a short delay.
    let fileContent: string | null = null;
    const maxRetries = 10;
    const retryDelay = 3_000; // 3 seconds between retries

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      fileContent = await readS3Object(s3Key);
      if (fileContent !== null) break;
      // Wait before retrying
      await page.waitForTimeout(retryDelay);
    }

    expect(
      fileContent,
      `Expected file to exist in S3 at ${S3_BUCKET}/${s3Key} after ${maxRetries} retries`,
    ).not.toBeNull();

    // =================================================================
    // Step 10: Verify file content matches
    // =================================================================
    expect(fileContent!.trim()).toBe(expectedFileContent);

    // =================================================================
    // Step 11: Clean up — stop the session
    // =================================================================
    const stopButton = page.getByRole("button", { name: /^Stop$/ });
    await stopButton.click();

    const stoppingLabel = page.getByText("Stopping...");
    const stoppedLabel = page.getByText("Stopped");
    await expect(
      stoppingLabel.or(stoppedLabel).first(),
    ).toBeVisible({ timeout: 30_000 });

    await expect(stoppedLabel).toBeVisible({ timeout: 30_000 });

    // Mark as cleaned up so afterEach doesn't try again
    createdSessionUrl = null;
  });
});
