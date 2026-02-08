import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import {
  SyncStatusManager,
} from '@hq-cloud/file-sync';
import type {
  SyncTriggerResult,
  SyncStatusDirection,
  SyncDaemonStats,
  DownloadManagerStats,
  DaemonState,
  SyncError,
} from '@hq-cloud/file-sync';

// ─── Singleton manager (reset for testing) ──────────────────────────

let _manager: SyncStatusManager | undefined;

function getManager(): SyncStatusManager {
  if (!_manager) {
    _manager = new SyncStatusManager();
  }
  return _manager;
}

/** Reset the sync status manager (for testing) */
export function resetSyncStatusManager(): void {
  _manager = undefined;
}

/**
 * Update daemon stats externally.
 * Called by the daemon integration layer whenever stats change.
 */
export function feedDaemonStats(stats: SyncDaemonStats): void {
  getManager().updateDaemonStats(stats);
}

/**
 * Update download stats externally.
 * Called by the download manager integration layer whenever stats change.
 */
export function feedDownloadStats(stats: DownloadManagerStats): void {
  getManager().updateDownloadStats(stats);
}

/**
 * Record a sync error externally.
 */
export function recordSyncError(
  direction: SyncStatusDirection,
  message: string,
  opts?: { filePath?: string; code?: string; retryable?: boolean }
): SyncError {
  return getManager().addError(direction, message, opts);
}

// ─── Request/Response types ─────────────────────────────────────────

interface SyncTriggerBody {
  /** Force sync even if one is already in progress */
  force?: boolean;
}

// ─── Route plugin ───────────────────────────────────────────────────

export const syncRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  const manager = getManager();

  /**
   * GET /sync/status
   * Returns comprehensive sync status for mobile clients.
   */
  fastify.get('/sync/status', (_request, reply) => {
    const status = manager.getStatus();
    return reply.send(status);
  });

  /**
   * GET /sync/errors
   * Returns recent sync errors.
   */
  fastify.get('/sync/errors', (_request, reply) => {
    const errors = manager.getRecentErrors();
    return reply.send({
      count: errors.length,
      errors,
    });
  });

  /**
   * DELETE /sync/errors
   * Clears all recorded sync errors.
   */
  fastify.delete('/sync/errors', (_request, reply) => {
    manager.clearErrors();
    return reply.status(204).send();
  });

  /**
   * POST /sync/trigger
   * Manually trigger a sync cycle.
   *
   * This endpoint signals the daemon to run an immediate sync.
   * In production, the daemon integration layer calls daemon.triggerSync().
   * Here we validate preconditions and return a result.
   */
  fastify.post<{ Body: SyncTriggerBody }>(
    '/sync/trigger',
    (request, reply) => {
      const { force } = request.body ?? {};
      const status = manager.getStatus();

      // Check if daemon is in a state that allows syncing
      const nonSyncableStates: DaemonState[] = ['idle', 'stopped', 'stopping'];
      if (nonSyncableStates.includes(status.daemonState)) {
        const result: SyncTriggerResult = manager.buildTriggerResult(
          false,
          status.pendingChanges,
          `Daemon is ${status.daemonState}, cannot trigger sync`
        );
        return reply.status(409).send(result);
      }

      // Check if already syncing and force not set
      if (status.isSyncing && !force) {
        const result: SyncTriggerResult = manager.buildTriggerResult(
          false,
          status.pendingChanges,
          'Sync already in progress. Use force=true to override'
        );
        return reply.status(409).send(result);
      }

      // Check if trigger is already in progress
      if (manager.triggerInProgress) {
        const result: SyncTriggerResult = manager.buildTriggerResult(
          false,
          status.pendingChanges,
          'A sync trigger is already pending'
        );
        return reply.status(409).send(result);
      }

      // Accept the trigger
      manager.setTriggerInProgress(true);

      // In a real deployment, this would call daemon.triggerSync().
      // The integration layer listens for this state and invokes the daemon.
      // For now, we mark the trigger as accepted and reset after a brief delay.
      // The daemon event handler will call setTriggerInProgress(false) on completion.

      // Auto-reset trigger flag after timeout (safety net)
      setTimeout(() => {
        manager.setTriggerInProgress(false);
      }, 30_000);

      const result: SyncTriggerResult = manager.buildTriggerResult(
        true,
        status.pendingChanges
      );
      return reply.status(202).send(result);
    }
  );

  done();
};
