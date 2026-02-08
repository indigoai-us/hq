/**
 * Daemon configuration builder.
 *
 * Reads from environment variables with sensible defaults.
 * All values can be overridden programmatically.
 */

import * as path from 'node:path';
import type { SyncDaemonConfig } from './types.js';
import { DEFAULT_DAEMON_CONFIG, DEFAULT_IGNORED_PATTERNS } from './types.js';

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function getEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Build daemon config from environment variables and optional overrides.
 *
 * Environment variables:
 * - HQ_DIR: Path to the HQ directory (required unless overridden)
 * - HQ_SYNC_INTERVAL_MS: Sync interval in milliseconds (default: 30000)
 * - HQ_SYNC_BATCH_SIZE: Max events per batch (default: 100)
 * - HQ_SYNC_DEBOUNCE_MS: Debounce delay in ms (default: 300)
 * - HQ_SYNC_MAX_CONCURRENT: Max concurrent uploads (default: 5)
 * - HQ_SYNC_IGNORED: Comma-separated additional ignored patterns
 * - HQ_SYNC_PID_FILE: Use PID file for single-instance (default: true)
 */
export function buildDaemonConfig(
  overrides?: Partial<SyncDaemonConfig>
): SyncDaemonConfig {
  const hqDir = overrides?.hqDir ?? getEnv('HQ_DIR', '');
  const pidFilePath =
    overrides?.pidFilePath ?? getEnv('HQ_SYNC_PID_PATH', path.join(hqDir, '.hq-sync.pid'));

  // Merge additional ignored patterns from env
  const envIgnored = process.env['HQ_SYNC_IGNORED'];
  const extraIgnored = envIgnored ? envIgnored.split(',').map((p) => p.trim()) : [];
  const mergedIgnored = [
    ...DEFAULT_IGNORED_PATTERNS,
    ...extraIgnored,
    ...(overrides?.ignoredPatterns ?? []),
  ];

  // Deduplicate
  const uniqueIgnored = [...new Set(mergedIgnored)];

  return {
    hqDir,
    syncIntervalMs: overrides?.syncIntervalMs ?? getEnvNumber('HQ_SYNC_INTERVAL_MS', DEFAULT_DAEMON_CONFIG.syncIntervalMs),
    ignoredPatterns: uniqueIgnored,
    batchSize: overrides?.batchSize ?? getEnvNumber('HQ_SYNC_BATCH_SIZE', DEFAULT_DAEMON_CONFIG.batchSize),
    usePidFile: overrides?.usePidFile ?? getEnv('HQ_SYNC_PID_FILE', 'true') === 'true',
    pidFilePath,
    debounceMs: overrides?.debounceMs ?? getEnvNumber('HQ_SYNC_DEBOUNCE_MS', DEFAULT_DAEMON_CONFIG.debounceMs),
    maxConcurrentUploads: overrides?.maxConcurrentUploads ?? getEnvNumber('HQ_SYNC_MAX_CONCURRENT', DEFAULT_DAEMON_CONFIG.maxConcurrentUploads),
  };
}

/**
 * Validate a daemon configuration.
 * Returns an array of error messages (empty = valid).
 */
export function validateDaemonConfig(config: SyncDaemonConfig): string[] {
  const errors: string[] = [];

  if (!config.hqDir) {
    errors.push('hqDir is required: specify HQ directory path');
  }

  if (config.syncIntervalMs < 1000) {
    errors.push('syncIntervalMs must be at least 1000 (1 second)');
  }

  if (config.syncIntervalMs > 600_000) {
    errors.push('syncIntervalMs must not exceed 600000 (10 minutes)');
  }

  if (config.batchSize < 1) {
    errors.push('batchSize must be at least 1');
  }

  if (config.batchSize > 10_000) {
    errors.push('batchSize must not exceed 10000');
  }

  if (config.debounceMs < 0) {
    errors.push('debounceMs must not be negative');
  }

  if (config.debounceMs > 10_000) {
    errors.push('debounceMs must not exceed 10000');
  }

  if (config.maxConcurrentUploads < 1) {
    errors.push('maxConcurrentUploads must be at least 1');
  }

  if (config.maxConcurrentUploads > 50) {
    errors.push('maxConcurrentUploads must not exceed 50');
  }

  return errors;
}
