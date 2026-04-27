/**
 * S3 operations — upload, download, list, delete.
 *
 * VLT-5: All operations now accept an EntityContext (entity-aware bucket +
 * STS-scoped credentials) instead of reading static env config. The caller
 * is responsible for resolving the context via resolveEntityContext().
 */

import * as fs from "fs";
import * as path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { EntityContext } from "./types.js";

/**
 * Build an S3Client from an EntityContext's STS-scoped credentials.
 * A new client is created each time to ensure fresh credentials are used
 * (the caller handles caching/refresh at the EntityContext level).
 */
function buildClient(ctx: EntityContext): S3Client {
  return new S3Client({
    region: ctx.region,
    credentials: {
      accessKeyId: ctx.credentials.accessKeyId,
      secretAccessKey: ctx.credentials.secretAccessKey,
      sessionToken: ctx.credentials.sessionToken,
    },
  });
}

/**
 * Result of a successful upload.
 *
 * `versionId` is the opaque S3 VersionId of the new object. It's `null` when
 * the bucket has versioning disabled (S3 returns the literal string "null" in
 * that case; we surface it as JS `null` so callers can distinguish "we know
 * there's no version" from "the field wasn't returned"). Callers stamp this
 * into the journal as the parent pointer for the next push.
 */
export interface UploadResult {
  versionId: string | null;
}

/**
 * Optional knobs for `uploadFile`. `ifMatch` is the optimistic-concurrency
 * primitive: when set, S3 atomically rejects the PUT (412 Precondition
 * Failed) if the cloud's current VersionId differs from the supplied value.
 * That's how we detect divergence on the push side without a separate HEAD
 * race window.
 */
export interface UploadOptions {
  ifMatch?: string;
}

export async function uploadFile(
  ctx: EntityContext,
  localPath: string,
  key: string,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const client = buildClient(ctx);
  const body = fs.readFileSync(localPath);

  const response = await client.send(
    new PutObjectCommand({
      Bucket: ctx.bucketName,
      Key: key,
      Body: body,
      ContentType: getMimeType(key),
      // Only include IfMatch when caller provides one — undefined and the
      // header is omitted, preserving the unconditional-PUT path for
      // brand-new files (no journal entry → no parent pointer).
      ...(options.ifMatch !== undefined ? { IfMatch: options.ifMatch } : {}),
    }),
  );

  return { versionId: normalizeVersionId(response.VersionId) };
}

/**
 * Result of a successful download. `versionId` is the cloud's VersionId of
 * the bytes the caller just wrote to disk — pull stamps this into the
 * journal as the new parent pointer.
 */
export interface DownloadResult {
  versionId: string | null;
}

export async function downloadFile(
  ctx: EntityContext,
  key: string,
  localPath: string,
): Promise<DownloadResult> {
  const client = buildClient(ctx);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: ctx.bucketName,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`Empty response for ${key}`);
  }

  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const chunks: Buffer[] = [];
  const stream = response.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  fs.writeFileSync(localPath, Buffer.concat(chunks));

  return { versionId: normalizeVersionId(response.VersionId) };
}

/**
 * Fetch a key's bytes without writing to disk. Used by the conflict path:
 * when divergence is detected, we want the cloud's bytes in memory so we
 * can write them to a `.conflict-` file next to the original. Going through
 * the disk-writing `downloadFile` would require a tmp file dance.
 */
export async function downloadFileBytes(
  ctx: EntityContext,
  key: string,
): Promise<{ bytes: Buffer; versionId: string | null }> {
  const client = buildClient(ctx);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: ctx.bucketName,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`Empty response for ${key}`);
  }

  const chunks: Buffer[] = [];
  const stream = response.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return {
    bytes: Buffer.concat(chunks),
    versionId: normalizeVersionId(response.VersionId),
  };
}

export interface RemoteFile {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

export async function listRemoteFiles(
  ctx: EntityContext,
  prefix?: string,
): Promise<RemoteFile[]> {
  const client = buildClient(ctx);
  const files: RemoteFile[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: ctx.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents || []) {
      if (!obj.Key || !obj.Size) continue;

      files.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag || "",
      });
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files;
}

export async function deleteRemoteFile(
  ctx: EntityContext,
  key: string,
): Promise<void> {
  const client = buildClient(ctx);

  await client.send(
    new DeleteObjectCommand({
      Bucket: ctx.bucketName,
      Key: key,
    }),
  );
}

/**
 * Check if a remote key exists and return its metadata.
 *
 * Includes `versionId` so callers can compare against the journal's
 * `s3VersionId` for divergence detection without a separate API call.
 */
export async function headRemoteFile(
  ctx: EntityContext,
  key: string,
): Promise<{
  lastModified: Date;
  etag: string;
  size: number;
  versionId: string | null;
} | null> {
  const client = buildClient(ctx);
  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: ctx.bucketName,
        Key: key,
      }),
    );
    return {
      lastModified: response.LastModified || new Date(),
      etag: response.ETag || "",
      size: response.ContentLength || 0,
      versionId: normalizeVersionId(response.VersionId),
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "NotFound") {
      return null;
    }
    throw err;
  }
}

/**
 * List recent VersionIds for a key, newest first.
 *
 * Capped at `maxVersions` (default 100). The cap matters for two reasons:
 *   1. ListObjectVersions paginates, and the entire bucket's history could
 *      be huge — we never need more than the recent chain.
 *   2. If our last-known VersionId isn't in the most recent N, the file has
 *      effectively diverged in ancient history and treating it as a conflict
 *      is the safe choice (no realistic fast-forward beyond N versions ago).
 *
 * Returns just the IDs (string[]) — callers only need them for chain-membership
 * checks, not the full version metadata.
 */
export async function listObjectVersions(
  ctx: EntityContext,
  key: string,
  maxVersions = 100,
): Promise<string[]> {
  const client = buildClient(ctx);
  const versions: string[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  while (versions.length < maxVersions) {
    const response = await client.send(
      new ListObjectVersionsCommand({
        Bucket: ctx.bucketName,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
        MaxKeys: Math.min(maxVersions - versions.length, 1000),
      }),
    );

    for (const v of response.Versions || []) {
      // Prefix is a starts-with filter, so a key like "notes.md" would
      // also match "notes.md.backup". Filter to exact key matches only.
      if (v.Key !== key) continue;
      if (!v.VersionId) continue;
      versions.push(v.VersionId);
      if (versions.length >= maxVersions) break;
    }

    if (!response.IsTruncated) break;
    keyMarker = response.NextKeyMarker;
    versionIdMarker = response.NextVersionIdMarker;
  }

  return versions;
}

/**
 * Did this error come from a failed `If-Match` precondition (HTTP 412)?
 *
 * AWS SDK v3 surfaces this as `name: "PreconditionFailed"` with
 * `$metadata.httpStatusCode === 412`. Either signal is sufficient; we check
 * both to be robust against SDK error-shape changes.
 */
export function isPreconditionFailed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (e.name === "PreconditionFailed") return true;
  if (e.$metadata?.httpStatusCode === 412) return true;
  return false;
}

/**
 * S3 returns the literal string "null" for objects in buckets where
 * versioning is disabled (or was disabled when the object was put). We
 * surface that as JS `null` to keep the TS type honest — `s3VersionId === "null"`
 * would otherwise be a footgun across the journal.
 */
function normalizeVersionId(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw === "null") return null;
  return raw;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".md": "text/markdown",
    ".json": "application/json",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".ts": "text/typescript",
    ".js": "text/javascript",
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
