import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../index.js';
import {
  resetSyncStatusManager,
  feedDaemonStats,
  feedDownloadStats,
  recordSyncError,
} from '../routes/sync.js';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));
import type {
  SyncStatus,
  SyncTriggerResult,
  SyncError,
  SyncDaemonStats,
  DownloadManagerStats,
} from '@hq-cloud/file-sync';

// ErrorResponse interface removed (unused)

interface ErrorListResponse {
  count: number;
  errors: SyncError[];
}

function makeDaemonStats(overrides: Partial<SyncDaemonStats> = {}): SyncDaemonStats {
  return {
    state: 'running',
    startedAt: Date.now() - 60_000,
    syncCyclesCompleted: 5,
    filesSynced: 42,
    syncErrors: 0,
    pendingEvents: 3,
    lastSyncAt: Date.now() - 5_000,
    lastSyncDurationMs: 150,
    ...overrides,
  };
}

function makeDownloadStats(overrides: Partial<DownloadManagerStats> = {}): DownloadManagerStats {
  return {
    isPolling: true,
    pollCyclesCompleted: 10,
    totalFilesDownloaded: 20,
    totalFilesDeleted: 2,
    totalErrors: 0,
    lastPollAt: Date.now() - 10_000,
    lastPollDurationMs: 200,
    trackedFiles: 100,
    ...overrides,
  };
}

describe('Sync Routes', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    resetSyncStatusManager();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    await app.close();
    resetSyncStatusManager();  });

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-clerk-jwt',
  });

  // ─── GET /api/sync/status ──────────────────────────────────────────

  describe('GET /api/sync/status', () => {
    it('returns default status when no data has been fed', async () => {
      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SyncStatus;

      expect(body.daemonState).toBe('idle');
      expect(body.health).toBe('offline');
      expect(body.isSyncing).toBe(false);
      expect(body.progress).toBeNull();
      expect(body.lastSyncAt).toBeNull();
      expect(body.pendingChanges).toBe(0);
      expect(body.trackedFiles).toBe(0);
      expect(body.upload.totalFilesUploaded).toBe(0);
      expect(body.download.isPolling).toBe(false);
      expect(body.recentErrors).toEqual([]);
      expect(body.generatedAt).toBeTruthy();
    });

    it('returns status reflecting daemon stats', async () => {
      feedDaemonStats(makeDaemonStats({
        filesSynced: 100,
        syncCyclesCompleted: 25,
        pendingEvents: 7,
      }));

      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SyncStatus;

      expect(body.daemonState).toBe('running');
      expect(body.health).toBe('healthy');
      expect(body.upload.totalFilesUploaded).toBe(100);
      expect(body.upload.syncCyclesCompleted).toBe(25);
      expect(body.pendingChanges).toBe(7);
    });

    it('returns status reflecting download stats', async () => {
      feedDaemonStats(makeDaemonStats());
      feedDownloadStats(makeDownloadStats({
        totalFilesDownloaded: 55,
        trackedFiles: 200,
      }));

      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SyncStatus;

      expect(body.download.totalFilesDownloaded).toBe(55);
      expect(body.trackedFiles).toBe(200);
    });

    it('includes recent errors in status', async () => {
      recordSyncError('upload', 'Upload failed', { filePath: 'test.txt' });
      recordSyncError('download', 'S3 timeout');

      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SyncStatus;

      expect(body.recentErrors).toHaveLength(2);
      expect(body.recentErrors[0]!.direction).toBe('download');
      expect(body.recentErrors[1]!.direction).toBe('upload');
    });

    it('returns 401 without auth', async () => {
      const res = await fetch(`${baseUrl}/api/sync/status`);
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/sync/errors ──────────────────────────────────────────

  describe('GET /api/sync/errors', () => {
    it('returns empty errors initially', async () => {
      const res = await fetch(`${baseUrl}/api/sync/errors`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as ErrorListResponse;
      expect(body.count).toBe(0);
      expect(body.errors).toEqual([]);
    });

    it('returns recorded errors', async () => {
      recordSyncError('upload', 'Error 1');
      recordSyncError('download', 'Error 2', { code: 'TIMEOUT' });

      const res = await fetch(`${baseUrl}/api/sync/errors`, {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as ErrorListResponse;
      expect(body.count).toBe(2);
      expect(body.errors[0]!.message).toBe('Error 2');
      expect(body.errors[0]!.code).toBe('TIMEOUT');
      expect(body.errors[1]!.message).toBe('Error 1');
    });
  });

  // ─── DELETE /api/sync/errors ───────────────────────────────────────

  describe('DELETE /api/sync/errors', () => {
    it('clears all errors', async () => {
      recordSyncError('upload', 'Error 1');
      recordSyncError('download', 'Error 2');

      const delRes = await fetch(`${baseUrl}/api/sync/errors`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      expect(delRes.status).toBe(204);

      // Verify errors are cleared
      const getRes = await fetch(`${baseUrl}/api/sync/errors`, {
        headers: authHeaders(),
      });
      const body = (await getRes.json()) as ErrorListResponse;
      expect(body.count).toBe(0);
    });

    it('returns 204 even if no errors exist', async () => {
      const res = await fetch(`${baseUrl}/api/sync/errors`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      expect(res.status).toBe(204);
    });
  });

  // ─── POST /api/sync/trigger ────────────────────────────────────────

  describe('POST /api/sync/trigger', () => {
    it('rejects when daemon is idle', async () => {
      // Default state is idle (no daemon stats fed)
      const res = await fetch(`${baseUrl}/api/sync/trigger`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as SyncTriggerResult;
      expect(body.accepted).toBe(false);
      expect(body.reason).toContain('idle');
    });

    it('rejects when daemon is stopped', async () => {
      feedDaemonStats(makeDaemonStats({ state: 'stopped' }));

      const res = await fetch(`${baseUrl}/api/sync/trigger`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as SyncTriggerResult;
      expect(body.accepted).toBe(false);
      expect(body.reason).toContain('stopped');
    });

    it('accepts when daemon is running', async () => {
      feedDaemonStats(makeDaemonStats({ state: 'running', pendingEvents: 0 }));

      const res = await fetch(`${baseUrl}/api/sync/trigger`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(202);
      const body = (await res.json()) as SyncTriggerResult;
      expect(body.accepted).toBe(true);
      expect(body.reason).toBeNull();
      expect(body.pendingEvents).toBe(0);
      expect(body.triggeredAt).toBeTruthy();
    });

    it('accepts when daemon is paused', async () => {
      feedDaemonStats(makeDaemonStats({ state: 'paused', pendingEvents: 2 }));

      const res = await fetch(`${baseUrl}/api/sync/trigger`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(202);
      const body = (await res.json()) as SyncTriggerResult;
      expect(body.accepted).toBe(true);
    });

    it('rejects duplicate trigger', async () => {
      feedDaemonStats(makeDaemonStats({ state: 'running', pendingEvents: 0 }));

      // First trigger should succeed
      const res1 = await fetch(`${baseUrl}/api/sync/trigger`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      expect(res1.status).toBe(202);

      // Second trigger should fail (trigger in progress)
      const res2 = await fetch(`${baseUrl}/api/sync/trigger`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      expect(res2.status).toBe(409);
      const body2 = (await res2.json()) as SyncTriggerResult;
      expect(body2.accepted).toBe(false);
      expect(body2.reason).toContain('already pending');
    });

    it('returns 401 without auth', async () => {
      const res = await fetch(`${baseUrl}/api/sync/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── Health derivation via status ──────────────────────────────────

  describe('health status derivation', () => {
    it('shows healthy when running with no errors', async () => {
      feedDaemonStats(makeDaemonStats({ state: 'running' }));

      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as SyncStatus;
      expect(body.health).toBe('healthy');
    });

    it('shows degraded when errors exist', async () => {
      feedDaemonStats(makeDaemonStats({ state: 'running' }));
      recordSyncError('upload', 'Minor issue');

      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as SyncStatus;
      expect(body.health).toBe('degraded');
    });

    it('shows error when many errors exist', async () => {
      feedDaemonStats(makeDaemonStats({ state: 'running' }));
      for (let i = 0; i < 6; i++) {
        recordSyncError('upload', `Error ${i}`);
      }

      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as SyncStatus;
      expect(body.health).toBe('error');
    });

    it('shows offline when daemon is stopped', async () => {
      feedDaemonStats(makeDaemonStats({ state: 'stopped' }));

      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as SyncStatus;
      expect(body.health).toBe('offline');
    });
  });

  // ─── Full status response structure ────────────────────────────────

  describe('full status response structure', () => {
    it('has all expected fields', async () => {
      feedDaemonStats(makeDaemonStats());
      feedDownloadStats(makeDownloadStats());

      const res = await fetch(`${baseUrl}/api/sync/status`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as SyncStatus;

      // Top-level fields
      expect(body).toHaveProperty('daemonState');
      expect(body).toHaveProperty('health');
      expect(body).toHaveProperty('isSyncing');
      expect(body).toHaveProperty('progress');
      expect(body).toHaveProperty('lastSyncAt');
      expect(body).toHaveProperty('lastSyncDurationMs');
      expect(body).toHaveProperty('pendingChanges');
      expect(body).toHaveProperty('trackedFiles');
      expect(body).toHaveProperty('upload');
      expect(body).toHaveProperty('download');
      expect(body).toHaveProperty('recentErrors');
      expect(body).toHaveProperty('generatedAt');

      // Upload sub-fields
      expect(body.upload).toHaveProperty('totalFilesUploaded');
      expect(body.upload).toHaveProperty('syncCyclesCompleted');
      expect(body.upload).toHaveProperty('totalErrors');

      // Download sub-fields
      expect(body.download).toHaveProperty('isPolling');
      expect(body.download).toHaveProperty('totalFilesDownloaded');
      expect(body.download).toHaveProperty('totalFilesDeleted');
      expect(body.download).toHaveProperty('totalErrors');
      expect(body.download).toHaveProperty('lastPollAt');
    });
  });
});
