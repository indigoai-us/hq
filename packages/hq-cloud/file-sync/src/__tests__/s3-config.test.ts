import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildBucketConfig, validateBucketConfig } from '../s3/config.js';

describe('S3 Bucket Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('buildBucketConfig', () => {
    it('should return default config for development', () => {
      process.env['NODE_ENV'] = 'development';
      const config = buildBucketConfig();

      expect(config.bucketName).toBe('hq-cloud-files-development');
      expect(config.region).toBe('us-east-1');
      expect(config.versioning).toBe(true);
      expect(config.encryption.algorithm).toBe('AES256');
      expect(config.encryption.bucketKeyEnabled).toBe(true);
      expect(config.publicAccessBlock.blockPublicAcls).toBe(true);
      expect(config.publicAccessBlock.blockPublicPolicy).toBe(true);
      expect(config.publicAccessBlock.ignorePublicAcls).toBe(true);
      expect(config.publicAccessBlock.restrictPublicBuckets).toBe(true);
    });

    it('should use custom bucket name from env', () => {
      process.env['S3_BUCKET_NAME'] = 'my-custom-bucket';
      const config = buildBucketConfig();

      expect(config.bucketName).toBe('my-custom-bucket');
    });

    it('should use custom region from env', () => {
      process.env['S3_REGION'] = 'eu-west-1';
      const config = buildBucketConfig();

      expect(config.region).toBe('eu-west-1');
    });

    it('should use KMS encryption when key ARN is provided', () => {
      process.env['S3_KMS_KEY_ARN'] = 'arn:aws:kms:us-east-1:123456789:key/test-key';
      const config = buildBucketConfig();

      expect(config.encryption.algorithm).toBe('aws:kms');
      expect(config.encryption.kmsKeyArn).toBe(
        'arn:aws:kms:us-east-1:123456789:key/test-key'
      );
    });

    it('should include lifecycle rules for version management', () => {
      const config = buildBucketConfig();

      expect(config.lifecycleRules.length).toBeGreaterThanOrEqual(2);

      const versionRule = config.lifecycleRules.find(
        (r) => r.id === 'noncurrent-version-management'
      );
      expect(versionRule).toBeDefined();
      expect(versionRule?.enabled).toBe(true);
      expect(versionRule?.noncurrentVersionExpiration).toBe(365);
      expect(versionRule?.noncurrentVersionsToRetain).toBe(5);
      expect(versionRule?.transitions).toHaveLength(2);
      expect(versionRule?.transitions[0]?.storageClass).toBe('STANDARD_IA');
      expect(versionRule?.transitions[1]?.storageClass).toBe('GLACIER');
    });

    it('should include abort incomplete multipart upload rule', () => {
      const config = buildBucketConfig();

      const abortRule = config.lifecycleRules.find(
        (r) => r.id === 'abort-incomplete-multipart'
      );
      expect(abortRule).toBeDefined();
      expect(abortRule?.abortIncompleteMultipartUploadDays).toBe(7);
    });

    it('should include CORS rules', () => {
      const config = buildBucketConfig();

      expect(config.corsRules).toHaveLength(1);
      expect(config.corsRules[0]?.allowedMethods).toContain('GET');
      expect(config.corsRules[0]?.allowedMethods).toContain('PUT');
      expect(config.corsRules[0]?.exposedHeaders).toContain('ETag');
    });

    it('should respect custom CORS origins', () => {
      process.env['S3_CORS_ORIGINS'] = 'https://app.hq.cloud,https://admin.hq.cloud';
      const config = buildBucketConfig();

      expect(config.corsRules[0]?.allowedOrigins).toEqual([
        'https://app.hq.cloud',
        'https://admin.hq.cloud',
      ]);
    });

    it('should respect custom version expiration from env', () => {
      process.env['S3_NONCURRENT_VERSION_EXPIRATION_DAYS'] = '180';
      process.env['S3_NONCURRENT_VERSIONS_TO_RETAIN'] = '3';
      const config = buildBucketConfig();

      const versionRule = config.lifecycleRules.find(
        (r) => r.id === 'noncurrent-version-management'
      );
      expect(versionRule?.noncurrentVersionExpiration).toBe(180);
      expect(versionRule?.noncurrentVersionsToRetain).toBe(3);
    });
  });

  describe('validateBucketConfig', () => {
    it('should pass for valid default config', () => {
      const config = buildBucketConfig();
      const errors = validateBucketConfig(config);

      expect(errors).toHaveLength(0);
    });

    it('should fail for bucket name too short', () => {
      const config = buildBucketConfig();
      config.bucketName = 'ab';
      const errors = validateBucketConfig(config);

      expect(errors).toContain('Bucket name must be at least 3 characters');
    });

    it('should fail for bucket name too long', () => {
      const config = buildBucketConfig();
      config.bucketName = 'a'.repeat(64);
      const errors = validateBucketConfig(config);

      expect(errors).toContain('Bucket name must not exceed 63 characters');
    });

    it('should fail for invalid bucket name characters', () => {
      const config = buildBucketConfig();
      config.bucketName = 'My_Invalid_Bucket';
      const errors = validateBucketConfig(config);

      expect(errors.some((e) => e.includes('lowercase'))).toBe(true);
    });

    it('should fail when versioning is disabled', () => {
      const config = buildBucketConfig();
      config.versioning = false;
      const errors = validateBucketConfig(config);

      expect(errors).toContain('Versioning must be enabled for HQ file sync');
    });

    it('should fail when KMS encryption missing key ARN', () => {
      const config = buildBucketConfig();
      config.encryption = {
        algorithm: 'aws:kms',
        bucketKeyEnabled: true,
      };
      const errors = validateBucketConfig(config);

      expect(errors).toContain(
        'KMS key ARN is required when using aws:kms encryption'
      );
    });

    it('should fail when lifecycle rules are empty', () => {
      const config = buildBucketConfig();
      config.lifecycleRules = [];
      const errors = validateBucketConfig(config);

      expect(errors).toContain('At least one lifecycle rule is required');
    });

    it('should fail when public access is not blocked', () => {
      const config = buildBucketConfig();
      config.publicAccessBlock.blockPublicAcls = false;
      const errors = validateBucketConfig(config);

      expect(errors).toContain('Public ACLs must be blocked for security');
    });

    it('should fail when public policies are not blocked', () => {
      const config = buildBucketConfig();
      config.publicAccessBlock.blockPublicPolicy = false;
      const errors = validateBucketConfig(config);

      expect(errors).toContain('Public policies must be blocked for security');
    });
  });
});
