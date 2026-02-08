/**
 * WebSocket broadcast functions for sync status events.
 *
 * Broadcasts sync progress, status changes, errors, and completion
 * events to all connected WebSocket clients.
 */

import { getConnectionRegistry } from './connection-registry.js';
import type {
  SyncStatus,
  SyncProgress,
  SyncError,
  SyncStatusDirection,
  SyncStatusMessage,
  SyncProgressMessage,
  SyncErrorMessage,
  SyncCompleteMessage,
} from '@hq-cloud/file-sync';

/**
 * Broadcast a full sync status update to all connected clients.
 */
export function broadcastSyncStatus(status: SyncStatus): void {
  const registry = getConnectionRegistry();
  const connections = registry.getAll();

  if (connections.length === 0) return;

  const message: SyncStatusMessage = {
    type: 'sync_status',
    payload: status,
  };

  const messageStr = JSON.stringify(message);

  for (const connection of connections) {
    if (connection.socket.readyState === connection.socket.OPEN) {
      connection.socket.send(messageStr);
    }
  }
}

/**
 * Broadcast sync progress to all connected clients.
 */
export function broadcastSyncProgress(progress: SyncProgress): void {
  const registry = getConnectionRegistry();
  const connections = registry.getAll();

  if (connections.length === 0) return;

  const message: SyncProgressMessage = {
    type: 'sync_progress',
    payload: {
      ...progress,
      timestamp: Date.now(),
    },
  };

  const messageStr = JSON.stringify(message);

  for (const connection of connections) {
    if (connection.socket.readyState === connection.socket.OPEN) {
      connection.socket.send(messageStr);
    }
  }
}

/**
 * Broadcast a sync error to all connected clients.
 */
export function broadcastSyncError(error: SyncError): void {
  const registry = getConnectionRegistry();
  const connections = registry.getAll();

  if (connections.length === 0) return;

  const message: SyncErrorMessage = {
    type: 'sync_error',
    payload: error,
  };

  const messageStr = JSON.stringify(message);

  for (const connection of connections) {
    if (connection.socket.readyState === connection.socket.OPEN) {
      connection.socket.send(messageStr);
    }
  }
}

/**
 * Broadcast sync completion to all connected clients.
 */
export function broadcastSyncComplete(
  direction: SyncStatusDirection,
  filesSynced: number,
  errors: number,
  durationMs: number
): void {
  const registry = getConnectionRegistry();
  const connections = registry.getAll();

  if (connections.length === 0) return;

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

  const messageStr = JSON.stringify(message);

  for (const connection of connections) {
    if (connection.socket.readyState === connection.socket.OPEN) {
      connection.socket.send(messageStr);
    }
  }
}
