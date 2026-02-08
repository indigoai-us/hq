/**
 * DownloadManager - orchestrates polling S3 for changes and downloading files.
 *
 * Integrates:
 * - ChangeDetector: polls S3 and compares with sync state
 * - FileDownloader: downloads files and applies deletion policies
 * - SyncStateManager: persists what has been downloaded
 *
 * Emits events compatible with the daemon event system for monitoring.
 */

import { EventEmitter } from 'node:events';
import { S3Client } from '@aws-sdk/client-s3';
import type { Logger } from 'pino';
import type {
  DownloadSyncConfig,
  DownloadPollResult,
  DownloadManagerStats,
  DownloadManagerEvents,
} from './types.js';
import { ChangeDetector } from './change-detector.js';
import { FileDownloader } from './file-downloader.js';
import { SyncStateManager } from './sync-state.js';
import { validateDownloadConfig } from './config.js';

/**
 * Typed event emitter interface for the download manager.
 */
export interface TypedDownloadManagerEmitter {
  on<K extends keyof DownloadManagerEvents>(
    event: K,
    listener: DownloadManagerEvents[K]
  ): this;
  off<K extends keyof DownloadManagerEvents>(
    event: K,
    listener: DownloadManagerEvents[K]
  ): this;
  emit<K extends keyof DownloadManagerEvents>(
    event: K,
    ...args: Parameters<DownloadManagerEvents[K]>
  ): boolean;
}

/**
 * Manages the download sync lifecycle.
 *
 * Can operate in two modes:
 * 1. Polling mode: automatically polls S3 at a configurable interval
 * 2. Manual mode: call pollOnce() to trigger a single poll cycle
 */
export class DownloadManager
  extends EventEmitter
  implements TypedDownloadManagerEmitter
{
  private readonly config: DownloadSyncConfig;
  private readonly logger: Logger;
  private readonly client: S3Client;
  private readonly changeDetector: ChangeDetector;
  private readonly fileDownloader: FileDownloader;
  private readonly stateManager: SyncStateManager;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private _isPolling = false;
  private _isPollRunning = false;

  // Stats
  private _pollCyclesCompleted = 0;
  private _totalFilesDownloaded = 0;
  private _totalFilesDeleted = 0;
  private _totalErrors = 0;
  private _lastPollAt: number | null = null;
  private _lastPollDurationMs: number | null = null;

  constructor(config: DownloadSyncConfig, logger: Logger, client?: S3Client) {
    super();

    const errors = validateDownloadConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid download config: ${errors.join('; ')}`);
    }

    this.config = config;
    this.logger = logger.child({ component: 'download-manager' });

    this.client =
      client ??
      new S3Client({
        region: config.region,
      });

    this.changeDetector = new ChangeDetector(this.client, config, logger);
    this.fileDownloader = new FileDownloader(this.client, config, logger);

    // Extract userId from s3Prefix (format: {userId}/hq/)
    const userId = config.s3Prefix.split('/')[0] ?? 'unknown';
    this.stateManager = new SyncStateManager(
      config.stateFilePath,
      userId,
      config.s3Prefix
    );

    // Load existing state from disk
    this.stateManager.load();
  }

  /** Whether polling is active */
  get isPolling(): boolean {
    return this._isPolling;
  }

  /** Whether a poll cycle is currently running */
  get isPollRunning(): boolean {
    return this._isPollRunning;
  }

  /** Number of files tracked in sync state */
  get trackedFiles(): number {
    return this.stateManager.size;
  }

  /**
   * Start automatic polling at the configured interval.
   */
  startPolling(): void {
    if (this._isPolling) {
      return;
    }

    this._isPolling = true;
    this.logger.info(
      { intervalMs: this.config.pollIntervalMs },
      'Starting download poll'
    );

    // Run immediately, then on interval
    void this.pollOnce();

    this.pollTimer = setInterval((): void => {
      void this.pollOnce();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop automatic polling.
   */
  stopPolling(): void {
    if (!this._isPolling) {
      return;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this._isPolling = false;
    this.logger.info('Stopped download poll');
  }

  /**
   * Run a single poll cycle: detect changes, download files, update state.
   *
   * Safe to call concurrently; if a poll is already running, returns a
   * result indicating the skip.
   */
  async pollOnce(): Promise<DownloadPollResult> {
    if (this._isPollRunning) {
      return {
        success: true,
        changesDetected: 0,
        filesDownloaded: 0,
        filesDeleted: 0,
        errors: 0,
        results: [],
        durationMs: 0,
        polledAt: Date.now(),
        error: 'Poll already in progress, skipping',
      };
    }

    this._isPollRunning = true;
    const startTime = Date.now();

    this.emit('pollStart');

    try {
      // Step 1: Detect changes
      const changes = await this.changeDetector.detectChanges(this.stateManager);

      // Emit individual change events
      for (const change of changes) {
        this.emit('changeDetected', change);
      }

      if (changes.length === 0) {
        const result: DownloadPollResult = {
          success: true,
          changesDetected: 0,
          filesDownloaded: 0,
          filesDeleted: 0,
          errors: 0,
          results: [],
          durationMs: Date.now() - startTime,
          polledAt: startTime,
        };

        this.stateManager.recordPoll();
        this.stateManager.save();
        this._pollCyclesCompleted++;
        this._lastPollAt = Date.now();
        this._lastPollDurationMs = result.durationMs;

        this.emit('pollComplete', result);
        return result;
      }

      // Step 2: Process changes (download/delete)
      const downloadResults = await this.fileDownloader.processChanges(
        changes,
        this.stateManager
      );

      // Emit individual file download events
      for (const result of downloadResults) {
        this.emit('fileDownloaded', result);
      }

      // Step 3: Save state
      this.stateManager.recordPoll();
      this.stateManager.save();

      // Compute totals
      const filesDownloaded = downloadResults.filter(
        (r) => r.success && (r.changeType === 'added' || r.changeType === 'modified')
      ).length;
      const filesDeleted = downloadResults.filter(
        (r) => r.success && r.changeType === 'deleted'
      ).length;
      const errors = downloadResults.filter((r) => !r.success).length;

      // Update stats
      this._pollCyclesCompleted++;
      this._totalFilesDownloaded += filesDownloaded;
      this._totalFilesDeleted += filesDeleted;
      this._totalErrors += errors;
      this._lastPollAt = Date.now();
      this._lastPollDurationMs = Date.now() - startTime;

      const pollResult: DownloadPollResult = {
        success: errors === 0,
        changesDetected: changes.length,
        filesDownloaded,
        filesDeleted,
        errors,
        results: downloadResults,
        durationMs: Date.now() - startTime,
        polledAt: startTime,
      };

      this.emit('pollComplete', pollResult);

      this.logger.info(
        {
          changesDetected: changes.length,
          filesDownloaded,
          filesDeleted,
          errors,
          durationMs: pollResult.durationMs,
        },
        'Poll cycle complete'
      );

      return pollResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this._totalErrors++;

      this.logger.error(
        { error: error.message },
        'Poll cycle failed'
      );

      this.emit('error', error);

      return {
        success: false,
        changesDetected: 0,
        filesDownloaded: 0,
        filesDeleted: 0,
        errors: 1,
        results: [],
        durationMs: Date.now() - startTime,
        polledAt: startTime,
        error: error.message,
      };
    } finally {
      this._isPollRunning = false;
    }
  }

  /**
   * Get current download manager statistics.
   */
  getStats(): DownloadManagerStats {
    return {
      isPolling: this._isPolling,
      pollCyclesCompleted: this._pollCyclesCompleted,
      totalFilesDownloaded: this._totalFilesDownloaded,
      totalFilesDeleted: this._totalFilesDeleted,
      totalErrors: this._totalErrors,
      lastPollAt: this._lastPollAt,
      lastPollDurationMs: this._lastPollDurationMs,
      trackedFiles: this.stateManager.size,
    };
  }

  /**
   * Force a full re-sync by clearing the sync state.
   * The next poll will treat all S3 files as new.
   */
  resetState(): void {
    this.stateManager.clear();
    this.stateManager.forceSave();
    this.logger.info('Sync state reset; next poll will re-download all files');
  }
}
