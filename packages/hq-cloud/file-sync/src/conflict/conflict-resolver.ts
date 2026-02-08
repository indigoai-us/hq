/**
 * Conflict resolver.
 *
 * Applies resolution strategies to detected conflicts:
 * - keep_both: rename local file to .conflict, allow remote download
 * - local_wins: keep local file, skip remote download
 * - remote_wins: overwrite local with remote (allow download to proceed)
 * - manual: defer resolution for user review
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Logger } from 'pino';
import type {
  SyncConflict,
  ConflictConfig,
  ConflictResolutionResult,
  ConflictResolutionStrategy,
} from './types.js';
import { DEFAULT_CONFLICT_CONFIG } from './types.js';

/**
 * Resolves file sync conflicts using configurable strategies.
 *
 * The resolver operates on the local filesystem to prepare for
 * the appropriate sync action (download/skip) after conflict resolution.
 */
export class ConflictResolver {
  private readonly config: ConflictConfig;
  private readonly logger: Logger;
  private readonly localDir: string;

  constructor(localDir: string, logger: Logger, config?: Partial<ConflictConfig>) {
    this.localDir = localDir;
    this.config = { ...DEFAULT_CONFLICT_CONFIG, ...config };
    this.logger = logger.child({ component: 'conflict-resolver' });
  }

  /**
   * Resolve a conflict using its assigned strategy.
   *
   * @param conflict - The conflict to resolve
   * @returns Resolution result indicating what action was taken
   */
  resolve(conflict: SyncConflict): ConflictResolutionResult {
    this.logger.info(
      {
        conflictId: conflict.id,
        relativePath: conflict.relativePath,
        strategy: conflict.strategy,
      },
      'Resolving conflict'
    );

    try {
      switch (conflict.strategy) {
        case 'keep_both':
          return this.resolveKeepBoth(conflict);

        case 'local_wins':
          return this.resolveLocalWins(conflict);

        case 'remote_wins':
          return this.resolveRemoteWins(conflict);

        case 'manual':
          return this.resolveManual(conflict);

        default:
          return {
            conflict,
            success: false,
            action: 'none',
            error: `Unknown strategy: ${conflict.strategy as string}`,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        {
          conflictId: conflict.id,
          relativePath: conflict.relativePath,
          error: message,
        },
        'Failed to resolve conflict'
      );

      conflict.status = 'detected';
      conflict.error = message;

      return {
        conflict,
        success: false,
        action: conflict.strategy,
        error: message,
      };
    }
  }

  /**
   * Resolve using a specific strategy override (e.g., user chose a different strategy).
   *
   * @param conflict - The conflict to resolve
   * @param strategy - The strategy to use instead of the conflict's assigned strategy
   * @returns Resolution result
   */
  resolveWithStrategy(
    conflict: SyncConflict,
    strategy: ConflictResolutionStrategy
  ): ConflictResolutionResult {
    conflict.strategy = strategy;
    return this.resolve(conflict);
  }

  /**
   * Keep both versions: rename local to .conflict, allow remote to be downloaded.
   *
   * File naming: {name}.{ext} -> {name}.{timestamp}.conflict.{ext}
   * or {name}.conflict.{ext} if timestamping is disabled.
   */
  private resolveKeepBoth(conflict: SyncConflict): ConflictResolutionResult {
    const localPath = path.join(this.localDir, conflict.relativePath);

    if (!fs.existsSync(localPath)) {
      // Local file gone - no conflict to resolve, remote can proceed
      conflict.status = 'resolved';
      conflict.resolvedAt = Date.now();

      return {
        conflict,
        success: true,
        action: 'keep_both (local file already removed)',
      };
    }

    const conflictPath = this.buildConflictPath(conflict.relativePath);
    const conflictAbsPath = path.join(this.localDir, conflictPath);

    // Ensure directory exists
    const dir = path.dirname(conflictAbsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Rename local file to .conflict
    fs.renameSync(localPath, conflictAbsPath);

    conflict.status = 'resolved';
    conflict.resolvedAt = Date.now();
    conflict.conflictFilePath = conflictPath;

    this.logger.info(
      {
        conflictId: conflict.id,
        relativePath: conflict.relativePath,
        conflictPath,
      },
      'Conflict resolved: keep_both (local renamed to .conflict)'
    );

    return {
      conflict,
      success: true,
      action: `keep_both: renamed local to ${conflictPath}`,
    };
  }

  /**
   * Local wins: keep the local file, skip downloading the remote version.
   * The remote version remains on S3 but is not applied locally.
   */
  private resolveLocalWins(conflict: SyncConflict): ConflictResolutionResult {
    conflict.status = 'resolved';
    conflict.resolvedAt = Date.now();

    this.logger.info(
      {
        conflictId: conflict.id,
        relativePath: conflict.relativePath,
      },
      'Conflict resolved: local_wins (keeping local version)'
    );

    return {
      conflict,
      success: true,
      action: 'local_wins: kept local version, remote download skipped',
    };
  }

  /**
   * Remote wins: allow the remote version to overwrite the local file.
   * No filesystem action needed here - the download manager will handle it.
   */
  private resolveRemoteWins(conflict: SyncConflict): ConflictResolutionResult {
    conflict.status = 'resolved';
    conflict.resolvedAt = Date.now();

    this.logger.info(
      {
        conflictId: conflict.id,
        relativePath: conflict.relativePath,
      },
      'Conflict resolved: remote_wins (allowing remote overwrite)'
    );

    return {
      conflict,
      success: true,
      action: 'remote_wins: local will be overwritten by remote version',
    };
  }

  /**
   * Manual: defer the conflict for user review. No automatic action taken.
   */
  private resolveManual(conflict: SyncConflict): ConflictResolutionResult {
    conflict.status = 'deferred';
    conflict.resolvedAt = null;

    this.logger.info(
      {
        conflictId: conflict.id,
        relativePath: conflict.relativePath,
      },
      'Conflict deferred for manual resolution'
    );

    return {
      conflict,
      success: true,
      action: 'manual: deferred for user review',
    };
  }

  /**
   * Build the conflict file path with optional timestamp.
   *
   * Example with timestamp: docs/readme.md -> docs/readme.1700000000000.conflict.md
   * Example without timestamp: docs/readme.md -> docs/readme.conflict.md
   */
  private buildConflictPath(relativePath: string): string {
    const parsed = path.parse(relativePath);
    const suffix = this.config.conflictSuffix.replace(/^\./, '');

    if (this.config.timestampConflictFiles) {
      const timestamp = Date.now();
      if (parsed.ext) {
        return path.join(parsed.dir, `${parsed.name}.${timestamp}.${suffix}${parsed.ext}`);
      }
      return path.join(parsed.dir, `${parsed.name}.${timestamp}.${suffix}`);
    }

    if (parsed.ext) {
      return path.join(parsed.dir, `${parsed.name}.${suffix}${parsed.ext}`);
    }
    return path.join(parsed.dir, `${parsed.name}.${suffix}`);
  }
}
