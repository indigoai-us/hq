/**
 * File Proxy Service
 *
 * Proxies file operations (upload, download, list, sync) through the API
 * to S3, so clients never need AWS credentials. All operations are scoped
 * to the authenticated user's S3 prefix: user_{clerkId}/hq/
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { _Object as S3Object } from '@aws-sdk/client-s3';
import { config } from '../config.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface FileListEntry {
  path: string;
  size: number;
  lastModified: string;
  etag: string;
}

export interface FileListResult {
  prefix: string;
  files: FileListEntry[];
  truncated: boolean;
  nextContinuationToken?: string;
}

export interface SyncManifestEntry {
  path: string;
  hash: string;
  size: number;
}

export interface SyncDiffResult {
  needsUpload: string[];
  needsDownload: string[];
  inSync: string[];
  remoteOnly: string[];
}

export interface StorageQuota {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
}

// ─── Constants ──────────────────────────────────────────────────────

/** Default per-user storage quota: 500 MB */
const DEFAULT_QUOTA_BYTES = 500 * 1024 * 1024;

/** Max keys per ListObjectsV2 request */
const MAX_LIST_KEYS = 1000;

// ─── S3 Client ──────────────────────────────────────────────────────

let _s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({ region: config.s3Region });
  }
  return _s3Client;
}

/** Reset S3 client (for testing) */
export function resetS3Client(): void {
  _s3Client = undefined;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Build the S3 key prefix for a user.
 * Convention: user_{clerkId}/hq/
 */
export function getUserPrefix(userId: string): string {
  const id = userId.startsWith('user_') ? userId : `user_${userId}`;
  return `${id}/hq/`;
}

/**
 * Build the full S3 key for a user's file.
 */
export function getUserFileKey(userId: string, relativePath: string): string {
  // Normalize: remove leading slashes, convert backslashes
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${getUserPrefix(userId)}${normalized}`;
}

/**
 * Validate that a relative path is safe (no directory traversal).
 */
export function validatePath(relativePath: string): { valid: boolean; error?: string } {
  if (!relativePath || typeof relativePath !== 'string') {
    return { valid: false, error: 'path is required' };
  }

  const normalized = relativePath.replace(/\\/g, '/');

  if (normalized.includes('..')) {
    return { valid: false, error: 'path must not contain ".."' };
  }

  if (normalized.startsWith('/')) {
    return { valid: false, error: 'path must be relative (no leading /)' };
  }

  if (normalized.length === 0) {
    return { valid: false, error: 'path must not be empty' };
  }

  if (normalized.length > 1024) {
    return { valid: false, error: 'path exceeds maximum length (1024 characters)' };
  }

  return { valid: true };
}

// ─── Operations ─────────────────────────────────────────────────────

/**
 * Upload a file to the user's S3 prefix.
 * Enforces per-user storage quota.
 */
export async function uploadFile(options: {
  userId: string;
  relativePath: string;
  body: Buffer | Uint8Array;
  contentType?: string;
  quotaBytes?: number;
}): Promise<{ key: string; size: number }> {
  const { userId, relativePath, body, contentType, quotaBytes = DEFAULT_QUOTA_BYTES } = options;

  const pathCheck = validatePath(relativePath);
  if (!pathCheck.valid) {
    throw new FileProxyError(400, pathCheck.error!);
  }

  // Check quota before upload
  const usage = await getStorageUsage(userId);
  if (usage + body.length > quotaBytes) {
    const quota = formatBytes(quotaBytes);
    const used = formatBytes(usage);
    throw new FileProxyError(
      413,
      `Storage quota exceeded. Used: ${used}, Limit: ${quota}, File size: ${formatBytes(body.length)}`
    );
  }

  const key = getUserFileKey(userId, relativePath);
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: config.s3BucketName,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      Metadata: {
        'uploaded-by': userId,
        'upload-timestamp': new Date().toISOString(),
      },
    })
  );

  return { key, size: body.length };
}

/**
 * Download a file from the user's S3 prefix.
 * Returns the file body as a readable stream and metadata.
 */
export async function downloadFile(options: {
  userId: string;
  relativePath: string;
}): Promise<{
  body: ReadableStream | NodeJS.ReadableStream;
  contentType: string;
  contentLength: number;
  lastModified: Date;
}> {
  const { userId, relativePath } = options;

  const pathCheck = validatePath(relativePath);
  if (!pathCheck.valid) {
    throw new FileProxyError(400, pathCheck.error!);
  }

  const key = getUserFileKey(userId, relativePath);
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.s3BucketName,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new FileProxyError(404, `File not found: ${relativePath}`);
    }

    return {
      body: response.Body as unknown as ReadableStream,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || 0,
      lastModified: response.LastModified || new Date(),
    };
  } catch (err) {
    if (err instanceof FileProxyError) throw err;
    const name = (err as { name?: string })?.name;
    if (name === 'NoSuchKey' || name === 'NotFound') {
      throw new FileProxyError(404, `File not found: ${relativePath}`);
    }
    throw err;
  }
}

/**
 * List files in the user's S3 prefix.
 */
export async function listFiles(options: {
  userId: string;
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}): Promise<FileListResult> {
  const { userId, prefix, maxKeys = MAX_LIST_KEYS, continuationToken } = options;

  let s3Prefix = getUserPrefix(userId);
  if (prefix) {
    const pathCheck = validatePath(prefix);
    if (!pathCheck.valid) {
      throw new FileProxyError(400, pathCheck.error!);
    }
    s3Prefix = getUserFileKey(userId, prefix);
    // Ensure prefix ends with / for directory listing
    if (!s3Prefix.endsWith('/')) {
      s3Prefix += '/';
    }
  }

  const client = getS3Client();
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: config.s3BucketName,
      Prefix: s3Prefix,
      MaxKeys: Math.min(maxKeys, MAX_LIST_KEYS),
      ContinuationToken: continuationToken,
    })
  );

  const userPrefixLen = getUserPrefix(userId).length;
  const files: FileListEntry[] = (response.Contents || [])
    .filter((obj: S3Object) => obj.Key && obj.Key !== s3Prefix)
    .map((obj: S3Object) => ({
      path: obj.Key!.substring(userPrefixLen),
      size: obj.Size || 0,
      lastModified: (obj.LastModified || new Date()).toISOString(),
      etag: (obj.ETag || '').replace(/"/g, ''),
    }));

  return {
    prefix: prefix || '',
    files,
    truncated: response.IsTruncated || false,
    nextContinuationToken: response.NextContinuationToken,
  };
}

/**
 * Compare a local file manifest against S3 and return the diff.
 * Clients send their local hashes; server checks what exists in S3.
 */
export async function syncDiff(options: {
  userId: string;
  manifest: SyncManifestEntry[];
}): Promise<SyncDiffResult> {
  const { userId, manifest } = options;

  if (!Array.isArray(manifest)) {
    throw new FileProxyError(400, 'manifest must be an array');
  }

  // Build a map of local files from manifest
  const localFiles = new Map<string, SyncManifestEntry>();
  for (const entry of manifest) {
    if (!entry.path || !entry.hash) {
      throw new FileProxyError(400, 'Each manifest entry must have path and hash');
    }
    const pathCheck = validatePath(entry.path);
    if (!pathCheck.valid) {
      throw new FileProxyError(400, `Invalid path "${entry.path}": ${pathCheck.error}`);
    }
    localFiles.set(entry.path, entry);
  }

  // List all files in user's S3 prefix
  const remoteFiles = new Map<string, { etag: string; size: number }>();
  let continuationToken: string | undefined;

  do {
    const result = await listFiles({ userId, continuationToken });
    for (const file of result.files) {
      remoteFiles.set(file.path, { etag: file.etag, size: file.size });
    }
    continuationToken = result.truncated ? result.nextContinuationToken : undefined;
  } while (continuationToken);

  const needsUpload: string[] = [];
  const needsDownload: string[] = [];
  const inSync: string[] = [];
  const remoteOnly: string[] = [];

  // Compare local manifest against remote
  for (const [path, entry] of localFiles) {
    const remote = remoteFiles.get(path);
    if (!remote) {
      // File exists locally but not remotely => needs upload
      needsUpload.push(path);
    } else if (remote.etag !== entry.hash) {
      // Hashes differ — needs upload (local wins for sync push)
      needsUpload.push(path);
    } else {
      inSync.push(path);
    }
    // Remove from remote map so we can find remote-only files
    remoteFiles.delete(path);
  }

  // Remaining remote files not in local manifest
  for (const path of remoteFiles.keys()) {
    remoteOnly.push(path);
    needsDownload.push(path);
  }

  return { needsUpload, needsDownload, inSync, remoteOnly };
}

/**
 * Get total storage used by a user (sum of all object sizes).
 */
export async function getStorageUsage(userId: string): Promise<number> {
  let totalBytes = 0;
  let continuationToken: string | undefined;

  do {
    const result = await listFiles({ userId, continuationToken });
    for (const file of result.files) {
      totalBytes += file.size;
    }
    continuationToken = result.truncated ? result.nextContinuationToken : undefined;
  } while (continuationToken);

  return totalBytes;
}

/**
 * Get storage quota information for a user.
 */
export async function getStorageQuota(
  userId: string,
  quotaBytes: number = DEFAULT_QUOTA_BYTES
): Promise<StorageQuota> {
  const usedBytes = await getStorageUsage(userId);
  return {
    usedBytes,
    limitBytes: quotaBytes,
    remainingBytes: Math.max(0, quotaBytes - usedBytes),
  };
}

// ─── Error Class ────────────────────────────────────────────────────

export class FileProxyError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'FileProxyError';
    this.statusCode = statusCode;
  }
}

// ─── Utilities ──────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
