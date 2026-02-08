/**
 * SyncStatusManager - aggregates sync state from daemon, upload, and download modules.
 *
 * Provides a unified view of sync health and recent errors for the API and mobile clients.
 * Does NOT own the daemon/download/upload instances -- it reads their stats and
 * listens to their events via explicit feed methods.
 */

import type {
  SyncStatus,
  SyncError,
  SyncHealth,
  SyncStatusDirection,
  SyncProgress,
  SyncTriggerResult,
  SyncStatusManagerConfig,
} from './types.js';
import { DEFAULT_STATUS_MANAGER_CONFIG } from './types.js';
import type { SyncDaemonStats, DaemonState } from '../daemon/types.js';
import type { DownloadManagerStats } from '../download/types.js';

/**
 * Manages aggregated sync status.
 *
 * Usage:
 *   const manager = new SyncStatusManager();
 *   manager.updateDaemonStats(daemon.getStats());
 *   manager.updateDownloadStats(downloadManager.getStats());
 *   const status = manager.getStatus();
 */
export class SyncStatusManager {
  private readonly config: SyncStatusManagerConfig;
  private readonly errors: SyncError[] = [];

  // Cached stats from subsystems
  private daemonStats: SyncDaemonStats | null = null;
  private downloadStats: DownloadManagerStats | null = null;

  // Additional tracked state
  private _trackedFiles = 0;
  private _isSyncing = false;
  private _currentProgress: SyncProgress | null = null;
  private _triggerInProgress = false;

  constructor(config: Partial<SyncStatusManagerConfig> = {}) {
    this.config = { ...DEFAULT_STATUS_MANAGER_CONFIG, ...config };
  }

  /**
   * Update cached daemon stats.
   * Call this after every daemon event or on a timer.
   */
  updateDaemonStats(stats: SyncDaemonStats): void {
    this.daemonStats = stats;
    this._isSyncing =
      stats.state === 'running' && stats.pendingEvents > 0;
  }

  /**
   * Update cached download stats.
   * Call this after every download manager event or on a timer.
   */
  updateDownloadStats(stats: DownloadManagerStats): void {
    this.downloadStats = stats;
    this._trackedFiles = stats.trackedFiles;
  }

  /**
   * Set whether a sync is currently in progress.
   */
  setSyncing(syncing: boolean): void {
    this._isSyncing = syncing;
  }

  /**
   * Update current sync progress (set to null when done).
   */
  setProgress(progress: SyncProgress | null): void {
    this._currentProgress = progress;
  }

  /**
   * Record a sync error.
   */
  addError(
    direction: SyncStatusDirection,
    message: string,
    opts: {
      filePath?: string;
      code?: string;
      retryable?: boolean;
    } = {}
  ): SyncError {
    const error: SyncError = {
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      direction,
      filePath: opts.filePath ?? null,
      message,
      code: opts.code ?? 'SYNC_ERROR',
      retryable: opts.retryable ?? true,
    };

    this.errors.unshift(error);

    // Trim to max
    while (this.errors.length > this.config.maxRecentErrors) {
      this.errors.pop();
    }

    return error;
  }

  /**
   * Clear all recorded errors.
   */
  clearErrors(): void {
    this.errors.length = 0;
  }

  /**
   * Derive overall health from component stats.
   */
  getHealth(): SyncHealth {
    const daemon = this.daemonStats;

    // If daemon not initialized, we're offline
    if (!daemon) return 'offline';

    // If daemon is stopped or idle, offline
    if (daemon.state === 'stopped' || daemon.state === 'idle') return 'offline';

    // If there are recent errors, degraded
    const recentErrorCount = this.getRecentErrorCount(5 * 60_000); // last 5 minutes
    if (recentErrorCount > 5) return 'error';
    if (recentErrorCount > 0) return 'degraded';

    // If daemon is running with no errors, healthy
    if (daemon.state === 'running') return 'healthy';

    // Paused/starting/stopping are considered degraded
    return 'degraded';
  }

  /**
   * Get the number of errors in the given time window.
   */
  private getRecentErrorCount(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.errors.filter(
      (e) => new Date(e.occurredAt).getTime() > cutoff
    ).length;
  }

  /**
   * Get the comprehensive sync status for API responses.
   */
  getStatus(): SyncStatus {
    const daemon = this.daemonStats;
    const download = this.downloadStats;

    const daemonState: DaemonState = daemon?.state ?? 'idle';
    const lastSyncAt = daemon?.lastSyncAt
      ? new Date(daemon.lastSyncAt).toISOString()
      : null;

    return {
      daemonState,
      health: this.getHealth(),
      isSyncing: this._isSyncing,
      progress: this._currentProgress,
      lastSyncAt,
      lastSyncDurationMs: daemon?.lastSyncDurationMs ?? null,
      pendingChanges: daemon?.pendingEvents ?? 0,
      trackedFiles: this._trackedFiles,
      upload: {
        totalFilesUploaded: daemon?.filesSynced ?? 0,
        syncCyclesCompleted: daemon?.syncCyclesCompleted ?? 0,
        totalErrors: daemon?.syncErrors ?? 0,
      },
      download: {
        isPolling: download?.isPolling ?? false,
        totalFilesDownloaded: download?.totalFilesDownloaded ?? 0,
        totalFilesDeleted: download?.totalFilesDeleted ?? 0,
        totalErrors: download?.totalErrors ?? 0,
        lastPollAt: download?.lastPollAt
          ? new Date(download.lastPollAt).toISOString()
          : null,
      },
      recentErrors: [...this.errors],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Build a trigger result without actually triggering.
   * The actual trigger is done by the route handler which has access to the daemon.
   */
  buildTriggerResult(accepted: boolean, pendingEvents: number, reason: string | null = null): SyncTriggerResult {
    return {
      accepted,
      reason,
      pendingEvents,
      triggeredAt: new Date().toISOString(),
    };
  }

  /**
   * Whether a trigger is currently in progress (prevents double-triggering).
   */
  get triggerInProgress(): boolean {
    return this._triggerInProgress;
  }

  setTriggerInProgress(inProgress: boolean): void {
    this._triggerInProgress = inProgress;
  }

  /**
   * Get recent errors (returns a copy).
   */
  getRecentErrors(): SyncError[] {
    return [...this.errors];
  }
}
