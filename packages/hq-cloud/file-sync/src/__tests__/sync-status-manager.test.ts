import { describe, it, expect, beforeEach } from 'vitest';
import { SyncStatusManager } from '../status/sync-status-manager.js';
import type { SyncDaemonStats, DaemonState } from '../daemon/types.js';
import type { DownloadManagerStats } from '../download/types.js';

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

describe('SyncStatusManager', () => {
  let manager: SyncStatusManager;

  beforeEach(() => {
    manager = new SyncStatusManager({ maxRecentErrors: 5 });
  });

  describe('getStatus()', () => {
    it('returns default status when no stats are provided', () => {
      const status = manager.getStatus();

      expect(status.daemonState).toBe('idle');
      expect(status.health).toBe('offline');
      expect(status.isSyncing).toBe(false);
      expect(status.progress).toBeNull();
      expect(status.lastSyncAt).toBeNull();
      expect(status.lastSyncDurationMs).toBeNull();
      expect(status.pendingChanges).toBe(0);
      expect(status.trackedFiles).toBe(0);
      expect(status.upload.totalFilesUploaded).toBe(0);
      expect(status.download.isPolling).toBe(false);
      expect(status.recentErrors).toEqual([]);
      expect(status.generatedAt).toBeTruthy();
    });

    it('reflects daemon stats correctly', () => {
      const daemonStats = makeDaemonStats({
        filesSynced: 100,
        syncCyclesCompleted: 25,
        pendingEvents: 3,
      });
      manager.updateDaemonStats(daemonStats);

      const status = manager.getStatus();

      expect(status.daemonState).toBe('running');
      expect(status.upload.totalFilesUploaded).toBe(100);
      expect(status.upload.syncCyclesCompleted).toBe(25);
      expect(status.pendingChanges).toBe(3);
      expect(status.lastSyncAt).toBeTruthy();
      expect(status.lastSyncDurationMs).toBe(150);
    });

    it('reflects download stats correctly', () => {
      manager.updateDaemonStats(makeDaemonStats());
      manager.updateDownloadStats(makeDownloadStats({
        totalFilesDownloaded: 55,
        totalFilesDeleted: 3,
        trackedFiles: 200,
      }));

      const status = manager.getStatus();

      expect(status.download.isPolling).toBe(true);
      expect(status.download.totalFilesDownloaded).toBe(55);
      expect(status.download.totalFilesDeleted).toBe(3);
      expect(status.trackedFiles).toBe(200);
    });

    it('includes recent errors in status', () => {
      manager.addError('upload', 'Failed to upload file.txt', {
        filePath: 'file.txt',
        code: 'UPLOAD_FAILED',
      });
      manager.addError('download', 'S3 timeout', {
        code: 'S3_TIMEOUT',
        retryable: true,
      });

      const status = manager.getStatus();
      expect(status.recentErrors).toHaveLength(2);
      expect(status.recentErrors[0]!.direction).toBe('download');
      expect(status.recentErrors[1]!.direction).toBe('upload');
    });

    it('reflects sync progress when set', () => {
      manager.setProgress({
        direction: 'upload',
        filesCompleted: 5,
        filesTotal: 10,
        bytesTransferred: 1024,
        bytesTotal: 2048,
        currentFile: 'notes.md',
        estimatedRemainingMs: 5000,
      });

      const status = manager.getStatus();
      expect(status.progress).toBeTruthy();
      expect(status.progress!.direction).toBe('upload');
      expect(status.progress!.filesCompleted).toBe(5);
      expect(status.progress!.currentFile).toBe('notes.md');
    });

    it('progress is null when cleared', () => {
      manager.setProgress({
        direction: 'upload',
        filesCompleted: 5,
        filesTotal: 10,
        bytesTransferred: 1024,
        bytesTotal: 2048,
        currentFile: null,
        estimatedRemainingMs: null,
      });
      manager.setProgress(null);

      expect(manager.getStatus().progress).toBeNull();
    });
  });

  describe('getHealth()', () => {
    it('returns offline when no daemon stats available', () => {
      expect(manager.getHealth()).toBe('offline');
    });

    it('returns offline for stopped daemon', () => {
      manager.updateDaemonStats(makeDaemonStats({ state: 'stopped' }));
      expect(manager.getHealth()).toBe('offline');
    });

    it('returns offline for idle daemon', () => {
      manager.updateDaemonStats(makeDaemonStats({ state: 'idle' }));
      expect(manager.getHealth()).toBe('offline');
    });

    it('returns healthy for running daemon with no errors', () => {
      manager.updateDaemonStats(makeDaemonStats({ state: 'running' }));
      expect(manager.getHealth()).toBe('healthy');
    });

    it('returns degraded for paused daemon', () => {
      manager.updateDaemonStats(makeDaemonStats({ state: 'paused' }));
      expect(manager.getHealth()).toBe('degraded');
    });

    it('returns degraded with a few recent errors', () => {
      manager.updateDaemonStats(makeDaemonStats({ state: 'running' }));
      manager.addError('upload', 'Error 1');
      expect(manager.getHealth()).toBe('degraded');
    });

    it('returns error with many recent errors', () => {
      manager.updateDaemonStats(makeDaemonStats({ state: 'running' }));
      for (let i = 0; i < 6; i++) {
        manager.addError('upload', `Error ${i}`);
      }
      expect(manager.getHealth()).toBe('error');
    });
  });

  describe('addError()', () => {
    it('adds an error with default values', () => {
      const error = manager.addError('upload', 'Something went wrong');

      expect(error.id).toBeTruthy();
      expect(error.direction).toBe('upload');
      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('SYNC_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.filePath).toBeNull();
      expect(error.occurredAt).toBeTruthy();
    });

    it('adds an error with custom options', () => {
      const error = manager.addError('download', 'File not found', {
        filePath: 'missing.txt',
        code: 'FILE_NOT_FOUND',
        retryable: false,
      });

      expect(error.filePath).toBe('missing.txt');
      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.retryable).toBe(false);
    });

    it('trims errors to maxRecentErrors', () => {
      // Manager has maxRecentErrors=5
      for (let i = 0; i < 10; i++) {
        manager.addError('upload', `Error ${i}`);
      }

      const errors = manager.getRecentErrors();
      expect(errors).toHaveLength(5);
      // Most recent should be first
      expect(errors[0]!.message).toBe('Error 9');
    });

    it('keeps most recent errors at the front', () => {
      manager.addError('upload', 'First');
      manager.addError('download', 'Second');

      const errors = manager.getRecentErrors();
      expect(errors[0]!.message).toBe('Second');
      expect(errors[1]!.message).toBe('First');
    });
  });

  describe('clearErrors()', () => {
    it('clears all errors', () => {
      manager.addError('upload', 'Error 1');
      manager.addError('download', 'Error 2');
      manager.clearErrors();

      expect(manager.getRecentErrors()).toHaveLength(0);
      expect(manager.getStatus().recentErrors).toHaveLength(0);
    });
  });

  describe('setSyncing()', () => {
    it('sets isSyncing flag', () => {
      manager.setSyncing(true);
      expect(manager.getStatus().isSyncing).toBe(true);

      manager.setSyncing(false);
      expect(manager.getStatus().isSyncing).toBe(false);
    });
  });

  describe('buildTriggerResult()', () => {
    it('builds accepted result', () => {
      const result = manager.buildTriggerResult(true, 5);

      expect(result.accepted).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.pendingEvents).toBe(5);
      expect(result.triggeredAt).toBeTruthy();
    });

    it('builds rejected result with reason', () => {
      const result = manager.buildTriggerResult(false, 0, 'Daemon is stopped');

      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('Daemon is stopped');
    });
  });

  describe('triggerInProgress', () => {
    it('defaults to false', () => {
      expect(manager.triggerInProgress).toBe(false);
    });

    it('can be set and cleared', () => {
      manager.setTriggerInProgress(true);
      expect(manager.triggerInProgress).toBe(true);

      manager.setTriggerInProgress(false);
      expect(manager.triggerInProgress).toBe(false);
    });
  });

  describe('getRecentErrors()', () => {
    it('returns a copy of errors', () => {
      manager.addError('upload', 'Test');
      const errors1 = manager.getRecentErrors();
      const errors2 = manager.getRecentErrors();

      expect(errors1).toEqual(errors2);
      expect(errors1).not.toBe(errors2);
    });
  });

  describe('status generatedAt', () => {
    it('updates on each call', async () => {
      const status1 = manager.getStatus();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const status2 = manager.getStatus();

      expect(status2.generatedAt).not.toBe(status1.generatedAt);
    });
  });

  describe('daemon state transitions affect status', () => {
    const states: DaemonState[] = ['idle', 'starting', 'running', 'paused', 'stopping', 'stopped'];

    for (const state of states) {
      it(`reflects daemon state: ${state}`, () => {
        manager.updateDaemonStats(makeDaemonStats({ state }));
        expect(manager.getStatus().daemonState).toBe(state);
      });
    }
  });
});
