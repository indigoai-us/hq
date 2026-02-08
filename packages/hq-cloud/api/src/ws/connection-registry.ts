import type { WebSocket } from 'ws';
import type { ClientConnection, ConnectionRegistry } from './types.js';

/**
 * In-memory registry for tracking WebSocket connections by deviceId.
 * Thread-safe for single-process usage.
 */
export class InMemoryConnectionRegistry implements ConnectionRegistry {
  private connections: Map<string, ClientConnection> = new Map();

  /**
   * Add a new connection to the registry.
   * If a connection with the same deviceId exists, the old one is replaced.
   */
  add(deviceId: string, socket: WebSocket): void {
    const existing = this.connections.get(deviceId);
    if (existing) {
      // Close the old connection if it exists
      try {
        existing.socket.close(1000, 'New connection established');
      } catch {
        // Socket may already be closed
      }
    }

    const connection: ClientConnection = {
      deviceId,
      socket,
      connectedAt: new Date(),
      lastPing: new Date(),
      isAlive: true,
      workerSubscriptions: new Set(),
      subscribedToAll: false,
    };

    this.connections.set(deviceId, connection);
  }

  /**
   * Remove a connection from the registry.
   */
  remove(deviceId: string): void {
    this.connections.delete(deviceId);
  }

  /**
   * Get a connection by deviceId.
   */
  get(deviceId: string): ClientConnection | undefined {
    return this.connections.get(deviceId);
  }

  /**
   * Get all active connections.
   */
  getAll(): ClientConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Update the lastPing timestamp for a connection.
   */
  updatePing(deviceId: string): void {
    const connection = this.connections.get(deviceId);
    if (connection) {
      connection.lastPing = new Date();
      connection.isAlive = true;
    }
  }

  /**
   * Mark a connection as dead (not responding to pings).
   */
  markDead(deviceId: string): void {
    const connection = this.connections.get(deviceId);
    if (connection) {
      connection.isAlive = false;
    }
  }

  /**
   * Get the number of active connections.
   */
  get size(): number {
    return this.connections.size;
  }

  /**
   * Subscribe a client to worker updates.
   * @param deviceId Client device ID
   * @param workerIds Worker IDs to subscribe to. Empty array = all workers.
   */
  subscribe(deviceId: string, workerIds: string[]): void {
    const connection = this.connections.get(deviceId);
    if (!connection) return;

    if (workerIds.length === 0) {
      // Subscribe to all workers
      connection.subscribedToAll = true;
      connection.workerSubscriptions.clear();
    } else {
      // Subscribe to specific workers
      for (const workerId of workerIds) {
        connection.workerSubscriptions.add(workerId);
      }
    }
  }

  /**
   * Unsubscribe a client from worker updates.
   * @param deviceId Client device ID
   * @param workerIds Worker IDs to unsubscribe from. Empty array = unsubscribe from all.
   */
  unsubscribe(deviceId: string, workerIds: string[]): void {
    const connection = this.connections.get(deviceId);
    if (!connection) return;

    if (workerIds.length === 0) {
      // Unsubscribe from all workers
      connection.subscribedToAll = false;
      connection.workerSubscriptions.clear();
    } else {
      // Unsubscribe from specific workers
      for (const workerId of workerIds) {
        connection.workerSubscriptions.delete(workerId);
      }
    }
  }

  /**
   * Get all connections subscribed to a specific worker.
   */
  getSubscribersForWorker(workerId: string): ClientConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.subscribedToAll || conn.workerSubscriptions.has(workerId)
    );
  }

  /**
   * Get subscription info for a client.
   */
  getSubscription(deviceId: string): { workerIds: string[]; all: boolean } | undefined {
    const connection = this.connections.get(deviceId);
    if (!connection) return undefined;

    return {
      workerIds: Array.from(connection.workerSubscriptions),
      all: connection.subscribedToAll,
    };
  }

  /**
   * Clear all connections. Useful for testing and shutdown.
   */
  clear(): void {
    for (const connection of this.connections.values()) {
      try {
        connection.socket.close(1001, 'Server shutting down');
      } catch {
        // Socket may already be closed
      }
    }
    this.connections.clear();
  }
}

// Singleton instance for the application
let registryInstance: InMemoryConnectionRegistry | null = null;

export function getConnectionRegistry(): InMemoryConnectionRegistry {
  if (!registryInstance) {
    registryInstance = new InMemoryConnectionRegistry();
  }
  return registryInstance;
}

// For testing - reset the singleton
export function resetConnectionRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
  }
  registryInstance = null;
}
