/**
 * S3 uploader with batching, concurrency control, and progress reporting.
 *
 * Uses AWS SDK v3 PutObjectCommand for small files and
 * @aws-sdk/lib-storage Upload for multipart uploads.
 * Attaches SyncObjectMetadata to every uploaded object.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as fs from 'node:fs';
import type { Logger } from 'pino';
import type { FileEvent, FileSyncResult } from '../daemon/types.js';
import type {
  UploadConfig,
  UploadResult,
  FileUploadProgress,
  BatchUploadProgress,
  UploadProgressCallback,
} from './types.js';
import { hashFile } from './file-hasher.js';

/**
 * Manages uploading changed files to S3 with metadata, batching,
 * and progress reporting.
 */
export class S3Uploader {
  private readonly client: S3Client;
  private readonly config: UploadConfig;
  private readonly logger: Logger;

  constructor(config: UploadConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 's3-uploader' });

    this.client = new S3Client({
      region: this.config.region,
    });
  }

  /**
   * Upload a batch of file events to S3.
   *
   * Handles add/change events by uploading files, and
   * unlink events by deleting the corresponding S3 object.
   * Directory events (addDir/unlinkDir) are handled as marker objects.
   *
   * @param events - File events to process
   * @param onProgress - Optional callback for progress updates
   * @returns Array of FileSyncResult compatible with the SyncHandler interface
   */
  async uploadBatch(
    events: FileEvent[],
    onProgress?: UploadProgressCallback
  ): Promise<FileSyncResult[]> {
    const progress: BatchUploadProgress = {
      totalFiles: events.length,
      completedFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      totalBytes: 0,
      bytesUploaded: 0,
      files: events.map((e) => ({
        relativePath: e.relativePath,
        status: 'pending',
        sizeBytes: 0,
        bytesUploaded: 0,
        skippedDeduplicate: false,
        eventType: e.type,
      })),
    };

    this.logger.info(
      { batchSize: events.length },
      'Starting batch upload'
    );

    // Process events with concurrency control
    const results = await this.processWithConcurrency(
      events,
      progress,
      onProgress
    );

    this.logger.info(
      {
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        skipped: results.filter((r) => r.skipped).length,
      },
      'Batch upload complete'
    );

    // Convert UploadResult[] to FileSyncResult[] for SyncHandler compatibility
    return results.map((r) => ({
      relativePath: r.relativePath,
      success: r.success,
      error: r.error,
      eventType: r.eventType,
    }));
  }

  /**
   * Process events with concurrency limiting.
   * Runs up to maxConcurrentUploads operations in parallel.
   */
  private async processWithConcurrency(
    events: FileEvent[],
    progress: BatchUploadProgress,
    onProgress?: UploadProgressCallback
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    const queue = [...events];
    const inflight: Promise<void>[] = [];

    const processNext = async (): Promise<void> => {
      const event = queue.shift();
      if (!event) return;

      const result = await this.processEvent(event, progress, onProgress);
      results.push(result);

      // Update aggregate progress
      const fileProgress = progress.files.find(
        (f) => f.relativePath === event.relativePath
      );
      if (fileProgress) {
        if (result.success) {
          if (result.skipped) {
            progress.skippedFiles++;
            fileProgress.status = 'skipped';
            fileProgress.skippedDeduplicate = true;
          } else {
            fileProgress.status = 'completed';
          }
          progress.completedFiles++;
        } else {
          progress.failedFiles++;
          fileProgress.status = 'failed';
          fileProgress.error = result.error;
        }
        fileProgress.bytesUploaded = result.sizeBytes;
        progress.bytesUploaded += result.sizeBytes;
      }

      onProgress?.(progress);

      // Process next item in queue
      if (queue.length > 0) {
        await processNext();
      }
    };

    // Start initial batch of concurrent operations
    const concurrency = Math.min(
      this.config.maxConcurrentUploads,
      events.length
    );

    for (let i = 0; i < concurrency; i++) {
      inflight.push(processNext());
    }

    await Promise.all(inflight);

    return results;
  }

  /**
   * Process a single file event: hash, then upload or delete.
   */
  private async processEvent(
    event: FileEvent,
    progress: BatchUploadProgress,
    onProgress?: UploadProgressCallback
  ): Promise<UploadResult> {
    const startTime = Date.now();
    const s3Key = this.buildS3Key(event.relativePath);

    try {
      switch (event.type) {
        case 'unlink':
          return await this.handleDelete(event, s3Key, startTime);

        case 'unlinkDir':
          return await this.handleDeleteDirectory(event, s3Key, startTime);

        case 'addDir':
          return await this.handleAddDirectory(event, s3Key, startTime);

        case 'add':
        case 'change':
          return await this.handleFileUpload(
            event,
            s3Key,
            progress,
            onProgress,
            startTime
          );

        default:
          return {
            relativePath: event.relativePath,
            success: false,
            sizeBytes: 0,
            skipped: false,
            error: `Unknown event type: ${event.type as string}`,
            eventType: event.type,
            durationMs: Date.now() - startTime,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { path: event.relativePath, error: message },
        'Failed to process event'
      );
      return {
        relativePath: event.relativePath,
        success: false,
        sizeBytes: 0,
        skipped: false,
        error: message,
        eventType: event.type,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle add/change events: hash the file, then upload to S3.
   */
  private async handleFileUpload(
    event: FileEvent,
    s3Key: string,
    progress: BatchUploadProgress,
    onProgress?: UploadProgressCallback,
    startTime: number = Date.now()
  ): Promise<UploadResult> {
    // Verify file still exists (may have been deleted between event and processing)
    if (!fs.existsSync(event.absolutePath)) {
      this.logger.debug(
        { path: event.relativePath },
        'File no longer exists, skipping upload'
      );
      return {
        relativePath: event.relativePath,
        success: true,
        sizeBytes: 0,
        skipped: true,
        eventType: event.type,
        durationMs: Date.now() - startTime,
      };
    }

    // Update status to hashing
    const fileProgress = progress.files.find(
      (f) => f.relativePath === event.relativePath
    );
    if (fileProgress) {
      fileProgress.status = 'hashing';
      onProgress?.(progress);
    }

    // Compute file hash
    const hashResult = await hashFile(
      event.absolutePath,
      this.config.hashAlgorithm
    );

    if (fileProgress) {
      fileProgress.contentHash = hashResult.hash;
      fileProgress.sizeBytes = hashResult.sizeBytes;
      progress.totalBytes += hashResult.sizeBytes;
    }

    this.logger.debug(
      {
        path: event.relativePath,
        hash: hashResult.hash,
        size: hashResult.sizeBytes,
      },
      'File hashed'
    );

    // Update status to uploading
    if (fileProgress) {
      fileProgress.status = 'uploading';
      onProgress?.(progress);
    }

    // Build metadata
    const metadata: Record<string, string> = {
      'content-hash': hashResult.hash,
      'hash-algorithm': hashResult.algorithm,
      'local-path': event.relativePath,
      'last-modified-local': new Date(event.timestamp).toISOString(),
      'uploaded-by': this.config.userId,
      'sync-agent-version': this.config.syncAgentVersion,
      'file-size': String(hashResult.sizeBytes),
    };

    // Choose upload method based on file size
    let versionId: string | undefined;

    if (hashResult.sizeBytes > this.config.multipartThresholdBytes) {
      versionId = await this.multipartUpload(
        event.absolutePath,
        s3Key,
        metadata,
        hashResult.sizeBytes,
        fileProgress,
        progress,
        onProgress
      );
    } else {
      versionId = await this.simpleUpload(
        event.absolutePath,
        s3Key,
        metadata
      );
    }

    this.logger.info(
      {
        path: event.relativePath,
        s3Key,
        size: hashResult.sizeBytes,
        hash: hashResult.hash,
        versionId,
      },
      'File uploaded'
    );

    return {
      relativePath: event.relativePath,
      success: true,
      s3Key,
      s3VersionId: versionId,
      contentHash: hashResult.hash,
      sizeBytes: hashResult.sizeBytes,
      skipped: false,
      eventType: event.type,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Simple PutObject upload for files below the multipart threshold.
   */
  private async simpleUpload(
    filePath: string,
    s3Key: string,
    metadata: Record<string, string>
  ): Promise<string | undefined> {
    const body = fs.readFileSync(filePath);

    const response = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: s3Key,
        Body: body,
        Metadata: metadata,
        ContentType: this.inferContentType(s3Key),
      })
    );

    return response.VersionId;
  }

  /**
   * Multipart upload for large files using @aws-sdk/lib-storage.
   * Reports per-part progress.
   */
  private async multipartUpload(
    filePath: string,
    s3Key: string,
    metadata: Record<string, string>,
    totalSize: number,
    fileProgress: FileUploadProgress | undefined,
    batchProgress: BatchUploadProgress,
    onProgress?: UploadProgressCallback
  ): Promise<string | undefined> {
    const stream = fs.createReadStream(filePath);

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucketName,
        Key: s3Key,
        Body: stream,
        Metadata: metadata,
        ContentType: this.inferContentType(s3Key),
      },
      queueSize: 4,
      partSize: this.config.multipartPartSizeBytes,
      leavePartsOnError: false,
    });

    upload.on('httpUploadProgress', (progressEvent) => {
      if (fileProgress && progressEvent.loaded !== undefined) {
        const previousUploaded = fileProgress.bytesUploaded;
        fileProgress.bytesUploaded = Math.min(progressEvent.loaded, totalSize);
        batchProgress.bytesUploaded += fileProgress.bytesUploaded - previousUploaded;
        onProgress?.(batchProgress);
      }
    });

    const result = await upload.done();
    return result.VersionId;
  }

  /**
   * Handle file deletion: remove the corresponding S3 object.
   */
  private async handleDelete(
    event: FileEvent,
    s3Key: string,
    startTime: number
  ): Promise<UploadResult> {
    this.logger.debug(
      { path: event.relativePath, s3Key },
      'Deleting S3 object'
    );

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: s3Key,
      })
    );

    return {
      relativePath: event.relativePath,
      success: true,
      s3Key,
      sizeBytes: 0,
      skipped: false,
      eventType: event.type,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Handle directory deletion: remove the directory marker from S3.
   */
  private async handleDeleteDirectory(
    event: FileEvent,
    s3Key: string,
    startTime: number
  ): Promise<UploadResult> {
    const dirKey = s3Key.endsWith('/') ? s3Key : `${s3Key}/`;

    this.logger.debug(
      { path: event.relativePath, s3Key: dirKey },
      'Deleting S3 directory marker'
    );

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: dirKey,
      })
    );

    return {
      relativePath: event.relativePath,
      success: true,
      s3Key: dirKey,
      sizeBytes: 0,
      skipped: false,
      eventType: event.type,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Handle directory creation: create a marker object in S3.
   */
  private async handleAddDirectory(
    event: FileEvent,
    s3Key: string,
    startTime: number
  ): Promise<UploadResult> {
    const dirKey = s3Key.endsWith('/') ? s3Key : `${s3Key}/`;

    this.logger.debug(
      { path: event.relativePath, s3Key: dirKey },
      'Creating S3 directory marker'
    );

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: dirKey,
        Body: '',
        ContentType: 'application/x-directory',
        Metadata: {
          'local-path': event.relativePath,
          'uploaded-by': this.config.userId,
          'sync-agent-version': this.config.syncAgentVersion,
        },
      })
    );

    return {
      relativePath: event.relativePath,
      success: true,
      s3Key: dirKey,
      sizeBytes: 0,
      skipped: false,
      eventType: event.type,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Build the S3 key for a file based on user ID and relative path.
   * Normalizes path separators for S3 compatibility.
   */
  private buildS3Key(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${this.config.userId}/hq/${normalized}`;
  }

  /**
   * Infer content type from file extension.
   * Falls back to application/octet-stream for unknown types.
   */
  private inferContentType(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();

    const contentTypes: Record<string, string> = {
      'json': 'application/json',
      'yaml': 'application/x-yaml',
      'yml': 'application/x-yaml',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'ts': 'text/typescript',
      'js': 'application/javascript',
      'html': 'text/html',
      'css': 'text/css',
      'xml': 'application/xml',
      'csv': 'text/csv',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      'gz': 'application/gzip',
      'tar': 'application/x-tar',
    };

    return (ext && contentTypes[ext]) ?? 'application/octet-stream';
  }
}
