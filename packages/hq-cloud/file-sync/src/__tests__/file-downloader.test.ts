import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Readable } from 'node:stream';
import { FileDownloader } from '../download/file-downloader.js';
import { SyncStateManager } from '../download/sync-state.js';
import type { DownloadSyncConfig, DetectedChange, S3ObjectInfo } from '../download/types.js';
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

function makeS3Object(relativePath: string, content = 'test content'): S3ObjectInfo {
  return {
    key: `user1/hq/${relativePath}`,
    relativePath,
    lastModified: 1700000000000,
    size: Buffer.byteLength(content),
    etag: `"etag-${relativePath}"`,
  };
}

function makeChange(type: 'added' | 'modified' | 'deleted', relativePath: string, content = 'test content'): DetectedChange {
  if (type === 'deleted') {
    return {
      type: 'deleted',
      relativePath,
      s3Object: null,
      previousLastModified: 1700000000000,
    };
  }

  return {
    type,
    relativePath,
    s3Object: makeS3Object(relativePath, content),
    previousLastModified: type === 'modified' ? 1699999999000 : null,
  };
}

interface MockS3Client {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: (...args: any[]) => Promise<any>;
}

function createMockS3Client(contentMap: Record<string, string> = {}): MockS3Client {
  return {
    send: vi.fn().mockImplementation(
      (command: { input?: { Key?: string } }) => {
        const key = command.input?.Key ?? '';
        const content = contentMap[key] ?? 'default content';

        return Promise.resolve({
          Body: Readable.from([Buffer.from(content)]),
        });
      }
    ),
  };
}

describe('FileDownloader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-downloader-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('downloading files', () => {
    it('should download a new file to local directory', async () => {
      const config = makeConfig(tmpDir);
      const client = createMockS3Client({ 'user1/hq/new-file.txt': 'hello world' });
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = [makeChange('added', 'new-file.txt', 'hello world')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.changeType).toBe('added');
      expect(results[0]!.relativePath).toBe('new-file.txt');

      const localPath = path.join(tmpDir, 'new-file.txt');
      expect(fs.existsSync(localPath)).toBe(true);
      expect(fs.readFileSync(localPath, 'utf-8')).toBe('hello world');
    });

    it('should create parent directories as needed', async () => {
      const config = makeConfig(tmpDir);
      const client = createMockS3Client({ 'user1/hq/deep/nested/file.txt': 'nested content' });
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = [makeChange('added', 'deep/nested/file.txt', 'nested content')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results[0]!.success).toBe(true);
      const localPath = path.join(tmpDir, 'deep', 'nested', 'file.txt');
      expect(fs.existsSync(localPath)).toBe(true);
    });

    it('should preserve timestamps when configured', async () => {
      const config = makeConfig(tmpDir, { preserveTimestamps: true });
      const client = createMockS3Client({ 'user1/hq/timestamped.txt': 'data' });
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const change = makeChange('added', 'timestamped.txt', 'data');
      const results = await downloader.processChanges([change], stateManager);

      expect(results[0]!.success).toBe(true);

      const localPath = path.join(tmpDir, 'timestamped.txt');
      const stat = fs.statSync(localPath);
      // The mtime should be close to the s3Object.lastModified (1700000000000)
      const expectedMtime = new Date(1700000000000);
      expect(stat.mtime.getTime()).toBe(expectedMtime.getTime());
    });

    it('should update sync state after successful download', async () => {
      const config = makeConfig(tmpDir);
      const client = createMockS3Client({ 'user1/hq/tracked.txt': 'content' });
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = [makeChange('added', 'tracked.txt', 'content')];
      await downloader.processChanges(changes, stateManager);

      const entry = stateManager.getEntry('tracked.txt');
      expect(entry).toBeDefined();
      expect(entry!.relativePath).toBe('tracked.txt');
      expect(entry!.lastModified).toBe(1700000000000);
    });

    it('should handle download errors gracefully', async () => {
      const config = makeConfig(tmpDir);
      const client: MockS3Client = {
        send: vi.fn().mockRejectedValue(new Error('Access denied')),
      };
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = [makeChange('added', 'error-file.txt')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBe('Access denied');
    });

    it('should handle empty body response', async () => {
      const config = makeConfig(tmpDir);
      const client: MockS3Client = {
        send: vi.fn().mockResolvedValue({ Body: null }),
      };
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = [makeChange('added', 'empty-body.txt')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBe('S3 response body is empty');
    });

    it('should report correct duration', async () => {
      const config = makeConfig(tmpDir);
      const client = createMockS3Client({ 'user1/hq/timed.txt': 'data' });
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = [makeChange('added', 'timed.txt', 'data')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('concurrent downloads', () => {
    it('should respect maxConcurrentDownloads', async () => {
      const config = makeConfig(tmpDir, { maxConcurrentDownloads: 2 });
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const client: MockS3Client = {
        send: vi.fn().mockImplementation(
          (command: { input?: { Key?: string } }) => {
            currentConcurrent++;
            if (currentConcurrent > maxConcurrent) {
              maxConcurrent = currentConcurrent;
            }
            return new Promise((resolve) => {
              setTimeout(() => {
                currentConcurrent--;
                const key = command.input?.Key ?? '';
                resolve({
                  Body: Readable.from([Buffer.from(`content for ${key}`)]),
                });
              }, 10);
            });
          }
        ),
      };

      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = [
        makeChange('added', 'file1.txt'),
        makeChange('added', 'file2.txt'),
        makeChange('added', 'file3.txt'),
        makeChange('added', 'file4.txt'),
        makeChange('added', 'file5.txt'),
      ];

      const results = await downloader.processChanges(changes, stateManager);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('deletion handling', () => {
    it('should delete local file when policy is delete', async () => {
      const config = makeConfig(tmpDir, { deletedFilePolicy: 'delete' });

      // Create a local file to be deleted
      const localFile = path.join(tmpDir, 'to-delete.txt');
      fs.writeFileSync(localFile, 'will be deleted');

      const client = createMockS3Client();
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);
      stateManager.updateEntry(makeS3Object('to-delete.txt'));

      const changes = [makeChange('deleted', 'to-delete.txt')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results[0]!.success).toBe(true);
      expect(results[0]!.changeType).toBe('deleted');
      expect(fs.existsSync(localFile)).toBe(false);
    });

    it('should move file to trash when policy is trash', async () => {
      const trashDir = path.join(tmpDir, '.hq-trash');
      const config = makeConfig(tmpDir, { deletedFilePolicy: 'trash', trashDir });

      // Create a local file to be trashed
      const localFile = path.join(tmpDir, 'to-trash.txt');
      fs.writeFileSync(localFile, 'will be trashed');

      const client = createMockS3Client();
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);
      stateManager.updateEntry(makeS3Object('to-trash.txt'));

      const changes = [makeChange('deleted', 'to-trash.txt')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results[0]!.success).toBe(true);
      expect(fs.existsSync(localFile)).toBe(false);
      expect(fs.existsSync(path.join(trashDir, 'to-trash.txt'))).toBe(true);
    });

    it('should keep file when policy is keep', async () => {
      const config = makeConfig(tmpDir, { deletedFilePolicy: 'keep' });

      const localFile = path.join(tmpDir, 'to-keep.txt');
      fs.writeFileSync(localFile, 'will be kept');

      const client = createMockS3Client();
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);
      stateManager.updateEntry(makeS3Object('to-keep.txt'));

      const changes = [makeChange('deleted', 'to-keep.txt')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results[0]!.success).toBe(true);
      expect(fs.existsSync(localFile)).toBe(true);
    });

    it('should handle deleting already-missing files', async () => {
      const config = makeConfig(tmpDir, { deletedFilePolicy: 'delete' });
      const client = createMockS3Client();
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = [makeChange('deleted', 'already-gone.txt')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results[0]!.success).toBe(true);
    });

    it('should remove sync state entry after deletion', async () => {
      const config = makeConfig(tmpDir, { deletedFilePolicy: 'delete' });
      const client = createMockS3Client();
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      stateManager.updateEntry(makeS3Object('del.txt'));
      expect(stateManager.getEntry('del.txt')).toBeDefined();

      const changes = [makeChange('deleted', 'del.txt')];
      await downloader.processChanges(changes, stateManager);

      expect(stateManager.getEntry('del.txt')).toBeUndefined();
    });
  });

  describe('change with null s3Object', () => {
    it('should fail gracefully when s3Object is null for non-delete change', async () => {
      const config = makeConfig(tmpDir);
      const client = createMockS3Client();
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const change: DetectedChange = {
        type: 'added',
        relativePath: 'broken.txt',
        s3Object: null,
        previousLastModified: null,
      };

      const results = await downloader.processChanges([change], stateManager);

      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBe('No S3 object info available');
    });
  });

  describe('trash with nested paths', () => {
    it('should create nested trash directories for deep paths', async () => {
      const trashDir = path.join(tmpDir, '.hq-trash');
      const config = makeConfig(tmpDir, { deletedFilePolicy: 'trash', trashDir });

      // Create a nested local file
      const nestedDir = path.join(tmpDir, 'knowledge', 'deep');
      fs.mkdirSync(nestedDir, { recursive: true });
      const localFile = path.join(nestedDir, 'nested.txt');
      fs.writeFileSync(localFile, 'nested content');

      const client = createMockS3Client();
      const logger = createMockLogger();
      const downloader = new FileDownloader(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);
      stateManager.updateEntry(makeS3Object('knowledge/deep/nested.txt'));

      const changes = [makeChange('deleted', 'knowledge/deep/nested.txt')];
      const results = await downloader.processChanges(changes, stateManager);

      expect(results[0]!.success).toBe(true);
      expect(fs.existsSync(path.join(trashDir, 'knowledge', 'deep', 'nested.txt'))).toBe(true);
    });
  });
});
