/**
 * Types for the upload module.
 *
 * Handles file hashing, S3 upload with metadata, batching,
 * and progress reporting.
 */

import type { FileEventType } from '../daemon/types.js';

/** Hash algorithm used for content-addressable deduplication */
export type HashAlgorithm = 'sha256' | 'md5';

/** Result of hashing a file */
export interface FileHashResult {
  /** The computed hash as a hex string */
  hash: string;
  /** Algorithm used */
  algorithm: HashAlgorithm;
  /** File size in bytes */
  sizeBytes: number;
}

/** Configuration for the S3 upload handler */
export interface UploadConfig {
  /** S3 bucket name */
  bucketName: string;
  /** AWS region */
  region: string;
  /** User identifier for S3 path prefixing */
  userId: string;
  /** Hash algorithm to use for content deduplication (default: sha256) */
  hashAlgorithm: HashAlgorithm;
  /** Maximum concurrent S3 upload operations (default: 5) */
  maxConcurrentUploads: number;
  /** Multipart upload threshold in bytes (default: 5MB) */
  multipartThresholdBytes: number;
  /** Multipart upload part size in bytes (default: 5MB) */
  multipartPartSizeBytes: number;
  /** Sync agent version string for metadata */
  syncAgentVersion: string;
  /** Whether to skip upload if remote hash matches local hash (default: true) */
  deduplicateByHash: boolean;
}

/** Default upload configuration values */
export const DEFAULT_UPLOAD_CONFIG: Omit<UploadConfig, 'bucketName' | 'region' | 'userId'> = {
  hashAlgorithm: 'sha256',
  maxConcurrentUploads: 5,
  multipartThresholdBytes: 5 * 1024 * 1024, // 5 MB
  multipartPartSizeBytes: 5 * 1024 * 1024,  // 5 MB
  syncAgentVersion: '0.1.0',
  deduplicateByHash: true,
};

/** Status of an individual file upload */
export type UploadStatus = 'pending' | 'hashing' | 'uploading' | 'skipped' | 'completed' | 'failed';

/** Progress information for a single file upload */
export interface FileUploadProgress {
  /** Relative path of the file */
  relativePath: string;
  /** Current upload status */
  status: UploadStatus;
  /** File size in bytes (0 for directory events or deleted files) */
  sizeBytes: number;
  /** Bytes uploaded so far */
  bytesUploaded: number;
  /** Content hash (populated after hashing phase) */
  contentHash?: string;
  /** Whether the upload was skipped due to deduplication */
  skippedDeduplicate: boolean;
  /** Error message if failed */
  error?: string;
  /** Event type that triggered this upload */
  eventType: FileEventType;
}

/** Aggregate progress for a batch of uploads */
export interface BatchUploadProgress {
  /** Total number of files in the batch */
  totalFiles: number;
  /** Number of files completed (success + skipped) */
  completedFiles: number;
  /** Number of files failed */
  failedFiles: number;
  /** Number of files skipped (deduplication) */
  skippedFiles: number;
  /** Total bytes to upload */
  totalBytes: number;
  /** Total bytes uploaded so far */
  bytesUploaded: number;
  /** Individual file progress entries */
  files: FileUploadProgress[];
}

/** Callback type for progress updates */
export type UploadProgressCallback = (progress: BatchUploadProgress) => void;

/** Result of uploading a single file to S3 */
export interface UploadResult {
  /** Relative path of the file */
  relativePath: string;
  /** Whether the upload succeeded */
  success: boolean;
  /** S3 key where the file was uploaded */
  s3Key?: string;
  /** S3 version ID (if versioning enabled) */
  s3VersionId?: string;
  /** Content hash of the file */
  contentHash?: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Whether the upload was skipped (hash matched remote) */
  skipped: boolean;
  /** Error message if upload failed */
  error?: string;
  /** Event type that triggered the upload */
  eventType: FileEventType;
  /** Duration of the upload in milliseconds */
  durationMs: number;
}
