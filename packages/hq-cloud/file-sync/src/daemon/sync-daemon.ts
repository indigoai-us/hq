/**
 * SyncDaemon - background agent that watches an HQ directory and syncs changes.
 *
 * Lifecycle: idle -> starting -> running <-> paused -> stopping -> stopped
 *
 * The daemon:
 * 1. Watches the HQ directory via FileWatcher
 * 2. Queues change events in an EventQueue
 * 3. On a configurable interval (or when the batch limit is reached),
 *    drains the queue and invokes the sync handler
 * 4. Emits typed events for monitoring/UI integration
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DaemonState,
  FileEvent,
  SyncDaemonConfig,
  SyncDaemonStats,
  SyncDaemonEvents,
  FileSyncResult,
} from './types.js';
import { FileWatcher } from './file-watcher.js';
import { EventQueue } from './event-queue.js';
import { validateDaemonConfig } from './config.js';

/**
 * Callback the daemon invokes to actually sync a batch of file events.
 * The consumer provides this to integrate with S3 or any other backend.
 */
export type SyncHandler = (events: FileEvent[]) => Promise<FileSyncResult[]>;

/**
 * Typed event emitter interface for the daemon.
 */
export interface TypedSyncDaemonEmitter {
  on<K extends keyof SyncDaemonEvents>(event: K, listener: SyncDaemonEvents[K]): this;
  off<K extends keyof SyncDaemonEvents>(event: K, listener: SyncDaemonEvents[K]): this;
  emit<K extends keyof SyncDaemonEvents>(
    event: K,
    ...args: Parameters<SyncDaemonEvents[K]>
  ): boolean;
}

export class SyncDaemon extends EventEmitter implements TypedSyncDaemonEmitter {
  private _state: DaemonState = 'idle';
  private readonly config: SyncDaemonConfig;
  private readonly syncHandler: SyncHandler;
  private readonly queue: EventQueue;
  private watcher: FileWatcher | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  // Stats
  private _startedAt: number | null = null;
  private _syncCyclesCompleted = 0;
  private _filesSynced = 0;
  private _syncErrors = 0;
  private _lastSyncAt: number | null = null;
  private _lastSyncDurationMs: number | null = null;
  private _isSyncing = false;

  constructor(config: SyncDaemonConfig, syncHandler: SyncHandler) {
    super();
    this.config = config;
    this.syncHandler = syncHandler;
    this.queue = new EventQueue();
  }

  /** Current daemon state */
  get state(): DaemonState {
    return this._state;
  }

  /** Whether a sync operation is currently in progress */
  get isSyncing(): boolean {
    return this._isSyncing;
  }

  /** Number of events waiting in the queue */
  get pendingEvents(): number {
    return this.queue.size;
  }

  /**
   * Start the daemon.
   *
   * Validates configuration, acquires PID lock, starts file watcher,
   * and begins the sync interval timer.
   */
  async start(): Promise<void> {
    if (this._state !== 'idle' && this._state !== 'stopped') {
      throw new Error(`Cannot start daemon from state: ${this._state}`);
    }

    this.setState('starting');

    // Validate config
    const errors = validateDaemonConfig(this.config);
    if (errors.length > 0) {
      this.setState('stopped');
      throw new Error(`Invalid daemon config: ${errors.join('; ')}`);
    }

    // Verify HQ directory exists
    if (!fs.existsSync(this.config.hqDir)) {
      this.setState('stopped');
      throw new Error(`HQ directory does not exist: ${this.config.hqDir}`);
    }

    // Acquire PID lock
    if (this.config.usePidFile) {
      this.acquirePidLock();
    }

    try {
      // Start file watcher
      this.watcher = new FileWatcher(this.config, {
        onEvent: (event: FileEvent): void => { this.handleFileEvent(event); },
        onError: (error: Error): void => { this.emit('error', error); },
        onReady: (): void => {
          // Watcher is ready, no additional action needed
        },
      });

      await this.watcher.start();

      // Start sync timer
      this.syncTimer = setInterval((): void => {
        void this.runSyncCycle();
      }, this.config.syncIntervalMs);

      this._startedAt = Date.now();
      this.setState('running');
    } catch (err) {
      this.releasePidLock();
      this.setState('stopped');
      throw err;
    }
  }

  /**
   * Stop the daemon gracefully.
   *
   * Stops the file watcher, runs a final sync, clears timers,
   * and releases the PID lock.
   */
  async stop(): Promise<void> {
    if (this._state === 'stopped' || this._state === 'idle') {
      return;
    }

    this.setState('stopping');

    // Stop the sync timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Stop the file watcher
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    // Run final sync for any pending events
    if (this.queue.size > 0) {
      await this.runSyncCycle();
    }

    // Release PID lock
    this.releasePidLock();

    this.setState('stopped');
    this.emit('stopped');
  }

  /**
   * Pause the daemon: stops the file watcher and sync timer,
   * but keeps pending events in the queue.
   */
  async pause(): Promise<void> {
    if (this._state !== 'running') {
      throw new Error(`Cannot pause daemon from state: ${this._state}`);
    }

    // Stop sync timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Stop file watcher
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    this.setState('paused');
  }

  /**
   * Resume the daemon from paused state.
   */
  async resume(): Promise<void> {
    if (this._state !== 'paused') {
      throw new Error(`Cannot resume daemon from state: ${this._state}`);
    }

    // Restart file watcher
    this.watcher = new FileWatcher(this.config, {
      onEvent: (event: FileEvent): void => { this.handleFileEvent(event); },
      onError: (error: Error): void => { this.emit('error', error); },
      onReady: (): void => {
        // Watcher ready after resume
      },
    });

    await this.watcher.start();

    // Restart sync timer
    this.syncTimer = setInterval((): void => {
      void this.runSyncCycle();
    }, this.config.syncIntervalMs);

    this.setState('running');
  }

  /**
   * Manually trigger a sync cycle (useful for testing or on-demand sync).
   */
  async triggerSync(): Promise<FileSyncResult[]> {
    return this.runSyncCycle();
  }

  /**
   * Get current daemon statistics.
   */
  getStats(): SyncDaemonStats {
    return {
      state: this._state,
      startedAt: this._startedAt,
      syncCyclesCompleted: this._syncCyclesCompleted,
      filesSynced: this._filesSynced,
      syncErrors: this._syncErrors,
      pendingEvents: this.queue.size,
      lastSyncAt: this._lastSyncAt,
      lastSyncDurationMs: this._lastSyncDurationMs,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private setState(newState: DaemonState): void {
    const oldState = this._state;
    this._state = newState;
    this.emit('stateChange', newState, oldState);
  }

  private handleFileEvent(event: FileEvent): void {
    this.queue.push(event);
    this.emit('fileEvent', event);

    // If batch limit reached, trigger immediate sync
    if (this.queue.size >= this.config.batchSize && !this._isSyncing) {
      void this.runSyncCycle();
    }
  }

  private async runSyncCycle(): Promise<FileSyncResult[]> {
    if (this._isSyncing || this.queue.size === 0) {
      return [];
    }

    this._isSyncing = true;
    const events = this.queue.drain();
    const startTime = Date.now();

    this.emit('syncStart', events.length);

    try {
      const results = await this.syncHandler(events);

      const successes = results.filter((r) => r.success).length;
      const failures = results.filter((r) => !r.success).length;
      const durationMs = Date.now() - startTime;

      this._syncCyclesCompleted++;
      this._filesSynced += successes;
      this._syncErrors += failures;
      this._lastSyncAt = Date.now();
      this._lastSyncDurationMs = durationMs;

      this.emit('syncComplete', successes, failures, durationMs);

      return results;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this._syncErrors += events.length;
      this.emit('error', error);
      return events.map((e) => ({
        relativePath: e.relativePath,
        success: false,
        error: error.message,
        eventType: e.type,
      }));
    } finally {
      this._isSyncing = false;
    }
  }

  private acquirePidLock(): void {
    const pidPath = this.config.pidFilePath;
    const pidDir = path.dirname(pidPath);

    // Ensure directory exists
    if (!fs.existsSync(pidDir)) {
      fs.mkdirSync(pidDir, { recursive: true });
    }

    // Check for existing PID
    if (fs.existsSync(pidPath)) {
      const existingPid = fs.readFileSync(pidPath, 'utf-8').trim();
      if (existingPid && this.isProcessRunning(parseInt(existingPid, 10))) {
        throw new Error(
          `Another sync daemon is already running (PID: ${existingPid}). ` +
            `Remove ${pidPath} if this is stale.`
        );
      }
      // Stale PID file, remove it
      fs.unlinkSync(pidPath);
    }

    // Write our PID
    fs.writeFileSync(pidPath, String(process.pid), 'utf-8');
  }

  private releasePidLock(): void {
    if (this.config.usePidFile && fs.existsSync(this.config.pidFilePath)) {
      try {
        const content = fs.readFileSync(this.config.pidFilePath, 'utf-8').trim();
        // Only remove if it's our PID
        if (content === String(process.pid)) {
          fs.unlinkSync(this.config.pidFilePath);
        }
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if the process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
