import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDaemonConfig, validateDaemonConfig } from '../daemon/config.js';
import { DEFAULT_IGNORED_PATTERNS } from '../daemon/types.js';

describe('Daemon Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('buildDaemonConfig', () => {
    it('should return defaults when no overrides or env vars', () => {
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.hqDir).toBe('/test/hq');
      expect(config.syncIntervalMs).toBe(30_000);
      expect(config.batchSize).toBe(100);
      expect(config.debounceMs).toBe(300);
      expect(config.maxConcurrentUploads).toBe(5);
      expect(config.usePidFile).toBe(true);
    });

    it('should use HQ_DIR from environment', () => {
      process.env['HQ_DIR'] = '/env/hq';
      const config = buildDaemonConfig();

      expect(config.hqDir).toBe('/env/hq');
    });

    it('should prefer override over environment variable', () => {
      process.env['HQ_DIR'] = '/env/hq';
      const config = buildDaemonConfig({ hqDir: '/override/hq' });

      expect(config.hqDir).toBe('/override/hq');
    });

    it('should read sync interval from env', () => {
      process.env['HQ_SYNC_INTERVAL_MS'] = '60000';
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.syncIntervalMs).toBe(60_000);
    });

    it('should read batch size from env', () => {
      process.env['HQ_SYNC_BATCH_SIZE'] = '50';
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.batchSize).toBe(50);
    });

    it('should read debounce from env', () => {
      process.env['HQ_SYNC_DEBOUNCE_MS'] = '500';
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.debounceMs).toBe(500);
    });

    it('should read max concurrent from env', () => {
      process.env['HQ_SYNC_MAX_CONCURRENT'] = '10';
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.maxConcurrentUploads).toBe(10);
    });

    it('should include default ignored patterns', () => {
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      for (const pattern of DEFAULT_IGNORED_PATTERNS) {
        expect(config.ignoredPatterns).toContain(pattern);
      }
    });

    it('should merge additional ignored patterns from env', () => {
      process.env['HQ_SYNC_IGNORED'] = '**/*.log,**/*.tmp';
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.ignoredPatterns).toContain('**/*.log');
      expect(config.ignoredPatterns).toContain('**/*.tmp');
      // Still includes defaults
      expect(config.ignoredPatterns).toContain('**/node_modules/**');
    });

    it('should merge override ignored patterns', () => {
      const config = buildDaemonConfig({
        hqDir: '/test/hq',
        ignoredPatterns: ['**/*.custom'],
      });

      expect(config.ignoredPatterns).toContain('**/*.custom');
      expect(config.ignoredPatterns).toContain('**/node_modules/**');
    });

    it('should deduplicate ignored patterns', () => {
      const config = buildDaemonConfig({
        hqDir: '/test/hq',
        ignoredPatterns: ['**/node_modules/**'],
      });

      const nodeModulesCount = config.ignoredPatterns.filter(
        (p) => p === '**/node_modules/**'
      ).length;
      expect(nodeModulesCount).toBe(1);
    });

    it('should set default PID file path relative to hqDir', () => {
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.pidFilePath).toContain('.hq-sync.pid');
    });

    it('should allow PID file path override', () => {
      const config = buildDaemonConfig({
        hqDir: '/test/hq',
        pidFilePath: '/custom/path/daemon.pid',
      });

      expect(config.pidFilePath).toBe('/custom/path/daemon.pid');
    });

    it('should handle invalid env numbers gracefully', () => {
      process.env['HQ_SYNC_INTERVAL_MS'] = 'not-a-number';
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.syncIntervalMs).toBe(30_000);
    });

    it('should disable PID file when env says false', () => {
      process.env['HQ_SYNC_PID_FILE'] = 'false';
      const config = buildDaemonConfig({ hqDir: '/test/hq' });

      expect(config.usePidFile).toBe(false);
    });
  });

  describe('validateDaemonConfig', () => {
    const validConfig = buildDaemonConfig({ hqDir: '/test/hq' });

    it('should pass for valid config', () => {
      const errors = validateDaemonConfig(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should fail when hqDir is empty', () => {
      const config = { ...validConfig, hqDir: '' };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('hqDir is required: specify HQ directory path');
    });

    it('should fail when syncIntervalMs is too low', () => {
      const config = { ...validConfig, syncIntervalMs: 500 };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('syncIntervalMs must be at least 1000 (1 second)');
    });

    it('should fail when syncIntervalMs is too high', () => {
      const config = { ...validConfig, syncIntervalMs: 700_000 };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('syncIntervalMs must not exceed 600000 (10 minutes)');
    });

    it('should fail when batchSize is less than 1', () => {
      const config = { ...validConfig, batchSize: 0 };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('batchSize must be at least 1');
    });

    it('should fail when batchSize exceeds 10000', () => {
      const config = { ...validConfig, batchSize: 20_000 };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('batchSize must not exceed 10000');
    });

    it('should fail when debounceMs is negative', () => {
      const config = { ...validConfig, debounceMs: -1 };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('debounceMs must not be negative');
    });

    it('should fail when debounceMs exceeds 10000', () => {
      const config = { ...validConfig, debounceMs: 15_000 };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('debounceMs must not exceed 10000');
    });

    it('should fail when maxConcurrentUploads is less than 1', () => {
      const config = { ...validConfig, maxConcurrentUploads: 0 };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('maxConcurrentUploads must be at least 1');
    });

    it('should fail when maxConcurrentUploads exceeds 50', () => {
      const config = { ...validConfig, maxConcurrentUploads: 100 };
      const errors = validateDaemonConfig(config);

      expect(errors).toContain('maxConcurrentUploads must not exceed 50');
    });

    it('should report multiple errors at once', () => {
      const config = {
        ...validConfig,
        hqDir: '',
        syncIntervalMs: 100,
        batchSize: 0,
      };
      const errors = validateDaemonConfig(config);

      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
