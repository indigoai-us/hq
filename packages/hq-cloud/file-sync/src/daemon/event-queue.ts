/**
 * In-memory event queue for batching file-system changes.
 *
 * Deduplicates events per path (latest event wins) and drains
 * in FIFO order when the sync cycle fires.
 */

import type { FileEvent } from './types.js';

/**
 * Queues file events for batch processing, deduplicating by relative path.
 *
 * If two events arrive for the same path before a drain, the later event
 * replaces the earlier one. This prevents redundant S3 operations
 * (e.g., writing a file that was already deleted).
 */
export class EventQueue {
  /** Map of relativePath -> latest FileEvent */
  private readonly events: Map<string, FileEvent> = new Map();

  /** Number of events in the queue */
  get size(): number {
    return this.events.size;
  }

  /**
   * Push a new event into the queue.
   * If an event for the same relative path already exists, it is replaced.
   */
  push(event: FileEvent): void {
    this.events.set(event.relativePath, event);
  }

  /**
   * Drain all events from the queue and return them in insertion order.
   * The queue is empty after this call.
   */
  drain(): FileEvent[] {
    const drained = Array.from(this.events.values());
    this.events.clear();
    return drained;
  }

  /**
   * Peek at all queued events without removing them.
   */
  peek(): FileEvent[] {
    return Array.from(this.events.values());
  }

  /**
   * Clear all events from the queue.
   */
  clear(): void {
    this.events.clear();
  }

  /**
   * Check if the queue has an event for a given relative path.
   */
  has(relativePath: string): boolean {
    return this.events.has(relativePath);
  }
}
