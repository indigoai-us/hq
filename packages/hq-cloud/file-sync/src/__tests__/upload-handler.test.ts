import { describe, it, expect, vi } from 'vitest';
import { createUploadHandler, buildUploadConfig } from '../upload/upload-handler.js';
import type { UploadHandlerOptions } from '../upload/upload-handler.js';
import type { UploadConfig } from '../upload/types.js';
import { DEFAULT_UPLOAD_CONFIG } from '../upload/types.js';
import type { Logger } from 'pino';

// Mock the S3Uploader so we don't need real AWS
vi.mock('../upload/s3-uploader.js', () => ({
  S3Uploader: vi.fn().mockImplementation(() => ({
    uploadBatch: vi.fn().mockResolvedValue([
      { relativePath: 'test.txt', success: true, eventType: 'add' },
    ]),
  })),
}));

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

describe('buildUploadConfig', () => {
  it('should apply default values for optional fields', () => {
    const options: UploadHandlerOptions = {
      bucketName: 'my-bucket',
      region: 'us-west-2',
      userId: 'user-1',
      logger,
    };

    const config = buildUploadConfig(options);

    expect(config.bucketName).toBe('my-bucket');
    expect(config.region).toBe('us-west-2');
    expect(config.userId).toBe('user-1');
    expect(config.hashAlgorithm).toBe(DEFAULT_UPLOAD_CONFIG.hashAlgorithm);
    expect(config.maxConcurrentUploads).toBe(DEFAULT_UPLOAD_CONFIG.maxConcurrentUploads);
    expect(config.multipartThresholdBytes).toBe(DEFAULT_UPLOAD_CONFIG.multipartThresholdBytes);
    expect(config.multipartPartSizeBytes).toBe(DEFAULT_UPLOAD_CONFIG.multipartPartSizeBytes);
    expect(config.syncAgentVersion).toBe(DEFAULT_UPLOAD_CONFIG.syncAgentVersion);
    expect(config.deduplicateByHash).toBe(DEFAULT_UPLOAD_CONFIG.deduplicateByHash);
  });

  it('should allow overriding defaults', () => {
    const options: UploadHandlerOptions = {
      bucketName: 'custom-bucket',
      region: 'eu-west-1',
      userId: 'user-2',
      logger,
      config: {
        hashAlgorithm: 'md5',
        maxConcurrentUploads: 10,
        syncAgentVersion: '2.0.0',
        deduplicateByHash: false,
      },
    };

    const config = buildUploadConfig(options);

    expect(config.hashAlgorithm).toBe('md5');
    expect(config.maxConcurrentUploads).toBe(10);
    expect(config.syncAgentVersion).toBe('2.0.0');
    expect(config.deduplicateByHash).toBe(false);
    // Non-overridden should remain default
    expect(config.multipartThresholdBytes).toBe(DEFAULT_UPLOAD_CONFIG.multipartThresholdBytes);
  });

  it('should preserve required fields exactly', () => {
    const options: UploadHandlerOptions = {
      bucketName: 'exact-bucket',
      region: 'ap-southeast-1',
      userId: 'exact-user',
      logger,
    };

    const config = buildUploadConfig(options);

    expect(config.bucketName).toBe('exact-bucket');
    expect(config.region).toBe('ap-southeast-1');
    expect(config.userId).toBe('exact-user');
  });
});

describe('createUploadHandler', () => {
  it('should return a function', () => {
    const handler = createUploadHandler({
      bucketName: 'test-bucket',
      region: 'us-east-1',
      userId: 'test-user',
      logger,
    });

    expect(typeof handler).toBe('function');
  });

  it('should return a SyncHandler-compatible function', async () => {
    const handler = createUploadHandler({
      bucketName: 'test-bucket',
      region: 'us-east-1',
      userId: 'test-user',
      logger,
    });

    const events = [
      {
        type: 'add' as const,
        absolutePath: '/tmp/test.txt',
        relativePath: 'test.txt',
        timestamp: Date.now(),
      },
    ];

    const results = await handler(events);

    expect(results).toHaveLength(1);
    expect(results[0]!.relativePath).toBe('test.txt');
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.eventType).toBe('add');
  });

  it('should accept a progress callback', () => {
    const onProgress = vi.fn();

    const handler = createUploadHandler({
      bucketName: 'test-bucket',
      region: 'us-east-1',
      userId: 'test-user',
      logger,
      onProgress,
    });

    expect(typeof handler).toBe('function');
  });

  it('should accept config overrides', () => {
    const handler = createUploadHandler({
      bucketName: 'test-bucket',
      region: 'us-east-1',
      userId: 'test-user',
      logger,
      config: {
        hashAlgorithm: 'md5',
        maxConcurrentUploads: 3,
      },
    });

    expect(typeof handler).toBe('function');
  });
});

describe('DEFAULT_UPLOAD_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_UPLOAD_CONFIG.hashAlgorithm).toBe('sha256');
    expect(DEFAULT_UPLOAD_CONFIG.maxConcurrentUploads).toBe(5);
    expect(DEFAULT_UPLOAD_CONFIG.multipartThresholdBytes).toBe(5 * 1024 * 1024);
    expect(DEFAULT_UPLOAD_CONFIG.multipartPartSizeBytes).toBe(5 * 1024 * 1024);
    expect(DEFAULT_UPLOAD_CONFIG.syncAgentVersion).toBe('0.1.0');
    expect(DEFAULT_UPLOAD_CONFIG.deduplicateByHash).toBe(true);
  });

  it('should not include required fields', () => {
    const config = DEFAULT_UPLOAD_CONFIG as Record<string, unknown>;
    expect(config['bucketName']).toBeUndefined();
    expect(config['region']).toBeUndefined();
    expect(config['userId']).toBeUndefined();
  });
});

describe('UploadConfig type', () => {
  it('should accept a complete config object', () => {
    const config: UploadConfig = {
      bucketName: 'test',
      region: 'us-east-1',
      userId: 'user-1',
      hashAlgorithm: 'sha256',
      maxConcurrentUploads: 5,
      multipartThresholdBytes: 5 * 1024 * 1024,
      multipartPartSizeBytes: 5 * 1024 * 1024,
      syncAgentVersion: '1.0.0',
      deduplicateByHash: true,
    };

    // TypeScript compile-time check; runtime just verify shape
    expect(config.bucketName).toBe('test');
    expect(config.hashAlgorithm).toBe('sha256');
  });
});
