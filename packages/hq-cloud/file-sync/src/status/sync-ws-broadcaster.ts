/**
 * SyncWebSocketBroadcaster - broadcasts real-time sync events over WebSocket.
 *
 * Listens to daemon and download manager events and translates them into
 * typed WebSocket messages (SyncStatusMessage, SyncProgressMessage,
 * SyncErrorMessage, SyncCompleteMessage).
 *
 * The broadcaster is transport-agnostic: it accepts a `send` callback
 * that the consumer implements for their WebSocket library (ws, Socket.IO, etc.).
 */

import type {
  SyncStatusMessage,
  SyncProgressMessage,
  SyncErrorMessage,
  SyncCompleteMessage,
  SyncStatusDirection,
} from './types.js';
import { DEFAULT_STATUS_MANAGER_CONFIG } from './types.js';
import type { SyncStatusManager } from './sync-status-manager.js';

/** A WebSocket message the broadcaster can emit */
export type SyncWsMessage =
  | SyncStatusMessage
  | SyncProgressMessage
  | SyncErrorMessage
  | SyncCompleteMessage;

/**
 * Callback invoked to send a message to connected clients.
 * The consumer decides how to broadcast (to all clients, filtered, etc.).
 */
export type WsSendFn = (message: SyncWsMessage) => void;

/** Configuration for the broadcaster */
export interface SyncWsBroadcasterConfig {
  /** How often to broadcast full status snapshots (ms). Default: 5000. */
  statusBroadcastIntervalMs: number;
}

const DEFAULT_BROADCASTER_CONFIG: SyncWsBroadcasterConfig = {
  statusBroadcastIntervalMs: DEFAULT_STATUS_MANAGER_CONFIG.statusBroadcastIntervalMs,
};

/**
 * Broadcasts sync events to WebSocket clients.
 *
 * Usage:
 *   const broadcaster = new SyncWebSocketBroadcaster(statusManager, send, config);
 *   broadcaster.start();       // Begin periodic status broadcasts
 *   broadcaster.notifyProgress(...);  // Push progress events
 *   broadcaster.notifyError(...);     // Push error events
 *   broadcaster.notifyComplete(...);  // Push completion events
 *   broadcaster.stop();        // Stop periodic broadcasts
 */
export class SyncWebSocketBroadcaster {
  private readonly statusManager: SyncStatusManager;
  private readonly send: WsSendFn;
  private readonly config: SyncWsBroadcasterConfig;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;

  constructor(
    statusManager: SyncStatusManager,
    send: WsSendFn,
    config: Partial<SyncWsBroadcasterConfig> = {}
  ) {
    this.statusManager = statusManager;
    this.send = send;
    this.config = { ...DEFAULT_BROADCASTER_CONFIG, ...config };
  }

  /** Whether the broadcaster is actively sending periodic updates */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Start periodic status broadcasts.
   * Sends an initial status snapshot immediately, then at the configured interval.
   */
  start(): void {
    if (this._isRunning) return;

    this._isRunning = true;

    // Send initial status
    this.broadcastStatus();

    // Set up periodic broadcast
    this.broadcastTimer = setInterval(() => {
      this.broadcastStatus();
    }, this.config.statusBroadcastIntervalMs);
  }

  /**
   * Stop periodic status broadcasts.
   */
  stop(): void {
    if (!this._isRunning) return;

    this._isRunning = false;

    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  /**
   * Broadcast the current full status snapshot.
   * Called periodically and can be called manually.
   */
  broadcastStatus(): void {
    const status = this.statusManager.getStatus();
    const message: SyncStatusMessage = {
      type: 'sync_status',
      payload: status,
    };
    this.send(message);
  }

  /**
   * Notify clients of sync progress.
   * Called during an active sync operation as files are processed.
   */
  notifyProgress(
    direction: SyncStatusDirection,
    filesCompleted: number,
    filesTotal: number,
    bytesTransferred: number,
    bytesTotal: number,
    currentFile: string | null = null,
    estimatedRemainingMs: number | null = null
  ): void {
    // Update the status manager's progress
    this.statusManager.setProgress({
      direction,
      filesCompleted,
      filesTotal,
      bytesTransferred,
      bytesTotal,
      currentFile,
      estimatedRemainingMs,
    });

    const message: SyncProgressMessage = {
      type: 'sync_progress',
      payload: {
        direction,
        filesCompleted,
        filesTotal,
        bytesTransferred,
        bytesTotal,
        currentFile,
        estimatedRemainingMs,
        timestamp: Date.now(),
      },
    };
    this.send(message);
  }

  /**
   * Notify clients of a sync error.
   * Called when a file sync operation fails.
   */
  notifyError(
    direction: SyncStatusDirection,
    errorMessage: string,
    opts: {
      filePath?: string;
      code?: string;
      retryable?: boolean;
    } = {}
  ): void {
    // Record the error in the status manager
    const error = this.statusManager.addError(direction, errorMessage, opts);

    const message: SyncErrorMessage = {
      type: 'sync_error',
      payload: error,
    };
    this.send(message);
  }

  /**
   * Notify clients that a sync cycle has completed.
   * Called at the end of an upload or download cycle.
   */
  notifyComplete(
    direction: SyncStatusDirection,
    filesSynced: number,
    errors: number,
    durationMs: number
  ): void {
    // Clear progress since the cycle is done
    this.statusManager.setProgress(null);

    const message: SyncCompleteMessage = {
      type: 'sync_complete',
      payload: {
        direction,
        filesSynced,
        errors,
        durationMs,
        timestamp: Date.now(),
      },
    };
    this.send(message);
  }
}
