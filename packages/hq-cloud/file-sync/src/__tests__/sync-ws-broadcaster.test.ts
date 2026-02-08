import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncStatusManager } from '../status/sync-status-manager.js';
import { SyncWebSocketBroadcaster } from '../status/sync-ws-broadcaster.js';
import type { SyncWsMessage } from '../status/sync-ws-broadcaster.js';
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

describe('SyncWebSocketBroadcaster', () => {
  let statusManager: SyncStatusManager;
  let sentMessages: SyncWsMessage[];
  let sendFn: (msg: SyncWsMessage) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    statusManager = new SyncStatusManager({ maxRecentErrors: 10 });
    sentMessages = [];
    sendFn = (msg) => sentMessages.push(msg);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates a broadcaster that is not running', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);
      expect(broadcaster.isRunning).toBe(false);
    });
  });

  describe('start()', () => {
    it('sends initial status broadcast immediately', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);
      broadcaster.start();

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]!.type).toBe('sync_status');

      broadcaster.stop();
    });

    it('marks broadcaster as running', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);
      broadcaster.start();

      expect(broadcaster.isRunning).toBe(true);

      broadcaster.stop();
    });

    it('does not double-start', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);
      broadcaster.start();
      broadcaster.start(); // should be a no-op

      // Only one initial message
      expect(sentMessages).toHaveLength(1);

      broadcaster.stop();
    });

    it('sends periodic status broadcasts at configured interval', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn, {
        statusBroadcastIntervalMs: 1000,
      });
      broadcaster.start();

      // Initial broadcast
      expect(sentMessages).toHaveLength(1);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);
      expect(sentMessages).toHaveLength(2);

      // Advance by another second
      vi.advanceTimersByTime(1000);
      expect(sentMessages).toHaveLength(3);

      // All should be status messages
      for (const msg of sentMessages) {
        expect(msg.type).toBe('sync_status');
      }

      broadcaster.stop();
    });
  });

  describe('stop()', () => {
    it('stops periodic broadcasts', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn, {
        statusBroadcastIntervalMs: 1000,
      });
      broadcaster.start();
      broadcaster.stop();

      const countAfterStop = sentMessages.length;

      vi.advanceTimersByTime(5000);

      expect(sentMessages.length).toBe(countAfterStop);
    });

    it('marks broadcaster as not running', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);
      broadcaster.start();
      broadcaster.stop();

      expect(broadcaster.isRunning).toBe(false);
    });

    it('is safe to call when not running', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);
      broadcaster.stop(); // should not throw
      expect(broadcaster.isRunning).toBe(false);
    });
  });

  describe('broadcastStatus()', () => {
    it('sends a sync_status message with full status payload', () => {
      statusManager.updateDaemonStats(makeDaemonStats({ pendingEvents: 3 }));

      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);
      broadcaster.broadcastStatus();

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0]!;
      expect(msg.type).toBe('sync_status');

      if (msg.type !== 'sync_status') return;
      expect(msg.payload.daemonState).toBe('running');
      expect(msg.payload.pendingChanges).toBe(3);
      expect(msg.payload.generatedAt).toBeTruthy();
    });
  });

  describe('notifyProgress()', () => {
    it('sends a sync_progress message', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);

      broadcaster.notifyProgress('upload', 5, 10, 1024, 2048, 'notes.md', 3000);

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0]!;
      expect(msg.type).toBe('sync_progress');

      if (msg.type !== 'sync_progress') return;
      expect(msg.payload.direction).toBe('upload');
      expect(msg.payload.filesCompleted).toBe(5);
      expect(msg.payload.filesTotal).toBe(10);
      expect(msg.payload.bytesTransferred).toBe(1024);
      expect(msg.payload.bytesTotal).toBe(2048);
      expect(msg.payload.currentFile).toBe('notes.md');
      expect(msg.payload.estimatedRemainingMs).toBe(3000);
      expect(msg.payload.timestamp).toBeTypeOf('number');
    });

    it('updates status manager progress', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);

      broadcaster.notifyProgress('download', 3, 8, 512, 1024);

      const status = statusManager.getStatus();
      expect(status.progress).toBeTruthy();
      expect(status.progress!.direction).toBe('download');
      expect(status.progress!.filesCompleted).toBe(3);
    });

    it('defaults currentFile and estimatedRemainingMs to null', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);

      broadcaster.notifyProgress('upload', 0, 5, 0, 1024);

      const msg = sentMessages[0]!;
      if (msg.type !== 'sync_progress') return;
      expect(msg.payload.currentFile).toBeNull();
      expect(msg.payload.estimatedRemainingMs).toBeNull();
    });
  });

  describe('notifyError()', () => {
    it('sends a sync_error message', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);

      broadcaster.notifyError('upload', 'Failed to upload file.txt', {
        filePath: 'file.txt',
        code: 'UPLOAD_FAILED',
        retryable: false,
      });

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0]!;
      expect(msg.type).toBe('sync_error');

      if (msg.type !== 'sync_error') return;
      expect(msg.payload.direction).toBe('upload');
      expect(msg.payload.message).toBe('Failed to upload file.txt');
      expect(msg.payload.filePath).toBe('file.txt');
      expect(msg.payload.code).toBe('UPLOAD_FAILED');
      expect(msg.payload.retryable).toBe(false);
      expect(msg.payload.id).toBeTruthy();
      expect(msg.payload.occurredAt).toBeTruthy();
    });

    it('records error in status manager', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);

      broadcaster.notifyError('download', 'S3 timeout');

      const errors = statusManager.getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('S3 timeout');
    });
  });

  describe('notifyComplete()', () => {
    it('sends a sync_complete message', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);

      broadcaster.notifyComplete('upload', 10, 1, 1500);

      expect(sentMessages).toHaveLength(1);
      const msg = sentMessages[0]!;
      expect(msg.type).toBe('sync_complete');

      if (msg.type !== 'sync_complete') return;
      expect(msg.payload.direction).toBe('upload');
      expect(msg.payload.filesSynced).toBe(10);
      expect(msg.payload.errors).toBe(1);
      expect(msg.payload.durationMs).toBe(1500);
      expect(msg.payload.timestamp).toBeTypeOf('number');
    });

    it('clears progress in status manager', () => {
      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);

      // Set some progress first
      broadcaster.notifyProgress('upload', 5, 10, 1024, 2048);
      expect(statusManager.getStatus().progress).toBeTruthy();

      // Complete clears progress
      broadcaster.notifyComplete('upload', 10, 0, 1000);
      expect(statusManager.getStatus().progress).toBeNull();
    });
  });

  describe('integration: full sync lifecycle', () => {
    it('broadcasts progress, errors, and completion in sequence', () => {
      statusManager.updateDaemonStats(makeDaemonStats());

      const broadcaster = new SyncWebSocketBroadcaster(statusManager, sendFn);

      // Start syncing
      statusManager.setSyncing(true);
      broadcaster.notifyProgress('upload', 0, 5, 0, 5000);
      broadcaster.notifyProgress('upload', 2, 5, 2000, 5000, 'doc.md', 1500);
      broadcaster.notifyError('upload', 'Permission denied for secret.env', {
        filePath: 'secret.env',
        code: 'PERMISSION_DENIED',
        retryable: false,
      });
      broadcaster.notifyProgress('upload', 4, 5, 4000, 5000, 'notes.md', 500);
      broadcaster.notifyComplete('upload', 4, 1, 2500);
      statusManager.setSyncing(false);

      expect(sentMessages).toHaveLength(5);
      expect(sentMessages.map((m) => m.type)).toEqual([
        'sync_progress',
        'sync_progress',
        'sync_error',
        'sync_progress',
        'sync_complete',
      ]);

      // Final status should show:
      const status = statusManager.getStatus();
      expect(status.isSyncing).toBe(false);
      expect(status.progress).toBeNull();
      expect(status.recentErrors).toHaveLength(1);
      expect(status.recentErrors[0]!.code).toBe('PERMISSION_DENIED');
    });
  });
});
