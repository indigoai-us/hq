import { describe, it, expect, afterEach } from 'vitest';
import { buildDownloadConfig, validateDownloadConfig } from '../download/config.js';
import type { DownloadSyncConfig } from '../download/types.js';

describe('buildDownloadConfig', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('should build config with defaults', () => {
    const config = buildDownloadConfig({
      bucketName: 'test-bucket',
      localDir: '/tmp/hq',
    });

    expect(config.bucketName).toBe('test-bucket');
    expect(config.localDir).toBe('/tmp/hq');
    expect(config.region).toBe('us-east-1');
    expect(config.pollIntervalMs).toBe(30_000);
    expect(config.maxConcurrentDownloads).toBe(5);
    expect(config.deletedFilePolicy).toBe('keep');
    expect(config.preserveTimestamps).toBe(true);
    expect(config.maxListPages).toBe(100);
    expect(config.excludePatterns).toEqual([]);
  });

  it('should read bucket name from environment', () => {
    process.env['S3_BUCKET_NAME'] = 'env-bucket';
    const config = buildDownloadConfig({ localDir: '/tmp/hq' });
    expect(config.bucketName).toBe('env-bucket');
  });

  it('should read region from environment', () => {
    process.env['S3_REGION'] = 'eu-west-1';
    const config = buildDownloadConfig({
      bucketName: 'b',
      localDir: '/tmp/hq',
    });
    expect(config.region).toBe('eu-west-1');
  });

  it('should build s3Prefix from HQ_USER_ID', () => {
    process.env['HQ_USER_ID'] = 'user123';
    const config = buildDownloadConfig({
      bucketName: 'b',
      localDir: '/tmp/hq',
    });
    expect(config.s3Prefix).toBe('user123/hq/');
  });

  it('should allow overriding s3Prefix', () => {
    const config = buildDownloadConfig({
      bucketName: 'b',
      localDir: '/tmp/hq',
      s3Prefix: 'custom/prefix/',
    });
    expect(config.s3Prefix).toBe('custom/prefix/');
  });

  it('should read poll interval from environment', () => {
    process.env['HQ_DOWNLOAD_POLL_INTERVAL_MS'] = '60000';
    const config = buildDownloadConfig({
      bucketName: 'b',
      localDir: '/tmp/hq',
    });
    expect(config.pollIntervalMs).toBe(60_000);
  });

  it('should read deleted file policy from environment', () => {
    process.env['HQ_DOWNLOAD_DELETED_POLICY'] = 'delete';
    const config = buildDownloadConfig({
      bucketName: 'b',
      localDir: '/tmp/hq',
    });
    expect(config.deletedFilePolicy).toBe('delete');
  });

  it('should fallback to keep for invalid deleted policy', () => {
    process.env['HQ_DOWNLOAD_DELETED_POLICY'] = 'invalid';
    const config = buildDownloadConfig({
      bucketName: 'b',
      localDir: '/tmp/hq',
    });
    expect(config.deletedFilePolicy).toBe('keep');
  });

  it('should read exclude patterns from environment', () => {
    process.env['HQ_DOWNLOAD_EXCLUDE'] = '*.tmp, *.log';
    const config = buildDownloadConfig({
      bucketName: 'b',
      localDir: '/tmp/hq',
    });
    expect(config.excludePatterns).toEqual(['*.tmp', '*.log']);
  });

  it('should prefer overrides over env vars', () => {
    process.env['S3_BUCKET_NAME'] = 'env-bucket';
    const config = buildDownloadConfig({
      bucketName: 'override-bucket',
      localDir: '/tmp/hq',
    });
    expect(config.bucketName).toBe('override-bucket');
  });
});

describe('validateDownloadConfig', () => {
  function makeValidConfig(): DownloadSyncConfig {
    return {
      bucketName: 'test-bucket',
      region: 'us-east-1',
      s3Prefix: 'user/hq/',
      localDir: '/tmp/hq',
      pollIntervalMs: 30_000,
      maxConcurrentDownloads: 5,
      deletedFilePolicy: 'keep',
      trashDir: '/tmp/hq/.hq-trash',
      stateFilePath: '/tmp/hq/.hq-sync-state.json',
      excludePatterns: [],
      preserveTimestamps: true,
      maxListPages: 100,
    };
  }

  it('should pass for valid config', () => {
    const errors = validateDownloadConfig(makeValidConfig());
    expect(errors).toHaveLength(0);
  });

  it('should require bucketName', () => {
    const config = { ...makeValidConfig(), bucketName: '' };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('bucketName is required');
  });

  it('should require region', () => {
    const config = { ...makeValidConfig(), region: '' };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('region is required');
  });

  it('should require s3Prefix', () => {
    const config = { ...makeValidConfig(), s3Prefix: '' };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('s3Prefix is required');
  });

  it('should require localDir', () => {
    const config = { ...makeValidConfig(), localDir: '' };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('localDir is required');
  });

  it('should require pollIntervalMs >= 5000', () => {
    const config = { ...makeValidConfig(), pollIntervalMs: 1000 };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('pollIntervalMs must be at least 5000 (5 seconds)');
  });

  it('should require pollIntervalMs <= 3600000', () => {
    const config = { ...makeValidConfig(), pollIntervalMs: 5_000_000 };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('pollIntervalMs must not exceed 3600000 (1 hour)');
  });

  it('should require maxConcurrentDownloads >= 1', () => {
    const config = { ...makeValidConfig(), maxConcurrentDownloads: 0 };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('maxConcurrentDownloads must be at least 1');
  });

  it('should require maxConcurrentDownloads <= 50', () => {
    const config = { ...makeValidConfig(), maxConcurrentDownloads: 100 };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('maxConcurrentDownloads must not exceed 50');
  });

  it('should require trashDir when policy is trash', () => {
    const config = { ...makeValidConfig(), deletedFilePolicy: 'trash' as const, trashDir: '' };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('trashDir is required when deletedFilePolicy is "trash"');
  });

  it('should not require trashDir when policy is keep', () => {
    const config = { ...makeValidConfig(), deletedFilePolicy: 'keep' as const, trashDir: '' };
    const errors = validateDownloadConfig(config);
    expect(errors).not.toContain('trashDir is required when deletedFilePolicy is "trash"');
  });

  it('should require stateFilePath', () => {
    const config = { ...makeValidConfig(), stateFilePath: '' };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('stateFilePath is required');
  });

  it('should require maxListPages >= 1', () => {
    const config = { ...makeValidConfig(), maxListPages: 0 };
    const errors = validateDownloadConfig(config);
    expect(errors).toContain('maxListPages must be at least 1');
  });
});
