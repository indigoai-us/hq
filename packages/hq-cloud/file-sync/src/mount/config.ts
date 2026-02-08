/**
 * Configuration builder for S3 mount settings.
 *
 * Environment variables:
 * - S3_MOUNT_BUCKET: S3 bucket name (falls back to S3_BUCKET_NAME)
 * - S3_MOUNT_REGION: AWS region (falls back to S3_REGION)
 * - S3_MOUNT_PREFIX: S3 prefix to mount (e.g., userId/hq)
 * - S3_MOUNT_POINT: Local mount point (default: /hq)
 * - S3_MOUNT_BACKEND: Preferred backend - s3fs or goofys (default: goofys)
 * - S3_MOUNT_FALLBACK: Enable AWS CLI fallback (default: true)
 * - S3_MOUNT_CACHE_DIR: Cache directory (default: /tmp/s3-cache)
 * - S3_MOUNT_CACHE_SIZE_MB: Max cache size in MB (default: 1024)
 * - S3_MOUNT_CACHE_TTL: Cache TTL in seconds (default: 300)
 * - S3_MOUNT_ALLOW_OTHER: Allow other users to access mount (default: true)
 * - S3_MOUNT_RETRIES: Max retries for failed operations (default: 3)
 * - S3_MOUNT_PARALLEL: Max parallel S3 requests (default: 20)
 */

import type {
  S3MountConfig,
  MountCacheConfig,
  MountOptions,
  MountCredentials,
  MountBackend,
} from './types.js';

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

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

/**
 * Build the default cache configuration.
 */
export function buildCacheConfig(): MountCacheConfig {
  return {
    enabled: getEnvBoolean('S3_MOUNT_CACHE_ENABLED', true),
    cacheDir: getEnv('S3_MOUNT_CACHE_DIR', '/tmp/s3-cache'),
    maxSizeMb: getEnvNumber('S3_MOUNT_CACHE_SIZE_MB', 1024),
    ttlSeconds: getEnvNumber('S3_MOUNT_CACHE_TTL', 300),
    checkOnOpen: getEnvBoolean('S3_MOUNT_CACHE_CHECK_ON_OPEN', true),
    statCacheEnabled: getEnvBoolean('S3_MOUNT_STAT_CACHE', true),
    statCacheTtlSeconds: getEnvNumber('S3_MOUNT_STAT_CACHE_TTL', 60),
    typeCacheTtlSeconds: getEnvNumber('S3_MOUNT_TYPE_CACHE_TTL', 60),
  };
}

/**
 * Build the default mount options.
 */
export function buildMountOptions(): MountOptions {
  return {
    allowOther: getEnvBoolean('S3_MOUNT_ALLOW_OTHER', true),
    fileMode: getEnvNumber('S3_MOUNT_FILE_MODE', 0o644),
    dirMode: getEnvNumber('S3_MOUNT_DIR_MODE', 0o755),
    uid: process.env['S3_MOUNT_UID'] ? getEnvNumber('S3_MOUNT_UID', 0) : undefined,
    gid: process.env['S3_MOUNT_GID'] ? getEnvNumber('S3_MOUNT_GID', 0) : undefined,
    retries: getEnvNumber('S3_MOUNT_RETRIES', 3),
    connectTimeout: getEnvNumber('S3_MOUNT_CONNECT_TIMEOUT', 10),
    readTimeout: getEnvNumber('S3_MOUNT_READ_TIMEOUT', 30),
    parallelCount: getEnvNumber('S3_MOUNT_PARALLEL', 20),
    multipartThresholdMb: getEnvNumber('S3_MOUNT_MULTIPART_THRESHOLD_MB', 8),
    sseEnabled: getEnvBoolean('S3_MOUNT_SSE', true),
    extraOptions: process.env['S3_MOUNT_EXTRA_OPTIONS']
      ? getEnv('S3_MOUNT_EXTRA_OPTIONS', '').split(',').filter(Boolean)
      : [],
  };
}

/**
 * Build credentials configuration.
 * Defaults to IAM role (ECS task role) which is the preferred method in containers.
 */
export function buildCredentials(): MountCredentials {
  return {
    useIamRole: getEnvBoolean('S3_MOUNT_USE_IAM_ROLE', true),
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
    sessionToken: process.env['AWS_SESSION_TOKEN'],
    credentialsFile: process.env['S3_MOUNT_CREDENTIALS_FILE'],
  };
}

/**
 * Build the complete S3 mount configuration.
 */
export function buildMountConfig(overrides?: Partial<S3MountConfig>): S3MountConfig {
  const env = getEnv('NODE_ENV', 'development');
  const defaultBucketName = `hq-cloud-files-${env}`;

  const config: S3MountConfig = {
    bucketName: getEnv('S3_MOUNT_BUCKET', getEnv('S3_BUCKET_NAME', defaultBucketName)),
    region: getEnv('S3_MOUNT_REGION', getEnv('S3_REGION', 'us-east-1')),
    prefix: getEnv('S3_MOUNT_PREFIX', ''),
    mountPoint: getEnv('S3_MOUNT_POINT', '/hq'),
    preferredBackend: getEnv('S3_MOUNT_BACKEND', 'goofys') as MountBackend,
    enableFallback: getEnvBoolean('S3_MOUNT_FALLBACK', true),
    cache: buildCacheConfig(),
    mountOptions: buildMountOptions(),
    credentials: buildCredentials(),
  };

  return { ...config, ...overrides };
}

/**
 * Validate a mount configuration for completeness and correctness.
 * Returns an array of validation errors (empty = valid).
 */
export function validateMountConfig(config: S3MountConfig): string[] {
  const errors: string[] = [];

  if (!config.bucketName || config.bucketName.length < 3) {
    errors.push('Bucket name must be at least 3 characters');
  }

  if (!config.region) {
    errors.push('Region is required');
  }

  if (!config.mountPoint) {
    errors.push('Mount point is required');
  }

  if (!config.mountPoint.startsWith('/')) {
    errors.push('Mount point must be an absolute path');
  }

  if (config.preferredBackend !== 's3fs' && config.preferredBackend !== 'goofys') {
    errors.push('Preferred backend must be "s3fs" or "goofys"');
  }

  if (config.cache.enabled) {
    if (!config.cache.cacheDir) {
      errors.push('Cache directory is required when caching is enabled');
    }

    if (config.cache.maxSizeMb <= 0) {
      errors.push('Cache max size must be greater than 0');
    }

    if (config.cache.ttlSeconds <= 0) {
      errors.push('Cache TTL must be greater than 0');
    }
  }

  if (config.mountOptions.retries < 0) {
    errors.push('Retries must be non-negative');
  }

  if (config.mountOptions.parallelCount <= 0) {
    errors.push('Parallel count must be greater than 0');
  }

  if (config.mountOptions.connectTimeout <= 0) {
    errors.push('Connect timeout must be greater than 0');
  }

  if (config.mountOptions.readTimeout <= 0) {
    errors.push('Read timeout must be greater than 0');
  }

  if (!config.credentials.useIamRole && !config.credentials.accessKeyId) {
    errors.push(
      'Either IAM role or access key credentials are required'
    );
  }

  return errors;
}
