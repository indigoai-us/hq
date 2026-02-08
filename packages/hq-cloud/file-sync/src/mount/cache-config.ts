/**
 * Cache configuration utilities for S3 mount performance.
 *
 * Generates backend-specific cache arguments for s3fs and goofys.
 * Both backends support local caching to reduce S3 API calls and improve
 * read performance for frequently accessed files.
 */

import type { MountCacheConfig, MountBackend } from './types.js';

/**
 * Generate s3fs-specific cache arguments.
 *
 * s3fs cache options:
 * - use_cache: Local cache directory
 * - ensure_diskfree: Minimum free disk space in MB
 * - check_cache_disk_free_ratio: Ratio of free disk to ensure
 * - stat_cache_expire: Stat cache TTL in seconds
 * - enable_content_md5: Verify content integrity
 */
export function buildS3fsCacheArgs(cache: MountCacheConfig): string[] {
  const args: string[] = [];

  if (!cache.enabled) {
    return args;
  }

  args.push(`use_cache=${cache.cacheDir}`);
  args.push(`ensure_diskfree=${Math.floor(cache.maxSizeMb * 0.1)}`);

  if (cache.statCacheEnabled) {
    args.push(`stat_cache_expire=${cache.statCacheTtlSeconds}`);
  } else {
    args.push('stat_cache_expire=0');
  }

  if (cache.typeCacheTtlSeconds > 0) {
    args.push(`type_cache_expire=${cache.typeCacheTtlSeconds}`);
  }

  if (cache.checkOnOpen) {
    args.push('enable_content_md5');
  }

  return args;
}

/**
 * Generate goofys-specific cache arguments.
 *
 * goofys cache options:
 * - --cache: Enable local caching with a cache directory
 * - --stat-cache-ttl: TTL for stat cache entries
 * - --type-cache-ttl: TTL for directory listing cache entries
 * - --dir-mode / --file-mode: Permission modes
 */
export function buildGoofysCacheArgs(cache: MountCacheConfig): string[] {
  const args: string[] = [];

  if (!cache.enabled) {
    return args;
  }

  args.push('--cache', cache.cacheDir);
  args.push('--cache-file-clearing', String(cache.ttlSeconds));

  if (cache.statCacheEnabled) {
    args.push('--stat-cache-ttl', `${cache.statCacheTtlSeconds}s`);
  }

  if (cache.typeCacheTtlSeconds > 0) {
    args.push('--type-cache-ttl', `${cache.typeCacheTtlSeconds}s`);
  }

  return args;
}

/**
 * Build cache arguments for the specified backend.
 */
export function buildCacheArgs(backend: MountBackend, cache: MountCacheConfig): string[] {
  switch (backend) {
    case 's3fs':
      return buildS3fsCacheArgs(cache);
    case 'goofys':
      return buildGoofysCacheArgs(cache);
  }
}

/**
 * Presets for common cache configurations.
 */
export const CACHE_PRESETS = {
  /** Fast: aggressive caching, good for read-heavy workloads */
  fast: {
    enabled: true,
    cacheDir: '/tmp/s3-cache',
    maxSizeMb: 2048,
    ttlSeconds: 600,
    checkOnOpen: false,
    statCacheEnabled: true,
    statCacheTtlSeconds: 120,
    typeCacheTtlSeconds: 120,
  },

  /** Balanced: moderate caching, good for mixed workloads */
  balanced: {
    enabled: true,
    cacheDir: '/tmp/s3-cache',
    maxSizeMb: 1024,
    ttlSeconds: 300,
    checkOnOpen: true,
    statCacheEnabled: true,
    statCacheTtlSeconds: 60,
    typeCacheTtlSeconds: 60,
  },

  /** Consistent: minimal caching, ensures latest data */
  consistent: {
    enabled: true,
    cacheDir: '/tmp/s3-cache',
    maxSizeMb: 512,
    ttlSeconds: 60,
    checkOnOpen: true,
    statCacheEnabled: true,
    statCacheTtlSeconds: 10,
    typeCacheTtlSeconds: 10,
  },

  /** Disabled: no caching at all */
  disabled: {
    enabled: false,
    cacheDir: '/tmp/s3-cache',
    maxSizeMb: 0,
    ttlSeconds: 0,
    checkOnOpen: false,
    statCacheEnabled: false,
    statCacheTtlSeconds: 0,
    typeCacheTtlSeconds: 0,
  },
} as const satisfies Record<string, MountCacheConfig>;

export type CachePresetName = keyof typeof CACHE_PRESETS;
