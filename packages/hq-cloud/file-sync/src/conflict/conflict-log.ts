/**
 * In-memory conflict log for tracking and querying detected conflicts.
 *
 * Stores conflicts in memory with configurable maximum capacity.
 * Provides query methods compatible with REST API responses.
 * Designed for future persistence (conflicts can be serialized to JSON).
 */

import type { Logger } from 'pino';
import type {
  SyncConflict,
  ConflictQuery,
  ConflictListResponse,
  ConflictConfig,
} from './types.js';
import { DEFAULT_CONFLICT_CONFIG } from './types.js';

/**
 * In-memory store for sync conflicts.
 *
 * Tracks all detected conflicts with their resolution status,
 * providing query capabilities suitable for API endpoints.
 */
export class ConflictLog {
  private readonly conflicts: Map<string, SyncConflict> = new Map();
  private readonly maxEntries: number;
  private readonly logger: Logger;

  constructor(logger: Logger, config?: Partial<ConflictConfig>) {
    const mergedConfig = { ...DEFAULT_CONFLICT_CONFIG, ...config };
    this.maxEntries = mergedConfig.maxLogEntries;
    this.logger = logger.child({ component: 'conflict-log' });
  }

  /** Total number of conflicts in the log */
  get size(): number {
    return this.conflicts.size;
  }

  /**
   * Add a conflict to the log.
   * If the log exceeds maxEntries, the oldest resolved conflict is evicted.
   *
   * @param conflict - The conflict to add
   */
  add(conflict: SyncConflict): void {
    this.conflicts.set(conflict.id, conflict);

    this.logger.debug(
      {
        conflictId: conflict.id,
        relativePath: conflict.relativePath,
        status: conflict.status,
      },
      'Conflict added to log'
    );

    // Evict if over capacity
    if (this.conflicts.size > this.maxEntries) {
      this.evictOldest();
    }
  }

  /**
   * Update an existing conflict in the log.
   *
   * @param conflict - The updated conflict
   */
  update(conflict: SyncConflict): void {
    if (!this.conflicts.has(conflict.id)) {
      this.logger.warn(
        { conflictId: conflict.id },
        'Attempted to update non-existent conflict'
      );
      return;
    }

    this.conflicts.set(conflict.id, conflict);
  }

  /**
   * Get a conflict by its ID.
   *
   * @param id - The conflict ID
   * @returns The conflict or undefined
   */
  get(id: string): SyncConflict | undefined {
    return this.conflicts.get(id);
  }

  /**
   * Get a conflict by relative path (returns the most recent unresolved conflict).
   *
   * @param relativePath - The file's relative path
   * @returns The most recent unresolved conflict for this path, or undefined
   */
  getByPath(relativePath: string): SyncConflict | undefined {
    let latest: SyncConflict | undefined;

    for (const conflict of this.conflicts.values()) {
      if (conflict.relativePath !== relativePath) {
        continue;
      }
      if (conflict.status === 'resolved') {
        continue;
      }
      if (!latest || conflict.detectedAt > latest.detectedAt) {
        latest = conflict;
      }
    }

    return latest;
  }

  /**
   * Check if a file currently has an unresolved conflict.
   *
   * @param relativePath - The file's relative path
   * @returns True if an unresolved conflict exists
   */
  hasUnresolvedConflict(relativePath: string): boolean {
    for (const conflict of this.conflicts.values()) {
      if (
        conflict.relativePath === relativePath &&
        conflict.status !== 'resolved'
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Remove a conflict from the log.
   *
   * @param id - The conflict ID to remove
   * @returns True if the conflict was found and removed
   */
  remove(id: string): boolean {
    return this.conflicts.delete(id);
  }

  /**
   * Query conflicts with filtering, pagination, and sorting.
   * Returns an API-compatible response object.
   *
   * @param query - Query options
   * @returns ConflictListResponse with matching conflicts
   */
  list(query?: ConflictQuery): ConflictListResponse {
    let results = Array.from(this.conflicts.values());

    // Filter by status
    if (query?.status) {
      results = results.filter((c) => c.status === query.status);
    }

    // Filter by path prefix
    if (query?.pathPrefix) {
      results = results.filter((c) =>
        c.relativePath.startsWith(query.pathPrefix!)
      );
    }

    // Sort
    const sortBy = query?.sortBy ?? 'detectedAt';
    const sortDir = query?.sortDirection ?? 'desc';
    const multiplier = sortDir === 'asc' ? 1 : -1;

    results.sort((a, b) => {
      switch (sortBy) {
        case 'detectedAt':
          return (a.detectedAt - b.detectedAt) * multiplier;
        case 'resolvedAt':
          return ((a.resolvedAt ?? 0) - (b.resolvedAt ?? 0)) * multiplier;
        case 'relativePath':
          return a.relativePath.localeCompare(b.relativePath) * multiplier;
        default:
          return 0;
      }
    });

    // Compute totals before pagination
    const total = results.length;

    // Pagination
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? results.length;
    results = results.slice(offset, offset + limit);

    // Compute status counts from all conflicts (not just filtered)
    const allConflicts = Array.from(this.conflicts.values());
    const unresolved = allConflicts.filter((c) => c.status === 'detected').length;
    const resolved = allConflicts.filter((c) => c.status === 'resolved').length;
    const deferred = allConflicts.filter((c) => c.status === 'deferred').length;

    return {
      conflicts: results,
      total,
      unresolved,
      resolved,
      deferred,
    };
  }

  /**
   * Get all unresolved conflicts (detected or deferred).
   *
   * @returns Array of unresolved conflicts
   */
  getUnresolved(): SyncConflict[] {
    return Array.from(this.conflicts.values()).filter(
      (c) => c.status !== 'resolved'
    );
  }

  /**
   * Get all deferred conflicts (awaiting manual resolution).
   *
   * @returns Array of deferred conflicts
   */
  getDeferred(): SyncConflict[] {
    return Array.from(this.conflicts.values()).filter(
      (c) => c.status === 'deferred'
    );
  }

  /**
   * Clear all conflicts from the log.
   */
  clear(): void {
    this.conflicts.clear();
    this.logger.info('Conflict log cleared');
  }

  /**
   * Clear only resolved conflicts from the log.
   *
   * @returns Number of conflicts removed
   */
  clearResolved(): number {
    let removed = 0;
    for (const [id, conflict] of this.conflicts.entries()) {
      if (conflict.status === 'resolved') {
        this.conflicts.delete(id);
        removed++;
      }
    }

    this.logger.info({ removed }, 'Cleared resolved conflicts');
    return removed;
  }

  /**
   * Export all conflicts as a JSON-serializable array.
   * Useful for persistence or API responses.
   *
   * @returns Array of all conflicts
   */
  toJSON(): SyncConflict[] {
    return Array.from(this.conflicts.values());
  }

  /**
   * Import conflicts from a previously exported array.
   * Used for restoring state from persistence.
   *
   * @param conflicts - Array of conflicts to import
   */
  fromJSON(conflicts: SyncConflict[]): void {
    this.conflicts.clear();
    for (const conflict of conflicts) {
      this.conflicts.set(conflict.id, conflict);
    }

    this.logger.info(
      { imported: conflicts.length },
      'Conflicts imported from JSON'
    );
  }

  /**
   * Evict the oldest resolved conflict to make room.
   * If no resolved conflicts exist, evict the oldest overall.
   */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    let oldestResolvedId: string | null = null;
    let oldestResolvedTime = Infinity;

    for (const [id, conflict] of this.conflicts.entries()) {
      if (conflict.detectedAt < oldestTime) {
        oldestTime = conflict.detectedAt;
        oldestId = id;
      }
      if (conflict.status === 'resolved' && conflict.detectedAt < oldestResolvedTime) {
        oldestResolvedTime = conflict.detectedAt;
        oldestResolvedId = id;
      }
    }

    // Prefer evicting resolved conflicts
    const evictId = oldestResolvedId ?? oldestId;
    if (evictId) {
      this.conflicts.delete(evictId);
      this.logger.debug({ evictedId: evictId }, 'Evicted oldest conflict from log');
    }
  }
}
