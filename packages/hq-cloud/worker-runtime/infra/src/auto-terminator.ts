/**
 * Worker Auto-Termination Service
 *
 * Monitors worker heartbeats and terminates idle containers to reduce
 * resource waste. Tracks activity per worker, applies configurable idle
 * timeouts, captures final status before termination, and logs cost
 * savings metrics.
 *
 * Features:
 * 1. Configurable idle timeout (default 15 min)
 * 2. Heartbeat tracking in the orchestrator
 * 3. Workers without activity are terminated
 * 4. Final status captured before termination
 * 5. Cost savings metrics logged
 *
 * @module auto-terminator
 */

import { estimateTaskCostPerHour } from './run-task.js';
import type { EcsClient } from './spawner-service.js';
import type { FargateCpuSize, FargateMemorySize } from '../../types/infra/index.js';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/**
 * Logger interface for the auto-terminator service
 */
export interface AutoTerminatorLogger {
  info(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/**
 * Default console logger
 */
const DEFAULT_LOGGER: AutoTerminatorLogger = {
  // eslint-disable-next-line no-console
  info: (msg: string) => console.log(`[AutoTerminator] ${msg}`),
  error: (msg: string) => console.error(`[AutoTerminator] ${msg}`),
  // eslint-disable-next-line no-console
  debug: (msg: string) => console.log(`[AutoTerminator:debug] ${msg}`),
};

/**
 * Worker activity record tracked by the auto-terminator
 */
export interface WorkerActivity {
  /** Worker ID in the registry */
  workerId: string;
  /** ECS task ARN for the running container */
  taskArn: string;
  /** Timestamp of the last recorded heartbeat (epoch ms) */
  lastHeartbeatAt: number;
  /** Timestamp the worker was first registered (epoch ms) */
  registeredAt: number;
  /** Current worker status */
  status: 'active' | 'idle' | 'terminating' | 'terminated';
  /** CPU size of the worker's task */
  cpu: FargateCpuSize;
  /** Memory size of the worker's task */
  memory: FargateMemorySize;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Event types emitted by the auto-terminator
 */
export type AutoTerminatorEventType =
  | 'worker_registered'
  | 'heartbeat_received'
  | 'worker_idle'
  | 'termination_initiated'
  | 'termination_complete'
  | 'termination_failed'
  | 'worker_deregistered'
  | 'cost_savings_logged';

/**
 * Event payload emitted by the auto-terminator
 */
export interface AutoTerminatorEvent {
  type: AutoTerminatorEventType;
  timestamp: string;
  workerId: string;
  payload: Record<string, unknown>;
}

/**
 * Cost savings entry for a single terminated worker
 */
export interface CostSavingsEntry {
  /** Worker ID */
  workerId: string;
  /** Task ARN */
  taskArn: string;
  /** Duration the worker ran before termination (ms) */
  runDurationMs: number;
  /** How long the worker was idle before termination (ms) */
  idleDurationMs: number;
  /** Estimated cost saved by terminating (USD) */
  estimatedSavingsUsd: number;
  /** CPU size */
  cpu: FargateCpuSize;
  /** Memory size */
  memory: FargateMemorySize;
  /** Timestamp of termination */
  terminatedAt: string;
}

/**
 * Callback for final status capture before termination
 */
export type FinalStatusCallback = (
  workerId: string,
  taskArn: string,
  reason: string
) => void | Promise<void>;

/**
 * Callback for cost savings metric logging
 */
export type CostSavingsCallback = (entry: CostSavingsEntry) => void | Promise<void>;

/**
 * Callback for termination events
 */
export type TerminationEventCallback = (event: AutoTerminatorEvent) => void | Promise<void>;

/**
 * Configuration for the AutoTerminator service
 */
export interface AutoTerminatorConfig {
  /** ECS cluster name or ARN */
  cluster: string;
  /** Idle timeout in milliseconds before a worker is terminated (default: 900000 = 15 min) */
  idleTimeoutMs?: number;
  /** How often to scan for idle workers (ms, default: 60000 = 1 min) */
  scanIntervalMs?: number;
  /** Default CPU size for cost estimation (default: 512) */
  defaultCpu?: FargateCpuSize;
  /** Default memory size for cost estimation (default: 1024) */
  defaultMemory?: FargateMemorySize;
  /** Logger instance */
  logger?: AutoTerminatorLogger;
}

/** Default idle timeout: 15 minutes */
export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Default scan interval: 1 minute */
export const DEFAULT_SCAN_INTERVAL_MS = 60 * 1000;

// ────────────────────────────────────────────────────────────────
// AutoTerminator Service
// ────────────────────────────────────────────────────────────────

/**
 * AutoTerminator Service
 *
 * Manages automatic termination of idle worker containers:
 * 1. Tracks worker heartbeats to determine activity
 * 2. Periodically scans for workers that exceed the idle timeout
 * 3. Initiates graceful termination via ECS StopTask
 * 4. Captures final status before termination
 * 5. Logs cost savings metrics for terminated workers
 */
export class AutoTerminator {
  private readonly config: Required<AutoTerminatorConfig>;
  private readonly ecsClient: EcsClient;
  private readonly logger: AutoTerminatorLogger;
  private readonly workers: Map<string, WorkerActivity> = new Map();
  private running = false;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private finalStatusCallback: FinalStatusCallback | null = null;
  private costSavingsCallback: CostSavingsCallback | null = null;
  private eventCallback: TerminationEventCallback | null = null;

  constructor(config: AutoTerminatorConfig, ecsClient: EcsClient) {
    this.config = {
      ...config,
      idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      scanIntervalMs: config.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS,
      defaultCpu: config.defaultCpu ?? 512,
      defaultMemory: config.defaultMemory ?? 1024,
      logger: config.logger ?? DEFAULT_LOGGER,
    };
    this.ecsClient = ecsClient;
    this.logger = this.config.logger;
  }

  /**
   * Start the auto-terminator service.
   * Begins periodic scanning for idle workers.
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    this.scanTimer = setInterval(() => {
      void this.scanForIdleWorkers();
    }, this.config.scanIntervalMs);

    this.logger.info(
      `Auto-terminator started (idle timeout: ${String(this.config.idleTimeoutMs)}ms, ` +
      `scan interval: ${String(this.config.scanIntervalMs)}ms)`
    );
  }

  /**
   * Stop the auto-terminator service.
   * Clears the scan timer but does not terminate any workers.
   */
  stop(): void {
    this.running = false;

    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    this.logger.info('Auto-terminator stopped');
  }

  /**
   * Register a callback for final status capture before termination.
   */
  onFinalStatus(callback: FinalStatusCallback): void {
    this.finalStatusCallback = callback;
  }

  /**
   * Register a callback for cost savings metric logging.
   */
  onCostSavings(callback: CostSavingsCallback): void {
    this.costSavingsCallback = callback;
  }

  /**
   * Register a callback for termination events.
   */
  onEvent(callback: TerminationEventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * Register a worker for heartbeat tracking.
   * Called when a worker container starts and registers with the API.
   */
  registerWorker(
    workerId: string,
    taskArn: string,
    options?: {
      cpu?: FargateCpuSize;
      memory?: FargateMemorySize;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const now = Date.now();

    const activity: WorkerActivity = {
      workerId,
      taskArn,
      lastHeartbeatAt: now,
      registeredAt: now,
      status: 'active',
      cpu: options?.cpu ?? this.config.defaultCpu,
      memory: options?.memory ?? this.config.defaultMemory,
      metadata: options?.metadata,
    };

    this.workers.set(workerId, activity);

    this.emitEvent('worker_registered', workerId, {
      taskArn,
      cpu: activity.cpu,
      memory: activity.memory,
    });

    this.logger.info(
      `Worker registered: ${workerId} (task: ${taskArn})`
    );
  }

  /**
   * Record a heartbeat for a worker, resetting its idle timer.
   * Returns false if the worker is not registered.
   */
  recordHeartbeat(workerId: string): boolean {
    const activity = this.workers.get(workerId);
    if (!activity) {
      this.logger.debug(`Heartbeat for unknown worker: ${workerId}`);
      return false;
    }

    if (activity.status === 'terminating' || activity.status === 'terminated') {
      this.logger.debug(
        `Heartbeat ignored for ${activity.status} worker: ${workerId}`
      );
      return false;
    }

    activity.lastHeartbeatAt = Date.now();
    activity.status = 'active';

    this.emitEvent('heartbeat_received', workerId, {
      lastHeartbeatAt: activity.lastHeartbeatAt,
    });

    this.logger.debug(`Heartbeat recorded for worker: ${workerId}`);
    return true;
  }

  /**
   * Deregister a worker from heartbeat tracking.
   * Called when a worker completes or is manually stopped.
   */
  deregisterWorker(workerId: string): boolean {
    const activity = this.workers.get(workerId);
    if (!activity) {
      return false;
    }

    this.workers.delete(workerId);

    this.emitEvent('worker_deregistered', workerId, {
      taskArn: activity.taskArn,
      runDurationMs: Date.now() - activity.registeredAt,
    });

    this.logger.info(`Worker deregistered: ${workerId}`);
    return true;
  }

  /**
   * Scan for idle workers and initiate termination for those
   * that exceed the idle timeout.
   */
  async scanForIdleWorkers(): Promise<string[]> {
    const now = Date.now();
    const terminatedWorkerIds: string[] = [];

    for (const [workerId, activity] of this.workers) {
      // Skip workers already being terminated or terminated
      if (activity.status === 'terminating' || activity.status === 'terminated') {
        continue;
      }

      const idleDurationMs = now - activity.lastHeartbeatAt;

      if (idleDurationMs >= this.config.idleTimeoutMs) {
        // Mark as idle first
        activity.status = 'idle';
        this.emitEvent('worker_idle', workerId, {
          idleDurationMs,
          threshold: this.config.idleTimeoutMs,
        });

        this.logger.info(
          `Worker ${workerId} idle for ${String(idleDurationMs)}ms ` +
          `(threshold: ${String(this.config.idleTimeoutMs)}ms). Initiating termination.`
        );

        // Attempt termination
        const success = await this.terminateWorker(workerId, activity);
        if (success) {
          terminatedWorkerIds.push(workerId);
        }
      }
    }

    if (terminatedWorkerIds.length > 0) {
      this.logger.info(
        `Scan complete: terminated ${String(terminatedWorkerIds.length)} idle worker(s)`
      );
    }

    return terminatedWorkerIds;
  }

  /**
   * Get the activity record for a specific worker.
   */
  getWorkerActivity(workerId: string): WorkerActivity | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Get all tracked worker activity records.
   */
  getAllWorkerActivity(): WorkerActivity[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get count of tracked workers.
   */
  get trackedWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Get count of active (non-terminated) workers.
   */
  get activeWorkerCount(): number {
    let count = 0;
    for (const activity of this.workers.values()) {
      if (activity.status === 'active' || activity.status === 'idle') {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if the service is running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  // ────────────────────────────────────────────────────────────────
  // Private Methods
  // ────────────────────────────────────────────────────────────────

  /**
   * Terminate a specific worker by stopping its ECS task.
   */
  private async terminateWorker(
    workerId: string,
    activity: WorkerActivity
  ): Promise<boolean> {
    activity.status = 'terminating';

    this.emitEvent('termination_initiated', workerId, {
      taskArn: activity.taskArn,
      idleDurationMs: Date.now() - activity.lastHeartbeatAt,
    });

    try {
      // Step 1: Capture final status
      if (this.finalStatusCallback) {
        await this.finalStatusCallback(
          workerId,
          activity.taskArn,
          'auto-termination: idle timeout exceeded'
        );
      }

      // Step 2: Stop the ECS task
      await this.ecsClient.stopTask(
        this.config.cluster,
        activity.taskArn,
        'Auto-terminated: idle timeout exceeded'
      );

      // Step 3: Mark as terminated
      const now = Date.now();
      activity.status = 'terminated';

      // Step 4: Calculate and log cost savings
      const runDurationMs = now - activity.registeredAt;
      const idleDurationMs = now - activity.lastHeartbeatAt;
      const costPerHour = estimateTaskCostPerHour(activity.cpu, activity.memory);
      // Estimate savings: assume the task would have run for at least another
      // idle timeout period if not terminated
      const estimatedSavingsUsd =
        (this.config.idleTimeoutMs / (1000 * 60 * 60)) * costPerHour;

      const savingsEntry: CostSavingsEntry = {
        workerId,
        taskArn: activity.taskArn,
        runDurationMs,
        idleDurationMs,
        estimatedSavingsUsd,
        cpu: activity.cpu,
        memory: activity.memory,
        terminatedAt: new Date(now).toISOString(),
      };

      if (this.costSavingsCallback) {
        await this.costSavingsCallback(savingsEntry);
      }

      this.emitEvent('cost_savings_logged', workerId, {
        ...savingsEntry,
      });

      this.emitEvent('termination_complete', workerId, {
        taskArn: activity.taskArn,
        runDurationMs,
        idleDurationMs,
        estimatedSavingsUsd,
      });

      this.logger.info(
        `Worker ${workerId} terminated. Run: ${String(runDurationMs)}ms, ` +
        `Idle: ${String(idleDurationMs)}ms, ` +
        `Estimated savings: $${savingsEntry.estimatedSavingsUsd.toFixed(4)}`
      );

      // Remove from tracking after successful termination
      this.workers.delete(workerId);

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Revert status so it can be retried on next scan
      activity.status = 'idle';

      this.emitEvent('termination_failed', workerId, {
        taskArn: activity.taskArn,
        error: errorMessage,
      });

      this.logger.error(
        `Failed to terminate worker ${workerId}: ${errorMessage}`
      );

      return false;
    }
  }

  /**
   * Emit a termination event
   */
  private emitEvent(
    type: AutoTerminatorEventType,
    workerId: string,
    payload: Record<string, unknown>
  ): void {
    if (!this.eventCallback) {
      return;
    }

    const event: AutoTerminatorEvent = {
      type,
      timestamp: new Date().toISOString(),
      workerId,
      payload,
    };

    void Promise.resolve(this.eventCallback(event)).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Event callback error: ${msg}`);
    });
  }
}

// ────────────────────────────────────────────────────────────────
// Factory: Create from environment
// ────────────────────────────────────────────────────────────────

/**
 * Create an AutoTerminator instance from environment variables.
 *
 * Required env vars:
 * - ECS_CLUSTER: ECS cluster name or ARN
 *
 * Optional env vars:
 * - IDLE_TIMEOUT_MS: Idle timeout in milliseconds (default: 900000)
 * - IDLE_SCAN_INTERVAL_MS: Scan interval in milliseconds (default: 60000)
 */
export function createAutoTerminatorFromEnv(
  ecsClient: EcsClient,
  options?: {
    logger?: AutoTerminatorLogger;
    finalStatusCallback?: FinalStatusCallback;
    costSavingsCallback?: CostSavingsCallback;
  }
): AutoTerminator {
  const cluster = process.env['ECS_CLUSTER'] ?? 'hq-workers';
  const idleTimeoutMs = parseInt(
    process.env['IDLE_TIMEOUT_MS'] ?? String(DEFAULT_IDLE_TIMEOUT_MS),
    10
  );
  const scanIntervalMs = parseInt(
    process.env['IDLE_SCAN_INTERVAL_MS'] ?? String(DEFAULT_SCAN_INTERVAL_MS),
    10
  );

  const terminator = new AutoTerminator(
    {
      cluster,
      idleTimeoutMs,
      scanIntervalMs,
      logger: options?.logger,
    },
    ecsClient
  );

  if (options?.finalStatusCallback) {
    terminator.onFinalStatus(options.finalStatusCallback);
  }

  if (options?.costSavingsCallback) {
    terminator.onCostSavings(options.costSavingsCallback);
  }

  return terminator;
}
