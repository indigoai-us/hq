/**
 * S3 operations — upload, download, list, delete
 */

import * as fs from "fs";
import * as path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { Credentials, SyncConfig } from "./types.js";
import { readCredentials, refreshAwsCredentials } from "./auth.js";

let s3Client: S3Client | null = null;

function getConfig(creds: Credentials): SyncConfig {
  return {
    bucket: creds.bucket,
    region: creds.region,
    userId: creds.userId,
    prefix: `hq/`,
  };
}

async function getClient(): Promise<{ client: S3Client; config: SyncConfig }> {
  let creds = readCredentials();
  if (!creds) {
    throw new Error("Not authenticated. Run 'hq sync init' first.");
  }

  // Refresh if expired or missing access key
  if (!creds.accessKeyId || (creds.expiration && new Date(creds.expiration) < new Date())) {
    creds = await refreshAwsCredentials(creds);
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: creds.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });
  }

  return { client: s3Client, config: getConfig(creds) };
}

export async function uploadFile(
  localPath: string,
  relativePath: string
): Promise<void> {
  const { client, config } = await getClient();
  const key = `${config.prefix}${relativePath}`;
  const body = fs.readFileSync(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: getMimeType(relativePath),
    })
  );
}

export async function downloadFile(
  relativePath: string,
  localPath: string
): Promise<void> {
  const { client, config } = await getClient();
  const key = `${config.prefix}${relativePath}`;

  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })
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
  relativePath: string;
  size: number;
  lastModified: Date;
  etag: string;
}

export async function listRemoteFiles(): Promise<RemoteFile[]> {
  const { client, config } = await getClient();
  const files: RemoteFile[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of response.Contents || []) {
      if (!obj.Key || !obj.Size) continue;
      const relativePath = obj.Key.replace(config.prefix, "");
      if (!relativePath) continue;

      files.push({
        key: obj.Key,
        relativePath,
        size: obj.Size,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag || "",
      });
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files;
}

export async function deleteRemoteFile(relativePath: string): Promise<void> {
  const { client, config } = await getClient();
  const key = `${config.prefix}${relativePath}`;

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })
  );
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
