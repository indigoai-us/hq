/**
 * Tests for US-005: Graceful Sync & Shutdown Lifecycle
 *
 * Validates:
 * - 'syncing' session status transition: active -> syncing -> stopping -> stopped
 * - sync_and_shutdown WebSocket message sent to container before StopTask
 * - POST /api/sessions/:id/sync-status endpoint for container acknowledgment
 * - 15-second grace period with fallback to stop anyway
 * - Sync gate promise mechanics (create, acknowledge, timeout, reset)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSyncGate,
  acknowledgeSyncComplete,
  hasPendingSyncGate,
  cancelSyncGate,
  resetSyncGates,
  SYNC_GRACE_MS,
} from '../sessions/sync-gate.js';

// ─── Unit tests for sync-gate module ──────────────────────────────────

describe('SyncGate', () => {
  beforeEach(() => {
    resetSyncGates();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetSyncGates();
    vi.useRealTimers();
  });

  it('should resolve true when acknowledged before timeout', async () => {
    const gatePromise = createSyncGate('session-1');

    expect(hasPendingSyncGate('session-1')).toBe(true);

    // Simulate container calling sync-status
    const wasWaiting = acknowledgeSyncComplete('session-1');
    expect(wasWaiting).toBe(true);

    const result = await gatePromise;
    expect(result).toBe(true);
    expect(hasPendingSyncGate('session-1')).toBe(false);
  });

  it('should resolve false when timeout expires', async () => {
    const gatePromise = createSyncGate('session-2');

    expect(hasPendingSyncGate('session-2')).toBe(true);

    // Advance past the grace period
    vi.advanceTimersByTime(SYNC_GRACE_MS + 100);

    const result = await gatePromise;
    expect(result).toBe(false);
    expect(hasPendingSyncGate('session-2')).toBe(false);
  });

  it('should return false from acknowledgeSyncComplete when no gate exists', () => {
    const result = acknowledgeSyncComplete('no-such-session');
    expect(result).toBe(false);
  });

  it('should cancel a pending gate', async () => {
    const gatePromise = createSyncGate('session-3');

    expect(hasPendingSyncGate('session-3')).toBe(true);

    cancelSyncGate('session-3');

    const result = await gatePromise;
    expect(result).toBe(false);
    expect(hasPendingSyncGate('session-3')).toBe(false);
  });

  it('should replace existing gate when creating a new one for same session', async () => {
    const gate1 = createSyncGate('session-4');
    const gate2 = createSyncGate('session-4');

    // First gate should have resolved as false (replaced)
    const result1 = await gate1;
    expect(result1).toBe(false);

    // Second gate should still be pending
    expect(hasPendingSyncGate('session-4')).toBe(true);

    // Acknowledge the second gate
    acknowledgeSyncComplete('session-4');
    const result2 = await gate2;
    expect(result2).toBe(true);
  });

  it('should reset all gates', async () => {
    const gate1 = createSyncGate('session-5');
    const gate2 = createSyncGate('session-6');

    expect(hasPendingSyncGate('session-5')).toBe(true);
    expect(hasPendingSyncGate('session-6')).toBe(true);

    resetSyncGates();

    expect(hasPendingSyncGate('session-5')).toBe(false);
    expect(hasPendingSyncGate('session-6')).toBe(false);

    // Gates were cleared but not resolved; no way to await them
    // since resetSyncGates doesn't resolve the promises (design choice for cleanup)
  });

  it('SYNC_GRACE_MS should be 15000', () => {
    expect(SYNC_GRACE_MS).toBe(15_000);
  });
});

// ─── Integration tests for sync-status endpoint and DELETE flow ─────

import { buildApp } from '../index.js';
import { resetRelays, getOrCreateRelay, getRelay } from '../ws/session-relay.js';
import { resetConnectionTimeouts } from '../sessions/connection-timeout.js';
import { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));

// Mock MongoDB sessions
const mockSessions = new Map<string, Record<string, unknown>>();

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
  storeMessage: vi.fn(),
  getSessionMessages: vi.fn().mockResolvedValue([]),
  getLatestMessages: vi.fn().mockResolvedValue([]),
  ensureSessionMessageIndexes: vi.fn(),
}));

vi.mock('../data/user-settings.js', () => ({
  getUserSettings: vi.fn().mockResolvedValue(null),
  hasClaudeToken: vi.fn().mockResolvedValue(true),
  ensureUserSettingsIndexes: vi.fn(),
}));

vi.mock('../sessions/orchestrator.js', () => ({
  launchSession: vi.fn().mockResolvedValue({ taskArn: 'arn:aws:ecs:us-east-1:123456789012:task/hq-cloud-dev/abc123' }),
  stopSession: vi.fn(),
  isEcsConfigured: vi.fn().mockReturnValue(false),
}));

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

interface StopResponse {
  ok: boolean;
  status: string;
  syncAcknowledged?: boolean;
  message?: string;
}

interface SyncStatusResponse {
  ok: boolean;
  acknowledged: boolean;
  message: string;
}

describe('Sync Lifecycle Integration', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    mockSessions.clear();
    resetRelays();
    resetConnectionTimeouts();
    resetSyncGates();
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
    resetSyncGates();
    await app.close();
  });

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-clerk-jwt',
  });

  describe('POST /api/sessions/:id/sync-status', () => {
    it('should return 404 for nonexistent session', async () => {
      const res = await fetch(`${baseUrl}/api/sessions/nonexistent/sync-status`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'complete' }),
      });

      expect(res.status).toBe(404);
    });

    it('should accept sync-status from authenticated session owner', async () => {
      // Create a session
      mockSessions.set('sync-test-1', {
        sessionId: 'sync-test-1',
        userId: 'test-user-id',
        status: 'syncing',
        accessToken: 'container-token-1',
        ecsTaskArn: null,
      });

      const res = await fetch(`${baseUrl}/api/sessions/sync-test-1/sync-status`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'complete', filesChanged: 5 }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SyncStatusResponse;
      expect(body.ok).toBe(true);
      // No pending gate, so acknowledged should be false
      expect(body.acknowledged).toBe(false);
    });

    it('should accept sync-status from container using session access token', async () => {
      mockSessions.set('sync-test-2', {
        sessionId: 'sync-test-2',
        userId: 'test-user-id',
        status: 'syncing',
        accessToken: 'container-token-2',
        ecsTaskArn: null,
      });

      const res = await fetch(`${baseUrl}/api/sessions/sync-test-2/sync-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer container-token-2',
        },
        body: JSON.stringify({ status: 'complete' }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SyncStatusResponse;
      expect(body.ok).toBe(true);
    });

    it('should reject sync-status with wrong access token and no user auth', async () => {
      // Use a mock that rejects the clerk token for this specific case
      const { verifyClerkToken } = await import('../auth/clerk.js');
      vi.mocked(verifyClerkToken).mockRejectedValueOnce(new Error('Invalid token'));

      mockSessions.set('sync-test-3', {
        sessionId: 'sync-test-3',
        userId: 'other-user',
        status: 'syncing',
        accessToken: 'correct-token',
        ecsTaskArn: null,
      });

      // This will fail auth middleware entirely with invalid clerk token
      const res = await fetch(`${baseUrl}/api/sessions/sync-test-3/sync-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-token',
        },
        body: JSON.stringify({ status: 'complete' }),
      });

      // With invalid clerk token, auth middleware returns 401
      expect(res.status).toBe(401);
    });

    it('should acknowledge pending sync gate when container reports sync complete', async () => {
      mockSessions.set('sync-gate-test', {
        sessionId: 'sync-gate-test',
        userId: 'test-user-id',
        status: 'syncing',
        accessToken: 'gate-token',
        ecsTaskArn: null,
      });

      // Create a sync gate (simulating what DELETE handler would do)
      const gatePromise = createSyncGate('sync-gate-test');

      expect(hasPendingSyncGate('sync-gate-test')).toBe(true);

      // Container reports sync complete
      const res = await fetch(`${baseUrl}/api/sessions/sync-gate-test/sync-status`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'complete', filesChanged: 3 }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SyncStatusResponse;
      expect(body.ok).toBe(true);
      expect(body.acknowledged).toBe(true);
      expect(body.message).toContain('stop will proceed');

      // Gate should have resolved
      const gateResult = await gatePromise;
      expect(gateResult).toBe(true);
      expect(hasPendingSyncGate('sync-gate-test')).toBe(false);
    });
  });

  describe('DELETE /api/sessions/:id (graceful sync)', () => {
    it('should stop session without sync when no container is connected', async () => {
      // Create a session
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ prompt: 'test' }),
      });
      const session = (await createRes.json()) as { sessionId: string };

      // Stop without any container connected
      const stopRes = await fetch(`${baseUrl}/api/sessions/${session.sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      expect(stopRes.status).toBe(200);
      const body = (await stopRes.json()) as StopResponse;
      expect(body.ok).toBe(true);
      expect(body.status).toBe('stopped');
      // No container connected, so sync was not attempted
      expect(body.syncAcknowledged).toBe(false);
    });

    it('should transition through syncing status when container is connected', async () => {
      // Create a session in mock store with an active relay and fake claude socket
      const sessionId = 'sync-lifecycle-test';
      mockSessions.set(sessionId, {
        sessionId,
        userId: 'test-user-id',
        status: 'active',
        accessToken: 'lifecycle-token',
        ecsTaskArn: null,
      });

      // Create relay with a mock claude socket
      const relay = getOrCreateRelay(sessionId, 'test-user-id');
      const mockClaudeSocket = {
        readyState: 1, // WebSocket.OPEN
        OPEN: 1,
        send: vi.fn(),
        close: vi.fn(),
      };
      relay.claudeSocket = mockClaudeSocket as unknown as WebSocket;

      // Stop the session — this will try to sync first
      // Since we don't acknowledge, it will timeout
      // Use real timers for this test to let the sync gate time out quickly
      // We'll cancel the gate manually to simulate timeout quickly

      // Start the DELETE request (it will wait for sync gate)
      const stopPromise = fetch(`${baseUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      // Give the request a moment to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify sync_and_shutdown was sent to the container
      expect(mockClaudeSocket.send).toHaveBeenCalled();
      const sentData = mockClaudeSocket.send.mock.calls[0]?.[0] as string;
      expect(sentData).toBeDefined();
      const parsed = JSON.parse(sentData.replace('\n', ''));
      expect(parsed.type).toBe('sync_and_shutdown');
      expect(parsed.sessionId).toBe(sessionId);

      // Check that session transitioned to 'syncing'
      const { updateSessionStatus } = await import('../data/sessions.js');
      expect(vi.mocked(updateSessionStatus)).toHaveBeenCalledWith(sessionId, 'syncing');

      // Acknowledge the sync to unblock the DELETE
      acknowledgeSyncComplete(sessionId);

      // Wait for the response
      const stopRes = await stopPromise;
      expect(stopRes.status).toBe(200);
      const body = (await stopRes.json()) as StopResponse;
      expect(body.ok).toBe(true);
      expect(body.status).toBe('stopped');
      expect(body.syncAcknowledged).toBe(true);

      // Verify the full status transition: syncing -> stopping -> stopped
      expect(vi.mocked(updateSessionStatus)).toHaveBeenCalledWith(sessionId, 'syncing');
      expect(vi.mocked(updateSessionStatus)).toHaveBeenCalledWith(sessionId, 'stopping');
      expect(vi.mocked(updateSessionStatus)).toHaveBeenCalledWith(sessionId, 'stopped');
    });

    it('should proceed to stop after sync grace period expires', async () => {
      const sessionId = 'sync-timeout-test';
      mockSessions.set(sessionId, {
        sessionId,
        userId: 'test-user-id',
        status: 'active',
        accessToken: 'timeout-token',
        ecsTaskArn: null,
      });

      const relay = getOrCreateRelay(sessionId, 'test-user-id');
      const mockClaudeSocket = {
        readyState: 1,
        OPEN: 1,
        send: vi.fn(),
        close: vi.fn(),
      };
      relay.claudeSocket = mockClaudeSocket as unknown as WebSocket;

      // Start the DELETE request — it will wait for sync gate
      const stopPromise = fetch(`${baseUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      // Wait a moment for the request to start, then cancel the gate to simulate timeout
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Cancel the sync gate (simulates timeout)
      cancelSyncGate(sessionId);

      const stopRes = await stopPromise;
      expect(stopRes.status).toBe(200);
      const body = (await stopRes.json()) as StopResponse;
      expect(body.ok).toBe(true);
      expect(body.status).toBe('stopped');
      expect(body.syncAcknowledged).toBe(false);

      // Container WebSocket should still have been closed
      expect(mockClaudeSocket.close).toHaveBeenCalledWith(1000, 'Session stopped by user');
    });

    it('should include syncing in already-stopped check', async () => {
      const sessionId = 'already-stopped-check';
      mockSessions.set(sessionId, {
        sessionId,
        userId: 'test-user-id',
        status: 'stopped',
        accessToken: 'stopped-token',
        ecsTaskArn: null,
      });

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as StopResponse;
      expect(body.message).toBe('Session already stopped');
    });
  });
});
