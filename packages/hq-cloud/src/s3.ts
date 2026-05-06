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
 * Author identity stamped onto S3 user-defined metadata at upload time. The
 * vault UI's "CREATED BY" column reads `Metadata['created-by']` back via
 * HEAD; uploads without an author leave that column blank.
 */
export interface UploadAuthor {
  /** Cognito sub — stable join key for per-member rollups. */
  userSub: string;
  /** Email for human display. */
  email: string;
}

/**
 * S3 user metadata is ASCII-only (lowercased on read, capped at 2 KB total).
 * Values that fail the printable-ASCII test or would push the keys over the
 * cap are elided rather than throwing — partial attribution beats none. The
 * shape mirrors `hq-console/src/lib/s3-vault.ts buildAuthorMetadata` so the
 * read path on the consumer side stays a single check against
 * `Metadata['created-by']`.
 */
function buildAuthorMetadata(
  author: UploadAuthor,
  createdAt: string,
): Record<string, string> {
  const meta: Record<string, string> = {};
  const sub = author.userSub.trim();
  if (sub && /^[\x20-\x7E]+$/.test(sub)) {
    meta["created-by-sub"] = sub;
  }
  const email = author.email.trim();
  if (email && /^[\x20-\x7E]+$/.test(email)) {
    meta["created-by"] = email;
  }
  if (createdAt && /^[\x20-\x7E]+$/.test(createdAt)) {
    meta["created-at"] = createdAt;
  }
  return meta;
}

export async function uploadFile(
  ctx: EntityContext,
  localPath: string,
  key: string,
  author?: UploadAuthor,
): Promise<{ etag: string }> {
  const client = buildClient(ctx);
  const body = fs.readFileSync(localPath);

  // Preserve the original `created-at` across re-uploads when the object
  // already exists with author metadata — same convention the hq-console
  // upload route uses, so the NEW-pill ageing window doesn't reset on every
  // sync tick. HEAD failure (NoSuchKey, perm, transient 5xx) falls through
  // to "now", which is correct for a first upload.
  let createdAt = new Date().toISOString();
  if (author) {
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: ctx.bucketName, Key: key }),
      );
      const existing = head.Metadata?.["created-at"];
      if (typeof existing === "string" && existing.length > 0) {
        createdAt = existing;
      }
    } catch {
      // Object doesn't exist yet, or HEAD denied — keep `now`.
    }
  }

  const Metadata = author ? buildAuthorMetadata(author, createdAt) : undefined;

  const response = await client.send(
    new PutObjectCommand({
      Bucket: ctx.bucketName,
      Key: key,
      Body: body,
      ContentType: getMimeType(key),
      ...(Metadata && Object.keys(Metadata).length > 0 ? { Metadata } : {}),
    }),
  );

  return { etag: response.ETag || "" };
}

export async function downloadFile(
  ctx: EntityContext,
  key: string,
  localPath: string,
): Promise<void> {
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
 */
export async function headRemoteFile(
  ctx: EntityContext,
  key: string,
): Promise<{ lastModified: Date; etag: string; size: number } | null> {
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
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "NotFound") {
      return null;
    }
    throw err;
  }
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
