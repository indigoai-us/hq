/**
 * Sync status API route handlers for mobile clients.
 *
 * Provides:
 * - GET  /api/sync/status  — current sync status (last sync time, pending changes, health)
 * - POST /api/sync/trigger — manually trigger a sync cycle
 * - GET  /api/sync/errors  — recent sync errors
 * - DELETE /api/sync/errors — clear sync errors
 *
 * These are framework-agnostic handler functions. The consumer wires them
 * into their HTTP framework (Express, Fastify, etc.).
 */

import type { SyncStatusManager } from './sync-status-manager.js';
import type { SyncStatus, SyncTriggerResult, SyncError } from './types.js';
import type { SyncDaemon } from '../daemon/sync-daemon.js';

/** Successful API response wrapper */
export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

/** Error API response wrapper */
export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

/** Union response type */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Dependencies injected into route handlers */
export interface SyncStatusRouteDeps {
  /** Status manager for reading aggregated state */
  statusManager: SyncStatusManager;
  /** Daemon instance for triggering syncs (optional - trigger will reject if absent) */
  daemon: SyncDaemon | null;
}

/**
 * GET /api/sync/status
 *
 * Returns the comprehensive sync status including:
 * - Last sync time
 * - Pending changes count
 * - Upload/download statistics
 * - Current sync health
 * - Active progress (if syncing)
 * - Recent errors
 */
export function handleGetSyncStatus(
  deps: SyncStatusRouteDeps
): ApiResponse<SyncStatus> {
  try {
    const status = deps.statusManager.getStatus();
    return { ok: true, data: status };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      error: { code: 'STATUS_ERROR', message: `Failed to get sync status: ${message}` },
    };
  }
}

/**
 * POST /api/sync/trigger
 *
 * Manually triggers a sync cycle. Returns immediately with
 * trigger acceptance status — the actual sync runs asynchronously.
 *
 * Rejects if:
 * - No daemon is available
 * - Daemon is not in a running state
 * - A trigger is already in progress
 */
export function handlePostSyncTrigger(
  deps: SyncStatusRouteDeps
): ApiResponse<SyncTriggerResult> {
  const { statusManager, daemon } = deps;

  // No daemon available
  if (!daemon) {
    const result = statusManager.buildTriggerResult(false, 0, 'Sync daemon is not available');
    return { ok: true, data: result };
  }

  // Daemon not running
  if (daemon.state !== 'running') {
    const result = statusManager.buildTriggerResult(
      false,
      daemon.pendingEvents,
      `Sync daemon is not running (state: ${daemon.state})`
    );
    return { ok: true, data: result };
  }

  // Already triggering
  if (statusManager.triggerInProgress) {
    const result = statusManager.buildTriggerResult(
      false,
      daemon.pendingEvents,
      'A sync trigger is already in progress'
    );
    return { ok: true, data: result };
  }

  // Accept the trigger
  statusManager.setTriggerInProgress(true);

  const pendingEvents = daemon.pendingEvents;
  const result = statusManager.buildTriggerResult(true, pendingEvents);

  // Trigger the sync asynchronously — do not await
  void daemon.triggerSync().finally(() => {
    statusManager.setTriggerInProgress(false);
  });

  return { ok: true, data: result };
}

/**
 * GET /api/sync/errors
 *
 * Returns recent sync errors for display in mobile UI.
 */
export function handleGetSyncErrors(
  deps: SyncStatusRouteDeps
): ApiResponse<SyncError[]> {
  try {
    const errors = deps.statusManager.getRecentErrors();
    return { ok: true, data: errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      error: { code: 'ERRORS_FETCH_FAILED', message: `Failed to get errors: ${message}` },
    };
  }
}

/**
 * DELETE /api/sync/errors
 *
 * Clears all recent sync errors.
 */
export function handleDeleteSyncErrors(
  deps: SyncStatusRouteDeps
): ApiResponse<{ cleared: boolean }> {
  try {
    deps.statusManager.clearErrors();
    return { ok: true, data: { cleared: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      error: { code: 'ERRORS_CLEAR_FAILED', message: `Failed to clear errors: ${message}` },
    };
  }
}
