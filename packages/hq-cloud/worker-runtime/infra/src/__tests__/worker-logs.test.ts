/**
 * Tests for Worker Logs Streaming Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WorkerLogsService,
  WorkerLogsError,
  createMockCloudWatchLogsClient,
  extractTaskIdFromArn,
  isValidRetentionDays,
  buildCloudWatchLogConfig,
  type CloudWatchLogsClient,
  type WorkerLogsServiceConfig,
  type LogStreamConnection,
  type GetLogsParams,
  DEFAULT_LOG_LIMIT,
  MAX_LOG_LIMIT,
  VALID_RETENTION_DAYS,
} from '../worker-logs.js';

/**
 * Create a mock WorkerLogsServiceConfig
 */
function createMockConfig(
  overrides: Partial<WorkerLogsServiceConfig> = {}
): WorkerLogsServiceConfig {
  return {
    logGroupName: '/hq/workers',
    region: 'us-east-1',
    logStreamPrefix: 'session',
    defaultRetentionDays: 30,
    defaultLimit: DEFAULT_LOG_LIMIT,
    liveTailPollIntervalMs: 100000, // Very slow for tests
    ...overrides,
  };
}

/**
 * Create a mock LogStreamConnection
 */
function createMockConnection(
  overrides: Partial<LogStreamConnection> = {}
): LogStreamConnection {
  return {
    connectionId: 'conn-test-123',
    workerId: 'backend-dev-abc',
    send: vi.fn(),
    close: vi.fn(),
    isActive: vi.fn(() => true),
    ...overrides,
  };
}

describe('WorkerLogsService', () => {
  let service: WorkerLogsService;
  let mockCwClient: CloudWatchLogsClient;
  let mockConfig: WorkerLogsServiceConfig;

  beforeEach(() => {
    mockCwClient = createMockCloudWatchLogsClient();
    mockConfig = createMockConfig();
  });

  afterEach(() => {
    if (service?.isRunning) {
      service.stop();
    }
  });

  describe('constructor', () => {
    it('should create service with valid config', () => {
      service = new WorkerLogsService(mockConfig, mockCwClient);
      expect(service).toBeDefined();
      expect(service.isRunning).toBe(false);
    });

    it('should apply default values for optional config', () => {
      const minimalConfig: WorkerLogsServiceConfig = {
        logGroupName: '/hq/workers',
        region: 'us-east-1',
      };

      service = new WorkerLogsService(minimalConfig, mockCwClient);
      expect(service).toBeDefined();
    });
  });

  describe('start/stop', () => {
    beforeEach(() => {
      service = new WorkerLogsService(mockConfig, mockCwClient);
    });

    it('should start the service', () => {
      service.start();
      expect(service.isRunning).toBe(true);
    });

    it('should not start twice', () => {
      service.start();
      service.start();
      expect(service.isRunning).toBe(true);
    });

    it('should stop the service', () => {
      service.start();
      service.stop();
      expect(service.isRunning).toBe(false);
    });

    it('should close all active streams on stop', () => {
      service.start();

      const conn = createMockConnection();
      service.startLiveTail(conn);
      expect(service.activeStreamCount).toBe(1);

      service.stop();
      expect(service.activeStreamCount).toBe(0);
    });
  });

  describe('getLogs', () => {
    const mockEvents = [
      {
        logStreamName: 'worker/worker/task123',
        timestamp: 1707300000000,
        message: '[stdout] Starting worker...',
        ingestionTime: 1707300001000,
      },
      {
        logStreamName: 'worker/worker/task123',
        timestamp: 1707300010000,
        message: '[stderr] Warning: memory low',
        ingestionTime: 1707300011000,
      },
      {
        logStreamName: 'worker/worker/task123',
        timestamp: 1707300020000,
        message: '[stdout] Task completed successfully',
        ingestionTime: 1707300021000,
      },
    ];

    beforeEach(() => {
      mockCwClient = createMockCloudWatchLogsClient({
        filterLogEventsResult: {
          events: mockEvents,
          nextToken: undefined,
        },
      });
      service = new WorkerLogsService(mockConfig, mockCwClient);
    });

    it('should fetch logs for a worker', async () => {
      const params: GetLogsParams = {
        workerId: 'backend-dev-abc',
      };

      const result = await service.getLogs(params);

      expect(result.entries).toHaveLength(3);
      expect(result.entries[0]!.message).toBe('[stdout] Starting worker...');
      expect(result.entries[0]!.logStreamName).toBe('worker/worker/task123');
      expect(result.hasMore).toBe(false);
    });

    it('should convert timestamps to ISO 8601', async () => {
      const result = await service.getLogs({ workerId: 'w-123' });

      for (const entry of result.entries) {
        // ISO 8601 format check
        expect(entry.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
        );
      }
    });

    it('should handle pagination with nextToken', async () => {
      mockCwClient = createMockCloudWatchLogsClient({
        filterLogEventsResult: {
          events: mockEvents.slice(0, 2),
          nextToken: 'next-page-token',
        },
      });
      service = new WorkerLogsService(mockConfig, mockCwClient);

      const result = await service.getLogs({ workerId: 'w-123' });

      expect(result.entries).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextToken).toBe('next-page-token');
    });

    it('should pass time range parameters', async () => {
      const filterSpy = vi.spyOn(mockCwClient, 'filterLogEvents');

      await service.getLogs({
        workerId: 'w-123',
        startTime: '2026-02-07T00:00:00Z',
        endTime: '2026-02-07T23:59:59Z',
      });

      expect(filterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: expect.any(Number),
          endTime: expect.any(Number),
        })
      );
    });

    it('should pass numeric timestamps directly', async () => {
      const filterSpy = vi.spyOn(mockCwClient, 'filterLogEvents');
      const startMs = 1707300000000;
      const endMs = 1707400000000;

      await service.getLogs({
        workerId: 'w-123',
        startTime: startMs,
        endTime: endMs,
      });

      expect(filterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: startMs,
          endTime: endMs,
        })
      );
    });

    it('should respect limit parameter', async () => {
      const filterSpy = vi.spyOn(mockCwClient, 'filterLogEvents');

      await service.getLogs({
        workerId: 'w-123',
        limit: 10,
      });

      expect(filterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
        })
      );
    });

    it('should cap limit at MAX_LOG_LIMIT', async () => {
      const filterSpy = vi.spyOn(mockCwClient, 'filterLogEvents');

      await service.getLogs({
        workerId: 'w-123',
        limit: 50000,
      });

      expect(filterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: MAX_LOG_LIMIT,
        })
      );
    });

    it('should use task ARN to resolve log stream prefix', async () => {
      const filterSpy = vi.spyOn(mockCwClient, 'filterLogEvents');
      const taskArn = 'arn:aws:ecs:us-east-1:123456789:task/hq-workers/taskid-abc123';

      await service.getLogs({
        workerId: 'w-123',
        taskArn,
      });

      expect(filterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          logStreamNamePrefix: 'session/session/taskid-abc123',
        })
      );
    });

    it('should pass filter pattern to CloudWatch', async () => {
      const filterSpy = vi.spyOn(mockCwClient, 'filterLogEvents');

      await service.getLogs({
        workerId: 'w-123',
        filterPattern: '"ERROR"',
      });

      expect(filterSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filterPattern: '"ERROR"',
        })
      );
    });

    it('should throw WorkerLogsError on CloudWatch failure', async () => {
      mockCwClient = createMockCloudWatchLogsClient({
        filterLogEventsError: new Error('AccessDeniedException'),
      });
      service = new WorkerLogsService(mockConfig, mockCwClient);

      await expect(
        service.getLogs({ workerId: 'w-123' })
      ).rejects.toThrow(WorkerLogsError);
    });

    it('should include error code and worker ID in WorkerLogsError', async () => {
      mockCwClient = createMockCloudWatchLogsClient({
        filterLogEventsError: new Error('Throttled'),
      });
      service = new WorkerLogsService(mockConfig, mockCwClient);

      try {
        await service.getLogs({ workerId: 'w-456' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkerLogsError);
        const logsError = error as WorkerLogsError;
        expect(logsError.code).toBe('FETCH_FAILED');
        expect(logsError.workerId).toBe('w-456');
      }
    });

    it('should handle empty events response', async () => {
      mockCwClient = createMockCloudWatchLogsClient({
        filterLogEventsResult: {
          events: [],
          nextToken: undefined,
        },
      });
      service = new WorkerLogsService(mockConfig, mockCwClient);

      const result = await service.getLogs({ workerId: 'w-123' });

      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.scannedCount).toBe(0);
    });
  });

  describe('getLogStreams', () => {
    beforeEach(() => {
      mockCwClient = createMockCloudWatchLogsClient({
        describeLogStreamsResult: {
          logStreams: [
            {
              logStreamName: 'worker/worker/task-001',
              creationTime: 1707300000000,
              firstEventTimestamp: 1707300001000,
              lastEventTimestamp: 1707300100000,
              lastIngestionTime: 1707300101000,
            },
            {
              logStreamName: 'worker/worker/task-002',
              creationTime: 1707200000000,
              lastEventTimestamp: 1707200100000,
            },
          ],
        },
      });
      service = new WorkerLogsService(mockConfig, mockCwClient);
    });

    it('should return log streams for a worker', async () => {
      const streams = await service.getLogStreams('w-123');

      expect(streams).toHaveLength(2);
      expect(streams[0]!.logStreamName).toBe('worker/worker/task-001');
      expect(streams[1]!.logStreamName).toBe('worker/worker/task-002');
    });

    it('should convert timestamps to ISO 8601', async () => {
      const streams = await service.getLogStreams('w-123');

      expect(streams[0]!.creationTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it('should handle optional fields', async () => {
      const streams = await service.getLogStreams('w-123');

      // Second stream has no firstEventTimestamp or lastIngestionTime
      expect(streams[1]!.firstEventTimestamp).toBeUndefined();
      expect(streams[1]!.lastIngestionTime).toBeUndefined();
    });

    it('should use task ARN prefix when provided', async () => {
      const describeSpy = vi.spyOn(mockCwClient, 'describeLogStreams');
      const taskArn = 'arn:aws:ecs:us-east-1:123:task/cluster/taskid-xyz';

      await service.getLogStreams('w-123', taskArn);

      expect(describeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          logStreamNamePrefix: 'session/session/taskid-xyz',
        })
      );
    });
  });

  describe('live tail', () => {
    beforeEach(() => {
      mockCwClient = createMockCloudWatchLogsClient({
        filterLogEventsResult: {
          events: [
            {
              logStreamName: 'worker/worker/task123',
              timestamp: Date.now(),
              message: 'Live log line 1',
            },
          ],
        },
      });
      mockConfig = createMockConfig({ liveTailPollIntervalMs: 50 });
      service = new WorkerLogsService(mockConfig, mockCwClient);
      service.start();
    });

    it('should start a live tail session', () => {
      const conn = createMockConnection();
      const connectionId = service.startLiveTail(conn);

      expect(connectionId).toBe('conn-test-123');
      expect(service.activeStreamCount).toBe(1);
    });

    it('should not duplicate live tail for same connection', () => {
      const conn = createMockConnection();
      service.startLiveTail(conn);
      service.startLiveTail(conn);

      expect(service.activeStreamCount).toBe(1);
    });

    it('should send entries to connection', async () => {
      const conn = createMockConnection();
      service.startLiveTail(conn);

      // Wait for one poll cycle
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(conn.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Live log line 1',
        })
      );
    });

    it('should close live tail and stop polling', () => {
      const conn = createMockConnection();
      service.startLiveTail(conn);
      expect(service.activeStreamCount).toBe(1);

      service.closeLiveTail('conn-test-123');
      expect(service.activeStreamCount).toBe(0);
    });

    it('should auto-close when connection becomes inactive', async () => {
      let active = true;
      const conn = createMockConnection({
        isActive: vi.fn(() => active),
      });

      service.startLiveTail(conn);
      expect(service.activeStreamCount).toBe(1);

      // Simulate connection closing
      active = false;

      // Wait for poll to detect the closed connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(service.activeStreamCount).toBe(0);
    });

    it('should handle multiple concurrent live tails', () => {
      const conn1 = createMockConnection({ connectionId: 'conn-1', workerId: 'w-1' });
      const conn2 = createMockConnection({ connectionId: 'conn-2', workerId: 'w-2' });

      service.startLiveTail(conn1);
      service.startLiveTail(conn2);

      expect(service.activeStreamCount).toBe(2);

      service.closeLiveTail('conn-1');
      expect(service.activeStreamCount).toBe(1);

      service.closeLiveTail('conn-2');
      expect(service.activeStreamCount).toBe(0);
    });

    it('should handle no-op close for unknown connection', () => {
      service.closeLiveTail('nonexistent');
      expect(service.activeStreamCount).toBe(0);
    });
  });

  describe('updateRetentionPolicy', () => {
    beforeEach(() => {
      mockCwClient = createMockCloudWatchLogsClient();
      service = new WorkerLogsService(mockConfig, mockCwClient);
    });

    it('should update retention policy with valid days', async () => {
      const putSpy = vi.spyOn(mockCwClient, 'putRetentionPolicy');

      await service.updateRetentionPolicy(90);

      expect(putSpy).toHaveBeenCalledWith({
        logGroupName: '/hq/workers',
        retentionInDays: 90,
      });
    });

    it('should reject invalid retention days', async () => {
      await expect(
        service.updateRetentionPolicy(42)
      ).rejects.toThrow(WorkerLogsError);
    });

    it('should include valid values in error message', async () => {
      try {
        await service.updateRetentionPolicy(42);
        expect.unreachable('Should have thrown');
      } catch (error) {
        const logsError = error as WorkerLogsError;
        expect(logsError.code).toBe('INVALID_RETENTION');
        expect(logsError.message).toContain('42');
      }
    });

    it('should throw on CloudWatch API failure', async () => {
      mockCwClient = createMockCloudWatchLogsClient({
        putRetentionPolicyError: new Error('AccessDenied'),
      });
      service = new WorkerLogsService(mockConfig, mockCwClient);

      await expect(
        service.updateRetentionPolicy(30)
      ).rejects.toThrow(WorkerLogsError);
    });
  });
});

describe('extractTaskIdFromArn', () => {
  it('should extract task ID from standard ARN', () => {
    const arn = 'arn:aws:ecs:us-east-1:123456789:task/hq-workers/abc123def';
    expect(extractTaskIdFromArn(arn)).toBe('abc123def');
  });

  it('should handle ARN with complex task ID', () => {
    const arn = 'arn:aws:ecs:eu-west-1:987654321:task/my-cluster/a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(extractTaskIdFromArn(arn)).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('should return undefined for malformed ARN', () => {
    expect(extractTaskIdFromArn('not-an-arn')).toBeUndefined();
    expect(extractTaskIdFromArn('arn:aws:ecs')).toBeUndefined();
  });
});

describe('isValidRetentionDays', () => {
  it('should return true for valid retention periods', () => {
    for (const days of VALID_RETENTION_DAYS) {
      expect(isValidRetentionDays(days)).toBe(true);
    }
  });

  it('should return false for invalid retention periods', () => {
    expect(isValidRetentionDays(0)).toBe(false);
    expect(isValidRetentionDays(2)).toBe(false);
    expect(isValidRetentionDays(15)).toBe(false);
    expect(isValidRetentionDays(42)).toBe(false);
    expect(isValidRetentionDays(-1)).toBe(false);
  });
});

describe('buildCloudWatchLogConfig', () => {
  it('should build correct awslogs configuration', () => {
    const config = buildCloudWatchLogConfig({
      logGroupName: '/hq/workers',
      region: 'us-east-1',
      streamPrefix: 'session',
    });

    expect(config.logDriver).toBe('awslogs');
    expect(config.options['awslogs-group']).toBe('/hq/workers');
    expect(config.options['awslogs-region']).toBe('us-east-1');
    expect(config.options['awslogs-stream-prefix']).toBe('session');
    expect(config.options['awslogs-create-group']).toBe('true');
  });

  it('should respect createGroup flag', () => {
    const config = buildCloudWatchLogConfig({
      logGroupName: '/hq/workers',
      region: 'us-east-1',
      streamPrefix: 'session',
      createGroup: false,
    });

    expect(config.options['awslogs-create-group']).toBe('false');
  });
});

describe('createMockCloudWatchLogsClient', () => {
  it('should return empty results by default', async () => {
    const client = createMockCloudWatchLogsClient();

    const filterResult = await client.filterLogEvents({
      logGroupName: '/test',
    });
    expect(filterResult.events).toHaveLength(0);

    const getResult = await client.getLogEvents({
      logGroupName: '/test',
      logStreamName: 'stream',
    });
    expect(getResult.events).toHaveLength(0);

    const describeResult = await client.describeLogStreams({
      logGroupName: '/test',
    });
    expect(describeResult.logStreams).toHaveLength(0);
  });

  it('should return configured results', async () => {
    const client = createMockCloudWatchLogsClient({
      filterLogEventsResult: {
        events: [
          { timestamp: 123, message: 'test log' },
        ],
      },
    });

    const result = await client.filterLogEvents({ logGroupName: '/test' });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.message).toBe('test log');
  });

  it('should throw configured error', async () => {
    const client = createMockCloudWatchLogsClient({
      filterLogEventsError: new Error('Test error'),
    });

    await expect(
      client.filterLogEvents({ logGroupName: '/test' })
    ).rejects.toThrow('Test error');
  });

  it('should resolve putRetentionPolicy', async () => {
    const client = createMockCloudWatchLogsClient();
    await expect(
      client.putRetentionPolicy({ logGroupName: '/test', retentionInDays: 30 })
    ).resolves.toBeUndefined();
  });

  it('should throw configured putRetentionPolicy error', async () => {
    const client = createMockCloudWatchLogsClient({
      putRetentionPolicyError: new Error('AccessDenied'),
    });

    await expect(
      client.putRetentionPolicy({ logGroupName: '/test', retentionInDays: 30 })
    ).rejects.toThrow('AccessDenied');
  });
});

describe('WorkerLogsError', () => {
  it('should include code and workerId', () => {
    const error = new WorkerLogsError('test message', 'TEST_CODE', 'w-123');

    expect(error.message).toBe('test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.workerId).toBe('w-123');
    expect(error.name).toBe('WorkerLogsError');
  });

  it('should handle undefined workerId', () => {
    const error = new WorkerLogsError('test', 'CODE', undefined);

    expect(error.workerId).toBeUndefined();
  });

  it('should be an instance of Error', () => {
    const error = new WorkerLogsError('test', 'CODE', 'w-1');
    expect(error).toBeInstanceOf(Error);
  });
});
