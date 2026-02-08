import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { S3Uploader } from '../upload/s3-uploader.js';
import type { UploadConfig, BatchUploadProgress } from '../upload/types.js';
import type { FileEvent } from '../daemon/types.js';
import type { Logger } from 'pino';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({ VersionId: 'v1' });
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: vi.fn().mockImplementation((params: Record<string, unknown>) => ({
      ...params,
      _command: 'PutObject',
    })),
    DeleteObjectCommand: vi.fn().mockImplementation((params: Record<string, unknown>) => ({
      ...params,
      _command: 'DeleteObject',
    })),
  };
});

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    done: vi.fn().mockResolvedValue({ VersionId: 'v-multipart' }),
  })),
}));

function makeConfig(overrides?: Partial<UploadConfig>): UploadConfig {
  return {
    bucketName: 'test-bucket',
    region: 'us-east-1',
    userId: 'test-user',
    hashAlgorithm: 'sha256',
    maxConcurrentUploads: 5,
    multipartThresholdBytes: 5 * 1024 * 1024,
    multipartPartSizeBytes: 5 * 1024 * 1024,
    syncAgentVersion: '0.1.0-test',
    deduplicateByHash: true,
    ...overrides,
  };
}

function makeEvent(
  tmpDir: string,
  fileName: string,
  type: FileEvent['type'] = 'add'
): FileEvent {
  return {
    type,
    absolutePath: path.join(tmpDir, fileName),
    relativePath: fileName,
    timestamp: Date.now(),
  };
}

// Create a silent mock logger compatible with pino's Logger interface
const noop = (): void => { /* noop */ };
const logger = {
  level: 'silent',
  info: noop,
  error: noop,
  warn: noop,
  debug: noop,
  trace: noop,
  fatal: noop,
  child: () => logger,
  silent: noop,
} as unknown as Logger;

describe('S3Uploader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-uploader-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('uploadBatch', () => {
    it('should upload a single file successfully', async () => {
      const content = 'test file content';
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, content);

      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'test.txt', 'add');

      const results = await uploader.uploadBatch([event]);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.relativePath).toBe('test.txt');
      expect(results[0]!.eventType).toBe('add');
    });

    it('should handle change events', async () => {
      const filePath = path.join(tmpDir, 'changed.txt');
      fs.writeFileSync(filePath, 'updated content');

      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'changed.txt', 'change');

      const results = await uploader.uploadBatch([event]);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.eventType).toBe('change');
    });

    it('should handle unlink events (deletions)', async () => {
      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'deleted.txt', 'unlink');

      const results = await uploader.uploadBatch([event]);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.eventType).toBe('unlink');
    });

    it('should handle addDir events', async () => {
      const dirPath = path.join(tmpDir, 'new-dir');
      fs.mkdirSync(dirPath);

      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'new-dir', 'addDir');

      const results = await uploader.uploadBatch([event]);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.eventType).toBe('addDir');
    });

    it('should handle unlinkDir events', async () => {
      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'removed-dir', 'unlinkDir');

      const results = await uploader.uploadBatch([event]);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.eventType).toBe('unlinkDir');
    });

    it('should handle multiple files in a batch', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'content 1');
      fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'content 2');
      fs.writeFileSync(path.join(tmpDir, 'file3.txt'), 'content 3');

      const uploader = new S3Uploader(makeConfig(), logger);
      const events = [
        makeEvent(tmpDir, 'file1.txt', 'add'),
        makeEvent(tmpDir, 'file2.txt', 'add'),
        makeEvent(tmpDir, 'file3.txt', 'change'),
      ];

      const results = await uploader.uploadBatch(events);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should skip upload for non-existent files (add/change)', async () => {
      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'ghost-file.txt', 'add');

      const results = await uploader.uploadBatch([event]);

      expect(results).toHaveLength(1);
      // Should succeed (skip) since the file was likely already deleted
      expect(results[0]!.success).toBe(true);
    });

    it('should call progress callback', async () => {
      fs.writeFileSync(path.join(tmpDir, 'progress.txt'), 'data');

      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'progress.txt', 'add');
      const progressUpdates: BatchUploadProgress[] = [];

      await uploader.uploadBatch([event], (progress) => {
        progressUpdates.push({ ...progress });
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      // Last update should show completion
      const last = progressUpdates[progressUpdates.length - 1]!;
      expect(last.completedFiles + last.failedFiles + last.skippedFiles).toBe(1);
    });

    it('should handle mixed event types in a batch', async () => {
      fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'new file');
      fs.writeFileSync(path.join(tmpDir, 'modified.txt'), 'modified');
      fs.mkdirSync(path.join(tmpDir, 'new-dir'));

      const uploader = new S3Uploader(makeConfig(), logger);
      const events: FileEvent[] = [
        makeEvent(tmpDir, 'new.txt', 'add'),
        makeEvent(tmpDir, 'modified.txt', 'change'),
        makeEvent(tmpDir, 'deleted.txt', 'unlink'),
        makeEvent(tmpDir, 'new-dir', 'addDir'),
        makeEvent(tmpDir, 'old-dir', 'unlinkDir'),
      ];

      const results = await uploader.uploadBatch(events);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should respect maxConcurrentUploads', async () => {
      // Create many files
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(path.join(tmpDir, `concurrent-${i}.txt`), `content ${i}`);
      }

      const config = makeConfig({ maxConcurrentUploads: 2 });
      const uploader = new S3Uploader(config, logger);
      const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent(tmpDir, `concurrent-${i}.txt`, 'add')
      );

      const results = await uploader.uploadBatch(events);

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle empty batch', async () => {
      const uploader = new S3Uploader(makeConfig(), logger);

      const results = await uploader.uploadBatch([]);

      expect(results).toHaveLength(0);
    });
  });

  describe('S3 key generation', () => {
    it('should build correct S3 keys with userId prefix', async () => {
      const content = 'key test';
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), content);

      const { PutObjectCommand: MockPut } = await import('@aws-sdk/client-s3');
      const config = makeConfig({ userId: 'user-42' });
      const uploader = new S3Uploader(config, logger);
      const event = makeEvent(tmpDir, 'test.txt', 'add');

      await uploader.uploadBatch([event]);

      // Check that PutObjectCommand was called with correct key
      expect(MockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'user-42/hq/test.txt',
          Bucket: 'test-bucket',
        })
      );
    });

    it('should normalize backslash paths', async () => {
      const content = 'path test';
      const subDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'nested.txt'), content);

      const { PutObjectCommand: MockPut } = await import('@aws-sdk/client-s3');
      const config = makeConfig({ userId: 'user-1' });
      const uploader = new S3Uploader(config, logger);

      // Use backslash path (Windows-style)
      const event: FileEvent = {
        type: 'add',
        absolutePath: path.join(subDir, 'nested.txt'),
        relativePath: 'sub\\nested.txt',
        timestamp: Date.now(),
      };

      await uploader.uploadBatch([event]);

      expect(MockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'user-1/hq/sub/nested.txt',
        })
      );
    });
  });

  describe('metadata', () => {
    it('should attach metadata to uploaded objects', async () => {
      const content = 'metadata test content';
      fs.writeFileSync(path.join(tmpDir, 'meta.txt'), content);

      const { PutObjectCommand: MockPut } = await import('@aws-sdk/client-s3');
      const config = makeConfig({
        userId: 'meta-user',
        syncAgentVersion: '1.2.3',
      });
      const uploader = new S3Uploader(config, logger);
      const event = makeEvent(tmpDir, 'meta.txt', 'add');

      await uploader.uploadBatch([event]);

      const expectedHash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');

      // Verify the PutObjectCommand was called with the right metadata
      const putCalls = vi.mocked(MockPut).mock.calls;
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      const lastCallParams = putCalls[putCalls.length - 1]![0] as Record<string, unknown>;
      const metadata = lastCallParams['Metadata'] as Record<string, string>;
      expect(metadata['content-hash']).toBe(expectedHash);
      expect(metadata['hash-algorithm']).toBe('sha256');
      expect(metadata['local-path']).toBe('meta.txt');
      expect(metadata['uploaded-by']).toBe('meta-user');
      expect(metadata['sync-agent-version']).toBe('1.2.3');
      expect(metadata['file-size']).toBe(String(Buffer.byteLength(content)));
    });
  });

  describe('content type inference', () => {
    it.each([
      ['file.json', 'application/json'],
      ['file.md', 'text/markdown'],
      ['file.txt', 'text/plain'],
      ['file.ts', 'text/typescript'],
      ['file.js', 'application/javascript'],
      ['file.yaml', 'application/x-yaml'],
      ['file.yml', 'application/x-yaml'],
      ['file.html', 'text/html'],
      ['file.css', 'text/css'],
      ['file.png', 'image/png'],
      ['file.unknown', 'application/octet-stream'],
      ['noextension', 'application/octet-stream'],
    ])('should infer content type for %s as %s', async (fileName, expectedType) => {
      fs.writeFileSync(path.join(tmpDir, fileName), 'test');

      const { PutObjectCommand: MockPut } = await import('@aws-sdk/client-s3');
      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, fileName, 'add');

      await uploader.uploadBatch([event]);

      expect(MockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: expectedType,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle S3 upload errors gracefully', async () => {
      fs.writeFileSync(path.join(tmpDir, 'error.txt'), 'data');

      // Make the S3 client throw
      const { S3Client } = await import('@aws-sdk/client-s3');
      const mockSend = vi.fn().mockRejectedValue(new Error('S3 error'));
      vi.mocked(S3Client).mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {} as never,
      }) as never);

      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'error.txt', 'add');

      const results = await uploader.uploadBatch([event]);

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('S3 error');
    });

    it('should continue processing other files after one fails', async () => {
      fs.writeFileSync(path.join(tmpDir, 'good1.txt'), 'good');
      fs.writeFileSync(path.join(tmpDir, 'good2.txt'), 'good');

      const { S3Client } = await import('@aws-sdk/client-s3');
      let callCount = 0;
      const mockSend = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First upload failed'));
        }
        return Promise.resolve({ VersionId: 'v1' });
      });
      vi.mocked(S3Client).mockImplementation(() => ({
        send: mockSend,
        config: {},
        destroy: vi.fn(),
        middlewareStack: {} as never,
      }) as never);

      const config = makeConfig({ maxConcurrentUploads: 1 });
      const uploader = new S3Uploader(config, logger);
      const events = [
        makeEvent(tmpDir, 'good1.txt', 'add'),
        makeEvent(tmpDir, 'good2.txt', 'add'),
      ];

      const results = await uploader.uploadBatch(events);

      expect(results).toHaveLength(2);
      // At least one should fail, at least one succeed
      const failed = results.filter((r) => !r.success);
      const succeeded = results.filter((r) => r.success);
      expect(failed.length).toBeGreaterThanOrEqual(1);
      expect(succeeded.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('directory operations', () => {
    it('should create directory markers with trailing slash', async () => {
      const { PutObjectCommand: MockPut } = await import('@aws-sdk/client-s3');
      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'my-dir', 'addDir');

      await uploader.uploadBatch([event]);

      expect(MockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'test-user/hq/my-dir/',
          ContentType: 'application/x-directory',
        })
      );
    });

    it('should delete directory markers with trailing slash', async () => {
      const { DeleteObjectCommand: MockDelete } = await import('@aws-sdk/client-s3');
      const uploader = new S3Uploader(makeConfig(), logger);
      const event = makeEvent(tmpDir, 'old-dir', 'unlinkDir');

      await uploader.uploadBatch([event]);

      expect(MockDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'test-user/hq/old-dir/',
        })
      );
    });
  });
});
