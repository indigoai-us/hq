/**
 * s3.ts — S3 adapter for hq-cloud.
 *
 * Wraps @aws-sdk/client-s3 with simple put/get/list/headObject helpers.
 * Supports custom endpoints (Cloudflare R2, MinIO) via S3_ENDPOINT config.
 * All errors propagate — callers are responsible for non-fatal handling.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  type PutObjectCommandInput,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface S3Object {
  key: string;
  size: number;
  lastModified: Date;
}

// ─── Client singleton ─────────────────────────────────────────────────────────

function createClient(): S3Client {
  const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
    region: config.AWS_REGION,
  };

  if (config.S3_ENDPOINT) {
    clientConfig.endpoint = config.S3_ENDPOINT;
    // Force path-style addressing for R2/MinIO compatibility
    clientConfig.forcePathStyle = true;
  }

  return new S3Client(clientConfig);
}

let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_client) {
    _client = createClient();
  }
  return _client;
}

// Reset for testing
export function resetS3Client(): void {
  _client = null;
}

// ─── Helpers for stream → Buffer ──────────────────────────────────────────────

async function streamToBuffer(stream: NonNullable<GetObjectCommandOutput['Body']>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload data to S3.
 * @param key     Full S3 key (not including bucket)
 * @param body    Content as Buffer or string
 * @param contentType  Optional MIME type (defaults to application/octet-stream)
 */
export async function put(key: string, body: Buffer | string, contentType?: string): Promise<void> {
  const params: PutObjectCommandInput = {
    Bucket: config.S3_BUCKET,
    Key: key,
    Body: typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
    ContentType: contentType ?? 'application/octet-stream',
  };
  await getS3Client().send(new PutObjectCommand(params));
}

/**
 * Download an object from S3.
 * @param key  Full S3 key
 * @returns    Content as Buffer
 */
export async function get(key: string): Promise<Buffer> {
  const result: GetObjectCommandOutput = await getS3Client().send(
    new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key })
  );

  if (!result.Body) {
    throw new Error(`S3 GetObject returned empty body for key: ${key}`);
  }

  return streamToBuffer(result.Body);
}

/**
 * List all objects under a prefix (handles pagination automatically).
 * @param prefix  S3 key prefix to list
 * @returns       Array of S3Object descriptors
 */
export async function list(prefix: string): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const result: ListObjectsV2CommandOutput = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: config.S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of result.Contents ?? []) {
      if (obj.Key && obj.Size !== undefined && obj.LastModified) {
        objects.push({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
        });
      }
    }

    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

/**
 * Check if an object exists and return its metadata.
 * Returns null if the object does not exist.
 */
export async function headObject(key: string): Promise<HeadObjectCommandOutput | null> {
  try {
    return await getS3Client().send(
      new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key })
    );
  } catch (err) {
    // NoSuchKey / 404 → return null
    if (err instanceof Error && ('$metadata' in err || err.name === 'NotFound' || err.name === 'NoSuchKey')) {
      return null;
    }
    throw err;
  }
}
