/**
 * Conflict detector for file sync.
 *
 * Detects conflicts by comparing local file hashes and remote S3 object
 * hashes against the last-synced state. A conflict exists when BOTH the
 * local file and the S3 object have changed since the last sync.
 *
 * Integrates with:
 * - SyncStateManager: provides last-synced ETags and timestamps
 * - File hasher: provides current local file hashes
 * - S3 object metadata: provides current remote content hashes
 */

import * as crypto from 'node:crypto';
import type { Logger } from 'pino';
import type {
  ConflictCheckInput,
  ConflictConfig,
  ConflictResolutionStrategy,
  SyncConflict,
} from './types.js';
import { DEFAULT_CONFLICT_CONFIG } from './types.js';

/**
 * Detects conflicts between local and remote file versions.
 *
 * A file is in conflict when:
 * 1. The local file hash differs from the last-synced hash (local changed)
 * 2. The remote ETag/hash differs from the last-synced ETag/hash (remote changed)
 *
 * If only one side changed, there is no conflict - the changed version
 * should simply overwrite the other.
 */
export class ConflictDetector {
  private readonly config: ConflictConfig;
  private readonly logger: Logger;

  constructor(logger: Logger, config?: Partial<ConflictConfig>) {
    this.config = { ...DEFAULT_CONFLICT_CONFIG, ...config };
    this.logger = logger.child({ component: 'conflict-detector' });
  }

  /**
   * Check whether a file has a conflict between local and remote versions.
   *
   * @param input - Information about the local file, remote object, and last sync state
   * @returns A SyncConflict if both sides changed, or null if no conflict
   */
  checkConflict(input: ConflictCheckInput): SyncConflict | null {
    const localChanged = this.hasLocalChanged(input);
    const remoteChanged = this.hasRemoteChanged(input);

    this.logger.debug(
      {
        relativePath: input.relativePath,
        localChanged,
        remoteChanged,
        localHash: input.localHash,
        remoteHash: input.remoteHash,
        lastSyncedHash: input.lastSyncedHash,
        lastSyncedEtag: input.lastSyncedEtag,
        remoteEtag: input.remoteEtag,
      },
      'Conflict check'
    );

    if (!localChanged || !remoteChanged) {
      // No conflict: at most one side changed
      return null;
    }

    // Both sides changed - this is a conflict
    const strategy = this.getStrategy(input.relativePath);
    const conflict = this.buildConflict(input, strategy);

    this.logger.info(
      {
        relativePath: input.relativePath,
        strategy,
        conflictId: conflict.id,
      },
      'Conflict detected'
    );

    return conflict;
  }

  /**
   * Check multiple files for conflicts in batch.
   *
   * @param inputs - Array of conflict check inputs
   * @returns Array of detected conflicts (only files with actual conflicts)
   */
  checkConflicts(inputs: ConflictCheckInput[]): SyncConflict[] {
    const conflicts: SyncConflict[] = [];

    for (const input of inputs) {
      const conflict = this.checkConflict(input);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    this.logger.info(
      {
        checked: inputs.length,
        conflicts: conflicts.length,
      },
      'Batch conflict check complete'
    );

    return conflicts;
  }

  /**
   * Determine if the local file has changed since last sync.
   * Compares the current local hash against the last-synced hash.
   */
  private hasLocalChanged(input: ConflictCheckInput): boolean {
    // If never synced, local is considered "new" (changed)
    if (!input.lastSyncedHash) {
      return true;
    }

    return input.localHash !== input.lastSyncedHash;
  }

  /**
   * Determine if the remote S3 object has changed since last sync.
   * Compares the current remote ETag against the last-synced ETag.
   * Also checks content hash from metadata when available.
   */
  private hasRemoteChanged(input: ConflictCheckInput): boolean {
    // If never synced, remote is considered "new" (changed)
    if (!input.lastSyncedEtag) {
      return true;
    }

    // Check ETag change first (always available)
    if (input.remoteEtag !== input.lastSyncedEtag) {
      return true;
    }

    // If content hashes are available, check those too
    if (input.remoteHash && input.lastSyncedHash) {
      return input.remoteHash !== input.lastSyncedHash;
    }

    return false;
  }

  /**
   * Get the resolution strategy for a file path.
   * Checks strategy overrides first, then falls back to default.
   */
  private getStrategy(relativePath: string): ConflictResolutionStrategy {
    for (const [pattern, strategy] of Object.entries(this.config.strategyOverrides)) {
      if (this.matchGlob(relativePath, pattern)) {
        return strategy;
      }
    }
    return this.config.defaultStrategy;
  }

  /**
   * Build a SyncConflict object from the check input.
   */
  private buildConflict(
    input: ConflictCheckInput,
    strategy: ConflictResolutionStrategy
  ): SyncConflict {
    return {
      id: this.generateId(),
      relativePath: input.relativePath,
      local: {
        relativePath: input.relativePath,
        currentHash: input.localHash,
        lastSyncedHash: input.lastSyncedHash,
        sizeBytes: input.localSizeBytes,
        lastModified: input.localLastModified,
      },
      remote: {
        s3Key: input.s3Key,
        relativePath: input.relativePath,
        currentHash: input.remoteHash,
        lastSyncedEtag: input.lastSyncedEtag,
        currentEtag: input.remoteEtag,
        sizeBytes: input.remoteSizeBytes,
        lastModified: input.remoteLastModified,
      },
      status: strategy === 'manual' ? 'deferred' : 'detected',
      strategy,
      detectedAt: Date.now(),
      resolvedAt: null,
      conflictFilePath: null,
      error: null,
    };
  }

  /**
   * Generate a unique conflict ID.
   */
  private generateId(): string {
    return `conflict-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Simple glob matching supporting * and ** patterns.
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');

    return new RegExp(`^${regexStr}$`).test(filePath);
  }
}
