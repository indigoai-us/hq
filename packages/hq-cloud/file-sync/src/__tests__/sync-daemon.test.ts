import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SyncDaemon } from '../daemon/sync-daemon.js';
import type { SyncHandler } from '../daemon/sync-daemon.js';
import type { SyncDaemonConfig, FileEvent, FileSyncResult, DaemonState } from '../daemon/types.js';
import { buildDaemonConfig } from '../daemon/config.js';

function makeConfig(tmpDir: string): SyncDaemonConfig {
  return buildDaemonConfig({
    hqDir: tmpDir,
    syncIntervalMs: 60_000, // Long interval; we trigger manually in tests
    debounceMs: 50,
    usePidFile: false,
    batchSize: 100,
  });
}

function makeSuccessHandler(): SyncHandler {
  return (events: FileEvent[]): Promise<FileSyncResult[]> =>
    Promise.resolve(
      events.map((e) => ({
        relativePath: e.relativePath,
        success: true,
        eventType: e.type,
      }))
    );
}

function makeFailHandler(message: string): SyncHandler {
  return (_events: FileEvent[]): Promise<FileSyncResult[]> =>
    Promise.reject(new Error(message));
}

describe('SyncDaemon', () => {
  let tmpDir: string;
  let config: SyncDaemonConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-daemon-test-'));
    config = makeConfig(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('lifecycle', () => {
    it('should start in idle state', () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      expect(daemon.state).toBe('idle');
    });

    it('should transition to running on start', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();

      expect(daemon.state).toBe('running');

      await daemon.stop();
    });

    it('should transition to stopped on stop', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();
      await daemon.stop();

      expect(daemon.state).toBe('stopped');
    });

    it('should emit stateChange events', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      const transitions: [DaemonState, DaemonState][] = [];

      daemon.on('stateChange', (newState: DaemonState, oldState: DaemonState) => {
        transitions.push([newState, oldState]);
      });

      await daemon.start();
      await daemon.stop();

      expect(transitions).toContainEqual(['starting', 'idle']);
      expect(transitions).toContainEqual(['running', 'starting']);
      expect(transitions).toContainEqual(['stopping', 'running']);
      expect(transitions).toContainEqual(['stopped', 'stopping']);
    });

    it('should emit stopped event on stop', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      let stoppedEmitted = false;

      daemon.on('stopped', () => {
        stoppedEmitted = true;
      });

      await daemon.start();
      await daemon.stop();

      expect(stoppedEmitted).toBe(true);
    });

    it('should throw when starting from running state', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();

      await expect(daemon.start()).rejects.toThrow('Cannot start daemon from state: running');

      await daemon.stop();
    });

    it('should allow restart from stopped state', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());

      await daemon.start();
      await daemon.stop();
      expect(daemon.state).toBe('stopped');

      await daemon.start();
      expect(daemon.state).toBe('running');

      await daemon.stop();
    });

    it('should no-op when stopping an already stopped daemon', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();
      await daemon.stop();

      // Should not throw
      await daemon.stop();
      expect(daemon.state).toBe('stopped');
    });

    it('should no-op when stopping an idle daemon', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());

      // Should not throw
      await daemon.stop();
    });
  });

  describe('pause / resume', () => {
    it('should transition to paused on pause', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();

      await daemon.pause();
      expect(daemon.state).toBe('paused');

      await daemon.stop();
    });

    it('should resume to running', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();
      await daemon.pause();

      await daemon.resume();
      expect(daemon.state).toBe('running');

      await daemon.stop();
    });

    it('should throw when pausing from non-running state', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());

      await expect(daemon.pause()).rejects.toThrow('Cannot pause daemon from state: idle');
    });

    it('should throw when resuming from non-paused state', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();

      await expect(daemon.resume()).rejects.toThrow(
        'Cannot resume daemon from state: running'
      );

      await daemon.stop();
    });
  });

  describe('validation', () => {
    it('should fail to start with invalid config', async () => {
      const badConfig = { ...config, hqDir: '' };
      const daemon = new SyncDaemon(badConfig, makeSuccessHandler());

      await expect(daemon.start()).rejects.toThrow('Invalid daemon config');
      expect(daemon.state).toBe('stopped');
    });

    it('should fail to start if HQ directory does not exist', async () => {
      const badConfig = { ...config, hqDir: '/nonexistent/path/that/should/not/exist' };
      const daemon = new SyncDaemon(badConfig, makeSuccessHandler());

      await expect(daemon.start()).rejects.toThrow('HQ directory does not exist');
      expect(daemon.state).toBe('stopped');
    });
  });

  describe('file events and sync', () => {
    it('should detect file changes and queue them', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      const events: FileEvent[] = [];

      daemon.on('fileEvent', (event: FileEvent) => {
        events.push(event);
      });

      await daemon.start();

      // Create a file
      fs.writeFileSync(path.join(tmpDir, 'new-file.txt'), 'content');

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(daemon.pendingEvents).toBeGreaterThanOrEqual(1);

      await daemon.stop();
    });

    it('should sync pending events via triggerSync', async () => {
      const syncedEvents: FileEvent[] = [];
      const handler: SyncHandler = (events: FileEvent[]): Promise<FileSyncResult[]> => {
        syncedEvents.push(...events);
        return Promise.resolve(
          events.map((e) => ({
            relativePath: e.relativePath,
            success: true,
            eventType: e.type,
          }))
        );
      };

      const daemon = new SyncDaemon(config, handler);
      await daemon.start();

      // Create a file
      fs.writeFileSync(path.join(tmpDir, 'sync-me.txt'), 'data');

      await new Promise((resolve) => setTimeout(resolve, 500));

      const results = await daemon.triggerSync();

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(syncedEvents.length).toBeGreaterThanOrEqual(1);
      expect(daemon.pendingEvents).toBe(0);

      await daemon.stop();
    });

    it('should emit syncStart and syncComplete events', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      let syncStartCount = 0;
      let syncCompleteData: { synced: number; errors: number; durationMs: number } | null = null;

      daemon.on('syncStart', () => {
        syncStartCount++;
      });

      daemon.on('syncComplete', (synced: number, errors: number, durationMs: number) => {
        syncCompleteData = { synced, errors, durationMs };
      });

      await daemon.start();

      fs.writeFileSync(path.join(tmpDir, 'event-file.txt'), 'data');
      await new Promise((resolve) => setTimeout(resolve, 500));

      await daemon.triggerSync();

      expect(syncStartCount).toBeGreaterThanOrEqual(1);
      expect(syncCompleteData).not.toBeNull();
      expect(syncCompleteData!.synced).toBeGreaterThanOrEqual(1);
      expect(syncCompleteData!.errors).toBe(0);
      expect(syncCompleteData!.durationMs).toBeGreaterThanOrEqual(0);

      await daemon.stop();
    });

    it('should handle sync handler errors gracefully', async () => {
      const daemon = new SyncDaemon(config, makeFailHandler('Sync failed'));
      const errors: Error[] = [];

      daemon.on('error', (err: Error) => {
        errors.push(err);
      });

      await daemon.start();

      fs.writeFileSync(path.join(tmpDir, 'error-file.txt'), 'data');
      await new Promise((resolve) => setTimeout(resolve, 500));

      const results = await daemon.triggerSync();

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => !r.success)).toBe(true);
      expect(errors.length).toBeGreaterThanOrEqual(1);

      await daemon.stop();
    });

    it('should return empty results when triggering sync with no pending events', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();

      const results = await daemon.triggerSync();
      expect(results).toHaveLength(0);

      await daemon.stop();
    });

    it('should sync remaining events on stop', async () => {
      const syncedPaths: string[] = [];
      const handler: SyncHandler = (events: FileEvent[]): Promise<FileSyncResult[]> => {
        syncedPaths.push(...events.map((e) => e.relativePath));
        return Promise.resolve(
          events.map((e) => ({
            relativePath: e.relativePath,
            success: true,
            eventType: e.type,
          }))
        );
      };

      const daemon = new SyncDaemon(config, handler);
      await daemon.start();

      fs.writeFileSync(path.join(tmpDir, 'final-sync.txt'), 'data');
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stop should trigger final sync
      await daemon.stop();

      expect(syncedPaths).toContain('final-sync.txt');
    });
  });

  describe('stats', () => {
    it('should report initial stats', () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      const stats = daemon.getStats();

      expect(stats.state).toBe('idle');
      expect(stats.startedAt).toBeNull();
      expect(stats.syncCyclesCompleted).toBe(0);
      expect(stats.filesSynced).toBe(0);
      expect(stats.syncErrors).toBe(0);
      expect(stats.pendingEvents).toBe(0);
      expect(stats.lastSyncAt).toBeNull();
      expect(stats.lastSyncDurationMs).toBeNull();
    });

    it('should track startedAt after start', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      const before = Date.now();

      await daemon.start();

      const stats = daemon.getStats();
      expect(stats.startedAt).not.toBeNull();
      expect(stats.startedAt!).toBeGreaterThanOrEqual(before);
      expect(stats.state).toBe('running');

      await daemon.stop();
    });

    it('should update stats after a sync cycle', async () => {
      const daemon = new SyncDaemon(config, makeSuccessHandler());
      await daemon.start();

      fs.writeFileSync(path.join(tmpDir, 'stats-file.txt'), 'data');
      await new Promise((resolve) => setTimeout(resolve, 500));

      await daemon.triggerSync();

      const stats = daemon.getStats();
      expect(stats.syncCyclesCompleted).toBeGreaterThanOrEqual(1);
      expect(stats.filesSynced).toBeGreaterThanOrEqual(1);
      expect(stats.lastSyncAt).not.toBeNull();
      expect(stats.lastSyncDurationMs).not.toBeNull();
      expect(stats.lastSyncDurationMs!).toBeGreaterThanOrEqual(0);

      await daemon.stop();
    });

    it('should count sync errors', async () => {
      const daemon = new SyncDaemon(config, makeFailHandler('boom'));

      daemon.on('error', () => {
        // Suppress unhandled error
      });

      await daemon.start();

      fs.writeFileSync(path.join(tmpDir, 'err-file.txt'), 'data');
      await new Promise((resolve) => setTimeout(resolve, 500));

      await daemon.triggerSync();

      const stats = daemon.getStats();
      expect(stats.syncErrors).toBeGreaterThanOrEqual(1);

      await daemon.stop();
    });
  });

  describe('PID lock', () => {
    it('should create PID file when usePidFile is true', async () => {
      const pidPath = path.join(tmpDir, '.hq-sync.pid');
      const pidConfig = { ...config, usePidFile: true, pidFilePath: pidPath };
      const daemon = new SyncDaemon(pidConfig, makeSuccessHandler());

      await daemon.start();

      expect(fs.existsSync(pidPath)).toBe(true);
      const content = fs.readFileSync(pidPath, 'utf-8').trim();
      expect(content).toBe(String(process.pid));

      await daemon.stop();
    });

    it('should remove PID file on stop', async () => {
      const pidPath = path.join(tmpDir, '.hq-sync.pid');
      const pidConfig = { ...config, usePidFile: true, pidFilePath: pidPath };
      const daemon = new SyncDaemon(pidConfig, makeSuccessHandler());

      await daemon.start();
      await daemon.stop();

      expect(fs.existsSync(pidPath)).toBe(false);
    });

    it('should remove stale PID file and acquire lock', async () => {
      const pidPath = path.join(tmpDir, '.hq-sync.pid');
      // Write a non-existent PID (stale lock)
      fs.writeFileSync(pidPath, '999999999', 'utf-8');

      const pidConfig = { ...config, usePidFile: true, pidFilePath: pidPath };
      const daemon = new SyncDaemon(pidConfig, makeSuccessHandler());

      // Should succeed since the PID is not actually running
      await daemon.start();

      const content = fs.readFileSync(pidPath, 'utf-8').trim();
      expect(content).toBe(String(process.pid));

      await daemon.stop();
    });

    it('should not create PID file when usePidFile is false', async () => {
      const pidPath = path.join(tmpDir, '.no-pid.pid');
      const noPidConfig = { ...config, usePidFile: false, pidFilePath: pidPath };
      const daemon = new SyncDaemon(noPidConfig, makeSuccessHandler());

      await daemon.start();

      expect(fs.existsSync(pidPath)).toBe(false);

      await daemon.stop();
    });
  });

  describe('batch trigger', () => {
    it('should trigger sync when batch size is reached', async () => {
      let syncCallCount = 0;
      const handler: SyncHandler = (events: FileEvent[]): Promise<FileSyncResult[]> => {
        syncCallCount++;
        return Promise.resolve(
          events.map((e) => ({
            relativePath: e.relativePath,
            success: true,
            eventType: e.type,
          }))
        );
      };

      const smallBatchConfig = {
        ...config,
        batchSize: 2,
        debounceMs: 10,
      };

      const daemon = new SyncDaemon(smallBatchConfig, handler);
      await daemon.start();

      // Create files to exceed batch size
      fs.writeFileSync(path.join(tmpDir, 'batch-1.txt'), 'a');
      fs.writeFileSync(path.join(tmpDir, 'batch-2.txt'), 'b');
      fs.writeFileSync(path.join(tmpDir, 'batch-3.txt'), 'c');

      // Wait for debounce + batch trigger
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(syncCallCount).toBeGreaterThanOrEqual(1);

      await daemon.stop();
    });
  });
});
