/**
 * Worker Spawner Service
 *
 * Consumes spawn requests from the API spawn queue and launches
 * ECS Fargate tasks. Tracks task ARNs in the worker registry and
 * handles spawn failures with exponential backoff retry.
 *
 * @module spawner-service
 */

import { buildRunTaskParams, validateFargateResources, describeTask } from './run-task.js';
import type {
  RunTaskConfig,
  RunTaskResult,
  EcsRunTaskParams,
} from './run-task.js';
import { resolveResourceTier, mergeTierOverrides, describeTier } from './resource-tiers.js';
import type {
  SpawnTaskInput,
  VpcNetworkConfig,
  FargateCpuSize,
  FargateMemorySize,
} from '../../types/infra/index.js';
import { DEFAULT_TASK_CONFIG } from '../../types/infra/index.js';

/**
 * Logger interface for spawner service
 */
export interface SpawnerLogger {
  info(message: string): void;
  error(message: string): void;
}

/**
 * Default console logger
 */
const DEFAULT_LOGGER: SpawnerLogger = {
  // eslint-disable-next-line no-console
  info: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
};

/**
 * Spawn request from the API queue
 */
export interface SpawnRequest {
  trackingId: string;
  workerId: string;
  skill: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a spawn attempt
 */
export interface SpawnResult {
  /** The tracking ID of the spawn request */
  trackingId: string;
  /** Whether the spawn succeeded */
  success: boolean;
  /** ECS task ARN if successful */
  taskArn?: string;
  /** Error message if failed */
  error?: string;
  /** Number of attempts made */
  attempts: number;
  /** Worker ID in the registry */
  registeredWorkerId?: string;
}

/**
 * Callback for spawn request events
 */
export type SpawnCallback = (request: SpawnRequest) => void;

/**
 * Callback for notifying the API of spawn results
 */
export type SpawnResultCallback = (result: SpawnResult) => void | Promise<void>;

/**
 * Callback for updating worker registry with task ARN
 */
export type WorkerRegistryCallback = (
  workerId: string,
  taskArn: string,
  trackingId: string
) => void | Promise<void>;

/**
 * ECS client interface - allows for mocking in tests
 */
export interface EcsClient {
  runTask(params: EcsRunTaskParams): Promise<RunTaskResult>;
  describeTasks(cluster: string, taskArns: string[]): Promise<TaskDescription[]>;
  stopTask(cluster: string, taskArn: string, reason: string): Promise<void>;
}

/**
 * Task description from ECS
 */
export interface TaskDescription {
  taskArn: string;
  lastStatus: string;
  desiredStatus: string;
  startedAt?: Date;
  stoppedAt?: Date;
  stoppedReason?: string;
  containers: Array<{
    name: string;
    lastStatus: string;
    exitCode?: number;
    reason?: string;
  }>;
}

/**
 * Configuration for the spawner service
 */
export interface SpawnerServiceConfig {
  /** ECS cluster ARN or name */
  cluster: string;
  /** Task definition ARN or family:revision */
  taskDefinition: string;
  /** VPC network configuration */
  network: VpcNetworkConfig;
  /** HQ API URL for worker communication */
  hqApiUrl: string;
  /** HQ API key for worker authentication */
  hqApiKey: string;
  /** Maximum retry attempts for failed spawns */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  retryBaseDelayMs?: number;
  /** Maximum delay between retries (ms) */
  retryMaxDelayMs?: number;
  /** Poll interval for queue (ms) */
  pollIntervalMs?: number;
  /** Default CPU for tasks */
  defaultCpu?: FargateCpuSize;
  /** Default memory for tasks */
  defaultMemory?: FargateMemorySize;
  /** Enable execute command for debugging */
  enableExecuteCommand?: boolean;
  /** Logger instance */
  logger?: SpawnerLogger;
}

/**
 * Internal state for a spawn attempt
 */
interface SpawnAttempt {
  request: SpawnRequest;
  attempts: number;
  lastError?: string;
  lastAttemptAt?: Date;
}

/**
 * Worker Spawner Service
 *
 * Manages the lifecycle of worker container spawning:
 * 1. Consumes spawn requests from the API queue
 * 2. Calls ECS RunTask to start containers
 * 3. Tracks task ARNs in the worker registry
 * 4. Handles failures with exponential backoff retry
 * 5. Reports status back to the API
 */
export class WorkerSpawnerService {
  private readonly config: Required<SpawnerServiceConfig>;
  private readonly ecsClient: EcsClient;
  private readonly pendingSpawns: Map<string, SpawnAttempt> = new Map();
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeQueue: (() => void) | null = null;
  private resultCallback: SpawnResultCallback | null = null;
  private registryCallback: WorkerRegistryCallback | null = null;

  constructor(
    config: SpawnerServiceConfig,
    ecsClient: EcsClient
  ) {
    // Apply defaults
    this.config = {
      ...config,
      maxRetries: config.maxRetries ?? 3,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 1000,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 30000,
      pollIntervalMs: config.pollIntervalMs ?? 5000,
      defaultCpu: config.defaultCpu ?? DEFAULT_TASK_CONFIG.cpu,
      defaultMemory: config.defaultMemory ?? DEFAULT_TASK_CONFIG.memory,
      enableExecuteCommand: config.enableExecuteCommand ?? false,
      logger: config.logger ?? DEFAULT_LOGGER,
    };
    this.ecsClient = ecsClient;

    // Validate CPU/memory combination
    if (!validateFargateResources(this.config.defaultCpu, this.config.defaultMemory)) {
      throw new Error(
        `Invalid CPU/memory combination: ${this.config.defaultCpu} CPU with ${this.config.defaultMemory} MiB memory`
      );
    }
  }

  /**
   * Start the spawner service
   *
   * @param onSpawnQueued - Callback to subscribe to spawn queue events
   */
  start(onSpawnQueued: (callback: SpawnCallback) => () => void): void {
    if (this.running) {
      return;
    }

    this.running = true;

    // Subscribe to spawn queue events
    this.unsubscribeQueue = onSpawnQueued((request) => {
      void this.handleSpawnRequest(request);
    });

    // Start retry polling loop
    this.pollTimer = setInterval(() => {
      void this.processRetries();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the spawner service
   */
  stop(): void {
    this.running = false;

    if (this.unsubscribeQueue) {
      this.unsubscribeQueue();
      this.unsubscribeQueue = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Register a callback for spawn results
   */
  onSpawnResult(callback: SpawnResultCallback): void {
    this.resultCallback = callback;
  }

  /**
   * Register a callback for worker registry updates
   */
  onWorkerRegistered(callback: WorkerRegistryCallback): void {
    this.registryCallback = callback;
  }

  /**
   * Handle a new spawn request from the queue
   */
  private async handleSpawnRequest(request: SpawnRequest): Promise<void> {
    // Create spawn attempt tracking
    const attempt: SpawnAttempt = {
      request,
      attempts: 0,
    };

    this.pendingSpawns.set(request.trackingId, attempt);

    // Try to spawn immediately
    await this.attemptSpawn(attempt);
  }

  /**
   * Attempt to spawn a worker container
   */
  private async attemptSpawn(attempt: SpawnAttempt): Promise<void> {
    attempt.attempts++;
    attempt.lastAttemptAt = new Date();

    const { request } = attempt;

    try {
      // Build spawn input
      const spawnInput: SpawnTaskInput = {
        trackingId: request.trackingId,
        workerId: request.workerId,
        skill: request.skill,
        parameters: request.parameters,
        hqApiUrl: this.config.hqApiUrl,
        hqApiKey: this.config.hqApiKey,
        metadata: request.metadata,
      };

      // Resolve resource tier for this spawn request
      const resolvedTier = resolveResourceTier(spawnInput);
      const tierOverrides = mergeTierOverrides(resolvedTier);

      // Build run task configuration with tier-based resource overrides
      const runConfig: RunTaskConfig = {
        cluster: this.config.cluster,
        taskDefinition: this.config.taskDefinition,
        network: this.config.network,
        enableExecuteCommand: this.config.enableExecuteCommand,
        tags: {
          'hq:spawn-attempt': String(attempt.attempts),
          'hq:resource-tier': resolvedTier,
        },
        overrides: tierOverrides,
      };

      // Log the task description for debugging
      const description = describeTask(spawnInput, runConfig);
      const tierDesc = describeTier(resolvedTier);
      this.config.logger.info(`[Spawner] Attempting spawn [tier: ${tierDesc}]:\n${description}`);

      // Build and execute RunTask
      const params = buildRunTaskParams(spawnInput, runConfig);
      const result = await this.ecsClient.runTask(params);

      // Check for failures
      if (result.failures.length > 0) {
        const failureReasons = result.failures
          .map((f) => f.reason ?? 'Unknown failure')
          .join('; ');
        throw new Error(`ECS RunTask failed: ${failureReasons}`);
      }

      // Check for successful task
      if (result.taskArns.length === 0) {
        throw new Error('ECS RunTask returned no tasks');
      }

      const taskArn = result.taskArns[0]!;

      // Generate a unique worker ID for the registry
      const registeredWorkerId = this.generateRegisteredWorkerId(request);

      // Notify registry callback
      if (this.registryCallback) {
        await this.registryCallback(registeredWorkerId, taskArn, request.trackingId);
      }

      // Spawn succeeded - clean up and notify
      this.pendingSpawns.delete(request.trackingId);

      const spawnResult: SpawnResult = {
        trackingId: request.trackingId,
        success: true,
        taskArn,
        attempts: attempt.attempts,
        registeredWorkerId,
      };

      this.config.logger.info(
        `[Spawner] Successfully spawned ${request.workerId} as ${registeredWorkerId} ` +
        `(task: ${taskArn}, attempts: ${attempt.attempts})`
      );

      if (this.resultCallback) {
        await this.resultCallback(spawnResult);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      attempt.lastError = errorMessage;

      this.config.logger.error(
        `[Spawner] Spawn attempt ${attempt.attempts}/${this.config.maxRetries} failed for ` +
        `${request.trackingId}: ${errorMessage}`
      );

      // Check if we should retry
      if (attempt.attempts < this.config.maxRetries) {
        // Keep in pending spawns for retry
        this.config.logger.info(
          `[Spawner] Will retry ${request.trackingId} after backoff delay`
        );
      } else {
        // Max retries exceeded - mark as failed
        this.pendingSpawns.delete(request.trackingId);

        const spawnResult: SpawnResult = {
          trackingId: request.trackingId,
          success: false,
          error: `Failed after ${attempt.attempts} attempts: ${errorMessage}`,
          attempts: attempt.attempts,
        };

        this.config.logger.error(
          `[Spawner] Spawn permanently failed for ${request.trackingId} after ` +
          `${attempt.attempts} attempts`
        );

        if (this.resultCallback) {
          await this.resultCallback(spawnResult);
        }
      }
    }
  }

  /**
   * Process pending retries based on exponential backoff
   */
  private async processRetries(): Promise<void> {
    const now = Date.now();

    for (const attempt of this.pendingSpawns.values()) {
      // Skip if not yet time to retry
      if (attempt.lastAttemptAt) {
        const backoffDelay = this.calculateBackoffDelay(attempt.attempts);
        const nextRetryAt = attempt.lastAttemptAt.getTime() + backoffDelay;

        if (now < nextRetryAt) {
          continue;
        }
      }

      // Attempt spawn
      await this.attemptSpawn(attempt);
    }
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attemptNumber: number): number {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    const exponentialDelay = this.config.retryBaseDelayMs * Math.pow(2, attemptNumber - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.retryMaxDelayMs);

    // Add jitter (0-25% of delay)
    const jitter = Math.random() * 0.25 * cappedDelay;

    return cappedDelay + jitter;
  }

  /**
   * Generate a unique worker ID for the registry
   * Format: {workerId}-{trackingId-suffix}
   */
  private generateRegisteredWorkerId(request: SpawnRequest): string {
    // Extract the random part of the tracking ID
    const trackingSuffix = request.trackingId.split('-').slice(-1)[0] ?? 'unknown';
    return `${request.workerId}-${trackingSuffix}`;
  }

  /**
   * Get the current status of a spawn request
   */
  getSpawnStatus(trackingId: string): SpawnAttempt | undefined {
    return this.pendingSpawns.get(trackingId);
  }

  /**
   * Get count of pending spawns
   */
  get pendingCount(): number {
    return this.pendingSpawns.size;
  }

  /**
   * Check if the service is running
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Get a task's current status from ECS
   */
  async getTaskStatus(taskArn: string): Promise<TaskDescription | undefined> {
    const tasks = await this.ecsClient.describeTasks(this.config.cluster, [taskArn]);
    return tasks[0];
  }

  /**
   * Stop a running task
   */
  async stopTask(taskArn: string, reason: string = 'Stopped by spawner service'): Promise<void> {
    await this.ecsClient.stopTask(this.config.cluster, taskArn, reason);
  }
}

/**
 * Create an ECS client using the AWS SDK
 * This is a factory function that should be called with the actual AWS SDK
 */
export function createEcsClient(ecsService: {
  runTask: (params: unknown) => Promise<{ tasks?: Array<{ taskArn?: string }>; failures?: Array<{ arn?: string; reason?: string; detail?: string }> }>;
  describeTasks: (params: { cluster: string; tasks: string[] }) => Promise<{ tasks?: Array<{
    taskArn?: string;
    lastStatus?: string;
    desiredStatus?: string;
    startedAt?: Date;
    stoppedAt?: Date;
    stoppedReason?: string;
    containers?: Array<{
      name?: string;
      lastStatus?: string;
      exitCode?: number;
      reason?: string;
    }>;
  }> }>;
  stopTask: (params: { cluster: string; task: string; reason: string }) => Promise<unknown>;
}): EcsClient {
  return {
    async runTask(params: EcsRunTaskParams): Promise<RunTaskResult> {
      const result = await ecsService.runTask(params);
      return {
        taskArns: (result.tasks ?? []).map((t) => t.taskArn ?? '').filter(Boolean),
        failures: result.failures ?? [],
      };
    },

    async describeTasks(cluster: string, taskArns: string[]): Promise<TaskDescription[]> {
      const result = await ecsService.describeTasks({ cluster, tasks: taskArns });
      return (result.tasks ?? []).map((t) => ({
        taskArn: t.taskArn ?? '',
        lastStatus: t.lastStatus ?? 'UNKNOWN',
        desiredStatus: t.desiredStatus ?? 'UNKNOWN',
        startedAt: t.startedAt,
        stoppedAt: t.stoppedAt,
        stoppedReason: t.stoppedReason,
        containers: (t.containers ?? []).map((c) => ({
          name: c.name ?? '',
          lastStatus: c.lastStatus ?? 'UNKNOWN',
          exitCode: c.exitCode,
          reason: c.reason,
        })),
      }));
    },

    async stopTask(cluster: string, taskArn: string, reason: string): Promise<void> {
      await ecsService.stopTask({ cluster, task: taskArn, reason });
    },
  };
}

/**
 * Create a mock ECS client for testing
 */
export function createMockEcsClient(options: {
  runTaskResult?: Partial<RunTaskResult>;
  runTaskError?: Error;
  describeTasks?: TaskDescription[];
}): EcsClient {
  return {
    runTask(): Promise<RunTaskResult> {
      if (options.runTaskError) {
        return Promise.reject(options.runTaskError);
      }
      return Promise.resolve({
        taskArns: options.runTaskResult?.taskArns ?? ['arn:aws:ecs:us-east-1:123456789:task/hq-workers/abc123'],
        failures: options.runTaskResult?.failures ?? [],
      });
    },

    describeTasks(): Promise<TaskDescription[]> {
      return Promise.resolve(options.describeTasks ?? []);
    },

    stopTask(): Promise<void> {
      // No-op for mock
      return Promise.resolve();
    },
  };
}
