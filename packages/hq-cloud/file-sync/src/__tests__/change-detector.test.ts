import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ChangeDetector } from '../download/change-detector.js';
import { SyncStateManager } from '../download/sync-state.js';
import type { DownloadSyncConfig, S3ObjectInfo } from '../download/types.js';
import type { Logger } from 'pino';

// Mock S3Client
interface MockS3Client {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: (...args: any[]) => Promise<any>;
}

function createMockS3Client(objects: Array<{ Key: string; LastModified: Date; Size: number; ETag: string }>, paginated = false): MockS3Client {
  if (paginated) {
    const mid = Math.ceil(objects.length / 2);
    const page1 = objects.slice(0, mid);
    const page2 = objects.slice(mid);

    let callCount = 0;
    return {
      send: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            Contents: page1,
            NextContinuationToken: 'page2-token',
          });
        }
        return Promise.resolve({
          Contents: page2,
          NextContinuationToken: undefined,
        });
      }),
    };
  }

  return {
    send: vi.fn().mockResolvedValue({
      Contents: objects,
      NextContinuationToken: undefined,
    }),
  };
}

function createMockLogger(): Logger {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function makeConfig(localDir: string): DownloadSyncConfig {
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
  };
}

describe('ChangeDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-change-detect-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('detect new files', () => {
    it('should detect new files not in sync state', async () => {
      const config = makeConfig(tmpDir);
      const s3Objects = [
        { Key: 'user1/hq/file1.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"abc"' },
        { Key: 'user1/hq/file2.txt', LastModified: new Date(1700000001000), Size: 200, ETag: '"def"' },
      ];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(2);
      expect(changes[0]!.type).toBe('added');
      expect(changes[0]!.relativePath).toBe('file1.txt');
      expect(changes[1]!.type).toBe('added');
      expect(changes[1]!.relativePath).toBe('file2.txt');
    });
  });

  describe('detect modified files', () => {
    it('should detect files with changed LastModified', async () => {
      const config = makeConfig(tmpDir);
      const s3Objects = [
        { Key: 'user1/hq/file1.txt', LastModified: new Date(1700000002000), Size: 100, ETag: '"abc"' },
      ];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      // Pre-populate state with older timestamp
      const oldObj: S3ObjectInfo = {
        key: 'user1/hq/file1.txt',
        relativePath: 'file1.txt',
        lastModified: 1700000000000,
        size: 100,
        etag: '"abc"',
      };
      stateManager.updateEntry(oldObj);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('modified');
      expect(changes[0]!.relativePath).toBe('file1.txt');
      expect(changes[0]!.previousLastModified).toBe(1700000000000);
    });

    it('should detect files with changed ETag', async () => {
      const config = makeConfig(tmpDir);
      const s3Objects = [
        { Key: 'user1/hq/file1.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"new-etag"' },
      ];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const oldObj: S3ObjectInfo = {
        key: 'user1/hq/file1.txt',
        relativePath: 'file1.txt',
        lastModified: 1700000000000,
        size: 100,
        etag: '"old-etag"',
      };
      stateManager.updateEntry(oldObj);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('modified');
    });
  });

  describe('detect unchanged files', () => {
    it('should not report unchanged files', async () => {
      const config = makeConfig(tmpDir);
      const s3Objects = [
        { Key: 'user1/hq/file1.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"abc"' },
      ];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const existingObj: S3ObjectInfo = {
        key: 'user1/hq/file1.txt',
        relativePath: 'file1.txt',
        lastModified: 1700000000000,
        size: 100,
        etag: '"abc"',
      };
      stateManager.updateEntry(existingObj);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(0);
    });
  });

  describe('detect deleted files', () => {
    it('should detect deleted files when policy is delete', async () => {
      const config = { ...makeConfig(tmpDir), deletedFilePolicy: 'delete' as const };
      const s3Objects: Array<{ Key: string; LastModified: Date; Size: number; ETag: string }> = [];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      // File in state but not in S3
      const deletedObj: S3ObjectInfo = {
        key: 'user1/hq/deleted.txt',
        relativePath: 'deleted.txt',
        lastModified: 1700000000000,
        size: 50,
        etag: '"xyz"',
      };
      stateManager.updateEntry(deletedObj);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('deleted');
      expect(changes[0]!.relativePath).toBe('deleted.txt');
      expect(changes[0]!.s3Object).toBeNull();
    });

    it('should not detect deleted files when policy is keep', async () => {
      const config = { ...makeConfig(tmpDir), deletedFilePolicy: 'keep' as const };
      const s3Objects: Array<{ Key: string; LastModified: Date; Size: number; ETag: string }> = [];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const deletedObj: S3ObjectInfo = {
        key: 'user1/hq/deleted.txt',
        relativePath: 'deleted.txt',
        lastModified: 1700000000000,
        size: 50,
        etag: '"xyz"',
      };
      stateManager.updateEntry(deletedObj);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(0);
    });
  });

  describe('directory markers', () => {
    it('should skip S3 directory markers (keys ending with /)', async () => {
      const config = makeConfig(tmpDir);
      const s3Objects = [
        { Key: 'user1/hq/knowledge/', LastModified: new Date(1700000000000), Size: 0, ETag: '""' },
        { Key: 'user1/hq/knowledge/file.md', LastModified: new Date(1700000001000), Size: 100, ETag: '"abc"' },
      ];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(1);
      expect(changes[0]!.relativePath).toBe('knowledge/file.md');
    });
  });

  describe('exclude patterns', () => {
    it('should exclude files matching exclude patterns', async () => {
      const config = { ...makeConfig(tmpDir), excludePatterns: ['*.tmp', 'logs/**'] };
      const s3Objects = [
        { Key: 'user1/hq/file.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"a"' },
        { Key: 'user1/hq/temp.tmp', LastModified: new Date(1700000001000), Size: 50, ETag: '"b"' },
        { Key: 'user1/hq/logs/app.log', LastModified: new Date(1700000002000), Size: 200, ETag: '"c"' },
      ];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(1);
      expect(changes[0]!.relativePath).toBe('file.txt');
    });
  });

  describe('pagination', () => {
    it('should handle paginated S3 responses', async () => {
      const config = makeConfig(tmpDir);
      const s3Objects = [
        { Key: 'user1/hq/file1.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"a"' },
        { Key: 'user1/hq/file2.txt', LastModified: new Date(1700000001000), Size: 200, ETag: '"b"' },
        { Key: 'user1/hq/file3.txt', LastModified: new Date(1700000002000), Size: 300, ETag: '"c"' },
        { Key: 'user1/hq/file4.txt', LastModified: new Date(1700000003000), Size: 400, ETag: '"d"' },
      ];

      const client = createMockS3Client(s3Objects, true);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(4);
      expect(client.send).toHaveBeenCalledTimes(2);
    });

    it('should respect maxListPages limit', async () => {
      const config = { ...makeConfig(tmpDir), maxListPages: 1 };

      // Create a client that always returns more pages
      const client: MockS3Client = {
        send: vi.fn().mockResolvedValue({
          Contents: [
            { Key: 'user1/hq/file1.txt', LastModified: new Date(1700000000000), Size: 100, ETag: '"a"' },
          ],
          NextContinuationToken: 'always-more',
        }),
      };

      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      const changes = await detector.detectChanges(stateManager);

      expect(changes).toHaveLength(1);
      expect(client.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('mixed changes', () => {
    it('should detect added, modified, and deleted files in one pass', async () => {
      const config = { ...makeConfig(tmpDir), deletedFilePolicy: 'delete' as const };
      const s3Objects = [
        { Key: 'user1/hq/existing.txt', LastModified: new Date(1700000002000), Size: 100, ETag: '"new"' },
        { Key: 'user1/hq/new-file.txt', LastModified: new Date(1700000003000), Size: 200, ETag: '"abc"' },
      ];

      const client = createMockS3Client(s3Objects);
      const logger = createMockLogger();
      const detector = new ChangeDetector(client as never, config, logger);
      const stateManager = new SyncStateManager(config.stateFilePath, 'user1', config.s3Prefix);

      // Pre-populate: existing (old timestamp) and gone (will be deleted)
      stateManager.updateEntry({
        key: 'user1/hq/existing.txt',
        relativePath: 'existing.txt',
        lastModified: 1700000000000,
        size: 100,
        etag: '"old"',
      });
      stateManager.updateEntry({
        key: 'user1/hq/gone.txt',
        relativePath: 'gone.txt',
        lastModified: 1700000000000,
        size: 50,
        etag: '"gone"',
      });

      const changes = await detector.detectChanges(stateManager);

      const added = changes.filter((c) => c.type === 'added');
      const modified = changes.filter((c) => c.type === 'modified');
      const deleted = changes.filter((c) => c.type === 'deleted');

      expect(added).toHaveLength(1);
      expect(added[0]!.relativePath).toBe('new-file.txt');

      expect(modified).toHaveLength(1);
      expect(modified[0]!.relativePath).toBe('existing.txt');

      expect(deleted).toHaveLength(1);
      expect(deleted[0]!.relativePath).toBe('gone.txt');
    });
  });
});
