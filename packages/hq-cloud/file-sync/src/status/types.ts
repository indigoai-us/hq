/**
 * Types for the sync status module.
 *
 * Provides a unified view of sync state for mobile clients,
 * combining daemon state, upload progress, and download stats.
 */

import type { DaemonState } from '../daemon/types.js';

/** Overall sync health derived from component states */
export type SyncHealth = 'healthy' | 'degraded' | 'error' | 'offline';

/** Direction of a sync status operation (distinct from mount SyncDirection) */
export type SyncStatusDirection = 'upload' | 'download' | 'both';

/** A single sync error record */
export interface SyncError {
  /** Unique error ID */
  id: string;
  /** When the error occurred (ISO string) */
  occurredAt: string;
  /** Direction of the failed operation */
  direction: SyncStatusDirection;
  /** Relative file path (if applicable) */
  filePath: string | null;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
  /** Whether a retry is possible */
  retryable: boolean;
}

/** Progress information for an active sync operation */
export interface SyncProgress {
  /** Direction of the current operation */
  direction: SyncStatusDirection;
  /** Number of files completed */
  filesCompleted: number;
  /** Total files to process */
  filesTotal: number;
  /** Bytes transferred so far */
  bytesTransferred: number;
  /** Total bytes to transfer (0 if unknown) */
  bytesTotal: number;
  /** Current file being processed (if any) */
  currentFile: string | null;
  /** Estimated time remaining in milliseconds (null if unknown) */
  estimatedRemainingMs: number | null;
}

/** Comprehensive sync status response for mobile clients */
export interface SyncStatus {
  /** Current daemon state */
  daemonState: DaemonState;
  /** Overall sync health */
  health: SyncHealth;
  /** Whether a sync operation is currently in progress */
  isSyncing: boolean;
  /** Active sync progress (null if not syncing) */
  progress: SyncProgress | null;
  /** Timestamp of last successful sync (ISO string, null if never synced) */
  lastSyncAt: string | null;
  /** Duration of the last sync in milliseconds (null if never synced) */
  lastSyncDurationMs: number | null;
  /** Number of pending changes waiting to be synced */
  pendingChanges: number;
  /** Number of tracked files in sync state */
  trackedFiles: number;
  /** Upload stats */
  upload: {
    /** Total files uploaded since daemon start */
    totalFilesUploaded: number;
    /** Total sync cycles completed */
    syncCyclesCompleted: number;
    /** Total upload errors since start */
    totalErrors: number;
  };
  /** Download stats */
  download: {
    /** Whether download polling is active */
    isPolling: boolean;
    /** Total files downloaded since start */
    totalFilesDownloaded: number;
    /** Total files deleted locally since start */
    totalFilesDeleted: number;
    /** Total download errors since start */
    totalErrors: number;
    /** Timestamp of last successful poll (ISO string, null if never polled) */
    lastPollAt: string | null;
  };
  /** Recent sync errors (most recent first, capped at maxErrors) */
  recentErrors: SyncError[];
  /** Timestamp when this status was generated (ISO string) */
  generatedAt: string;
}

/** Result of a manual sync trigger */
export interface SyncTriggerResult {
  /** Whether the trigger was accepted */
  accepted: boolean;
  /** Reason if not accepted */
  reason: string | null;
  /** Number of pending events that will be synced */
  pendingEvents: number;
  /** Timestamp when the trigger was issued (ISO string) */
  triggeredAt: string;
}

/** WebSocket message for sync status updates */
export interface SyncStatusMessage {
  type: 'sync_status';
  payload: SyncStatus;
}

/** WebSocket message for sync progress updates */
export interface SyncProgressMessage {
  type: 'sync_progress';
  payload: SyncProgress & {
    /** Timestamp of this progress update */
    timestamp: number;
  };
}

/** WebSocket message for sync errors */
export interface SyncErrorMessage {
  type: 'sync_error';
  payload: SyncError;
}

/** WebSocket message for sync completion */
export interface SyncCompleteMessage {
  type: 'sync_complete';
  payload: {
    /** Direction of the completed sync */
    direction: SyncStatusDirection;
    /** Number of files synced */
    filesSynced: number;
    /** Number of errors */
    errors: number;
    /** Duration of the sync cycle in milliseconds */
    durationMs: number;
    /** Timestamp of completion */
    timestamp: number;
  };
}

/** Configuration for the SyncStatusManager */
export interface SyncStatusManagerConfig {
  /** Maximum number of recent errors to retain (default: 50) */
  maxRecentErrors: number;
  /** How often to emit status updates over WebSocket in ms (default: 5000) */
  statusBroadcastIntervalMs: number;
}

/** Default configuration for SyncStatusManager */
export const DEFAULT_STATUS_MANAGER_CONFIG: SyncStatusManagerConfig = {
  maxRecentErrors: 50,
  statusBroadcastIntervalMs: 5000,
};
