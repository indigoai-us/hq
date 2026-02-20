/**
 * Relay E2E Integration Test
 *
 * Tests the full WebSocket relay flow with a real API server:
 * 1. Create a session via REST API
 * 2. Connect as browser via WebSocket, subscribe to session
 * 3. Connect as container via WebSocket relay
 * 4. Browser sends initial prompt to container immediately on connect
 * 5. Container sends system/init → browser receives startup phases
 * 6. Container sends assistant message → browser receives it (wrapped)
 * 7. Browser sends user message → container receives it
 *
 * Protocol note: Claude Code expects to receive a user message BEFORE
 * sending system/init. The relay sends the initial prompt on container
 * connect, then container responds with system/init.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';
import { resetRelays } from '../ws/session-relay.js';

// Mock Clerk auth to accept any token
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));

// Mock MongoDB operations for sessions
const mockSessions = new Map<string, Record<string, unknown>>();
const mockMessages: Record<string, unknown>[] = [];

vi.mock('../data/sessions.js', () => ({
  createSession: vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
    const session = {
      sessionId: input.sessionId,
      userId: input.userId,
      status: 'starting',
      ecsTaskArn: null,
      accessToken: input.accessToken ?? null,
      initialPrompt: input.initialPrompt ?? null,
      workerContext: input.workerContext ?? null,
      messageCount: 0,
      capabilities: null,
      resultStats: null,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      stoppedAt: null,
      error: null,
    };
    mockSessions.set(session.sessionId as string, session);
    return session;
  }),
  getSession: vi.fn().mockImplementation(async (sessionId: string) => {
    return mockSessions.get(sessionId) ?? null;
  }),
  validateSessionAccessToken: vi.fn().mockImplementation(async (sessionId: string, accessToken: string) => {
    const session = mockSessions.get(sessionId);
    if (!session || session.accessToken !== accessToken) return null;
    return session;
  }),
  listUserSessions: vi.fn().mockImplementation(async (userId: string) => {
    return Array.from(mockSessions.values()).filter((s) => s.userId === userId);
  }),
  updateSessionStatus: vi.fn().mockImplementation(async (sessionId: string, status: string, extra?: Record<string, unknown>) => {
    const session = mockSessions.get(sessionId);
    if (!session) return null;
    session.status = status;
    if (extra?.ecsTaskArn) session.ecsTaskArn = extra.ecsTaskArn;
    if (extra?.error) session.error = extra.error;
    if (extra?.capabilities) session.capabilities = extra.capabilities;
    if (status === 'stopped' || status === 'errored') session.stoppedAt = new Date();
    return session;
  }),
  canCreateSession: vi.fn().mockResolvedValue(true),
  countActiveSessions: vi.fn().mockResolvedValue(0),
  findIdleSessions: vi.fn().mockResolvedValue([]),
  recordSessionActivity: vi.fn(),
  ensureSessionIndexes: vi.fn(),
}));

vi.mock('../data/session-messages.js', () => ({
  storeMessage: vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
    const msg = {
      sessionId: input.sessionId,
      sequence: mockMessages.length + 1,
      timestamp: new Date(),
      type: input.type,
      content: input.content,
      metadata: input.metadata ?? {},
    };
    mockMessages.push(msg);
    return msg;
  }),
  getSessionMessages: vi.fn().mockImplementation(async (sessionId: string) => {
    return mockMessages.filter((m) => m.sessionId === sessionId);
  }),
  getLatestMessages: vi.fn().mockResolvedValue([]),
  ensureSessionMessageIndexes: vi.fn(),
}));

// Mock ECS orchestrator — no real AWS calls
vi.mock('../sessions/orchestrator.js', () => ({
  launchSession: vi.fn().mockResolvedValue({ taskArn: 'arn:aws:ecs:us-east-1:123456789012:task/hq-cloud-dev/abc123' }),
  stopSession: vi.fn(),
  isEcsConfigured: vi.fn().mockReturnValue(false),
}));

// Mock user-settings — hasClaudeToken is checked during session creation
vi.mock('../data/user-settings.js', () => ({
  getUserSettings: vi.fn().mockResolvedValue(null),
  hasClaudeToken: vi.fn().mockResolvedValue(true),
  ensureUserSettingsIndexes: vi.fn(),
  provisionS3Prefix: vi.fn().mockResolvedValue(undefined),
}));

// Mock config to provide mongodbUri (sessions guard requires it)
vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js');
  return {
    config: {
      ...actual.config,
      mongodbUri: 'mongodb://fake-for-test',
      skipAuth: false,
    },
  };
});

let app: FastifyInstance;
let baseUrl: string;

// --- WebSocket helpers ---

/**
 * A WebSocket client that buffers all messages from the moment of creation.
 * This avoids race conditions where messages arrive before a handler is registered.
 */
class WsClient {
  ws: WebSocket;
  messages: Record<string, unknown>[] = [];
  private waiters: Array<{
    predicate: (msg: Record<string, unknown>) => boolean;
    resolve: (msg: Record<string, unknown>) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    // Start buffering immediately — before open event
    ws.on('message', (data: RawData) => {
      try {
        const str = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        const msg = JSON.parse(str) as Record<string, unknown>;
        this.messages.push(msg);
        // Check waiters
        for (let i = this.waiters.length - 1; i >= 0; i--) {
          const waiter = this.waiters[i]!;
          if (waiter.predicate(msg)) {
            clearTimeout(waiter.timer);
            this.waiters.splice(i, 1);
            waiter.resolve(msg);
          }
        }
      } catch { /* ignore parse errors */ }
    });
  }

  /** Wait for open event */
  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve) => this.ws.on('open', resolve));
  }

  /**
   * Wait for a message matching predicate. Checks already-buffered messages first.
   */
  waitFor(
    predicate: (msg: Record<string, unknown>) => boolean,
    timeoutMs = 10_000
  ): Promise<Record<string, unknown>> {
    // Check already-received messages
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for message (${timeoutMs}ms)`));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  /**
   * Wait for a message matching predicate, skipping N prior matches.
   * Useful when you need the 2nd or 3rd message of a type.
   */
  waitForNth(
    predicate: (msg: Record<string, unknown>) => boolean,
    skip: number,
    timeoutMs = 10_000
  ): Promise<Record<string, unknown>> {
    let count = 0;
    return this.waitFor((msg) => {
      if (!predicate(msg)) return false;
      count++;
      return count > skip;
    }, timeoutMs);
  }

  send(data: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(data));
  }

  sendNdjson(data: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(data) + '\n');
  }

  close(): void {
    this.ws.close();
  }
}

describe('Relay E2E — full startup + message flow', () => {
  beforeAll(async () => {
    process.env.LOG_LEVEL = 'warn';
    process.env.NODE_ENV = 'test';

    mockSessions.clear();
    mockMessages.length = 0;
    resetRelays();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  }, 30_000);

  afterAll(async () => {
    resetRelays();
    await app?.close();
  });

  async function createSession(prompt = 'What is 2+2?'): Promise<{ sessionId: string; accessToken: string }> {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create session: ${res.status} ${text}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    return {
      sessionId: data.sessionId as string,
      accessToken: data.accessToken as string,
    };
  }

  function makeBrowser(): WsClient {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws?token=test-token`);
    return new WsClient(ws);
  }

  function makeContainer(sessionId: string, accessToken: string): WsClient {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/relay/${sessionId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return new WsClient(ws);
  }

  it('creates a session and returns sessionId + accessToken', async () => {
    const { sessionId, accessToken } = await createSession();
    expect(sessionId).toBeTruthy();
    expect(accessToken).toBeTruthy();
  });

  it('browser receives startup phases as wrapped ServerEvent messages', async () => {
    const { sessionId, accessToken } = await createSession('Startup phase test');

    // Connect browser and wait for connected
    const browser = makeBrowser();
    await browser.open();
    await browser.waitFor((msg) => msg.type === 'connected');

    // Subscribe to session
    browser.send({ type: 'session_subscribe', payload: { sessionId } });

    // Initial status should be wrapped: { type, payload: { sessionId, status, ... }, timestamp }
    const statusMsg = await browser.waitFor((msg) => msg.type === 'session_status');

    // Verify envelope wrapping
    expect(statusMsg.type).toBe('session_status');
    expect(statusMsg.timestamp).toBeDefined();
    expect(statusMsg.payload).toBeDefined();

    const payload = statusMsg.payload as Record<string, unknown>;
    expect(payload.sessionId).toBe(sessionId);
    expect(payload.status).toBe('starting');

    // Connect container → should trigger 'initializing' phase
    // (Container also receives initial prompt immediately)
    const container = makeContainer(sessionId, accessToken);
    await container.open();

    const initPhase = await browser.waitFor((msg) => {
      if (msg.type !== 'session_status') return false;
      const p = msg.payload as Record<string, unknown>;
      return p?.startupPhase === 'initializing';
    });
    expect((initPhase.payload as Record<string, unknown>).status).toBe('starting');

    // Container sends system/init → should trigger 'ready' phase
    container.sendNdjson({
      type: 'system',
      subtype: 'init',
      cwd: '/hq',
      session_id: sessionId,
      model: 'claude-sonnet-4-20250514',
      tools: [{ name: 'Read', type: 'tool' }],
      mcp_servers: [],
      permission_mode: 'default',
      claude_code_version: '1.0.0-test',
    });

    const readyPhase = await browser.waitFor((msg) => {
      if (msg.type !== 'session_status') return false;
      const p = msg.payload as Record<string, unknown>;
      return p?.status === 'active' && p?.startupPhase === 'ready';
    });
    expect(readyPhase.payload).toBeDefined();
    expect((readyPhase.payload as Record<string, unknown>).capabilities).toBeDefined();

    container.close();
    browser.close();
  }, 15_000);

  it('container assistant message is relayed to browser as wrapped ServerEvent', async () => {
    const { sessionId, accessToken } = await createSession('Message relay test');

    // Connect container — it receives the initial prompt immediately
    const container = makeContainer(sessionId, accessToken);
    await container.open();
    await container.waitFor((msg) => msg.type === 'user');

    // Send system/init
    container.sendNdjson({
      type: 'system',
      subtype: 'init',
      cwd: '/hq',
      session_id: sessionId,
      model: 'claude-sonnet-4-20250514',
      tools: [],
      mcp_servers: [],
      permission_mode: 'default',
      claude_code_version: '1.0.0-test',
    });

    // Connect browser and subscribe
    const browser = makeBrowser();
    await browser.open();
    await browser.waitFor((msg) => msg.type === 'connected');
    browser.send({ type: 'session_subscribe', payload: { sessionId } });
    await browser.waitFor((msg) => msg.type === 'session_status');

    // Container sends assistant response
    container.sendNdjson({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'The answer is 4.' }] },
      content: 'The answer is 4.',
      session_id: sessionId,
    });

    // Browser should receive it wrapped
    const assistantMsg = await browser.waitFor((msg) => msg.type === 'session_message');
    expect(assistantMsg.timestamp).toBeDefined();
    const aPayload = assistantMsg.payload as Record<string, unknown>;
    expect(aPayload.sessionId).toBe(sessionId);
    expect(aPayload.messageType).toBe('assistant');
    expect(aPayload.content).toBe('The answer is 4.');

    container.close();
    browser.close();
  }, 15_000);

  it('browser user message reaches container via relay', async () => {
    const { sessionId, accessToken } = await createSession('Browser-to-container test');

    // Connect container — it receives the initial prompt immediately
    const container = makeContainer(sessionId, accessToken);
    await container.open();
    await container.waitFor((msg) => msg.type === 'user');

    // Send system/init
    container.sendNdjson({
      type: 'system',
      subtype: 'init',
      cwd: '/hq',
      session_id: sessionId,
      model: 'claude-sonnet-4-20250514',
      tools: [],
      mcp_servers: [],
      permission_mode: 'default',
      claude_code_version: '1.0.0-test',
    });

    // Connect browser and subscribe
    const browser = makeBrowser();
    await browser.open();
    await browser.waitFor((msg) => msg.type === 'connected');
    browser.send({ type: 'session_subscribe', payload: { sessionId } });
    await browser.waitFor((msg) => msg.type === 'session_status');

    // Browser sends user message
    browser.send({
      type: 'session_user_message',
      sessionId,
      content: 'Hello from browser!',
    });

    // Container should receive it as NDJSON user message
    const userMsg = await container.waitFor((msg) => {
      if (msg.type !== 'user') return false;
      const message = msg.message as Record<string, unknown> | undefined;
      return message?.content === 'Hello from browser!';
    });
    expect(userMsg).toBeDefined();

    container.close();
    browser.close();
  }, 15_000);

  it('container disconnect during startup broadcasts failed phase to browser', async () => {
    const { sessionId, accessToken } = await createSession('Fail test');

    // Connect browser and subscribe
    const browser = makeBrowser();
    await browser.open();
    await browser.waitFor((msg) => msg.type === 'connected');
    browser.send({ type: 'session_subscribe', payload: { sessionId } });
    await browser.waitFor((msg) => msg.type === 'session_status');

    // Connect container (but don't send system/init)
    const container = makeContainer(sessionId, accessToken);
    await container.open();
    await browser.waitFor((msg) => {
      const p = msg.type === 'session_status' ? (msg.payload as Record<string, unknown>) : null;
      return p?.startupPhase === 'initializing';
    });

    // Kill container without init
    container.close();

    // Browser should get failed phase
    const failedMsg = await browser.waitFor(
      (msg) => {
        if (msg.type !== 'session_status') return false;
        const p = msg.payload as Record<string, unknown>;
        return p?.startupPhase === 'failed';
      },
      5000
    );
    const failPayload = failedMsg.payload as Record<string, unknown>;
    expect(failPayload.status).toBe('errored');
    expect(failPayload.error).toBeTruthy();

    browser.close();
  }, 15_000);
});
