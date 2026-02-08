/**
 * SyncHandler-compatible upload handler.
 *
 * Bridges the SyncDaemon's SyncHandler interface with the S3Uploader,
 * providing a plug-and-play integration point.
 */

import type { Logger } from 'pino';
import type { SyncHandler } from '../daemon/sync-daemon.js';
import type { UploadConfig, UploadProgressCallback } from './types.js';
import { DEFAULT_UPLOAD_CONFIG } from './types.js';
import { S3Uploader } from './s3-uploader.js';

/** Options for building the upload handler */
export interface UploadHandlerOptions {
  /** S3 bucket name */
  bucketName: string;
  /** AWS region */
  region: string;
  /** User identifier */
  userId: string;
  /** Logger instance */
  logger: Logger;
  /** Optional progress callback */
  onProgress?: UploadProgressCallback;
  /** Optional config overrides */
  config?: Partial<Omit<UploadConfig, 'bucketName' | 'region' | 'userId'>>;
}

/**
 * Build the full UploadConfig from options, applying defaults.
 */
export function buildUploadConfig(
  options: UploadHandlerOptions
): UploadConfig {
  return {
    bucketName: options.bucketName,
    region: options.region,
    userId: options.userId,
    hashAlgorithm: options.config?.hashAlgorithm ?? DEFAULT_UPLOAD_CONFIG.hashAlgorithm,
    maxConcurrentUploads: options.config?.maxConcurrentUploads ?? DEFAULT_UPLOAD_CONFIG.maxConcurrentUploads,
    multipartThresholdBytes: options.config?.multipartThresholdBytes ?? DEFAULT_UPLOAD_CONFIG.multipartThresholdBytes,
    multipartPartSizeBytes: options.config?.multipartPartSizeBytes ?? DEFAULT_UPLOAD_CONFIG.multipartPartSizeBytes,
    syncAgentVersion: options.config?.syncAgentVersion ?? DEFAULT_UPLOAD_CONFIG.syncAgentVersion,
    deduplicateByHash: options.config?.deduplicateByHash ?? DEFAULT_UPLOAD_CONFIG.deduplicateByHash,
  };
}

/**
 * Create a SyncHandler that uploads file events to S3.
 *
 * This is the primary integration point: pass the returned handler
 * to the SyncDaemon constructor.
 *
 * @example
 * ```ts
 * const handler = createUploadHandler({
 *   bucketName: 'hq-cloud-files-prod',
 *   region: 'us-east-1',
 *   userId: 'user-123',
 *   logger: pino(),
 *   onProgress: (progress) => console.log(progress),
 * });
 *
 * const daemon = new SyncDaemon(config, handler);
 * ```
 */
export function createUploadHandler(
  options: UploadHandlerOptions
): SyncHandler {
  const config = buildUploadConfig(options);
  const uploader = new S3Uploader(config, options.logger);

  const handler: SyncHandler = (events) => {
    return uploader.uploadBatch(events, options.onProgress);
  };

  return handler;
}
