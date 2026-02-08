/**
 * File downloader for S3 objects.
 *
 * Downloads files from S3 to the local filesystem, preserving
 * timestamps using utimes. Handles concurrent downloads with
 * configurable parallelism.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { Logger } from 'pino';
import type {
  DownloadSyncConfig,
  DetectedChange,
  DownloadResult,
  DeletedFilePolicy,
} from './types.js';
import type { SyncStateManager } from './sync-state.js';

/**
 * Downloads files from S3 and applies changes to the local filesystem.
 *
 * Supports:
 * - Downloading new/updated files
 * - Preserving S3 LastModified as local mtime via utimes
 * - Configurable handling of deleted files (delete, keep, trash)
 * - Concurrent downloads with bounded parallelism
 */
export class FileDownloader {
  private readonly client: S3Client;
  private readonly config: DownloadSyncConfig;
  private readonly logger: Logger;

  constructor(client: S3Client, config: DownloadSyncConfig, logger: Logger) {
    this.client = client;
    this.config = config;
    this.logger = logger.child({ component: 'file-downloader' });
  }

  /**
   * Process a batch of detected changes, downloading/deleting as needed.
   *
   * Respects maxConcurrentDownloads by processing in bounded batches.
   */
  async processChanges(
    changes: DetectedChange[],
    stateManager: SyncStateManager
  ): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];

    // Split changes by type for ordered processing
    const downloads = changes.filter((c) => c.type === 'added' || c.type === 'modified');
    const deletions = changes.filter((c) => c.type === 'deleted');

    // Process downloads with concurrency limit
    for (let i = 0; i < downloads.length; i += this.config.maxConcurrentDownloads) {
      const batch = downloads.slice(i, i + this.config.maxConcurrentDownloads);
      const batchResults = await Promise.all(
        batch.map((change) => this.downloadFile(change, stateManager))
      );
      results.push(...batchResults);
    }

    // Process deletions sequentially (usually fast, no I/O to S3)
    for (const change of deletions) {
      const result = this.handleDeletion(change, stateManager);
      results.push(result);
    }

    return results;
  }

  /**
   * Download a single file from S3 to the local filesystem.
   */
  private async downloadFile(
    change: DetectedChange,
    stateManager: SyncStateManager
  ): Promise<DownloadResult> {
    const startTime = Date.now();
    const { relativePath, s3Object } = change;

    if (!s3Object) {
      return {
        relativePath,
        success: false,
        changeType: change.type,
        bytesDownloaded: 0,
        durationMs: Date.now() - startTime,
        error: 'No S3 object info available',
      };
    }

    const localPath = path.join(this.config.localDir, relativePath);

    try {
      // Ensure parent directory exists
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Download from S3
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucketName,
          Key: s3Object.key,
        })
      );

      if (!response.Body) {
        return {
          relativePath,
          success: false,
          changeType: change.type,
          bytesDownloaded: 0,
          durationMs: Date.now() - startTime,
          error: 'S3 response body is empty',
        };
      }

      // Write to local filesystem
      const bodyStream =
        response.Body instanceof Readable
          ? response.Body
          : Readable.from(response.Body.transformToByteArray() as unknown as Iterable<Uint8Array>);

      const writeStream = fs.createWriteStream(localPath);
      await pipeline(bodyStream, writeStream);

      // Preserve timestamps if configured
      if (this.config.preserveTimestamps) {
        const mtime = new Date(s3Object.lastModified);
        fs.utimesSync(localPath, mtime, mtime);
      }

      // Update sync state
      stateManager.updateEntry(s3Object);

      this.logger.debug(
        { relativePath, size: s3Object.size, changeType: change.type },
        'File downloaded'
      );

      return {
        relativePath,
        success: true,
        changeType: change.type,
        bytesDownloaded: s3Object.size,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { relativePath, error: message },
        'Failed to download file'
      );

      return {
        relativePath,
        success: false,
        changeType: change.type,
        bytesDownloaded: 0,
        durationMs: Date.now() - startTime,
        error: message,
      };
    }
  }

  /**
   * Handle a deleted file based on the configured deletion policy.
   */
  private handleDeletion(
    change: DetectedChange,
    stateManager: SyncStateManager
  ): DownloadResult {
    const startTime = Date.now();
    const { relativePath } = change;
    const localPath = path.join(this.config.localDir, relativePath);

    try {
      this.applyDeletionPolicy(localPath, relativePath, this.config.deletedFilePolicy);

      // Remove from sync state
      stateManager.removeEntry(relativePath);

      this.logger.debug(
        { relativePath, policy: this.config.deletedFilePolicy },
        'Handled file deletion'
      );

      return {
        relativePath,
        success: true,
        changeType: 'deleted',
        bytesDownloaded: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { relativePath, error: message },
        'Failed to handle file deletion'
      );

      return {
        relativePath,
        success: false,
        changeType: 'deleted',
        bytesDownloaded: 0,
        durationMs: Date.now() - startTime,
        error: message,
      };
    }
  }

  /**
   * Apply the configured deletion policy to a local file.
   */
  private applyDeletionPolicy(
    localPath: string,
    relativePath: string,
    policy: DeletedFilePolicy
  ): void {
    if (!fs.existsSync(localPath)) {
      // File already doesn't exist locally, nothing to do
      return;
    }

    switch (policy) {
      case 'delete':
        fs.unlinkSync(localPath);
        break;

      case 'trash': {
        const trashPath = path.join(this.config.trashDir, relativePath);
        const trashDir = path.dirname(trashPath);

        if (!fs.existsSync(trashDir)) {
          fs.mkdirSync(trashDir, { recursive: true });
        }

        fs.renameSync(localPath, trashPath);
        break;
      }

      case 'keep':
        // Intentionally do nothing - file is kept locally
        break;
    }
  }
}
