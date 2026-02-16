/**
 * Sync Gate
 *
 * Manages the handshake between a session stop request and the container's
 * file-sync completion. When a DELETE /api/sessions/:id is received, the
 * API sends a `sync_and_shutdown` WebSocket message to the container and
 * waits up to SYNC_GRACE_MS for the container to POST back to
 * /api/sessions/:id/sync-status confirming sync is done.
 *
 * If the container acknowledges in time, the gate resolves and the API
 * proceeds to call StopTask. If the timeout expires, the gate resolves
 * anyway (the container's SIGTERM handler is the backstop).
 */

/** Maximum time (ms) to wait for the container's sync acknowledgment */
export const SYNC_GRACE_MS = 15_000;

interface PendingSyncGate {
  resolve: (acknowledged: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingGates = new Map<string, PendingSyncGate>();

/**
 * Create a sync gate for a session.
 * Returns a promise that resolves with `true` if the container acknowledges
 * sync completion, or `false` if the timeout expires.
 */
export function createSyncGate(sessionId: string): Promise<boolean> {
  // If there's already a pending gate, resolve it as timed-out and replace
  const existing = pendingGates.get(sessionId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.resolve(false);
    pendingGates.delete(sessionId);
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pendingGates.delete(sessionId);
      resolve(false);
    }, SYNC_GRACE_MS);

    pendingGates.set(sessionId, { resolve, timer });
  });
}

/**
 * Acknowledge that the container's sync is complete for a session.
 * Called when the container POSTs to /api/sessions/:id/sync-status.
 * Returns true if there was a pending gate (i.e. the stop request was waiting).
 */
export function acknowledgeSyncComplete(sessionId: string): boolean {
  const gate = pendingGates.get(sessionId);
  if (!gate) {
    return false;
  }

  clearTimeout(gate.timer);
  pendingGates.delete(sessionId);
  gate.resolve(true);
  return true;
}

/**
 * Check if a session has a pending sync gate.
 */
export function hasPendingSyncGate(sessionId: string): boolean {
  return pendingGates.has(sessionId);
}

/**
 * Cancel a pending sync gate (e.g. on error).
 */
export function cancelSyncGate(sessionId: string): void {
  const gate = pendingGates.get(sessionId);
  if (gate) {
    clearTimeout(gate.timer);
    pendingGates.delete(sessionId);
    gate.resolve(false);
  }
}

/**
 * Reset all gates (for testing).
 */
export function resetSyncGates(): void {
  for (const gate of pendingGates.values()) {
    clearTimeout(gate.timer);
  }
  pendingGates.clear();
}
