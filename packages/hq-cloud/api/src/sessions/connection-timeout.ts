/**
 * Connection Timeout
 *
 * Tracks pending connection timeouts for session containers.
 * Extracted to its own module to avoid circular dependencies
 * between orchestrator.ts and session-relay.ts.
 */

const connectionTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

// 3 minutes — containers need time for ECS provisioning + S3 file sync (can be 1000+ files)
// before Claude Code starts and connects back via WebSocket.
export const CONNECTION_TIMEOUT_MS = 180_000;

/**
 * Register a timeout for a session.
 * The callback fires if the timeout is not cleared before CONNECTION_TIMEOUT_MS.
 */
export function setConnectionTimeout(
  sessionId: string,
  callback: () => void | Promise<void>
): void {
  // Clear any existing timeout for this session
  clearConnectionTimeout(sessionId);

  const timer = setTimeout(() => {
    connectionTimeouts.delete(sessionId);
    void callback();
  }, CONNECTION_TIMEOUT_MS);

  connectionTimeouts.set(sessionId, timer);
}

/**
 * Clear a connection timeout (called when container connects or session is stopped).
 */
export function clearConnectionTimeout(sessionId: string): void {
  const timer = connectionTimeouts.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    connectionTimeouts.delete(sessionId);
  }
}

/**
 * Check if a timeout is pending for a session (for testing).
 */
export function hasConnectionTimeout(sessionId: string): boolean {
  return connectionTimeouts.has(sessionId);
}

/**
 * Clear all timeouts (for testing).
 */
export function resetConnectionTimeouts(): void {
  for (const timer of connectionTimeouts.values()) {
    clearTimeout(timer);
  }
  connectionTimeouts.clear();
}
