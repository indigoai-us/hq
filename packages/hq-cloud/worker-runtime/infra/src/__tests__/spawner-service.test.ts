/**
 * Tests for Worker Spawner Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WorkerSpawnerService,
  createMockEcsClient,
  type SpawnRequest,
  type SpawnerServiceConfig,
  type EcsClient,
} from '../spawner-service.js';

/**
 * Create a mock spawn request
 */
function createMockSpawnRequest(overrides: Partial<SpawnRequest> = {}): SpawnRequest {
  return {
    trackingId: 'spawn-test123-abc',
    workerId: 'backend-dev',
    skill: 'implement-endpoint',
    parameters: { repo: '/path/to/repo' },
    status: 'pending',
    queuedAt: new Date(),
    startedAt: null,
    completedAt: null,
    error: null,
    ...overrides,
  };
}

/**
 * Create a mock spawner config
 */
function createMockConfig(overrides: Partial<SpawnerServiceConfig> = {}): SpawnerServiceConfig {
  return {
    cluster: 'hq-workers',
    taskDefinition: 'hq-worker:1',
    network: {
      vpcId: 'vpc-123',
      subnetIds: ['subnet-1', 'subnet-2'],
      securityGroupIds: ['sg-1'],
      assignPublicIp: false,
    },
    hqApiUrl: 'https://api.hq.test',
    hqApiKey: 'test-api-key',
    maxRetries: 3,
    retryBaseDelayMs: 100, // Fast retries for tests
    retryMaxDelayMs: 500,
    pollIntervalMs: 100000, // Very slow polling to avoid timer issues in tests
    ...overrides,
  };
}

describe('WorkerSpawnerService', () => {
  let service: WorkerSpawnerService;
  let mockEcsClient: EcsClient;
  let mockConfig: SpawnerServiceConfig;
  let spawnQueueCallbacks: Array<(request: SpawnRequest) => void>;
  let resultCallback: vi.Mock;
  let registryCallback: vi.Mock;

  /**
   * Mock onSpawnQueued function that simulates the spawn queue subscription
   */
  function mockOnSpawnQueued(callback: (request: SpawnRequest) => void): () => void {
    spawnQueueCallbacks.push(callback);
    return () => {
      const index = spawnQueueCallbacks.indexOf(callback);
      if (index > -1) {
        spawnQueueCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Trigger a spawn request as if it came from the queue
   */
  function triggerSpawnRequest(request: SpawnRequest): void {
    for (const callback of spawnQueueCallbacks) {
      callback(request);
    }
  }

  beforeEach(() => {
    spawnQueueCallbacks = [];
    resultCallback = vi.fn();
    registryCallback = vi.fn();
    mockEcsClient = createMockEcsClient({});
    mockConfig = createMockConfig();
  });

  afterEach(() => {
    if (service?.isRunning) {
      service.stop();
    }
  });

  describe('constructor', () => {
    it('should create service with valid config', () => {
      service = new WorkerSpawnerService(mockConfig, mockEcsClient);
      expect(service).toBeDefined();
      expect(service.isRunning).toBe(false);
    });

    it('should throw error for invalid CPU/memory combination', () => {
      const invalidConfig = createMockConfig({
        defaultCpu: 256,
        defaultMemory: 8192, // Invalid: 256 CPU only supports up to 2048 memory
      });

      expect(() => new WorkerSpawnerService(invalidConfig, mockEcsClient)).toThrow(
        /Invalid CPU\/memory combination/
      );
    });

    it('should apply default values', () => {
      const minimalConfig: SpawnerServiceConfig = {
        cluster: 'hq-workers',
        taskDefinition: 'hq-worker:1',
        network: {
          vpcId: 'vpc-123',
          subnetIds: ['subnet-1'],
          securityGroupIds: ['sg-1'],
          assignPublicIp: false,
        },
        hqApiUrl: 'https://api.hq.test',
        hqApiKey: 'test-key',
      };

      service = new WorkerSpawnerService(minimalConfig, mockEcsClient);
      expect(service).toBeDefined();
    });
  });

  describe('start/stop', () => {
    beforeEach(() => {
      service = new WorkerSpawnerService(mockConfig, mockEcsClient);
    });

    it('should start the service', () => {
      service.start(mockOnSpawnQueued);
      expect(service.isRunning).toBe(true);
      expect(spawnQueueCallbacks.length).toBe(1);
    });

    it('should not start twice', () => {
      service.start(mockOnSpawnQueued);
      service.start(mockOnSpawnQueued);
      expect(spawnQueueCallbacks.length).toBe(1);
    });

    it('should stop the service', () => {
      service.start(mockOnSpawnQueued);
      service.stop();
      expect(service.isRunning).toBe(false);
      expect(spawnQueueCallbacks.length).toBe(0);
    });
  });

  describe('spawn handling', () => {
    beforeEach(() => {
      service = new WorkerSpawnerService(mockConfig, mockEcsClient);
      service.onSpawnResult(resultCallback);
      service.onWorkerRegistered(registryCallback);
      service.start(mockOnSpawnQueued);
    });

    it('should handle successful spawn', async () => {
      const request = createMockSpawnRequest();

      triggerSpawnRequest(request);

      // Wait for async spawn to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify result callback was called with success
      expect(resultCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingId: request.trackingId,
          success: true,
          taskArn: expect.stringContaining('arn:aws:ecs'),
          attempts: 1,
          registeredWorkerId: expect.stringContaining(request.workerId),
        })
      );

      // Verify registry callback was called
      expect(registryCallback).toHaveBeenCalledWith(
        expect.stringContaining(request.workerId),
        expect.stringContaining('arn:aws:ecs'),
        request.trackingId
      );

      // Pending count should be 0
      expect(service.pendingCount).toBe(0);
    });

    it('should generate unique worker IDs', async () => {
      const request1 = createMockSpawnRequest({ trackingId: 'spawn-time1-abc123' });
      const request2 = createMockSpawnRequest({ trackingId: 'spawn-time2-def456' });

      triggerSpawnRequest(request1);
      await new Promise((resolve) => setTimeout(resolve, 50));

      triggerSpawnRequest(request2);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(registryCallback).toHaveBeenCalledTimes(2);

      // Verify different worker IDs were generated
      const call1 = registryCallback.mock.calls[0]!;
      const call2 = registryCallback.mock.calls[1]!;
      expect(call1[0]).not.toBe(call2[0]);
    });

    it('should include parameters from spawn request', async () => {
      const runTaskSpy = vi.spyOn(mockEcsClient, 'runTask');

      const request = createMockSpawnRequest({
        parameters: { repo: '/custom/repo', branch: 'feature' },
      });

      triggerSpawnRequest(request);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(runTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: expect.objectContaining({
            containerOverrides: expect.arrayContaining([
              expect.objectContaining({
                environment: expect.arrayContaining([
                  expect.objectContaining({
                    name: 'WORKER_PARAMS',
                    value: JSON.stringify(request.parameters),
                  }),
                ]),
              }),
            ]),
          }),
        })
      );
    });
  });

  describe('failure handling', () => {
    beforeEach(() => {
      service = new WorkerSpawnerService(mockConfig, mockEcsClient);
      service.onSpawnResult(resultCallback);
      service.start(mockOnSpawnQueued);
    });

    it('should track spawn failure and increment attempts', async () => {
      mockEcsClient.runTask = vi.fn().mockRejectedValue(new Error('ECS error'));

      const request = createMockSpawnRequest();
      triggerSpawnRequest(request);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // First attempt fails, should be queued for retry
      const status = service.getSpawnStatus(request.trackingId);
      expect(status).toBeDefined();
      expect(status?.attempts).toBe(1);
      expect(status?.lastError).toContain('ECS error');
    });

    it('should handle ECS failures response', async () => {
      mockEcsClient.runTask = vi.fn().mockResolvedValue({
        taskArns: [],
        failures: [
          { arn: 'arn:aws:ecs:failure', reason: 'RESOURCE_NOT_FOUND' },
        ],
      });

      const request = createMockSpawnRequest();
      triggerSpawnRequest(request);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = service.getSpawnStatus(request.trackingId);
      expect(status?.lastError).toContain('RESOURCE_NOT_FOUND');
    });

    it('should handle empty task response', async () => {
      mockEcsClient.runTask = vi.fn().mockResolvedValue({
        taskArns: [],
        failures: [],
      });

      const request = createMockSpawnRequest();
      triggerSpawnRequest(request);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = service.getSpawnStatus(request.trackingId);
      expect(status?.lastError).toContain('no tasks');
    });
  });

  describe('getTaskStatus', () => {
    beforeEach(() => {
      service = new WorkerSpawnerService(mockConfig, mockEcsClient);
    });

    it('should return task description', async () => {
      const mockDescription = {
        taskArn: 'arn:aws:ecs:us-east-1:123:task/hq-workers/abc',
        lastStatus: 'RUNNING',
        desiredStatus: 'RUNNING',
        containers: [{ name: 'session', lastStatus: 'RUNNING' }],
      };

      mockEcsClient.describeTasks = vi.fn().mockResolvedValue([mockDescription]);

      const result = await service.getTaskStatus(mockDescription.taskArn);

      expect(result).toEqual(mockDescription);
      expect(mockEcsClient.describeTasks).toHaveBeenCalledWith(
        mockConfig.cluster,
        [mockDescription.taskArn]
      );
    });

    it('should return undefined for non-existent task', async () => {
      mockEcsClient.describeTasks = vi.fn().mockResolvedValue([]);

      const result = await service.getTaskStatus('arn:aws:ecs:us-east-1:123:task/nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('stopTask', () => {
    beforeEach(() => {
      service = new WorkerSpawnerService(mockConfig, mockEcsClient);
    });

    it('should call ECS stopTask', async () => {
      const stopTaskSpy = vi.spyOn(mockEcsClient, 'stopTask');
      const taskArn = 'arn:aws:ecs:us-east-1:123:task/hq-workers/abc';
      const reason = 'User requested stop';

      await service.stopTask(taskArn, reason);

      expect(stopTaskSpy).toHaveBeenCalledWith(mockConfig.cluster, taskArn, reason);
    });

    it('should use default reason if not provided', async () => {
      const stopTaskSpy = vi.spyOn(mockEcsClient, 'stopTask');
      const taskArn = 'arn:aws:ecs:us-east-1:123:task/hq-workers/abc';

      await service.stopTask(taskArn);

      expect(stopTaskSpy).toHaveBeenCalledWith(
        mockConfig.cluster,
        taskArn,
        'Stopped by spawner service'
      );
    });
  });

  describe('getSpawnStatus', () => {
    beforeEach(() => {
      mockEcsClient.runTask = vi.fn().mockRejectedValue(new Error('Always fails'));
      service = new WorkerSpawnerService(mockConfig, mockEcsClient);
      service.start(mockOnSpawnQueued);
    });

    it('should return spawn attempt status', async () => {
      const request = createMockSpawnRequest();
      triggerSpawnRequest(request);

      // Wait for first attempt
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = service.getSpawnStatus(request.trackingId);

      expect(status).toBeDefined();
      expect(status?.request.trackingId).toBe(request.trackingId);
      expect(status?.attempts).toBeGreaterThanOrEqual(1);
    });

    it('should return undefined for unknown tracking ID', () => {
      const status = service.getSpawnStatus('unknown-tracking-id');
      expect(status).toBeUndefined();
    });
  });

  describe('concurrent spawns', () => {
    beforeEach(() => {
      service = new WorkerSpawnerService(mockConfig, mockEcsClient);
      service.onSpawnResult(resultCallback);
      service.start(mockOnSpawnQueued);
    });

    it('should handle multiple spawn requests', async () => {
      const requests = [
        createMockSpawnRequest({ trackingId: 'spawn-t1-aaa' }),
        createMockSpawnRequest({ trackingId: 'spawn-t2-bbb' }),
        createMockSpawnRequest({ trackingId: 'spawn-t3-ccc' }),
      ];

      // Trigger all requests
      for (const request of requests) {
        triggerSpawnRequest(request);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // All should succeed
      expect(resultCallback).toHaveBeenCalledTimes(3);

      for (const request of requests) {
        expect(resultCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            trackingId: request.trackingId,
            success: true,
          })
        );
      }
    });
  });
});

describe('createMockEcsClient', () => {
  it('should return successful task by default', async () => {
    const client = createMockEcsClient({});
    const result = await client.runTask({} as never);

    expect(result.taskArns.length).toBe(1);
    expect(result.failures.length).toBe(0);
  });

  it('should return configured result', async () => {
    const client = createMockEcsClient({
      runTaskResult: {
        taskArns: ['custom-arn-1', 'custom-arn-2'],
      },
    });

    const result = await client.runTask({} as never);
    expect(result.taskArns).toEqual(['custom-arn-1', 'custom-arn-2']);
  });

  it('should throw configured error', async () => {
    const client = createMockEcsClient({
      runTaskError: new Error('Configured error'),
    });

    await expect(client.runTask({} as never)).rejects.toThrow('Configured error');
  });

  it('should return describeTasks results', async () => {
    const mockTasks = [
      {
        taskArn: 'arn:1',
        lastStatus: 'RUNNING',
        desiredStatus: 'RUNNING',
        containers: [],
      },
    ];

    const client = createMockEcsClient({ describeTasks: mockTasks });
    const result = await client.describeTasks('cluster', ['arn:1']);

    expect(result).toEqual(mockTasks);
  });
});
