import type {
  S3BucketConfig,
  LifecycleRule,
  CorsRule,
  PublicAccessBlockConfig,
  EncryptionConfig,
} from './types.js';

/**
 * Environment-based configuration for S3 bucket infrastructure.
 */

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/** Default encryption: AES-256 server-side encryption */
const defaultEncryption: EncryptionConfig = {
  algorithm: 'AES256',
  bucketKeyEnabled: true,
};

/** KMS encryption for production environments */
const kmsEncryption = (kmsKeyArn: string): EncryptionConfig => ({
  algorithm: 'aws:kms',
  kmsKeyArn,
  bucketKeyEnabled: true,
});

/**
 * Lifecycle rules for managing S3 object versions.
 *
 * - Old versions move to Standard-IA after 30 days
 * - Old versions move to Glacier after 90 days
 * - Noncurrent versions expire after 365 days, keeping last 5
 * - Incomplete multipart uploads abort after 7 days
 */
function defaultLifecycleRules(): LifecycleRule[] {
  return [
    {
      id: 'noncurrent-version-management',
      enabled: true,
      prefix: '',
      transitions: [
        { days: 30, storageClass: 'STANDARD_IA' },
        { days: 90, storageClass: 'GLACIER' },
      ],
      noncurrentVersionExpiration: getEnvNumber(
        'S3_NONCURRENT_VERSION_EXPIRATION_DAYS',
        365
      ),
      noncurrentVersionsToRetain: getEnvNumber('S3_NONCURRENT_VERSIONS_TO_RETAIN', 5),
    },
    {
      id: 'abort-incomplete-multipart',
      enabled: true,
      prefix: '',
      transitions: [],
      abortIncompleteMultipartUploadDays: 7,
    },
  ];
}

/** Default CORS rules allowing web client access */
function defaultCorsRules(): CorsRule[] {
  const origins = getEnv('S3_CORS_ORIGINS', '*');
  return [
    {
      allowedOrigins: origins === '*' ? ['*'] : origins.split(','),
      allowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
      allowedHeaders: ['*'],
      exposedHeaders: ['ETag', 'x-amz-meta-content-hash', 'x-amz-version-id'],
      maxAgeSeconds: 3600,
    },
  ];
}

/** Block all public access by default */
const defaultPublicAccessBlock: PublicAccessBlockConfig = {
  blockPublicAcls: true,
  ignorePublicAcls: true,
  blockPublicPolicy: true,
  restrictPublicBuckets: true,
};

/**
 * Build the complete S3 bucket configuration.
 *
 * Environment variables:
 * - S3_BUCKET_NAME: Bucket name (default: hq-cloud-files-{NODE_ENV})
 * - S3_REGION: AWS region (default: us-east-1)
 * - S3_KMS_KEY_ARN: KMS key ARN for encryption (optional, uses AES256 if not set)
 * - S3_CORS_ORIGINS: Comma-separated CORS origins (default: *)
 * - S3_NONCURRENT_VERSION_EXPIRATION_DAYS: Days to keep old versions (default: 365)
 * - S3_NONCURRENT_VERSIONS_TO_RETAIN: Noncurrent versions to keep (default: 5)
 */
export function buildBucketConfig(): S3BucketConfig {
  const env = getEnv('NODE_ENV', 'development');
  const kmsKeyArn = process.env['S3_KMS_KEY_ARN'];

  return {
    bucketName: getEnv('S3_BUCKET_NAME', `hq-cloud-files-${env}`),
    region: getEnv('S3_REGION', 'us-east-1'),
    versioning: true,
    encryption: kmsKeyArn ? kmsEncryption(kmsKeyArn) : defaultEncryption,
    lifecycleRules: defaultLifecycleRules(),
    corsRules: defaultCorsRules(),
    publicAccessBlock: defaultPublicAccessBlock,
  };
}

/**
 * Validate a bucket configuration for completeness and correctness.
 * Returns an array of validation errors (empty = valid).
 */
export function validateBucketConfig(config: S3BucketConfig): string[] {
  const errors: string[] = [];

  if (!config.bucketName || config.bucketName.length < 3) {
    errors.push('Bucket name must be at least 3 characters');
  }

  if (config.bucketName.length > 63) {
    errors.push('Bucket name must not exceed 63 characters');
  }

  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(config.bucketName)) {
    errors.push(
      'Bucket name must start and end with lowercase letter or number, and contain only lowercase letters, numbers, hyphens, and periods'
    );
  }

  if (!config.region) {
    errors.push('Region is required');
  }

  if (!config.versioning) {
    errors.push('Versioning must be enabled for HQ file sync');
  }

  if (config.encryption.algorithm === 'aws:kms' && !config.encryption.kmsKeyArn) {
    errors.push('KMS key ARN is required when using aws:kms encryption');
  }

  if (config.lifecycleRules.length === 0) {
    errors.push('At least one lifecycle rule is required');
  }

  if (!config.publicAccessBlock.blockPublicAcls) {
    errors.push('Public ACLs must be blocked for security');
  }

  if (!config.publicAccessBlock.blockPublicPolicy) {
    errors.push('Public policies must be blocked for security');
  }

  return errors;
}
