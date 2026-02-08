/**
 * Graceful Shutdown Service
 *
 * Manages orderly container shutdown when SIGTERM/SIGINT is received:
 * 1. Installs signal handlers (SIGTERM, SIGINT)
 * 2. Allows the current operation to complete within a configurable timeout
 * 3. Sends final worker status to the HQ API
 * 4. Writes a checkpoint if checkpoint support is enabled
 * 5. Ensures the container exits cleanly with code 0
 *
 * @module graceful-shutdown
 */

import { EventEmitter } from 'node:events';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/**
 * Shutdown phases in order
 */
export type ShutdownPhase =
  | 'idle'
  | 'signal_received'
  | 'draining'
  | 'checkpointing'
  | 'notifying_api'
  | 'cleanup'
  | 'exited';

/**
 * Event types emitted during shutdown
 */
export type ShutdownEventType =
  | 'shutdown_initiated'
  | 'phase_changed'
  | 'drain_complete'
  | 'drain_timeout'
  | 'checkpoint_written'
  | 'checkpoint_skipped'
  | 'checkpoint_failed'
  | 'api_notified'
  | 'api_notify_failed'
  | 'cleanup_complete'
  | 'shutdown_complete';

/**
 * Shutdown event payload
 */
export interface ShutdownEvent {
  type: ShutdownEventType;
  timestamp: string;
  phase: ShutdownPhase;
  payload: Record<string, unknown>;
}

/**
 * Logger interface for the shutdown service
 */
export interface ShutdownLogger {
  info(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/**
 * Checkpoint data to persist on shutdown
 */
export interface CheckpointData {
  /** Worker ID */
  workerId: string;
  /** Timestamp of the checkpoint */
  timestamp: string;
  /** Current task being executed, if any */
  currentTask?: string;
  /** Partial output collected so far */
  partialOutput?: string;
  /** Events collected during execution */
  eventCount: number;
  /** Reason for checkpoint */
  reason: 'shutdown' | 'timeout' | 'error';
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for writing checkpoints (e.g., to filesystem or S3)
 */
export interface CheckpointWriter {
  /**
   * Write a checkpoint to persistent storage
   * Returns the path or identifier of the checkpoint
   */
  write(data: CheckpointData): Promise<string>;
}

/**
 * Interface for notifying the API of shutdown
 */
export interface ShutdownApiNotifier {
  /**
   * Send final status to the API
   */
  sendFinalStatus(
    workerId: string,
    status: 'completed' | 'terminated' | 'error',
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }>;
}

/**
 * A disposable resource that can be cleaned up during shutdown
 */
export interface Disposable {
  /** Name for logging */
  name: string;
  /** Dispose/cleanup function */
  dispose(): void | Promise<void>;
}

/**
 * Configuration for the GracefulShutdown service
 */
export interface GracefulShutdownConfig {
  /** Worker ID */
  workerId: string;
  /**
   * Maximum time to wait for current operation to drain (ms).
   * After this, the process will be forcefully terminated.
   * Default: 30000 (30 seconds, aligned with ECS SIGTERM grace period)
   */
  drainTimeoutMs?: number;
  /**
   * Maximum time to spend on API notification (ms).
   * Default: 5000
   */
  apiNotifyTimeoutMs?: number;
  /**
   * Maximum time to spend on checkpointing (ms).
   * Default: 5000
   */
  checkpointTimeoutMs?: number;
  /**
   * Whether to enable checkpointing on shutdown.
   * Default: true
   */
  enableCheckpoint?: boolean;
  /**
   * Process exit code on clean shutdown.
   * Default: 0
   */
  exitCode?: number;
  /**
   * Whether to call process.exit() after shutdown.
   * Set to false for testing.
   * Default: true
   */
  callProcessExit?: boolean;
  /** Logger instance */
  logger?: ShutdownLogger;
}

// ────────────────────────────────────────────────────────────────
// Default logger
// ────────────────────────────────────────────────────────────────

const DEFAULT_LOGGER: ShutdownLogger = {
  // eslint-disable-next-line no-console
  info: (msg: string) => console.log(`[GracefulShutdown] ${msg}`),
  error: (msg: string) => console.error(`[GracefulShutdown] ${msg}`),
  // eslint-disable-next-line no-console
  debug: (msg: string) => console.log(`[GracefulShutdown:debug] ${msg}`),
};

// ────────────────────────────────────────────────────────────────
// GracefulShutdown Service
// ────────────────────────────────────────────────────────────────

/**
 * GracefulShutdown Service
 *
 * Orchestrates orderly shutdown of a worker container.
 *
 * Usage:
 * ```ts
 * const shutdown = new GracefulShutdown({ workerId: 'w-123' });
 * shutdown.setApiNotifier(apiNotifier);
 * shutdown.setCheckpointWriter(checkpointWriter);
 * shutdown.registerDisposable({ name: 'websocket', dispose: () => ws.close() });
 *
 * // Register a drain callback that resolves when current work is done
 * shutdown.setDrainCallback(async () => {
 *   await currentTask.finish();
 * });
 *
 * // Install signal handlers - from here, SIGTERM/SIGINT trigger graceful shutdown
 * shutdown.install();
 * ```
 */
export class GracefulShutdown extends EventEmitter {
  private readonly config: Required<GracefulShutdownConfig>;
  private readonly logger: ShutdownLogger;
  private currentPhase: ShutdownPhase = 'idle';
  private shutdownInProgress = false;
  private apiNotifier: ShutdownApiNotifier | null = null;
  private checkpointWriter: CheckpointWriter | null = null;
  private drainCallback: (() => Promise<void>) | null = null;
  private disposables: Disposable[] = [];
  private signalHandlersInstalled = false;
  private boundHandlers: Map<string, () => void> = new Map();
  private shutdownPromise: Promise<void> | null = null;

  constructor(config: GracefulShutdownConfig) {
    super();
    this.config = {
      workerId: config.workerId,
      drainTimeoutMs: config.drainTimeoutMs ?? 30_000,
      apiNotifyTimeoutMs: config.apiNotifyTimeoutMs ?? 5_000,
      checkpointTimeoutMs: config.checkpointTimeoutMs ?? 5_000,
      enableCheckpoint: config.enableCheckpoint ?? true,
      exitCode: config.exitCode ?? 0,
      callProcessExit: config.callProcessExit ?? true,
      logger: config.logger ?? DEFAULT_LOGGER,
    };
    this.logger = this.config.logger;
  }

  /**
   * Set the API notifier for sending final status
   */
  setApiNotifier(notifier: ShutdownApiNotifier): void {
    this.apiNotifier = notifier;
  }

  /**
   * Set the checkpoint writer for persisting state on shutdown
   */
  setCheckpointWriter(writer: CheckpointWriter): void {
    this.checkpointWriter = writer;
  }

  /**
   * Set the drain callback.
   * This is called when shutdown begins to allow the current operation
   * to finish. It should resolve when the operation is complete.
   */
  setDrainCallback(callback: () => Promise<void>): void {
    this.drainCallback = callback;
  }

  /**
   * Register a disposable resource to be cleaned up during shutdown.
   * Resources are disposed in reverse registration order.
   */
  registerDisposable(disposable: Disposable): void {
    this.disposables.push(disposable);
  }

  /**
   * Install signal handlers for SIGTERM and SIGINT.
   * After this call, receiving these signals will trigger graceful shutdown.
   */
  install(): void {
    if (this.signalHandlersInstalled) {
      this.logger.debug('Signal handlers already installed');
      return;
    }

    const sigtermHandler = (): void => {
      this.logger.info('Received SIGTERM');
      void this.initiateShutdown('SIGTERM');
    };

    const sigintHandler = (): void => {
      this.logger.info('Received SIGINT');
      void this.initiateShutdown('SIGINT');
    };

    process.on('SIGTERM', sigtermHandler);
    process.on('SIGINT', sigintHandler);

    this.boundHandlers.set('SIGTERM', sigtermHandler);
    this.boundHandlers.set('SIGINT', sigintHandler);

    this.signalHandlersInstalled = true;
    this.logger.info(`Signal handlers installed for worker ${this.config.workerId}`);
  }

  /**
   * Uninstall signal handlers.
   * Useful for testing or when replacing with different handlers.
   */
  uninstall(): void {
    for (const [signal, handler] of this.boundHandlers) {
      process.removeListener(signal, handler);
    }
    this.boundHandlers.clear();
    this.signalHandlersInstalled = false;
    this.logger.debug('Signal handlers removed');
  }

  /**
   * Initiate the shutdown sequence.
   * Can be called directly (for programmatic shutdown) or via signal handlers.
   * If shutdown is already in progress, this is a no-op (returns the existing promise).
   */
  async initiateShutdown(reason: string = 'manual'): Promise<void> {
    if (this.shutdownInProgress) {
      this.logger.info('Shutdown already in progress, ignoring duplicate signal');
      if (this.shutdownPromise) {
        return this.shutdownPromise;
      }
      return;
    }

    this.shutdownInProgress = true;
    this.shutdownPromise = this.executeShutdownSequence(reason);
    return this.shutdownPromise;
  }

  /**
   * Execute the full shutdown sequence in order.
   */
  private async executeShutdownSequence(reason: string): Promise<void> {
    const startTime = Date.now();

    // Phase 1: Signal received
    this.setPhase('signal_received');
    this.emitShutdownEvent('shutdown_initiated', { reason });
    this.logger.info(`Shutdown initiated (reason: ${reason})`);

    // Phase 2: Drain current operation
    this.setPhase('draining');
    await this.drainCurrentOperation();

    // Phase 3: Checkpoint
    this.setPhase('checkpointing');
    await this.writeCheckpoint(reason);

    // Phase 4: Notify API
    this.setPhase('notifying_api');
    await this.notifyApi(reason);

    // Phase 5: Cleanup disposables
    this.setPhase('cleanup');
    await this.cleanupDisposables();

    // Uninstall signal handlers
    this.uninstall();

    // Phase 6: Exit
    const durationMs = Date.now() - startTime;
    this.setPhase('exited');
    this.emitShutdownEvent('shutdown_complete', {
      reason,
      durationMs,
      exitCode: this.config.exitCode,
    });

    this.logger.info(
      `Shutdown complete in ${String(durationMs)}ms, exiting with code ${String(this.config.exitCode)}`
    );

    if (this.config.callProcessExit) {
      process.exit(this.config.exitCode);
    }
  }

  /**
   * Drain the current operation, respecting the drain timeout.
   */
  private async drainCurrentOperation(): Promise<void> {
    if (!this.drainCallback) {
      this.logger.debug('No drain callback set, skipping drain phase');
      this.emitShutdownEvent('drain_complete', { skipped: true });
      return;
    }

    this.logger.info(
      `Draining current operation (timeout: ${String(this.config.drainTimeoutMs)}ms)...`
    );

    try {
      await withTimeout(
        this.drainCallback(),
        this.config.drainTimeoutMs,
        `Drain timeout after ${String(this.config.drainTimeoutMs)}ms`
      );

      this.emitShutdownEvent('drain_complete', { timedOut: false });
      this.logger.info('Drain completed successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const timedOut = message.includes('timeout');

      if (timedOut) {
        this.emitShutdownEvent('drain_timeout', {
          timeoutMs: this.config.drainTimeoutMs,
        });
        this.logger.error(`Drain timed out after ${String(this.config.drainTimeoutMs)}ms`);
      } else {
        this.emitShutdownEvent('drain_complete', { error: message });
        this.logger.error(`Drain error: ${message}`);
      }
    }
  }

  /**
   * Write a checkpoint if enabled and a writer is configured.
   */
  private async writeCheckpoint(reason: string): Promise<void> {
    if (!this.config.enableCheckpoint) {
      this.emitShutdownEvent('checkpoint_skipped', { reason: 'disabled' });
      this.logger.debug('Checkpointing disabled, skipping');
      return;
    }

    if (!this.checkpointWriter) {
      this.emitShutdownEvent('checkpoint_skipped', { reason: 'no_writer' });
      this.logger.debug('No checkpoint writer configured, skipping');
      return;
    }

    const checkpointData: CheckpointData = {
      workerId: this.config.workerId,
      timestamp: new Date().toISOString(),
      eventCount: 0,
      reason: reason === 'timeout' ? 'timeout' : 'shutdown',
    };

    this.logger.info('Writing checkpoint...');

    try {
      const checkpointPath = await withTimeout(
        this.checkpointWriter.write(checkpointData),
        this.config.checkpointTimeoutMs,
        `Checkpoint timeout after ${String(this.config.checkpointTimeoutMs)}ms`
      );

      this.emitShutdownEvent('checkpoint_written', {
        path: checkpointPath,
      });
      this.logger.info(`Checkpoint written: ${checkpointPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitShutdownEvent('checkpoint_failed', { error: message });
      this.logger.error(`Checkpoint failed: ${message}`);
      // Non-fatal - continue shutdown
    }
  }

  /**
   * Notify the API of final worker status.
   */
  private async notifyApi(reason: string): Promise<void> {
    if (!this.apiNotifier) {
      this.logger.debug('No API notifier configured, skipping');
      return;
    }

    const status = reason === 'error' ? 'error' as const : 'terminated' as const;

    this.logger.info(`Sending final status to API: ${status}`);

    try {
      const result = await withTimeout(
        this.apiNotifier.sendFinalStatus(this.config.workerId, status, {
          reason,
          shutdownAt: new Date().toISOString(),
        }),
        this.config.apiNotifyTimeoutMs,
        `API notification timeout after ${String(this.config.apiNotifyTimeoutMs)}ms`
      );

      if (result.success) {
        this.emitShutdownEvent('api_notified', { status });
        this.logger.info('API notified successfully');
      } else {
        this.emitShutdownEvent('api_notify_failed', {
          error: result.error ?? 'unknown',
        });
        this.logger.error(`API notification failed: ${result.error ?? 'unknown'}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitShutdownEvent('api_notify_failed', { error: message });
      this.logger.error(`API notification error: ${message}`);
      // Non-fatal - continue shutdown
    }
  }

  /**
   * Clean up all registered disposable resources in reverse order.
   */
  private async cleanupDisposables(): Promise<void> {
    // Dispose in reverse order (LIFO)
    const toDispose = [...this.disposables].reverse();

    for (const disposable of toDispose) {
      try {
        this.logger.debug(`Disposing: ${disposable.name}`);
        await Promise.resolve(disposable.dispose());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error disposing ${disposable.name}: ${message}`);
        // Non-fatal - continue with other disposables
      }
    }

    this.disposables = [];
    this.emitShutdownEvent('cleanup_complete', {
      disposedCount: toDispose.length,
    });
    this.logger.info(`Cleanup complete (${String(toDispose.length)} resources disposed)`);
  }

  /**
   * Transition to a new phase
   */
  private setPhase(phase: ShutdownPhase): void {
    const previousPhase = this.currentPhase;
    this.currentPhase = phase;
    this.emitShutdownEvent('phase_changed', {
      from: previousPhase,
      to: phase,
    });
  }

  /**
   * Emit a shutdown event
   */
  private emitShutdownEvent(
    type: ShutdownEventType,
    payload: Record<string, unknown>
  ): void {
    const event: ShutdownEvent = {
      type,
      timestamp: new Date().toISOString(),
      phase: this.currentPhase,
      payload,
    };

    this.emit('shutdown_event', event);
  }

  // ────────────────────────────────────────────────────────────────
  // Accessors
  // ────────────────────────────────────────────────────────────────

  /**
   * Get the current shutdown phase
   */
  get phase(): ShutdownPhase {
    return this.currentPhase;
  }

  /**
   * Whether shutdown is currently in progress
   */
  get isShuttingDown(): boolean {
    return this.shutdownInProgress;
  }

  /**
   * Whether signal handlers are installed
   */
  get isInstalled(): boolean {
    return this.signalHandlersInstalled;
  }
}

// ────────────────────────────────────────────────────────────────
// Timeout utility
// ────────────────────────────────────────────────────────────────

/**
 * Wrap a promise with a timeout. Rejects with the given message on timeout.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ────────────────────────────────────────────────────────────────
// HTTP API Notifier Factory
// ────────────────────────────────────────────────────────────────

/**
 * Create a ShutdownApiNotifier that communicates with the HQ API over HTTP
 */
export function createHttpShutdownNotifier(config: {
  apiUrl: string;
  apiKey: string;
  logger?: ShutdownLogger;
}): ShutdownApiNotifier {
  const logger = config.logger ?? DEFAULT_LOGGER;

  return {
    async sendFinalStatus(
      workerId: string,
      status: 'completed' | 'terminated' | 'error',
      metadata?: Record<string, unknown>
    ): Promise<{ success: boolean; error?: string }> {
      try {
        const response = await fetch(
          `${config.apiUrl}/api/workers/${workerId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              status,
              metadata: {
                ...metadata,
                finalUpdate: true,
              },
            }),
          }
        );

        if (response.ok) {
          return { success: true };
        }

        return {
          success: false,
          error: `HTTP ${String(response.status)}: ${response.statusText}`,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`sendFinalStatus failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Filesystem Checkpoint Writer Factory
// ────────────────────────────────────────────────────────────────

/**
 * Create a CheckpointWriter that writes to the local filesystem.
 *
 * Checkpoints are stored as JSON files in the given directory.
 */
export function createFilesystemCheckpointWriter(config: {
  checkpointDir: string;
  logger?: ShutdownLogger;
}): CheckpointWriter {
  const logger = config.logger ?? DEFAULT_LOGGER;

  return {
    async write(data: CheckpointData): Promise<string> {
      const { writeFile, mkdir } = await import('node:fs/promises');
      const path = await import('node:path');

      // Ensure checkpoint directory exists
      await mkdir(config.checkpointDir, { recursive: true });

      const filename = `checkpoint-${data.workerId}-${Date.now()}.json`;
      const filePath = path.join(config.checkpointDir, filename);

      await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

      logger.info(`Checkpoint written to: ${filePath}`);
      return filePath;
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Convenience Factory
// ────────────────────────────────────────────────────────────────

/**
 * Create a fully wired GracefulShutdown instance from environment variables.
 * Typical usage inside a running worker container.
 */
export function createGracefulShutdownFromEnv(
  options?: {
    drainCallback?: () => Promise<void>;
    disposables?: Disposable[];
    logger?: ShutdownLogger;
    callProcessExit?: boolean;
  }
): GracefulShutdown {
  const workerId = process.env['WORKER_ID'] ?? 'unknown';
  const apiUrl = process.env['HQ_API_URL'] ?? '';
  const apiKey = process.env['HQ_API_KEY'] ?? '';
  const checkpointDir = process.env['CHECKPOINT_DIR'] ?? '/hq/workspace/checkpoints';
  const drainTimeoutMs = parseInt(process.env['SHUTDOWN_DRAIN_TIMEOUT_MS'] ?? '30000', 10);

  const logger = options?.logger ?? DEFAULT_LOGGER;

  const shutdown = new GracefulShutdown({
    workerId,
    drainTimeoutMs,
    callProcessExit: options?.callProcessExit ?? true,
    logger,
  });

  // Set up API notifier if URL is configured
  if (apiUrl && apiKey) {
    shutdown.setApiNotifier(
      createHttpShutdownNotifier({ apiUrl, apiKey, logger })
    );
  }

  // Set up filesystem checkpoint writer
  shutdown.setCheckpointWriter(
    createFilesystemCheckpointWriter({ checkpointDir, logger })
  );

  // Set drain callback if provided
  if (options?.drainCallback) {
    shutdown.setDrainCallback(options.drainCallback);
  }

  // Register provided disposables
  if (options?.disposables) {
    for (const disposable of options.disposables) {
      shutdown.registerDisposable(disposable);
    }
  }

  return shutdown;
}
