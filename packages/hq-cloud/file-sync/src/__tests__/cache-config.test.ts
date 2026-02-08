import { describe, it, expect } from 'vitest';
import {
  buildS3fsCacheArgs,
  buildGoofysCacheArgs,
  buildCacheArgs,
  CACHE_PRESETS,
} from '../mount/cache-config.js';
import type { MountCacheConfig } from '../mount/types.js';

const enabledCache: MountCacheConfig = {
  enabled: true,
  cacheDir: '/tmp/s3-cache',
  maxSizeMb: 1024,
  ttlSeconds: 300,
  checkOnOpen: true,
  statCacheEnabled: true,
  statCacheTtlSeconds: 60,
  typeCacheTtlSeconds: 60,
};

const disabledCache: MountCacheConfig = {
  enabled: false,
  cacheDir: '/tmp/s3-cache',
  maxSizeMb: 0,
  ttlSeconds: 0,
  checkOnOpen: false,
  statCacheEnabled: false,
  statCacheTtlSeconds: 0,
  typeCacheTtlSeconds: 0,
};

describe('Cache Config', () => {
  describe('buildS3fsCacheArgs', () => {
    it('should return empty args when cache disabled', () => {
      const args = buildS3fsCacheArgs(disabledCache);
      expect(args).toEqual([]);
    });

    it('should include use_cache with cache dir', () => {
      const args = buildS3fsCacheArgs(enabledCache);
      expect(args).toContain('use_cache=/tmp/s3-cache');
    });

    it('should include ensure_diskfree', () => {
      const args = buildS3fsCacheArgs(enabledCache);
      // 10% of maxSizeMb
      expect(args).toContain('ensure_diskfree=102');
    });

    it('should include stat_cache_expire when stat cache enabled', () => {
      const args = buildS3fsCacheArgs(enabledCache);
      expect(args).toContain('stat_cache_expire=60');
    });

    it('should disable stat cache when not enabled', () => {
      const cache: MountCacheConfig = { ...enabledCache, statCacheEnabled: false };
      const args = buildS3fsCacheArgs(cache);
      expect(args).toContain('stat_cache_expire=0');
    });

    it('should include type_cache_expire', () => {
      const args = buildS3fsCacheArgs(enabledCache);
      expect(args).toContain('type_cache_expire=60');
    });

    it('should include enable_content_md5 when checkOnOpen is true', () => {
      const args = buildS3fsCacheArgs(enabledCache);
      expect(args).toContain('enable_content_md5');
    });

    it('should not include enable_content_md5 when checkOnOpen is false', () => {
      const cache: MountCacheConfig = { ...enabledCache, checkOnOpen: false };
      const args = buildS3fsCacheArgs(cache);
      expect(args).not.toContain('enable_content_md5');
    });
  });

  describe('buildGoofysCacheArgs', () => {
    it('should return empty args when cache disabled', () => {
      const args = buildGoofysCacheArgs(disabledCache);
      expect(args).toEqual([]);
    });

    it('should include --cache with cache dir', () => {
      const args = buildGoofysCacheArgs(enabledCache);
      const cacheIdx = args.indexOf('--cache');
      expect(cacheIdx).toBeGreaterThanOrEqual(0);
      expect(args[cacheIdx + 1]).toBe('/tmp/s3-cache');
    });

    it('should include --cache-file-clearing with TTL', () => {
      const args = buildGoofysCacheArgs(enabledCache);
      const clearIdx = args.indexOf('--cache-file-clearing');
      expect(clearIdx).toBeGreaterThanOrEqual(0);
      expect(args[clearIdx + 1]).toBe('300');
    });

    it('should include --stat-cache-ttl when stat cache enabled', () => {
      const args = buildGoofysCacheArgs(enabledCache);
      const statIdx = args.indexOf('--stat-cache-ttl');
      expect(statIdx).toBeGreaterThanOrEqual(0);
      expect(args[statIdx + 1]).toBe('60s');
    });

    it('should include --type-cache-ttl', () => {
      const args = buildGoofysCacheArgs(enabledCache);
      const typeIdx = args.indexOf('--type-cache-ttl');
      expect(typeIdx).toBeGreaterThanOrEqual(0);
      expect(args[typeIdx + 1]).toBe('60s');
    });

    it('should not include stat cache args when disabled', () => {
      const cache: MountCacheConfig = { ...enabledCache, statCacheEnabled: false };
      const args = buildGoofysCacheArgs(cache);
      expect(args).not.toContain('--stat-cache-ttl');
    });
  });

  describe('buildCacheArgs', () => {
    it('should dispatch to s3fs builder', () => {
      const args = buildCacheArgs('s3fs', enabledCache);
      // s3fs uses key=value format
      expect(args.some((a) => a.startsWith('use_cache='))).toBe(true);
    });

    it('should dispatch to goofys builder', () => {
      const args = buildCacheArgs('goofys', enabledCache);
      // goofys uses --flag format
      expect(args).toContain('--cache');
    });
  });

  describe('CACHE_PRESETS', () => {
    it('should define fast preset', () => {
      expect(CACHE_PRESETS.fast.enabled).toBe(true);
      expect(CACHE_PRESETS.fast.maxSizeMb).toBe(2048);
      expect(CACHE_PRESETS.fast.ttlSeconds).toBe(600);
      expect(CACHE_PRESETS.fast.checkOnOpen).toBe(false);
    });

    it('should define balanced preset', () => {
      expect(CACHE_PRESETS.balanced.enabled).toBe(true);
      expect(CACHE_PRESETS.balanced.maxSizeMb).toBe(1024);
      expect(CACHE_PRESETS.balanced.ttlSeconds).toBe(300);
      expect(CACHE_PRESETS.balanced.checkOnOpen).toBe(true);
    });

    it('should define consistent preset', () => {
      expect(CACHE_PRESETS.consistent.enabled).toBe(true);
      expect(CACHE_PRESETS.consistent.maxSizeMb).toBe(512);
      expect(CACHE_PRESETS.consistent.ttlSeconds).toBe(60);
      expect(CACHE_PRESETS.consistent.statCacheTtlSeconds).toBe(10);
    });

    it('should define disabled preset', () => {
      expect(CACHE_PRESETS.disabled.enabled).toBe(false);
      expect(CACHE_PRESETS.disabled.maxSizeMb).toBe(0);
    });

    it('should produce valid args for all presets', () => {
      for (const [name, preset] of Object.entries(CACHE_PRESETS)) {
        const s3fsArgs = buildS3fsCacheArgs(preset);
        const goofysArgs = buildGoofysCacheArgs(preset);

        if (name === 'disabled') {
          expect(s3fsArgs).toHaveLength(0);
          expect(goofysArgs).toHaveLength(0);
        } else {
          expect(s3fsArgs.length).toBeGreaterThan(0);
          expect(goofysArgs.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
