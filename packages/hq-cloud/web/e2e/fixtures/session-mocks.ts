/**
 * Session E2E Mock Helpers
 *
 * Provides API route mocking for session-related endpoints
 * used in Playwright E2E tests. These mocks intercept browser
 * HTTP requests to the session API.
 */

import type { Page } from "@playwright/test";
import type { Session, SessionMessage } from "../../src/types/session";

const API_BASE = "**/api";

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  const now = new Date().toISOString();
  return {
    sessionId: `session-${Date.now()}`,
    userId: "test-user",
    status: "starting",
    ecsTaskArn: null,
    initialPrompt: null,
    workerContext: null,
    messageCount: 0,
    createdAt: now,
    lastActivityAt: now,
    stoppedAt: null,
    error: null,
    ...overrides,
  };
}

export function makeSessionMessage(
  overrides: Partial<SessionMessage> = {},
): SessionMessage {
  return {
    sessionId: "test-session",
    sequence: Date.now(),
    timestamp: new Date().toISOString(),
    type: "assistant",
    content: "Hello from Claude",
    metadata: {},
    ...overrides,
  };
}

/**
 * Mock the sessions API endpoints:
 * - POST /api/sessions (create)
 * - GET /api/sessions (list)
 * - GET /api/sessions/:id (detail)
 * - GET /api/sessions/:id/messages (messages)
 * - DELETE /api/sessions/:id (stop)
 */
export async function mockSessionsApi(
  page: Page,
  sessions: Session[],
  opts: {
    messages?: SessionMessage[];
    createResult?: Session;
    stopResult?: { ok: boolean; status: string };
  } = {},
): Promise<void> {
  const { messages = [], createResult, stopResult } = opts;

  // POST /api/sessions — create a new session
  await page.route(`${API_BASE}/sessions`, (route) => {
    if (route.request().method() === "POST") {
      const result = createResult ?? makeSession({ status: "starting" });
      return route.fulfill(json(result, 201));
    }
    // GET /api/sessions — list
    if (route.request().method() === "GET") {
      return route.fulfill(json(sessions));
    }
    return route.continue();
  });

  // GET /api/sessions/:id — detail
  await page.route(`${API_BASE}/sessions/*`, (route) => {
    const url = route.request().url();

    // Skip sub-paths like /messages
    if (/\/sessions\/[^/]+\/messages/.test(url)) {
      return route.continue();
    }

    // DELETE /api/sessions/:id — stop
    if (route.request().method() === "DELETE") {
      return route.fulfill(
        json(stopResult ?? { ok: true, status: "stopped" }),
      );
    }

    if (route.request().method() !== "GET") return route.continue();

    const id = url.split("/sessions/").pop()?.split("?")[0];
    const session = sessions.find((s) => s.sessionId === id);
    if (session) return route.fulfill(json(session));
    return route.fulfill(json({ error: "Not found" }, 404));
  });

  // GET /api/sessions/:id/messages — messages
  await page.route(`${API_BASE}/sessions/*/messages`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(json(messages));
    }
    return route.continue();
  });
}
