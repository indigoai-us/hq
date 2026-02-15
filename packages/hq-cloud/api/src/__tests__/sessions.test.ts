import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../index.js';
import { WebSocket, type RawData } from 'ws';
import { resetRelays } from '../ws/session-relay.js';
import {
  resetConnectionTimeouts,
  hasConnectionTimeout,
  setConnectionTimeout,
  clearConnectionTimeout,
} from '../sessions/connection-timeout.js';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
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

// Mock user-settings — hasClaudeToken is checked during session creation
vi.mock('../data/user-settings.js', () => ({
  getUserSettings: vi.fn().mockResolvedValue(null),
  hasClaudeToken: vi.fn().mockResolvedValue(true), // Default: user has token
  ensureUserSettingsIndexes: vi.fn(),
}));

// Mock ECS orchestrator — no real AWS calls
vi.mock('../sessions/orchestrator.js', () => ({
  launchSession: vi.fn().mockResolvedValue({ taskArn: 'arn:aws:ecs:us-east-1:123456789012:task/hq-cloud-dev/abc123' }),
  stopSession: vi.fn(),
  isEcsConfigured: vi.fn().mockReturnValue(false), // ECS not configured in test
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

interface SessionResponse {
  sessionId: string;
  userId: string;
  status: string;
  ecsTaskArn: string | null;
  accessToken: string | null;
  initialPrompt: string | null;
  workerContext: string | null;
  messageCount: number;
  lastMessage?: Record<string, unknown> | null;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

describe('Session API', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    mockSessions.clear();
    mockMessages.length = 0;
    resetRelays();
    resetConnectionTimeouts();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    resetRelays();
    resetConnectionTimeouts();
    await app.close();
  });

  describe('POST /api/sessions', () => {
    it('should create a new session with access token', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ prompt: 'Hello Claude' }),
      });

      expect(response.status).toBe(201);
      const session = (await response.json()) as SessionResponse;
      expect(session.sessionId).toBeDefined();
      expect(session.userId).toBe('test-user-id');
      expect(session.status).toBe('starting');
      expect(session.initialPrompt).toBe('Hello Claude');
      // SM-004: session must have an access token
      expect(session.accessToken).toBeTruthy();
      expect(session.accessToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should generate unique access tokens for each session', async () => {
      const res1 = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });
      const session1 = (await res1.json()) as SessionResponse;

      const res2 = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });
      const session2 = (await res2.json()) as SessionResponse;

      expect(session1.accessToken).not.toBe(session2.accessToken);
    });

    it('should create session without prompt', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(201);
      const session = (await response.json()) as SessionResponse;
      expect(session.initialPrompt).toBeNull();
    });

    it('should create session with workerContext', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          prompt: 'Build something',
          workerContext: 'dev-team/fullstack',
        }),
      });

      expect(response.status).toBe(201);
      const session = (await response.json()) as SessionResponse;
      expect(session.workerContext).toBe('dev-team/fullstack');
    });

    it('should reject when at session limit', async () => {
      const { canCreateSession } = await import('../data/sessions.js');
      vi.mocked(canCreateSession).mockResolvedValueOnce(false);

      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(429);
      const body = (await response.json()) as ErrorResponse;
      expect(body.error).toBe('Too Many Sessions');
    });
  });

  describe('GET /api/sessions', () => {
    it('should list user sessions', async () => {
      // Create two sessions
      await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ prompt: 'Session 1' }),
      });
      await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ prompt: 'Session 2' }),
      });

      const response = await fetch(`${baseUrl}/api/sessions`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const sessions = (await response.json()) as SessionResponse[];
      expect(sessions).toHaveLength(2);
    });

    it('should return empty array when no sessions', async () => {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const sessions = (await response.json()) as SessionResponse[];
      expect(sessions).toHaveLength(0);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should get session by ID', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ prompt: 'Test' }),
      });
      const created = (await createRes.json()) as SessionResponse;

      const response = await fetch(`${baseUrl}/api/sessions/${created.sessionId}`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const session = (await response.json()) as SessionResponse;
      expect(session.sessionId).toBe(created.sessionId);
    });

    it('should return 404 for nonexistent session', async () => {
      const response = await fetch(`${baseUrl}/api/sessions/nonexistent`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should stop a session', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });
      const created = (await createRes.json()) as SessionResponse;

      const response = await fetch(`${baseUrl}/api/sessions/${created.sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; status: string };
      expect(body.ok).toBe(true);
      expect(body.status).toBe('stopped');
    });

    it('should return 404 for nonexistent session', async () => {
      const response = await fetch(`${baseUrl}/api/sessions/nonexistent`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(404);
    });

    it('should handle already stopped session', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });
      const created = (await createRes.json()) as SessionResponse;

      // Stop it first
      await fetch(`${baseUrl}/api/sessions/${created.sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      // Try to stop again
      const response = await fetch(`${baseUrl}/api/sessions/${created.sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; status: string; message: string };
      expect(body.message).toBe('Session already stopped');
    });
  });

  describe('GET /api/sessions/:id/messages', () => {
    it('should return empty messages for new session', async () => {
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });
      const created = (await createRes.json()) as SessionResponse;

      const response = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/messages`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const messages = (await response.json()) as unknown[];
      expect(messages).toHaveLength(0);
    });
  });
});

describe('Session WebSocket Relay', () => {
  let app: FastifyInstance;
  let serverUrl: string;

  beforeEach(async () => {
    mockSessions.clear();
    mockMessages.length = 0;
    resetRelays();
    resetConnectionTimeouts();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      serverUrl = `ws://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    resetRelays();
    resetConnectionTimeouts();
    await app.close();
  });

  it('should reject Claude Code connection without access token', async () => {
    // Create a relay so the session exists
    const { getOrCreateRelay } = await import('../ws/index.js');
    getOrCreateRelay('session-no-token', 'test-user-id');

    const ws = new WebSocket(`${serverUrl}/ws/relay/session-no-token`);

    const closed = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code: number, reason: Buffer) => {
        resolve({ code, reason: reason.toString() });
      });
      ws.on('error', () => {
        resolve({ code: 0, reason: 'error' });
      });
    });

    // Should be rejected with 4001 (auth required)
    expect(closed.code).toBe(4001);
  });

  it('should reject Claude Code connection with invalid access token', async () => {
    // Create session in mock store with a known token
    mockSessions.set('session-bad-token', {
      sessionId: 'session-bad-token',
      userId: 'test-user-id',
      status: 'starting',
      accessToken: 'correct-token',
      ecsTaskArn: null,
    });

    const { getOrCreateRelay } = await import('../ws/index.js');
    getOrCreateRelay('session-bad-token', 'test-user-id');

    const ws = new WebSocket(`${serverUrl}/ws/relay/session-bad-token`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });

    const closed = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code: number, reason: Buffer) => {
        resolve({ code, reason: reason.toString() });
      });
      ws.on('error', () => {
        resolve({ code: 0, reason: 'error' });
      });
    });

    // Should be rejected with 4003 (invalid token)
    expect(closed.code).toBe(4003);
  });

  it('should accept Claude Code connection with valid access token', async () => {
    // Create session in mock store
    mockSessions.set('session-valid-token', {
      sessionId: 'session-valid-token',
      userId: 'test-user-id',
      status: 'starting',
      accessToken: 'valid-access-token',
      ecsTaskArn: 'arn:test',
    });

    const { getOrCreateRelay } = await import('../ws/index.js');
    getOrCreateRelay('session-valid-token', 'test-user-id');

    const ws = new WebSocket(`${serverUrl}/ws/relay/session-valid-token`, {
      headers: { Authorization: 'Bearer valid-access-token' },
    });

    const connected = await new Promise<boolean>((resolve) => {
      ws.on('open', () => {
        resolve(true);
      });
      ws.on('close', () => {
        resolve(false);
      });
      ws.on('error', () => {
        resolve(false);
      });
      setTimeout(() => resolve(false), 3000);
    });

    expect(connected).toBe(true);
    ws.close();
  });

  it('should reject Claude Code connection for unknown session', async () => {
    const ws = new WebSocket(`${serverUrl}/ws/relay/unknown-session-id`, {
      headers: { Authorization: 'Bearer some-token' },
    });

    const closed = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code: number, reason: Buffer) => {
        resolve({ code, reason: reason.toString() });
      });
      ws.on('error', () => {
        resolve({ code: 0, reason: 'error' });
      });
    });

    // validateSessionAccessToken returns null for unknown session, so 4003
    expect(closed.code).toBe(4003);
  });

  it('should accept browser session_subscribe for existing relay', async () => {
    // Import relay functions to pre-create a relay
    const { getOrCreateRelay } = await import('../ws/index.js');
    getOrCreateRelay('test-session-relay', 'test-user-id');

    const ws = new WebSocket(`${serverUrl}/ws?token=test-clerk-jwt&deviceId=browser-1`);

    const response = await new Promise<Record<string, unknown>>((resolve) => {
      let gotConnected = false;

      ws.on('message', (data: RawData) => {
        const str = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        const msg = JSON.parse(str) as Record<string, unknown>;

        if (msg.type === 'connected' && !gotConnected) {
          gotConnected = true;
          // Subscribe to session
          ws.send(JSON.stringify({
            type: 'session_subscribe',
            payload: { sessionId: 'test-session-relay' },
          }));
        } else if (msg.type === 'session_status') {
          // Browser messages are wrapped in ServerEvent envelope { type, payload, timestamp }
          const payload = msg.payload as Record<string, unknown> | undefined;
          resolve(payload ?? msg);
        }
      });

      ws.on('error', () => resolve({ type: 'error' }));

      // Timeout fallback
      setTimeout(() => resolve({ type: 'timeout' }), 3000);
    });

    expect(response.type).toBe('session_status');
    expect(response.sessionId).toBe('test-session-relay');
    ws.close();
  });
});

describe('Connection Timeout', () => {
  beforeEach(() => {
    resetConnectionTimeouts();
  });

  afterEach(() => {
    resetConnectionTimeouts();
  });

  it('should track pending timeouts', () => {
    setConnectionTimeout('test-session', () => {});
    expect(hasConnectionTimeout('test-session')).toBe(true);
  });

  it('should clear a specific timeout', () => {
    setConnectionTimeout('test-session', () => {});
    expect(hasConnectionTimeout('test-session')).toBe(true);
    clearConnectionTimeout('test-session');
    expect(hasConnectionTimeout('test-session')).toBe(false);
  });

  it('should reset all timeouts', () => {
    setConnectionTimeout('session-1', () => {});
    setConnectionTimeout('session-2', () => {});
    expect(hasConnectionTimeout('session-1')).toBe(true);
    expect(hasConnectionTimeout('session-2')).toBe(true);

    resetConnectionTimeouts();

    expect(hasConnectionTimeout('session-1')).toBe(false);
    expect(hasConnectionTimeout('session-2')).toBe(false);
  });

  it('should not have timeout for unknown session', () => {
    expect(hasConnectionTimeout('unknown')).toBe(false);
  });

  it('should replace existing timeout when set again', () => {
    let firstCalled = false;
    let secondCalled = false;

    setConnectionTimeout('test-session', () => { firstCalled = true; });
    setConnectionTimeout('test-session', () => { secondCalled = true; });

    // The old timer should have been cleared
    expect(hasConnectionTimeout('test-session')).toBe(true);

    // Clear to prevent callback execution
    clearConnectionTimeout('test-session');
    expect(firstCalled).toBe(false);
    expect(secondCalled).toBe(false);
  });
});
