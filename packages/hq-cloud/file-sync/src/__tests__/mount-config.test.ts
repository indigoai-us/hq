import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildMountConfig,
  validateMountConfig,
  buildCacheConfig,
  buildMountOptions,
  buildCredentials,
} from '../mount/config.js';

describe('Mount Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('buildMountConfig', () => {
    it('should return default config', () => {
      process.env['NODE_ENV'] = 'development';
      const config = buildMountConfig();

      expect(config.bucketName).toBe('hq-cloud-files-development');
      expect(config.region).toBe('us-east-1');
      expect(config.prefix).toBe('');
      expect(config.mountPoint).toBe('/hq');
      expect(config.preferredBackend).toBe('goofys');
      expect(config.enableFallback).toBe(true);
    });

    it('should use custom bucket name from env', () => {
      process.env['S3_MOUNT_BUCKET'] = 'my-mount-bucket';
      const config = buildMountConfig();

      expect(config.bucketName).toBe('my-mount-bucket');
    });

    it('should fall back to S3_BUCKET_NAME env', () => {
      process.env['S3_BUCKET_NAME'] = 'fallback-bucket';
      const config = buildMountConfig();

      expect(config.bucketName).toBe('fallback-bucket');
    });

    it('should use custom region from env', () => {
      process.env['S3_MOUNT_REGION'] = 'eu-west-1';
      const config = buildMountConfig();

      expect(config.region).toBe('eu-west-1');
    });

    it('should use custom mount point from env', () => {
      process.env['S3_MOUNT_POINT'] = '/mnt/hq';
      const config = buildMountConfig();

      expect(config.mountPoint).toBe('/mnt/hq');
    });

    it('should use custom prefix from env', () => {
      process.env['S3_MOUNT_PREFIX'] = 'user-123/hq';
      const config = buildMountConfig();

      expect(config.prefix).toBe('user-123/hq');
    });

    it('should use s3fs backend from env', () => {
      process.env['S3_MOUNT_BACKEND'] = 's3fs';
      const config = buildMountConfig();

      expect(config.preferredBackend).toBe('s3fs');
    });

    it('should disable fallback from env', () => {
      process.env['S3_MOUNT_FALLBACK'] = 'false';
      const config = buildMountConfig();

      expect(config.enableFallback).toBe(false);
    });

    it('should apply overrides', () => {
      const config = buildMountConfig({
        bucketName: 'override-bucket',
        region: 'ap-southeast-1',
        mountPoint: '/override',
      });

      expect(config.bucketName).toBe('override-bucket');
      expect(config.region).toBe('ap-southeast-1');
      expect(config.mountPoint).toBe('/override');
    });

    it('should include cache config', () => {
      const config = buildMountConfig();

      expect(config.cache).toBeDefined();
      expect(config.cache.enabled).toBe(true);
      expect(config.cache.cacheDir).toBe('/tmp/s3-cache');
    });

    it('should include mount options', () => {
      const config = buildMountConfig();

      expect(config.mountOptions).toBeDefined();
      expect(config.mountOptions.retries).toBe(3);
      expect(config.mountOptions.parallelCount).toBe(20);
    });

    it('should include credentials', () => {
      const config = buildMountConfig();

      expect(config.credentials).toBeDefined();
      expect(config.credentials.useIamRole).toBe(true);
    });
  });

  describe('buildCacheConfig', () => {
    it('should return default cache config', () => {
      const cache = buildCacheConfig();

      expect(cache.enabled).toBe(true);
      expect(cache.cacheDir).toBe('/tmp/s3-cache');
      expect(cache.maxSizeMb).toBe(1024);
      expect(cache.ttlSeconds).toBe(300);
      expect(cache.checkOnOpen).toBe(true);
      expect(cache.statCacheEnabled).toBe(true);
      expect(cache.statCacheTtlSeconds).toBe(60);
      expect(cache.typeCacheTtlSeconds).toBe(60);
    });

    it('should use custom cache size from env', () => {
      process.env['S3_MOUNT_CACHE_SIZE_MB'] = '2048';
      const cache = buildCacheConfig();

      expect(cache.maxSizeMb).toBe(2048);
    });

    it('should use custom cache TTL from env', () => {
      process.env['S3_MOUNT_CACHE_TTL'] = '600';
      const cache = buildCacheConfig();

      expect(cache.ttlSeconds).toBe(600);
    });

    it('should disable cache from env', () => {
      process.env['S3_MOUNT_CACHE_ENABLED'] = 'false';
      const cache = buildCacheConfig();

      expect(cache.enabled).toBe(false);
    });
  });

  describe('buildMountOptions', () => {
    it('should return default mount options', () => {
      const opts = buildMountOptions();

      expect(opts.allowOther).toBe(true);
      expect(opts.fileMode).toBe(0o644);
      expect(opts.dirMode).toBe(0o755);
      expect(opts.retries).toBe(3);
      expect(opts.connectTimeout).toBe(10);
      expect(opts.readTimeout).toBe(30);
      expect(opts.parallelCount).toBe(20);
      expect(opts.multipartThresholdMb).toBe(8);
      expect(opts.sseEnabled).toBe(true);
      expect(opts.extraOptions).toEqual([]);
    });

    it('should not set uid/gid by default', () => {
      const opts = buildMountOptions();

      expect(opts.uid).toBeUndefined();
      expect(opts.gid).toBeUndefined();
    });

    it('should set uid/gid from env', () => {
      process.env['S3_MOUNT_UID'] = '1000';
      process.env['S3_MOUNT_GID'] = '1000';
      const opts = buildMountOptions();

      expect(opts.uid).toBe(1000);
      expect(opts.gid).toBe(1000);
    });

    it('should parse extra options from env', () => {
      process.env['S3_MOUNT_EXTRA_OPTIONS'] = 'opt1,opt2,opt3';
      const opts = buildMountOptions();

      expect(opts.extraOptions).toEqual(['opt1', 'opt2', 'opt3']);
    });
  });

  describe('buildCredentials', () => {
    it('should default to IAM role', () => {
      const creds = buildCredentials();

      expect(creds.useIamRole).toBe(true);
    });

    it('should pick up AWS credentials from env', () => {
      process.env['AWS_ACCESS_KEY_ID'] = 'AKIAIOSFODNN7EXAMPLE';
      process.env['AWS_SECRET_ACCESS_KEY'] = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      process.env['AWS_SESSION_TOKEN'] = 'FwoGZXIvYXdzEBYaDHqa0AP';
      const creds = buildCredentials();

      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(creds.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(creds.sessionToken).toBe('FwoGZXIvYXdzEBYaDHqa0AP');
    });

    it('should pick up credentials file from env', () => {
      process.env['S3_MOUNT_CREDENTIALS_FILE'] = '/etc/passwd-s3fs';
      const creds = buildCredentials();

      expect(creds.credentialsFile).toBe('/etc/passwd-s3fs');
    });
  });

  describe('validateMountConfig', () => {
    it('should pass for valid default config', () => {
      const config = buildMountConfig();
      const errors = validateMountConfig(config);

      expect(errors).toHaveLength(0);
    });

    it('should fail for empty bucket name', () => {
      const config = buildMountConfig({ bucketName: '' });
      const errors = validateMountConfig(config);

      expect(errors).toContain('Bucket name must be at least 3 characters');
    });

    it('should fail for short bucket name', () => {
      const config = buildMountConfig({ bucketName: 'ab' });
      const errors = validateMountConfig(config);

      expect(errors).toContain('Bucket name must be at least 3 characters');
    });

    it('should fail for empty region', () => {
      const config = buildMountConfig({ region: '' });
      const errors = validateMountConfig(config);

      expect(errors).toContain('Region is required');
    });

    it('should fail for empty mount point', () => {
      const config = buildMountConfig({ mountPoint: '' });
      const errors = validateMountConfig(config);

      expect(errors).toContain('Mount point is required');
    });

    it('should fail for relative mount point', () => {
      const config = buildMountConfig({ mountPoint: 'relative/path' });
      const errors = validateMountConfig(config);

      expect(errors).toContain('Mount point must be an absolute path');
    });

    it('should fail for invalid backend', () => {
      const config = buildMountConfig();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      (config as any).preferredBackend = 'invalid';
      const errors = validateMountConfig(config);

      expect(errors).toContain('Preferred backend must be "s3fs" or "goofys"');
    });

    it('should fail for zero cache size when cache enabled', () => {
      const config = buildMountConfig();
      config.cache.maxSizeMb = 0;
      const errors = validateMountConfig(config);

      expect(errors).toContain('Cache max size must be greater than 0');
    });

    it('should fail for zero cache TTL when cache enabled', () => {
      const config = buildMountConfig();
      config.cache.ttlSeconds = 0;
      const errors = validateMountConfig(config);

      expect(errors).toContain('Cache TTL must be greater than 0');
    });

    it('should not validate cache when disabled', () => {
      const config = buildMountConfig();
      config.cache.enabled = false;
      config.cache.maxSizeMb = 0;
      config.cache.ttlSeconds = 0;
      const errors = validateMountConfig(config);

      expect(errors).toHaveLength(0);
    });

    it('should fail for negative retries', () => {
      const config = buildMountConfig();
      config.mountOptions.retries = -1;
      const errors = validateMountConfig(config);

      expect(errors).toContain('Retries must be non-negative');
    });

    it('should fail for zero parallel count', () => {
      const config = buildMountConfig();
      config.mountOptions.parallelCount = 0;
      const errors = validateMountConfig(config);

      expect(errors).toContain('Parallel count must be greater than 0');
    });

    it('should fail for zero connect timeout', () => {
      const config = buildMountConfig();
      config.mountOptions.connectTimeout = 0;
      const errors = validateMountConfig(config);

      expect(errors).toContain('Connect timeout must be greater than 0');
    });

    it('should fail for zero read timeout', () => {
      const config = buildMountConfig();
      config.mountOptions.readTimeout = 0;
      const errors = validateMountConfig(config);

      expect(errors).toContain('Read timeout must be greater than 0');
    });

    it('should fail when no credentials configured', () => {
      const config = buildMountConfig();
      config.credentials.useIamRole = false;
      config.credentials.accessKeyId = undefined;
      const errors = validateMountConfig(config);

      expect(errors).toContain(
        'Either IAM role or access key credentials are required'
      );
    });

    it('should pass when using access key instead of IAM role', () => {
      const config = buildMountConfig();
      config.credentials.useIamRole = false;
      config.credentials.accessKeyId = 'AKIAIOSFODNN7EXAMPLE';
      const errors = validateMountConfig(config);

      expect(errors).toHaveLength(0);
    });
  });
});
