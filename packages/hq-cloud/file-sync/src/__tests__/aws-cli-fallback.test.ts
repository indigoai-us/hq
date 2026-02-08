import { describe, it, expect, vi } from 'vitest';
import { AwsCliFallback, buildDefaultSyncConfig } from '../mount/aws-cli-fallback.js';
import type { FsOperations } from '../mount/s3-mount-manager.js';
import type { SyncOperationConfig } from '../mount/types.js';

// Create a mock logger
function createMockLogger(): {
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

const baseSyncConfig: SyncOperationConfig = {
  s3Uri: 's3://test-bucket/user-123/hq',
  localPath: '/hq',
  direction: 'pull',
  deleteRemoved: false,
  excludePatterns: [],
  includePatterns: [],
  maxConcurrentRequests: 10,
  multipartEnabled: true,
  multipartChunkSizeMb: 8,
  dryRun: false,
};

describe('AwsCliFallback', () => {
  describe('sync (pull)', () => {
    it('should execute aws s3 sync for pull', async () => {
      const mockExec = createMockExec();
      mockExec.mockResolvedValue({
        stdout: 'download: s3://test-bucket/file.txt to ./file.txt (1.2 KiB)\n',
        stderr: '',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const result = await fallback.sync(baseSyncConfig);

      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(1);
      expect(result.bytesTransferred).toBe(1228); // 1.2 KiB
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify aws command args
      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        ['s3', 'sync', 's3://test-bucket/user-123/hq', '/hq'],
        expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 })
      );
    });

    it('should execute aws s3 sync for push', async () => {
      const mockExec = createMockExec();
      mockExec.mockResolvedValue({
        stdout: 'upload: ./file.txt to s3://test-bucket/file.txt (512 Bytes)\n',
        stderr: '',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const result = await fallback.sync({
        ...baseSyncConfig,
        direction: 'push',
      });

      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(1);
      expect(result.bytesTransferred).toBe(512);

      // Verify push order: local first, then s3
      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        ['s3', 'sync', '/hq', 's3://test-bucket/user-123/hq'],
        expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 })
      );
    });

    it('should handle --delete flag', async () => {
      const mockExec = createMockExec();
      mockExec.mockResolvedValue({
        stdout: 'delete: s3://test-bucket/old-file.txt\n',
        stderr: '',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const result = await fallback.sync({
        ...baseSyncConfig,
        direction: 'push',
        deleteRemoved: true,
      });

      expect(result.success).toBe(true);
      expect(result.filesDeleted).toBe(1);

      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        expect.arrayContaining(['--delete']),
        expect.anything()
      );
    });

    it('should handle exclude patterns', async () => {
      const mockExec = createMockExec();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      await fallback.sync({
        ...baseSyncConfig,
        excludePatterns: ['.git/*', 'node_modules/*'],
      });

      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        expect.arrayContaining(['--exclude', '.git/*', '--exclude', 'node_modules/*']),
        expect.anything()
      );
    });

    it('should handle include patterns', async () => {
      const mockExec = createMockExec();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      await fallback.sync({
        ...baseSyncConfig,
        includePatterns: ['*.ts', '*.json'],
      });

      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        expect.arrayContaining(['--include', '*.ts', '--include', '*.json']),
        expect.anything()
      );
    });

    it('should handle dry run flag', async () => {
      const mockExec = createMockExec();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      await fallback.sync({
        ...baseSyncConfig,
        dryRun: true,
      });

      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        expect.arrayContaining(['--dryrun']),
        expect.anything()
      );
    });

    it('should handle sync failure', async () => {
      const mockExec = createMockExec();
      mockExec.mockRejectedValue(new Error('Access denied'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const result = await fallback.sync(baseSyncConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
      expect(result.filesSynced).toBe(0);
    });

    it('should handle bidirectional sync', async () => {
      const mockExec = createMockExec();

      let callCount = 0;
      mockExec.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          stdout: `download: s3://bucket/file${callCount}.txt to ./file${callCount}.txt (100 Bytes)\n`,
          stderr: '',
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const result = await fallback.sync({
        ...baseSyncConfig,
        direction: 'bidirectional',
      });

      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(2); // 1 from pull + 1 from push
    });

    it('should parse multiple file sizes correctly', async () => {
      const mockExec = createMockExec();
      mockExec.mockResolvedValue({
        stdout: [
          'download: s3://bucket/small.txt to ./small.txt (100 Bytes)',
          'download: s3://bucket/medium.txt to ./medium.txt (2.5 MiB)',
          'download: s3://bucket/large.txt to ./large.txt (1.0 GiB)',
        ].join('\n'),
        stderr: '',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const result = await fallback.sync(baseSyncConfig);

      expect(result.success).toBe(true);
      expect(result.filesSynced).toBe(3);
      expect(result.bytesTransferred).toBe(
        100 + Math.floor(2.5 * 1024 * 1024) + Math.floor(1.0 * 1024 * 1024 * 1024)
      );
    });
  });

  describe('pull', () => {
    it('should be a convenience wrapper for sync pull', async () => {
      const mockExec = createMockExec();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const result = await fallback.pull(
        's3://test-bucket/user/hq',
        '/hq'
      );

      expect(result.success).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        expect.arrayContaining(['s3', 'sync', 's3://test-bucket/user/hq', '/hq']),
        expect.anything()
      );
    });

    it('should accept partial options', async () => {
      const mockExec = createMockExec();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      await fallback.pull('s3://bucket/path', '/local', {
        deleteRemoved: true,
        excludePatterns: ['.git/*'],
      });

      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        expect.arrayContaining(['--delete', '--exclude', '.git/*']),
        expect.anything()
      );
    });
  });

  describe('push', () => {
    it('should be a convenience wrapper for sync push', async () => {
      const mockExec = createMockExec();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const result = await fallback.push(
        '/hq',
        's3://test-bucket/user/hq'
      );

      expect(result.success).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        'aws',
        expect.arrayContaining(['s3', 'sync', '/hq', 's3://test-bucket/user/hq']),
        expect.anything()
      );
    });
  });

  describe('isAvailable', () => {
    it('should return true when aws cli is available', async () => {
      const mockExec = createMockExec();
      mockExec.mockResolvedValue({ stdout: 'aws-cli/2.15.0', stderr: '' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const available = await fallback.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when aws cli is not available', async () => {
      const mockExec = createMockExec();
      mockExec.mockRejectedValue(new Error('not found'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const fallback = new AwsCliFallback(createMockLogger() as any, {
        execCommand: mockExec,
        fsOps: createMockFs(),
      });

      const available = await fallback.isAvailable();
      expect(available).toBe(false);
    });
  });
});

describe('buildDefaultSyncConfig', () => {
  it('should build config for pull direction', () => {
    const config = buildDefaultSyncConfig('my-bucket', 'user-123', '/hq');

    expect(config.s3Uri).toBe('s3://my-bucket/user-123/hq');
    expect(config.localPath).toBe('/hq');
    expect(config.direction).toBe('pull');
    expect(config.deleteRemoved).toBe(false);
    expect(config.dryRun).toBe(false);
  });

  it('should build config for push direction', () => {
    const config = buildDefaultSyncConfig('my-bucket', 'user-123', '/hq', 'push');

    expect(config.direction).toBe('push');
  });

  it('should include default exclude patterns', () => {
    const config = buildDefaultSyncConfig('my-bucket', 'user-123', '/hq');

    expect(config.excludePatterns).toContain('.git/*');
    expect(config.excludePatterns).toContain('node_modules/*');
    expect(config.excludePatterns).toContain('.s3fs*');
    expect(config.excludePatterns).toContain('*.tmp');
  });

  it('should enable multipart uploads', () => {
    const config = buildDefaultSyncConfig('my-bucket', 'user-123', '/hq');

    expect(config.multipartEnabled).toBe(true);
    expect(config.multipartChunkSizeMb).toBe(8);
  });

  it('should set reasonable concurrent requests', () => {
    const config = buildDefaultSyncConfig('my-bucket', 'user-123', '/hq');

    expect(config.maxConcurrentRequests).toBe(10);
  });
});
