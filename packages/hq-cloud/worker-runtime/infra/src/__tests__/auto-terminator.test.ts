/**
 * Tests for Worker Auto-Termination Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AutoTerminator,
  createAutoTerminatorFromEnv,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_SCAN_INTERVAL_MS,
  type AutoTerminatorConfig,
  type AutoTerminatorEvent,
  type CostSavingsEntry,
} from '../auto-terminator.js';
import {
  createMockEcsClient,
  type EcsClient,
} from '../spawner-service.js';

/**
 * Create a mock AutoTerminatorConfig
 */
function createMockConfig(
  overrides: Partial<AutoTerminatorConfig> = {}
): AutoTerminatorConfig {
  return {
    cluster: 'hq-workers',
    idleTimeoutMs: 1000, // 1 second for fast tests
    scanIntervalMs: 100000, // Very slow to avoid timer issues in tests
    defaultCpu: 512,
    defaultMemory: 1024,
    ...overrides,
  };
}

describe('AutoTerminator', () => {
  let service: AutoTerminator;
  let mockEcsClient: EcsClient;
  let mockConfig: AutoTerminatorConfig;

  beforeEach(() => {
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
      service = new AutoTerminator(mockConfig, mockEcsClient);
      expect(service).toBeDefined();
      expect(service.isRunning).toBe(false);
    });

    it('should apply default values for optional config', () => {
      const minimalConfig: AutoTerminatorConfig = {
        cluster: 'hq-workers',
      };

      service = new AutoTerminator(minimalConfig, mockEcsClient);
      expect(service).toBeDefined();
    });
  });

  describe('start/stop', () => {
    beforeEach(() => {
      service = new AutoTerminator(mockConfig, mockEcsClient);
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
  });

  describe('registerWorker', () => {
    beforeEach(() => {
      service = new AutoTerminator(mockConfig, mockEcsClient);
    });

    it('should register a worker', () => {
      service.registerWorker('w-1', 'arn:aws:ecs:us-east-1:123:task/cluster/task1');
      expect(service.trackedWorkerCount).toBe(1);
    });

    it('should register with custom CPU/memory', () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1', {
        cpu: 1024,
        memory: 2048,
      });

      const activity = service.getWorkerActivity('w-1');
      expect(activity?.cpu).toBe(1024);
      expect(activity?.memory).toBe(2048);
    });

    it('should register with default CPU/memory when not specified', () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      const activity = service.getWorkerActivity('w-1');
      expect(activity?.cpu).toBe(512);
      expect(activity?.memory).toBe(1024);
    });

    it('should set initial status to active', () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      const activity = service.getWorkerActivity('w-1');
      expect(activity?.status).toBe('active');
    });

    it('should set initial heartbeat to registration time', () => {
      const before = Date.now();
      service.registerWorker('w-1', 'arn:aws:ecs:task1');
      const after = Date.now();

      const activity = service.getWorkerActivity('w-1');
      expect(activity?.lastHeartbeatAt).toBeGreaterThanOrEqual(before);
      expect(activity?.lastHeartbeatAt).toBeLessThanOrEqual(after);
      expect(activity?.registeredAt).toBeGreaterThanOrEqual(before);
      expect(activity?.registeredAt).toBeLessThanOrEqual(after);
    });

    it('should emit worker_registered event', () => {
      const eventCallback = vi.fn();
      service.onEvent(eventCallback);

      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker_registered',
          workerId: 'w-1',
          payload: expect.objectContaining({
            taskArn: 'arn:aws:ecs:task1',
          }),
        })
      );
    });

    it('should register with metadata', () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1', {
        metadata: { skill: 'implement-endpoint' },
      });

      const activity = service.getWorkerActivity('w-1');
      expect(activity?.metadata).toEqual({ skill: 'implement-endpoint' });
    });
  });

  describe('recordHeartbeat', () => {
    beforeEach(() => {
      service = new AutoTerminator(mockConfig, mockEcsClient);
      service.registerWorker('w-1', 'arn:aws:ecs:task1');
    });

    it('should update heartbeat timestamp', async () => {
      const activity = service.getWorkerActivity('w-1');
      const oldHeartbeat = activity?.lastHeartbeatAt ?? 0;

      // Wait a bit so timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = service.recordHeartbeat('w-1');

      expect(result).toBe(true);
      expect(activity?.lastHeartbeatAt).toBeGreaterThan(oldHeartbeat);
    });

    it('should return false for unknown worker', () => {
      const result = service.recordHeartbeat('w-unknown');
      expect(result).toBe(false);
    });

    it('should return false for terminated worker', () => {
      // Manually set status to terminated for testing
      const activity = service.getWorkerActivity('w-1');
      if (activity) {
        activity.status = 'terminated';
      }

      const result = service.recordHeartbeat('w-1');
      expect(result).toBe(false);
    });

    it('should return false for terminating worker', () => {
      const activity = service.getWorkerActivity('w-1');
      if (activity) {
        activity.status = 'terminating';
      }

      const result = service.recordHeartbeat('w-1');
      expect(result).toBe(false);
    });

    it('should set status back to active', () => {
      const activity = service.getWorkerActivity('w-1');
      if (activity) {
        activity.status = 'idle';
      }

      service.recordHeartbeat('w-1');
      expect(activity?.status).toBe('active');
    });

    it('should emit heartbeat_received event', () => {
      const eventCallback = vi.fn();
      service.onEvent(eventCallback);

      service.recordHeartbeat('w-1');

      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'heartbeat_received',
          workerId: 'w-1',
        })
      );
    });
  });

  describe('deregisterWorker', () => {
    beforeEach(() => {
      service = new AutoTerminator(mockConfig, mockEcsClient);
      service.registerWorker('w-1', 'arn:aws:ecs:task1');
    });

    it('should remove a registered worker', () => {
      const result = service.deregisterWorker('w-1');

      expect(result).toBe(true);
      expect(service.trackedWorkerCount).toBe(0);
    });

    it('should return false for unknown worker', () => {
      const result = service.deregisterWorker('w-unknown');
      expect(result).toBe(false);
    });

    it('should emit worker_deregistered event', () => {
      const eventCallback = vi.fn();
      service.onEvent(eventCallback);

      service.deregisterWorker('w-1');

      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker_deregistered',
          workerId: 'w-1',
        })
      );
    });
  });

  describe('scanForIdleWorkers', () => {
    let stopTaskSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockConfig = createMockConfig({ idleTimeoutMs: 50 });
      service = new AutoTerminator(mockConfig, mockEcsClient);
      stopTaskSpy = vi.spyOn(mockEcsClient, 'stopTask');
    });

    it('should terminate workers that exceed idle timeout', async () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      // Wait for idle timeout to be exceeded
      await new Promise((resolve) => setTimeout(resolve, 100));

      const terminated = await service.scanForIdleWorkers();

      expect(terminated).toContain('w-1');
      expect(stopTaskSpy).toHaveBeenCalledWith(
        'hq-workers',
        'arn:aws:ecs:task1',
        'Auto-terminated: idle timeout exceeded'
      );
    });

    it('should not terminate active workers', async () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      // Record heartbeat to keep active
      service.recordHeartbeat('w-1');

      // Scan immediately (worker just got a heartbeat)
      const terminated = await service.scanForIdleWorkers();

      expect(terminated).toHaveLength(0);
      expect(stopTaskSpy).not.toHaveBeenCalled();
    });

    it('should skip workers already being terminated', async () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      const activity = service.getWorkerActivity('w-1');
      if (activity) {
        activity.status = 'terminating';
        activity.lastHeartbeatAt = Date.now() - 100000; // Long ago
      }

      const terminated = await service.scanForIdleWorkers();

      expect(terminated).toHaveLength(0);
      expect(stopTaskSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple idle workers', async () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');
      service.registerWorker('w-2', 'arn:aws:ecs:task2');
      service.registerWorker('w-3', 'arn:aws:ecs:task3');

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      const terminated = await service.scanForIdleWorkers();

      expect(terminated).toHaveLength(3);
      expect(stopTaskSpy).toHaveBeenCalledTimes(3);
    });

    it('should only terminate workers past the threshold', async () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Register a fresh worker
      service.registerWorker('w-2', 'arn:aws:ecs:task2');

      const terminated = await service.scanForIdleWorkers();

      expect(terminated).toContain('w-1');
      expect(terminated).not.toContain('w-2');
    });

    it('should remove terminated workers from tracking', async () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');
      expect(service.trackedWorkerCount).toBe(1);

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.scanForIdleWorkers();

      expect(service.trackedWorkerCount).toBe(0);
    });

    it('should handle ECS stopTask failure gracefully', async () => {
      stopTaskSpy.mockRejectedValue(new Error('ECS API error'));

      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      const terminated = await service.scanForIdleWorkers();

      // Should not report as terminated
      expect(terminated).toHaveLength(0);
      // Worker should revert to idle (not removed)
      const activity = service.getWorkerActivity('w-1');
      expect(activity?.status).toBe('idle');
    });

    it('should emit termination events', async () => {
      const eventCallback = vi.fn();
      service.onEvent(eventCallback);

      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.scanForIdleWorkers();

      const eventTypes = eventCallback.mock.calls.map(
        (call: [AutoTerminatorEvent]) => call[0].type
      );

      expect(eventTypes).toContain('worker_registered');
      expect(eventTypes).toContain('worker_idle');
      expect(eventTypes).toContain('termination_initiated');
      expect(eventTypes).toContain('termination_complete');
      expect(eventTypes).toContain('cost_savings_logged');
    });
  });

  describe('final status callback', () => {
    it('should call final status callback before termination', async () => {
      const finalStatusCallback = vi.fn();
      mockConfig = createMockConfig({ idleTimeoutMs: 50 });
      service = new AutoTerminator(mockConfig, mockEcsClient);
      service.onFinalStatus(finalStatusCallback);

      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.scanForIdleWorkers();

      expect(finalStatusCallback).toHaveBeenCalledWith(
        'w-1',
        'arn:aws:ecs:task1',
        'auto-termination: idle timeout exceeded'
      );
    });

    it('should call final status before stopTask', async () => {
      const callOrder: string[] = [];

      const finalStatusCallback = vi.fn().mockImplementation(() => {
        callOrder.push('finalStatus');
      });
      const stopTaskSpy = vi.spyOn(mockEcsClient, 'stopTask').mockImplementation(() => {
        callOrder.push('stopTask');
        return Promise.resolve();
      });

      mockConfig = createMockConfig({ idleTimeoutMs: 50 });
      service = new AutoTerminator(mockConfig, mockEcsClient);
      service.onFinalStatus(finalStatusCallback);

      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      await new Promise((resolve) => setTimeout(resolve, 100));
      await service.scanForIdleWorkers();

      expect(callOrder).toEqual(['finalStatus', 'stopTask']);
      expect(stopTaskSpy).toHaveBeenCalled();
    });
  });

  describe('cost savings', () => {
    it('should call cost savings callback with entry', async () => {
      const costSavingsCallback = vi.fn();
      mockConfig = createMockConfig({ idleTimeoutMs: 50 });
      service = new AutoTerminator(mockConfig, mockEcsClient);
      service.onCostSavings(costSavingsCallback);

      service.registerWorker('w-1', 'arn:aws:ecs:task1', {
        cpu: 512,
        memory: 1024,
      });

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.scanForIdleWorkers();

      expect(costSavingsCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 'w-1',
          taskArn: 'arn:aws:ecs:task1',
          cpu: 512,
          memory: 1024,
          runDurationMs: expect.any(Number),
          idleDurationMs: expect.any(Number),
          estimatedSavingsUsd: expect.any(Number),
          terminatedAt: expect.any(String),
        })
      );
    });

    it('should include positive estimated savings', async () => {
      let capturedEntry: CostSavingsEntry | undefined;
      const costSavingsCallback = vi.fn().mockImplementation(
        (entry: CostSavingsEntry) => {
          capturedEntry = entry;
        }
      );

      mockConfig = createMockConfig({ idleTimeoutMs: 50 });
      service = new AutoTerminator(mockConfig, mockEcsClient);
      service.onCostSavings(costSavingsCallback);

      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      await new Promise((resolve) => setTimeout(resolve, 100));
      await service.scanForIdleWorkers();

      expect(capturedEntry).toBeDefined();
      expect(capturedEntry!.estimatedSavingsUsd).toBeGreaterThan(0);
    });

    it('should record proper idle duration', async () => {
      let capturedEntry: CostSavingsEntry | undefined;
      const costSavingsCallback = vi.fn().mockImplementation(
        (entry: CostSavingsEntry) => {
          capturedEntry = entry;
        }
      );

      mockConfig = createMockConfig({ idleTimeoutMs: 50 });
      service = new AutoTerminator(mockConfig, mockEcsClient);
      service.onCostSavings(costSavingsCallback);

      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      await new Promise((resolve) => setTimeout(resolve, 100));
      await service.scanForIdleWorkers();

      expect(capturedEntry).toBeDefined();
      // Idle duration should be at least 50ms (the timeout)
      expect(capturedEntry!.idleDurationMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe('getWorkerActivity / getAllWorkerActivity', () => {
    beforeEach(() => {
      service = new AutoTerminator(mockConfig, mockEcsClient);
    });

    it('should return undefined for unknown worker', () => {
      const activity = service.getWorkerActivity('w-unknown');
      expect(activity).toBeUndefined();
    });

    it('should return activity for registered worker', () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      const activity = service.getWorkerActivity('w-1');
      expect(activity).toBeDefined();
      expect(activity?.workerId).toBe('w-1');
      expect(activity?.taskArn).toBe('arn:aws:ecs:task1');
    });

    it('should return all tracked workers', () => {
      service.registerWorker('w-1', 'arn:aws:ecs:task1');
      service.registerWorker('w-2', 'arn:aws:ecs:task2');

      const all = service.getAllWorkerActivity();
      expect(all).toHaveLength(2);
    });

    it('should return empty array when no workers', () => {
      const all = service.getAllWorkerActivity();
      expect(all).toHaveLength(0);
    });
  });

  describe('activeWorkerCount', () => {
    beforeEach(() => {
      service = new AutoTerminator(mockConfig, mockEcsClient);
    });

    it('should count active workers', () => {
      service.registerWorker('w-1', 'arn:task1');
      service.registerWorker('w-2', 'arn:task2');

      expect(service.activeWorkerCount).toBe(2);
    });

    it('should exclude terminated workers', () => {
      service.registerWorker('w-1', 'arn:task1');
      service.registerWorker('w-2', 'arn:task2');

      const activity = service.getWorkerActivity('w-1');
      if (activity) {
        activity.status = 'terminated';
      }

      expect(service.activeWorkerCount).toBe(1);
    });

    it('should include idle workers', () => {
      service.registerWorker('w-1', 'arn:task1');

      const activity = service.getWorkerActivity('w-1');
      if (activity) {
        activity.status = 'idle';
      }

      expect(service.activeWorkerCount).toBe(1);
    });

    it('should exclude terminating workers', () => {
      service.registerWorker('w-1', 'arn:task1');

      const activity = service.getWorkerActivity('w-1');
      if (activity) {
        activity.status = 'terminating';
      }

      expect(service.activeWorkerCount).toBe(0);
    });
  });

  describe('integration: heartbeat resets idle timer', () => {
    it('should not terminate a worker that heartbeats before timeout', async () => {
      mockConfig = createMockConfig({ idleTimeoutMs: 100 });
      service = new AutoTerminator(mockConfig, mockEcsClient);
      const stopTaskSpy = vi.spyOn(mockEcsClient, 'stopTask');

      service.registerWorker('w-1', 'arn:aws:ecs:task1');

      // Wait 60ms (not yet at 100ms threshold)
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Send heartbeat to reset timer
      service.recordHeartbeat('w-1');

      // Wait another 60ms (total 120ms since registration, but only 60ms since heartbeat)
      await new Promise((resolve) => setTimeout(resolve, 60));

      const terminated = await service.scanForIdleWorkers();

      expect(terminated).toHaveLength(0);
      expect(stopTaskSpy).not.toHaveBeenCalled();
    });
  });
});

describe('createAutoTerminatorFromEnv', () => {
  it('should create an AutoTerminator with default env values', () => {
    const mockEcsClient = createMockEcsClient({});
    const terminator = createAutoTerminatorFromEnv(mockEcsClient);

    expect(terminator).toBeDefined();
    expect(terminator.isRunning).toBe(false);
  });

  it('should wire up callbacks when provided', () => {
    const mockEcsClient = createMockEcsClient({});
    const finalStatusCallback = vi.fn();
    const costSavingsCallback = vi.fn();

    const terminator = createAutoTerminatorFromEnv(mockEcsClient, {
      finalStatusCallback,
      costSavingsCallback,
    });

    expect(terminator).toBeDefined();
  });
});

describe('constants', () => {
  it('DEFAULT_IDLE_TIMEOUT_MS should be 15 minutes', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });

  it('DEFAULT_SCAN_INTERVAL_MS should be 1 minute', () => {
    expect(DEFAULT_SCAN_INTERVAL_MS).toBe(60 * 1000);
  });
});
