/**
 * S3 change detector.
 *
 * Lists objects in the user's S3 prefix and compares LastModified
 * timestamps against the local sync state to detect new, modified,
 * and deleted files.
 */

import {
  S3Client,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { _Object } from '@aws-sdk/client-s3';
import type { Logger } from 'pino';
import type { DownloadSyncConfig, S3ObjectInfo, DetectedChange } from './types.js';
import type { SyncStateManager } from './sync-state.js';

/**
 * Detects changes between S3 and the local sync state.
 *
 * Polls S3 via ListObjectsV2, comparing each object's LastModified
 * and ETag against the stored sync state.
 */
export class ChangeDetector {
  private readonly client: S3Client;
  private readonly config: DownloadSyncConfig;
  private readonly logger: Logger;

  constructor(client: S3Client, config: DownloadSyncConfig, logger: Logger) {
    this.client = client;
    this.config = config;
    this.logger = logger.child({ component: 'change-detector' });
  }

  /**
   * Poll S3 and detect all changes since the last sync.
   *
   * Returns an array of DetectedChange objects representing files
   * that need to be downloaded, updated, or deleted locally.
   */
  async detectChanges(stateManager: SyncStateManager): Promise<DetectedChange[]> {
    const changes: DetectedChange[] = [];
    const s3Objects = await this.listAllObjects();

    this.logger.debug(
      { objectCount: s3Objects.length },
      'Listed S3 objects for change detection'
    );

    // Build a set of S3 relative paths for deletion detection
    const s3Paths = new Set<string>();

    // Detect added and modified files
    for (const s3Object of s3Objects) {
      s3Paths.add(s3Object.relativePath);

      // Skip directory markers
      if (s3Object.key.endsWith('/')) {
        continue;
      }

      // Check if excluded
      if (this.isExcluded(s3Object.relativePath)) {
        continue;
      }

      if (stateManager.hasChanged(s3Object)) {
        const entry = stateManager.getEntry(s3Object.relativePath);
        const changeType = entry ? 'modified' : 'added';

        changes.push({
          type: changeType,
          relativePath: s3Object.relativePath,
          s3Object,
          previousLastModified: entry?.lastModified ?? null,
        });
      }
    }

    // Detect deleted files (files in state but not in S3)
    if (this.config.deletedFilePolicy !== 'keep') {
      const trackedPaths = stateManager.getTrackedPaths();

      for (const trackedPath of trackedPaths) {
        if (!s3Paths.has(trackedPath)) {
          changes.push({
            type: 'deleted',
            relativePath: trackedPath,
            s3Object: null,
            previousLastModified: stateManager.getEntry(trackedPath)?.lastModified ?? null,
          });
        }
      }
    }

    this.logger.info(
      {
        added: changes.filter((c) => c.type === 'added').length,
        modified: changes.filter((c) => c.type === 'modified').length,
        deleted: changes.filter((c) => c.type === 'deleted').length,
      },
      'Change detection complete'
    );

    return changes;
  }

  /**
   * List all objects under the configured S3 prefix, handling pagination.
   */
  private async listAllObjects(): Promise<S3ObjectInfo[]> {
    const objects: S3ObjectInfo[] = [];
    let continuationToken: string | undefined;
    let pageCount = 0;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: this.config.s3Prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          const info = this.toS3ObjectInfo(obj);
          if (info) {
            objects.push(info);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
      pageCount++;

      if (pageCount >= this.config.maxListPages) {
        this.logger.warn(
          { maxListPages: this.config.maxListPages, objectsSoFar: objects.length },
          'Reached maximum list pages limit'
        );
        break;
      }
    } while (continuationToken);

    return objects;
  }

  /**
   * Convert an S3 _Object to our S3ObjectInfo type.
   */
  private toS3ObjectInfo(obj: _Object): S3ObjectInfo | null {
    if (!obj.Key || !obj.LastModified) {
      return null;
    }

    const relativePath = this.stripPrefix(obj.Key);
    if (!relativePath) {
      return null;
    }

    return {
      key: obj.Key,
      relativePath,
      lastModified: obj.LastModified.getTime(),
      size: obj.Size ?? 0,
      etag: obj.ETag ?? '',
    };
  }

  /**
   * Strip the S3 prefix from a key to get the relative path.
   */
  private stripPrefix(key: string): string {
    if (!key.startsWith(this.config.s3Prefix)) {
      return '';
    }
    return key.slice(this.config.s3Prefix.length);
  }

  /**
   * Check if a relative path matches any exclude patterns.
   * Uses simple glob matching (supports * and **).
   */
  private isExcluded(relativePath: string): boolean {
    for (const pattern of this.config.excludePatterns) {
      if (this.matchGlob(relativePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching supporting * and ** patterns.
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    // Convert glob to regex
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');

    return new RegExp(`^${regexStr}$`).test(filePath);
  }
}
