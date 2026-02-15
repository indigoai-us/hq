/**
 * Initial Sync
 *
 * Provisions S3 space for a user and uploads their local HQ files
 * during onboarding. Uses file-sync's S3BucketManager and upload handler.
 */

import fs from 'node:fs';
import nodePath from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { S3BucketManager, createUploadHandler } from '@hq-cloud/file-sync';
import type { FileEvent, UploadProgressCallback } from '@hq-cloud/file-sync';

// Use FastifyBaseLogger for compatibility with Fastify's logger
type Logger = FastifyBaseLogger;

/** Directories to skip during recursive walk */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.DS_Store']);

/** File/dir names starting with these are skipped */
function shouldSkip(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

export interface ProvisionResult {
  s3Prefix: string;
  totalFiles: number;
}

export interface ProvisionAndSyncResult {
  s3Prefix: string;
  filesUploaded: number;
  errors: number;
}

/**
 * Walk a local directory recursively and collect FileEvent[] for upload.
 */
export function walkDirectory(rootDir: string): FileEvent[] {
  const events: FileEvent[] = [];
  const root = nodePath.resolve(rootDir);

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldSkip(entry.name)) continue;

      const absolutePath = nodePath.join(dir, entry.name);
      const relativePath = nodePath.relative(root, absolutePath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile()) {
        events.push({
          type: 'add',
          absolutePath,
          relativePath,
          timestamp: Date.now(),
        });
      }
    }
  }

  walk(root);
  return events;
}

/**
 * Provision S3 space and scan local directory (fast, no upload).
 * Used by the setup endpoint to return totalFiles quickly.
 */
export async function provisionS3Space(options: {
  userId: string;
  hqDir: string;
  bucketName: string;
  region: string;
  logger: Logger;
}): Promise<ProvisionResult> {
  const { userId, hqDir, bucketName, region, logger } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bucketManager = new S3BucketManager(logger as any, { bucketName, region });
  const userPath = await bucketManager.provisionUserSpace(userId);
  const s3Prefix = userPath.prefix;

  logger.info({ userId, s3Prefix, hqDir }, 'S3 space provisioned');

  const events = walkDirectory(hqDir);
  logger.info({ fileCount: events.length }, 'Scanned local files');

  return { s3Prefix, totalFiles: events.length };
}

/**
 * Upload local HQ files to S3 with per-file progress callback.
 * Used by the SSE sync endpoint.
 */
export async function uploadWithProgress(options: {
  userId: string;
  hqDir: string;
  bucketName: string;
  region: string;
  logger: Logger;
  onProgress: UploadProgressCallback;
}): Promise<ProvisionAndSyncResult> {
  const { userId, hqDir, bucketName, region, logger, onProgress } = options;

  const events = walkDirectory(hqDir);

  if (events.length === 0) {
    return { s3Prefix: `${userId}/hq`, filesUploaded: 0, errors: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = createUploadHandler({
    bucketName,
    region,
    userId,
    logger: logger as any,
    onProgress,
  });

  const results = await handler(events);
  const filesUploaded = results.filter((r) => r.success).length;
  const errors = results.filter((r) => !r.success).length;

  if (errors > 0) {
    const failedPaths = results.filter((r) => !r.success).map((r) => r.relativePath);
    logger.warn({ errors, failedPaths: failedPaths.slice(0, 10) }, 'Some files failed to upload');
  }

  logger.info({ filesUploaded, errors }, 'Upload with progress complete');
  return { s3Prefix: `${userId}/hq`, filesUploaded, errors };
}

/**
 * Provision S3 space for a user and upload all local HQ files (blocking).
 * Kept for backwards compatibility with tests.
 */
export async function provisionAndSync(options: {
  userId: string;
  hqDir: string;
  bucketName: string;
  region: string;
  logger: Logger;
}): Promise<ProvisionAndSyncResult> {
  const { userId, hqDir, bucketName, region, logger } = options;

  const { s3Prefix } = await provisionS3Space({ userId, hqDir, bucketName, region, logger });

  const events = walkDirectory(hqDir);

  if (events.length === 0) {
    return { s3Prefix, filesUploaded: 0, errors: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = createUploadHandler({
    bucketName,
    region,
    userId,
    logger: logger as any,
  });

  const results = await handler(events);
  const filesUploaded = results.filter((r) => r.success).length;
  const errors = results.filter((r) => !r.success).length;

  if (errors > 0) {
    const failedPaths = results.filter((r) => !r.success).map((r) => r.relativePath);
    logger.warn({ errors, failedPaths: failedPaths.slice(0, 10) }, 'Some files failed to upload');
  }

  logger.info({ filesUploaded, errors, s3Prefix }, 'Initial sync complete');
  return { s3Prefix, filesUploaded, errors };
}
