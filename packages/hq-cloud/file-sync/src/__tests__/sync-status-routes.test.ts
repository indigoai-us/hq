import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncStatusManager } from '../status/sync-status-manager.js';
import {
  handleGetSyncStatus,
  handlePostSyncTrigger,
  handleGetSyncErrors,
  handleDeleteSyncErrors,
} from '../status/sync-status-routes.js';
import type { SyncStatusRouteDeps } from '../status/sync-status-routes.js';
import type { SyncDaemonStats } from '../daemon/types.js';

function makeDaemonStats(overrides: Partial<SyncDaemonStats> = {}): SyncDaemonStats {
  return {
    state: 'running',
    startedAt: Date.now() - 60_000,
    syncCyclesCompleted: 5,
    filesSynced: 42,
    syncErrors: 0,
    pendingEvents: 0,
    lastSyncAt: Date.now() - 5_000,
    lastSyncDurationMs: 150,
    ...overrides,
  };
}

/** Minimal mock of SyncDaemon that satisfies the route handler needs */
function makeMockDaemon(overrides: {
  state?: string;
  pendingEvents?: number;
  triggerSync?: () => Promise<unknown[]>;
} = {}) {
  return {
    state: overrides.state ?? 'running',
    pendingEvents: overrides.pendingEvents ?? 0,
    triggerSync: overrides.triggerSync ?? vi.fn().mockResolvedValue([]),
  } as unknown as import('../daemon/sync-daemon.js').SyncDaemon;
}

describe('Sync Status Route Handlers', () => {
  let statusManager: SyncStatusManager;

  beforeEach(() => {
    statusManager = new SyncStatusManager({ maxRecentErrors: 10 });
  });

  describe('handleGetSyncStatus()', () => {
    it('returns default status when no stats provided', () => {
      const deps: SyncStatusRouteDeps = { statusManager, daemon: null };
      const response = handleGetSyncStatus(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.daemonState).toBe('idle');
      expect(response.data.health).toBe('offline');
      expect(response.data.isSyncing).toBe(false);
      expect(response.data.pendingChanges).toBe(0);
      expect(response.data.lastSyncAt).toBeNull();
      expect(response.data.generatedAt).toBeTruthy();
    });

    it('returns enriched status with daemon stats', () => {
      statusManager.updateDaemonStats(makeDaemonStats({
        pendingEvents: 3,
        filesSynced: 100,
      }));

      const deps: SyncStatusRouteDeps = { statusManager, daemon: null };
      const response = handleGetSyncStatus(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.daemonState).toBe('running');
      expect(response.data.health).toBe('healthy');
      expect(response.data.pendingChanges).toBe(3);
      expect(response.data.upload.totalFilesUploaded).toBe(100);
      expect(response.data.lastSyncAt).toBeTruthy();
    });

    it('includes recent errors in status', () => {
      statusManager.addError('upload', 'Upload failed', { code: 'UPLOAD_ERR' });
      statusManager.addError('download', 'Download timeout', { code: 'DL_TIMEOUT' });

      const deps: SyncStatusRouteDeps = { statusManager, daemon: null };
      const response = handleGetSyncStatus(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.recentErrors).toHaveLength(2);
      expect(response.data.recentErrors[0]!.code).toBe('DL_TIMEOUT');
      expect(response.data.recentErrors[1]!.code).toBe('UPLOAD_ERR');
    });

    it('includes sync progress when active', () => {
      statusManager.setProgress({
        direction: 'upload',
        filesCompleted: 5,
        filesTotal: 10,
        bytesTransferred: 1024,
        bytesTotal: 2048,
        currentFile: 'notes.md',
        estimatedRemainingMs: 3000,
      });

      const deps: SyncStatusRouteDeps = { statusManager, daemon: null };
      const response = handleGetSyncStatus(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.progress).toBeTruthy();
      expect(response.data.progress!.direction).toBe('upload');
      expect(response.data.progress!.filesCompleted).toBe(5);
      expect(response.data.progress!.currentFile).toBe('notes.md');
    });
  });

  describe('handlePostSyncTrigger()', () => {
    it('rejects when daemon is not available', () => {
      const deps: SyncStatusRouteDeps = { statusManager, daemon: null };
      const response = handlePostSyncTrigger(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.accepted).toBe(false);
      expect(response.data.reason).toBe('Sync daemon is not available');
    });

    it('rejects when daemon is not running', () => {
      const daemon = makeMockDaemon({ state: 'stopped' });
      const deps: SyncStatusRouteDeps = { statusManager, daemon };
      const response = handlePostSyncTrigger(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.accepted).toBe(false);
      expect(response.data.reason).toContain('not running');
      expect(response.data.reason).toContain('stopped');
    });

    it('rejects when a trigger is already in progress', () => {
      statusManager.setTriggerInProgress(true);
      const daemon = makeMockDaemon();
      const deps: SyncStatusRouteDeps = { statusManager, daemon };
      const response = handlePostSyncTrigger(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.accepted).toBe(false);
      expect(response.data.reason).toContain('already in progress');
    });

    it('accepts trigger when daemon is running', () => {
      const triggerSync = vi.fn().mockResolvedValue([]);
      const daemon = makeMockDaemon({ pendingEvents: 5, triggerSync });
      const deps: SyncStatusRouteDeps = { statusManager, daemon };
      const response = handlePostSyncTrigger(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.accepted).toBe(true);
      expect(response.data.reason).toBeNull();
      expect(response.data.pendingEvents).toBe(5);
      expect(response.data.triggeredAt).toBeTruthy();
    });

    it('calls daemon.triggerSync asynchronously on accept', () => {
      const triggerSync = vi.fn().mockResolvedValue([]);
      const daemon = makeMockDaemon({ triggerSync });
      const deps: SyncStatusRouteDeps = { statusManager, daemon };

      handlePostSyncTrigger(deps);

      expect(triggerSync).toHaveBeenCalled();
    });

    it('sets and clears triggerInProgress flag', async () => {
      let resolveSync: () => void = () => {};
      const syncPromise = new Promise<unknown[]>((resolve) => {
        resolveSync = () => resolve([]);
      });
      const triggerSync = vi.fn().mockReturnValue(syncPromise);
      const daemon = makeMockDaemon({ triggerSync });
      const deps: SyncStatusRouteDeps = { statusManager, daemon };

      handlePostSyncTrigger(deps);

      expect(statusManager.triggerInProgress).toBe(true);

      resolveSync();
      await syncPromise;
      // Allow microtask (finally) to execute
      await new Promise((r) => setTimeout(r, 0));

      expect(statusManager.triggerInProgress).toBe(false);
    });
  });

  describe('handleGetSyncErrors()', () => {
    it('returns empty array when no errors', () => {
      const deps: SyncStatusRouteDeps = { statusManager, daemon: null };
      const response = handleGetSyncErrors(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data).toEqual([]);
    });

    it('returns recent errors in order', () => {
      statusManager.addError('upload', 'Error 1', { code: 'E1' });
      statusManager.addError('download', 'Error 2', { code: 'E2' });
      statusManager.addError('both', 'Error 3', { code: 'E3' });

      const deps: SyncStatusRouteDeps = { statusManager, daemon: null };
      const response = handleGetSyncErrors(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data).toHaveLength(3);
      expect(response.data[0]!.code).toBe('E3');
      expect(response.data[1]!.code).toBe('E2');
      expect(response.data[2]!.code).toBe('E1');
    });
  });

  describe('handleDeleteSyncErrors()', () => {
    it('clears all errors', () => {
      statusManager.addError('upload', 'Error 1');
      statusManager.addError('download', 'Error 2');

      const deps: SyncStatusRouteDeps = { statusManager, daemon: null };
      const response = handleDeleteSyncErrors(deps);

      expect(response.ok).toBe(true);
      if (!response.ok) return;

      expect(response.data.cleared).toBe(true);

      // Verify errors are actually cleared
      const errorsResponse = handleGetSyncErrors(deps);
      expect(errorsResponse.ok).toBe(true);
      if (!errorsResponse.ok) return;
      expect(errorsResponse.data).toHaveLength(0);
    });
  });
});
