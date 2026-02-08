/**
 * Download sync configuration builder.
 *
 * Reads from environment variables with sensible defaults.
 * All values can be overridden programmatically.
 */

import * as path from 'node:path';
import type { DownloadSyncConfig, DeletedFilePolicy } from './types.js';
import { DEFAULT_DOWNLOAD_CONFIG } from './types.js';

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function getEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? fallback : parsed;
}

const VALID_DELETE_POLICIES: DeletedFilePolicy[] = ['delete', 'keep', 'trash'];

/**
 * Build download sync config from environment variables and optional overrides.
 *
 * Environment variables:
 * - S3_BUCKET_NAME: S3 bucket name (required unless overridden)
 * - S3_REGION: AWS region (default: us-east-1)
 * - HQ_USER_ID: User ID for S3 prefix
 * - HQ_DIR: Local HQ directory path
 * - HQ_DOWNLOAD_POLL_INTERVAL_MS: Poll interval (default: 30000)
 * - HQ_DOWNLOAD_MAX_CONCURRENT: Max concurrent downloads (default: 5)
 * - HQ_DOWNLOAD_DELETED_POLICY: How to handle deleted files (delete|keep|trash, default: keep)
 * - HQ_DOWNLOAD_TRASH_DIR: Directory for trashed files
 * - HQ_DOWNLOAD_STATE_FILE: Path to sync state file
 * - HQ_DOWNLOAD_EXCLUDE: Comma-separated exclude patterns
 */
export function buildDownloadConfig(
  overrides?: Partial<DownloadSyncConfig>
): DownloadSyncConfig {
  const localDir = overrides?.localDir ?? getEnv('HQ_DIR', '');
  const userId = getEnv('HQ_USER_ID', 'default');
  const s3Prefix = overrides?.s3Prefix ?? `${userId}/hq/`;

  const envDeletePolicy = getEnv('HQ_DOWNLOAD_DELETED_POLICY', 'keep') as DeletedFilePolicy;
  const deletedFilePolicy =
    overrides?.deletedFilePolicy ??
    (VALID_DELETE_POLICIES.includes(envDeletePolicy) ? envDeletePolicy : 'keep');

  const envExclude = process.env['HQ_DOWNLOAD_EXCLUDE'];
  const excludePatterns = overrides?.excludePatterns ??
    (envExclude ? envExclude.split(',').map((p) => p.trim()) : []);

  return {
    bucketName: overrides?.bucketName ?? getEnv('S3_BUCKET_NAME', ''),
    region: overrides?.region ?? getEnv('S3_REGION', 'us-east-1'),
    s3Prefix,
    localDir,
    pollIntervalMs:
      overrides?.pollIntervalMs ??
      getEnvNumber('HQ_DOWNLOAD_POLL_INTERVAL_MS', DEFAULT_DOWNLOAD_CONFIG.pollIntervalMs),
    maxConcurrentDownloads:
      overrides?.maxConcurrentDownloads ??
      getEnvNumber('HQ_DOWNLOAD_MAX_CONCURRENT', DEFAULT_DOWNLOAD_CONFIG.maxConcurrentDownloads),
    deletedFilePolicy,
    trashDir:
      overrides?.trashDir ??
      getEnv('HQ_DOWNLOAD_TRASH_DIR', path.join(localDir, '.hq-trash')),
    stateFilePath:
      overrides?.stateFilePath ??
      getEnv('HQ_DOWNLOAD_STATE_FILE', path.join(localDir, '.hq-sync-state.json')),
    excludePatterns,
    preserveTimestamps:
      overrides?.preserveTimestamps ?? DEFAULT_DOWNLOAD_CONFIG.preserveTimestamps,
    maxListPages:
      overrides?.maxListPages ??
      getEnvNumber('HQ_DOWNLOAD_MAX_LIST_PAGES', DEFAULT_DOWNLOAD_CONFIG.maxListPages),
  };
}

/**
 * Validate a download sync configuration.
 * Returns an array of error messages (empty = valid).
 */
export function validateDownloadConfig(config: DownloadSyncConfig): string[] {
  const errors: string[] = [];

  if (!config.bucketName) {
    errors.push('bucketName is required');
  }

  if (!config.region) {
    errors.push('region is required');
  }

  if (!config.s3Prefix) {
    errors.push('s3Prefix is required');
  }

  if (!config.localDir) {
    errors.push('localDir is required');
  }

  if (config.pollIntervalMs < 5000) {
    errors.push('pollIntervalMs must be at least 5000 (5 seconds)');
  }

  if (config.pollIntervalMs > 3_600_000) {
    errors.push('pollIntervalMs must not exceed 3600000 (1 hour)');
  }

  if (config.maxConcurrentDownloads < 1) {
    errors.push('maxConcurrentDownloads must be at least 1');
  }

  if (config.maxConcurrentDownloads > 50) {
    errors.push('maxConcurrentDownloads must not exceed 50');
  }

  if (!VALID_DELETE_POLICIES.includes(config.deletedFilePolicy)) {
    errors.push(`deletedFilePolicy must be one of: ${VALID_DELETE_POLICIES.join(', ')}`);
  }

  if (config.deletedFilePolicy === 'trash' && !config.trashDir) {
    errors.push('trashDir is required when deletedFilePolicy is "trash"');
  }

  if (!config.stateFilePath) {
    errors.push('stateFilePath is required');
  }

  if (config.maxListPages < 1) {
    errors.push('maxListPages must be at least 1');
  }

  return errors;
}
