import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S3MountManager } from '../mount/s3-mount-manager.js';
import type { FsOperations } from '../mount/s3-mount-manager.js';
import type { S3MountConfig } from '../mount/types.js';

// Create a mock logger
function createMockLogger(): ReturnType<typeof createChildLogger> {
  return createChildLogger();
}

function createChildLogger(): {
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
} {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

// Create mock fs operations
function createMockFs(): FsOperations {
  return {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockExec = ReturnType<typeof vi.fn<any>>;

function createMockExec(): MockExec {
  return vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
}

const baseConfig: Partial<S3MountConfig> = {
  bucketName: 'test-bucket',
  region: 'us-east-1',
  prefix: 'user-123/hq',
  mountPoint: '/hq',
  preferredBackend: 'goofys',
  enableFallback: true,
};

describe('S3MountManager', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const config = manager.getConfig();
      expect(config.bucketName).toBe('test-bucket');
      expect(config.region).toBe('us-east-1');
      expect(config.prefix).toBe('user-123/hq');
      expect(config.mountPoint).toBe('/hq');
    });

    it('should initialize with unmounted state', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const state = manager.getState();
      expect(state.status).toBe('unmounted');
      expect(state.backend).toBeNull();
      expect(state.mountedAt).toBeNull();
      expect(state.fallbackActive).toBe(false);
      expect(state.pid).toBeNull();
    });

    it('should build correct S3 URI with prefix', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const state = manager.getState();
      expect(state.s3Uri).toBe('s3://test-bucket/user-123/hq');
    });

    it('should build correct S3 URI without prefix', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: { ...baseConfig, prefix: '' },
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const state = manager.getState();
      expect(state.s3Uri).toBe('s3://test-bucket');
    });
  });

  describe('checkBackendAvailability', () => {
    it('should detect available backends', async () => {
      const mockExec = createMockExec();
      // s3fs --version succeeds
      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 's3fs') return Promise.resolve({ stdout: 's3fs 1.93', stderr: '' });
        if (cmd === 'goofys') return Promise.resolve({ stdout: 'goofys 0.24.0', stderr: '' });
        if (cmd === 'aws') return Promise.resolve({ stdout: 'aws-cli/2.15.0', stderr: '' });
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const mockFs = createMockFs();
      // /dev/fuse exists
      mockFs.access = vi.fn().mockResolvedValue(undefined);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const availability = await manager.checkBackendAvailability();

      expect(availability.s3fsAvailable).toBe(true);
      expect(availability.s3fsVersion).toBe('s3fs 1.93');
      expect(availability.goofysAvailable).toBe(true);
      expect(availability.goofysVersion).toBe('goofys 0.24.0');
      expect(availability.awsCliAvailable).toBe(true);
      expect(availability.awsCliVersion).toBe('aws-cli/2.15.0');
      expect(availability.fuseAvailable).toBe(true);
    });

    it('should detect unavailable backends', async () => {
      const mockExec = createMockExec();
      mockExec.mockRejectedValue(new Error('Command not found'));

      const mockFs = createMockFs();
      mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const availability = await manager.checkBackendAvailability();

      expect(availability.s3fsAvailable).toBe(false);
      expect(availability.goofysAvailable).toBe(false);
      expect(availability.awsCliAvailable).toBe(false);
      expect(availability.fuseAvailable).toBe(false);
    });

    it('should require FUSE for s3fs and goofys', async () => {
      const mockExec = createMockExec();
      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 's3fs') return Promise.resolve({ stdout: 's3fs 1.93', stderr: '' });
        if (cmd === 'goofys') return Promise.resolve({ stdout: 'goofys 0.24.0', stderr: '' });
        if (cmd === 'aws') return Promise.resolve({ stdout: 'aws-cli/2.15.0', stderr: '' });
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      const mockFs = createMockFs();
      // FUSE not available
      mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const availability = await manager.checkBackendAvailability();

      expect(availability.s3fsAvailable).toBe(false);
      expect(availability.goofysAvailable).toBe(false);
      expect(availability.awsCliAvailable).toBe(true);
    });
  });

  describe('mount', () => {
    it('should fail with invalid config', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: { ...baseConfig, bucketName: '' },
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const result = await manager.mount();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Configuration errors');
      expect(result.state.status).toBe('error');
    });

    it('should return success if already mounted', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      // Make backend available
      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 'goofys') return Promise.resolve({ stdout: 'goofys 0.24.0', stderr: '' });
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      // First mount
      await manager.mount();

      // Second mount should return already mounted
      const result = await manager.mount();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Already mounted');
    });

    it('should mount with goofys when available', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 'goofys') return Promise.resolve({ stdout: 'goofys 0.24.0', stderr: '' });
        if (cmd === 's3fs') return Promise.reject(new Error('not found'));
        if (cmd === 'aws') return Promise.reject(new Error('not found'));
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const result = await manager.mount();

      expect(result.success).toBe(true);
      expect(result.message).toContain('goofys');
      expect(result.state.status).toBe('mounted');
      expect(result.state.backend).toBe('goofys');
    });

    it('should mount with s3fs when goofys unavailable', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 's3fs') return Promise.resolve({ stdout: 's3fs 1.93', stderr: '' });
        if (cmd === 'goofys') return Promise.reject(new Error('not found'));
        if (cmd === 'aws') return Promise.reject(new Error('not found'));
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: { ...baseConfig, preferredBackend: 's3fs' },
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const result = await manager.mount();

      expect(result.success).toBe(true);
      expect(result.message).toContain('s3fs');
      expect(result.state.status).toBe('mounted');
      expect(result.state.backend).toBe('s3fs');
    });

    it('should fallback to AWS CLI when mount backends unavailable', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 'aws') return Promise.resolve({ stdout: 'aws-cli/2.15.0', stderr: '' });
        // s3fs and goofys not available
        return Promise.reject(new Error('not found'));
      });

      // FUSE not available
      mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const result = await manager.mount();

      expect(result.success).toBe(true);
      expect(result.state.status).toBe('fallback');
      expect(result.state.fallbackActive).toBe(true);
      expect(result.state.backend).toBeNull();
      expect(manager.getFallback()).not.toBeNull();
    });

    it('should fail when no backends available and fallback disabled', async () => {
      const mockExec = createMockExec();
      mockExec.mockRejectedValue(new Error('not found'));

      const mockFs = createMockFs();
      mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: { ...baseConfig, enableFallback: false },
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const result = await manager.mount();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No mount backend available');
      expect(result.state.status).toBe('error');
    });

    it('should try alternate backend when preferred fails', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      let goofysMountCalled = false;
      let s3fsMountCalled = false;

      mockExec.mockImplementation((cmd: string, args: string[]) => {
        // Both backends available (version check)
        if (args?.[0] === '--version') {
          if (cmd === 'goofys') return Promise.resolve({ stdout: 'goofys 0.24.0', stderr: '' });
          if (cmd === 's3fs') return Promise.resolve({ stdout: 's3fs 1.93', stderr: '' });
          if (cmd === 'aws') return Promise.reject(new Error('not found'));
        }
        // goofys mount fails
        if (cmd === 'goofys' && !args?.includes('--version')) {
          goofysMountCalled = true;
          return Promise.reject(new Error('goofys mount failed'));
        }
        // s3fs mount succeeds
        if (cmd === 's3fs' && !args?.includes('--version')) {
          s3fsMountCalled = true;
          return Promise.resolve({ stdout: '', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: { ...baseConfig, preferredBackend: 'goofys' },
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const result = await manager.mount();

      expect(goofysMountCalled).toBe(true);
      expect(s3fsMountCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.state.backend).toBe('s3fs');
    });

    it('should record duration', async () => {
      const mockExec = createMockExec();
      mockExec.mockRejectedValue(new Error('not found'));

      const mockFs = createMockFs();
      mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: { ...baseConfig, enableFallback: false },
        execCommand: mockExec,
        fsOps: mockFs,
      });

      const result = await manager.mount();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('unmount', () => {
    it('should return success if already unmounted', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const result = await manager.unmount();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Already unmounted');
    });

    it('should unmount fuse mount', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 'goofys') return Promise.resolve({ stdout: 'goofys 0.24.0', stderr: '' });
        if (cmd === 'fusermount') return Promise.resolve({ stdout: '', stderr: '' });
        return Promise.reject(new Error('not found'));
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      await manager.mount();
      const result = await manager.unmount();

      expect(result.success).toBe(true);
      expect(result.state.status).toBe('unmounted');
      expect(result.state.backend).toBeNull();
    });

    it('should deactivate fallback sync', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 'aws') return Promise.resolve({ stdout: 'aws-cli/2.15.0', stderr: '' });
        return Promise.reject(new Error('not found'));
      });

      mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      await manager.mount();
      expect(manager.getState().fallbackActive).toBe(true);

      const result = await manager.unmount();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Fallback sync deactivated');
      expect(result.state.fallbackActive).toBe(false);
    });

    it('should try lazy unmount when normal unmount fails', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      let normalUnmountAttempted = false;
      let lazyUnmountAttempted = false;

      mockExec.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'goofys') return Promise.resolve({ stdout: 'goofys 0.24.0', stderr: '' });
        if (cmd === 'fusermount') {
          if (args?.includes('-u')) {
            normalUnmountAttempted = true;
            return Promise.reject(new Error('device busy'));
          }
          if (args?.includes('-uz')) {
            lazyUnmountAttempted = true;
            return Promise.resolve({ stdout: '', stderr: '' });
          }
        }
        return Promise.reject(new Error('not found'));
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      await manager.mount();
      const result = await manager.unmount();

      expect(normalUnmountAttempted).toBe(true);
      expect(lazyUnmountAttempted).toBe(true);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Unmounted with lazy unmount');
    });
  });

  describe('isHealthy', () => {
    it('should return false when unmounted', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const healthy = await manager.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should return true when mounted and accessible', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 'goofys') return Promise.resolve({ stdout: 'goofys 0.24.0', stderr: '' });
        return Promise.reject(new Error('not found'));
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      await manager.mount();
      const healthy = await manager.isHealthy();

      expect(healthy).toBe(true);
    });

    it('should return true when fallback is active', async () => {
      const mockExec = createMockExec();
      const mockFs = createMockFs();

      mockExec.mockImplementation((cmd: string) => {
        if (cmd === 'aws') return Promise.resolve({ stdout: 'aws-cli/2.15.0', stderr: '' });
        return Promise.reject(new Error('not found'));
      });

      mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: mockExec,
        fsOps: mockFs,
      });

      await manager.mount();
      const healthy = await manager.isHealthy();

      expect(healthy).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return a copy of the state', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const state1 = manager.getState();
      const state2 = manager.getState();

      expect(state1).not.toBe(state2); // different references
      expect(state1).toEqual(state2); // same content
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const manager = new S3MountManager(createMockLogger() as any, {
        config: baseConfig,
        execCommand: createMockExec(),
        fsOps: createMockFs(),
      });

      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1.bucketName).toBe(config2.bucketName);
    });
  });
});
