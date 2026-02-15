/**
 * SM-009: Integration E2E Test — Session Lifecycle
 *
 * Tests the full session lifecycle against the REAL API server
 * with a mock container simulating the Claude Code WebSocket protocol.
 *
 * Architecture:
 * 1. API server runs with SKIP_AUTH=true and MONGODB_URI set
 * 2. Playwright creates a session via POST /api/sessions
 * 3. Mock container connects to /ws/relay/:sessionId via WebSocket
 * 4. Mock container sends system/init -> session becomes active
 * 5. Test sends a prompt via the session relay
 * 6. Mock container responds with assistant message + result
 * 7. Test stops the session via DELETE /api/sessions/:id
 * 8. Verify final state
 *
 * Requires: MONGODB_URI environment variable set for the API server.
 * Run with: npx playwright test --config=playwright.integration.config.ts session-lifecycle
 *
 * CI timeout: 120s (for container provisioning in ECS; mock container is instant)
 */

import { test, expect } from "@playwright/test";
import { WebSocket } from "ws";

const API = "http://127.0.0.1:3002";
const WS_API = "ws://127.0.0.1:3002";

test.describe("Session lifecycle (integration)", () => {
  // 120 second timeout for ECS provisioning; mock container connects instantly
  test.setTimeout(120_000);

  let sessionId: string | null = null;
  let accessToken: string | null = null;

  test.afterEach(async ({ request }) => {
    // Cleanup: stop any running sessions
    if (sessionId) {
      try {
        await request.delete(`${API}/api/sessions/${sessionId}`);
      } catch {
        // Best effort cleanup
      }
      sessionId = null;
      accessToken = null;
    }
  });

  test("create session, mock container connects, send prompt, get response, stop", async ({
    request,
  }) => {
    // --- Step 1: Create a session via API ---
    const createResponse = await request.post(`${API}/api/sessions`, {
      data: {
        prompt: "What is 2+2?",
      },
    });

    // Sessions require MongoDB; skip if not configured
    if (createResponse.status() === 503) {
      test.skip(true, "MongoDB not configured — skipping integration test");
      return;
    }

    expect(createResponse.status()).toBe(201);
    const session = await createResponse.json();
    sessionId = session.sessionId;
    accessToken = session.accessToken;

    expect(sessionId).toBeTruthy();
    expect(session.status).toBe("starting");

    // --- Step 2: Verify session appears in list ---
    const listResponse = await request.get(`${API}/api/sessions`);
    expect(listResponse.ok()).toBe(true);
    const sessions = await listResponse.json();
    const found = sessions.find(
      (s: { sessionId: string }) => s.sessionId === sessionId,
    );
    expect(found).toBeTruthy();
    expect(found.status).toBe("starting");

    // --- Step 3: Connect mock container ---
    const containerWs = new WebSocket(
      `${WS_API}/ws/relay/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Container WS connect timeout")),
        10_000,
      );
      containerWs.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      containerWs.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // --- Step 4: Send system/init (Claude Code initialized) ---
    containerWs.send(
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/hq",
        session_id: sessionId,
        model: "claude-sonnet-4-20250514",
        tools: [{ name: "Read", type: "tool" }],
        mcp_servers: [],
        permission_mode: "default",
        claude_code_version: "1.0.0-mock",
      }) + "\n",
    );

    // Wait a moment for status to update
    await new Promise((r) => setTimeout(r, 500));

    // --- Step 5: Verify session status is now active ---
    const detailResponse = await request.get(
      `${API}/api/sessions/${sessionId}`,
    );
    expect(detailResponse.ok()).toBe(true);
    const activeSession = await detailResponse.json();
    expect(activeSession.status).toBe("active");
    expect(activeSession.capabilities).toBeTruthy();
    expect(activeSession.capabilities.model).toBe("claude-sonnet-4-20250514");

    // --- Step 6: Wait for the initial prompt to arrive at container ---
    // The relay sends the initial prompt ("What is 2+2?") after system/init
    const userMessage = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for user message")),
        10_000,
      );

      containerWs.on("message", (data) => {
        const str = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
        const lines = str.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          try {
            const msg = JSON.parse(line) as Record<string, unknown>;
            if (msg.type === "user") {
              clearTimeout(timeout);
              const message = msg.message as Record<string, unknown>;
              resolve(String(message?.content ?? ""));
            }
          } catch {
            // Ignore
          }
        }
      });
    });

    expect(userMessage).toBe("What is 2+2?");

    // --- Step 7: Send assistant response from container ---
    containerWs.send(
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "The answer is 4." }],
        },
        content: "The answer is 4.",
        session_id: sessionId,
      }) + "\n",
    );

    // --- Step 8: Send result (turn complete) ---
    containerWs.send(
      JSON.stringify({
        type: "result",
        result: "Turn completed",
        result_type: "success",
        subtype: "success",
        duration_ms: 500,
        cost_usd: 0.001,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
      }) + "\n",
    );

    // Wait for messages to be stored
    await new Promise((r) => setTimeout(r, 500));

    // --- Step 9: Verify messages were stored ---
    const messagesResponse = await request.get(
      `${API}/api/sessions/${sessionId}/messages`,
    );
    expect(messagesResponse.ok()).toBe(true);
    const messages = await messagesResponse.json();

    // Should have: user message + assistant message + system (result)
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const userMsg = messages.find(
      (m: { type: string }) => m.type === "user",
    );
    expect(userMsg).toBeTruthy();
    expect(userMsg.content).toBe("What is 2+2?");

    const assistantMsg = messages.find(
      (m: { type: string }) => m.type === "assistant",
    );
    expect(assistantMsg).toBeTruthy();
    expect(assistantMsg.content).toContain("The answer is 4.");

    // --- Step 10: Stop session ---
    const stopResponse = await request.delete(
      `${API}/api/sessions/${sessionId}`,
    );
    expect(stopResponse.ok()).toBe(true);
    const stopResult = await stopResponse.json();
    expect(stopResult.ok).toBe(true);
    expect(stopResult.status).toBe("stopped");

    // --- Step 11: Verify final state ---
    const finalResponse = await request.get(
      `${API}/api/sessions/${sessionId}`,
    );
    expect(finalResponse.ok()).toBe(true);
    const finalSession = await finalResponse.json();
    expect(finalSession.status).toBe("stopped");
    expect(finalSession.stoppedAt).toBeTruthy();

    // Clean up WebSocket
    containerWs.close(1000, "Test complete");

    // Mark as cleaned up
    sessionId = null;
  });

  test("session rejects container with invalid access token", async ({
    request,
  }) => {
    // Create a session
    const createResponse = await request.post(`${API}/api/sessions`, {
      data: { prompt: "test" },
    });

    if (createResponse.status() === 503) {
      test.skip(true, "MongoDB not configured");
      return;
    }

    const session = await createResponse.json();
    sessionId = session.sessionId;

    // Try connecting with wrong token
    const ws = new WebSocket(`${WS_API}/ws/relay/${sessionId}`, {
      headers: {
        Authorization: "Bearer wrong-token",
      },
    });

    const closeCode = await new Promise<number>((resolve) => {
      ws.on("close", (code) => resolve(code));
      ws.on("error", () => {
        // Expected
      });
    });

    // Should be rejected with 4003 (invalid access token)
    expect(closeCode).toBe(4003);
  });

  test("session without auth header is rejected", async ({ request }) => {
    const createResponse = await request.post(`${API}/api/sessions`, {
      data: { prompt: "test" },
    });

    if (createResponse.status() === 503) {
      test.skip(true, "MongoDB not configured");
      return;
    }

    const session = await createResponse.json();
    sessionId = session.sessionId;

    // Try connecting without auth header
    const ws = new WebSocket(`${WS_API}/ws/relay/${sessionId}`);

    const closeCode = await new Promise<number>((resolve) => {
      ws.on("close", (code) => resolve(code));
      ws.on("error", () => {
        // Expected
      });
    });

    // Should be rejected with 4001 (auth required)
    expect(closeCode).toBe(4001);
  });

  test("session rate limit enforced (max 5 concurrent)", async ({
    request,
  }) => {
    const sessionIds: string[] = [];

    // Create 5 sessions
    for (let i = 0; i < 5; i++) {
      const response = await request.post(`${API}/api/sessions`, {
        data: { prompt: `Session ${i + 1}` },
      });

      if (response.status() === 503) {
        test.skip(true, "MongoDB not configured");
        return;
      }

      expect(response.status()).toBe(201);
      const sess = await response.json();
      sessionIds.push(sess.sessionId);
    }

    // 6th session should be rate-limited
    const response = await request.post(`${API}/api/sessions`, {
      data: { prompt: "Session 6" },
    });
    expect(response.status()).toBe(429);
    const errorBody = await response.json();
    expect(errorBody.error).toContain("Too Many");

    // Cleanup: stop all created sessions
    for (const id of sessionIds) {
      await request.delete(`${API}/api/sessions/${id}`);
    }

    // Clear sessionId so afterEach doesn't try to cleanup again
    sessionId = null;
  });
});
