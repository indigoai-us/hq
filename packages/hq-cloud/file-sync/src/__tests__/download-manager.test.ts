import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Readable } from 'node:stream';
import { DownloadManager } from '../download/download-manager.js';
import type { DownloadSyncConfig, DownloadPollResult, DetectedChange, DownloadResult } from '../download/types.js';
import type { Logger } from 'pino';

function createMockLogger(): Logger {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function makeConfig(localDir: string, overrides?: Partial<DownloadSyncConfig>): DownloadSyncConfig {
  return {
    bucketName: 'test-bucket',
    region: 'us-east-1',
    s3Prefix: 'user1/hq/',
    localDir,
    pollIntervalMs: 30_000,
    maxConcurrentDownloads: 5,
    deletedFilePolicy: 'keep',
    trashDir: path.join(localDir, '.hq-trash'),
    stateFilePath: path.join(localDir, '.hq-sync-state.json'),
    excludePatterns: [],
    preserveTimestamps: true,
    maxListPages: 100,
    ...overrides,
  };
}

interface MockS3Client {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: (...args: any[]) => Promise<any>;
}

function createMockS3Client(
  listObjects: Array<{ Key: string; LastModified: Date; Size: number; ETag: string }> = [],
  downloadContent = 'downloaded content'
): MockS3Client {
  return {
    send: vi.fn().mockImplementation(
      (command: { constructor?: { name?: string }; input?: { Key?: string } }) => {
        const commandName = command.constructor?.name ?? '';

        if (commandName === 'ListObjectsV2Command') {
          return Promise.resolve({
            Contents: listObjects,
            NextContinuationToken: undefined,
          });
        }

        if (commandName === 'GetObjectCommand') {
          return Promise.resolve({
            Body: Readable.from([Buffer.from(downloadContent)]),
          });
        }

        return Promise.resolve({});
      }
    ),
  };
}

describe('DownloadManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-download-mgr-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('construction', () => {
    it('should create a download manager with valid config', () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const client = createMockS3Client();

      const manager = new DownloadManager(config, logger, client as never);

      expect(manager.isPolling).toBe(false);
      expect(manager.isPollRunning).toBe(false);
      expect(manager.trackedFiles).toBe(0);
    });

    it('should throw for invalid config', () => {
      const config = makeConfig(tmpDir, { bucketName: '' });
      const logger = createMockLogger();

      expect(() => new DownloadManager(config, logger)).toThrow('Invalid download config');
    });

    it('should load existing state on creation', () => {
      const config = makeConfig(tmpDir);

      // Pre-create state file
      const stateData = {
        version: 1,
        userId: 'user1',
        s3Prefix: 'user1/hq/',
        lastPollAt: 1700000000000,
        entries: {
          'file.txt': {
            relativePath: 'file.txt',
            lastModified: 1700000000000,
            etag: '"abc"',
            size: 100,
            syncedAt: 1700000000000,
          },
        },
      };
      fs.writeFileSync(config.stateFilePath, JSON.stringify(stateData), 'utf-8');

      const logger = createMockLogger();
      const client = createMockS3Client();
      const manager = new DownloadManager(config, logger, client as never);

      expect(manager.trackedFiles).toBe(1);
    });
  });

  describe('pollOnce', () => {
    it('should return no-change result when S3 has no objects', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const client = createMockS3Client([]);
      const manager = new DownloadManager(config, logger, client as never);

      const result = await manager.pollOnce();

      expect(result.success).toBe(true);
      expect(result.changesDetected).toBe(0);
      expect(result.filesDownloaded).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should detect and download new files', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const s3Objects = [
        { Key: 'user1/hq/new-file.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"abc"' },
      ];
      const client = createMockS3Client(s3Objects, 'file content');
      const manager = new DownloadManager(config, logger, client as never);

      const result = await manager.pollOnce();

      expect(result.success).toBe(true);
      expect(result.changesDetected).toBe(1);
      expect(result.filesDownloaded).toBe(1);
      expect(result.errors).toBe(0);
      expect(result.results).toHaveLength(1);

      // File should exist locally
      const localPath = path.join(tmpDir, 'new-file.txt');
      expect(fs.existsSync(localPath)).toBe(true);
    });

    it('should skip when poll is already running', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();

      // Create a slow client
      const client: MockS3Client = {
        send: vi.fn().mockImplementation(() =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                Contents: [
                  { Key: 'user1/hq/file.txt', LastModified: new Date(), Size: 10, ETag: '"a"' },
                ],
              });
            }, 100);
          })
        ),
      };

      const manager = new DownloadManager(config, logger, client as never);

      // Start two polls concurrently
      const [result1, result2] = await Promise.all([
        manager.pollOnce(),
        manager.pollOnce(),
      ]);

      // One should succeed, one should skip
      const skipped = [result1, result2].find((r) => r.error === 'Poll already in progress, skipping');
      expect(skipped).toBeDefined();
    });

    it('should handle S3 list errors gracefully', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const client: MockS3Client = {
        send: vi.fn().mockRejectedValue(new Error('S3 unavailable')),
      };

      const manager = new DownloadManager(config, logger, client as never);
      // Suppress the emitted error event to prevent unhandled error
      manager.on('error', () => { /* suppress */ });
      const result = await manager.pollOnce();

      expect(result.success).toBe(false);
      expect(result.error).toBe('S3 unavailable');
      expect(result.errors).toBe(1);
    });

    it('should persist sync state after poll', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const s3Objects = [
        { Key: 'user1/hq/persisted.txt', LastModified: new Date(1700000000000), Size: 50, ETag: '"xyz"' },
      ];
      const client = createMockS3Client(s3Objects, 'persisted content');
      const manager = new DownloadManager(config, logger, client as never);

      await manager.pollOnce();

      // State file should exist
      expect(fs.existsSync(config.stateFilePath)).toBe(true);

      const stateData = JSON.parse(fs.readFileSync(config.stateFilePath, 'utf-8')) as {
        entries: Record<string, unknown>;
        lastPollAt: number | null;
      };
      expect(stateData.entries['persisted.txt']).toBeDefined();
      expect(stateData.lastPollAt).not.toBeNull();
    });
  });

  describe('events', () => {
    it('should emit pollStart event', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const client = createMockS3Client([]);
      const manager = new DownloadManager(config, logger, client as never);

      let startEmitted = false;
      manager.on('pollStart', () => {
        startEmitted = true;
      });

      await manager.pollOnce();

      expect(startEmitted).toBe(true);
    });

    it('should emit pollComplete event', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const client = createMockS3Client([]);
      const manager = new DownloadManager(config, logger, client as never);

      let completedResult: DownloadPollResult | null = null;
      manager.on('pollComplete', (result: DownloadPollResult) => {
        completedResult = result;
      });

      await manager.pollOnce();

      expect(completedResult).not.toBeNull();
      expect(completedResult!.success).toBe(true);
    });

    it('should emit changeDetected events', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const s3Objects = [
        { Key: 'user1/hq/change.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"abc"' },
      ];
      const client = createMockS3Client(s3Objects, 'change content');
      const manager = new DownloadManager(config, logger, client as never);

      const detectedChanges: DetectedChange[] = [];
      manager.on('changeDetected', (change: DetectedChange) => {
        detectedChanges.push(change);
      });

      await manager.pollOnce();

      expect(detectedChanges).toHaveLength(1);
      expect(detectedChanges[0]!.type).toBe('added');
    });

    it('should emit fileDownloaded events', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const s3Objects = [
        { Key: 'user1/hq/downloaded.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"abc"' },
      ];
      const client = createMockS3Client(s3Objects, 'download content');
      const manager = new DownloadManager(config, logger, client as never);

      const downloadedFiles: DownloadResult[] = [];
      manager.on('fileDownloaded', (result: DownloadResult) => {
        downloadedFiles.push(result);
      });

      await manager.pollOnce();

      expect(downloadedFiles).toHaveLength(1);
      expect(downloadedFiles[0]!.success).toBe(true);
    });

    it('should emit error event on failure', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const client: MockS3Client = {
        send: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };

      const manager = new DownloadManager(config, logger, client as never);
      const errors: Error[] = [];
      manager.on('error', (err: Error) => {
        errors.push(err);
      });

      await manager.pollOnce();

      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toBe('Connection failed');
    });
  });

  describe('stats', () => {
    it('should return initial stats', () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const client = createMockS3Client([]);
      const manager = new DownloadManager(config, logger, client as never);

      const stats = manager.getStats();

      expect(stats.isPolling).toBe(false);
      expect(stats.pollCyclesCompleted).toBe(0);
      expect(stats.totalFilesDownloaded).toBe(0);
      expect(stats.totalFilesDeleted).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.lastPollAt).toBeNull();
      expect(stats.lastPollDurationMs).toBeNull();
      expect(stats.trackedFiles).toBe(0);
    });

    it('should update stats after a poll', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const s3Objects = [
        { Key: 'user1/hq/stat-file.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"abc"' },
      ];
      const client = createMockS3Client(s3Objects, 'stat content');
      const manager = new DownloadManager(config, logger, client as never);

      await manager.pollOnce();

      const stats = manager.getStats();
      expect(stats.pollCyclesCompleted).toBe(1);
      expect(stats.totalFilesDownloaded).toBe(1);
      expect(stats.lastPollAt).not.toBeNull();
      expect(stats.lastPollDurationMs).not.toBeNull();
      expect(stats.lastPollDurationMs!).toBeGreaterThanOrEqual(0);
      expect(stats.trackedFiles).toBe(1);
    });

    it('should accumulate stats across polls', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();

      let callCount = 0;
      const client: MockS3Client = {
        send: vi.fn().mockImplementation(
          (command: { constructor?: { name?: string } }) => {
            const commandName = command.constructor?.name ?? '';

            if (commandName === 'ListObjectsV2Command') {
              callCount++;
              return Promise.resolve({
                Contents: [
                  {
                    Key: `user1/hq/file-${callCount}.txt`,
                    LastModified: new Date(1700000000000 + callCount * 1000),
                    Size: 100,
                    ETag: `"etag-${callCount}"`,
                  },
                ],
                NextContinuationToken: undefined,
              });
            }

            return Promise.resolve({
              Body: Readable.from([Buffer.from('content')]),
            });
          }
        ),
      };

      const manager = new DownloadManager(config, logger, client as never);

      await manager.pollOnce();
      await manager.pollOnce();

      const stats = manager.getStats();
      expect(stats.pollCyclesCompleted).toBe(2);
      // Each poll has one new file (different key), so 2 total downloads
      expect(stats.totalFilesDownloaded).toBe(2);
    });
  });

  describe('polling lifecycle', () => {
    it('should start and stop polling', () => {
      const config = makeConfig(tmpDir, { pollIntervalMs: 60_000 });
      const logger = createMockLogger();
      const client = createMockS3Client([]);
      const manager = new DownloadManager(config, logger, client as never);

      manager.startPolling();
      expect(manager.isPolling).toBe(true);

      manager.stopPolling();
      expect(manager.isPolling).toBe(false);
    });

    it('should not start polling twice', () => {
      const config = makeConfig(tmpDir, { pollIntervalMs: 60_000 });
      const logger = createMockLogger();
      const client = createMockS3Client([]);
      const manager = new DownloadManager(config, logger, client as never);

      manager.startPolling();
      manager.startPolling(); // Should no-op

      expect(manager.isPolling).toBe(true);

      manager.stopPolling();
    });

    it('should not error when stopping while not polling', () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const client = createMockS3Client([]);
      const manager = new DownloadManager(config, logger, client as never);

      expect(() => manager.stopPolling()).not.toThrow();
    });
  });

  describe('resetState', () => {
    it('should clear sync state', async () => {
      const config = makeConfig(tmpDir);
      const logger = createMockLogger();
      const s3Objects = [
        { Key: 'user1/hq/file.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"abc"' },
      ];
      const client = createMockS3Client(s3Objects, 'content');
      const manager = new DownloadManager(config, logger, client as never);

      await manager.pollOnce();
      expect(manager.trackedFiles).toBe(1);

      manager.resetState();
      expect(manager.trackedFiles).toBe(0);
    });
  });
});
