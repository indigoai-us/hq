/**
 * S3DataSource
 *
 * Reads HQ content from S3. Each user's HQ is stored under
 * {userId}/hq/ in the configured bucket.
 */

import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { DataSource, DirEntry } from './data-source.js';

export interface S3DataSourceConfig {
  bucketName: string;
  region: string;
  /** S3 key prefix, e.g. "{userId}/hq/" — must end with "/" */
  prefix: string;
}

export class S3DataSource implements DataSource {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly prefix: string;

  constructor(config: S3DataSourceConfig) {
    this.client = new S3Client({ region: config.region });
    this.bucketName = config.bucketName;
    // Ensure prefix ends with /
    this.prefix = config.prefix.endsWith('/') ? config.prefix : config.prefix + '/';
  }

  private key(relativePath: string): string {
    // Normalize separators and strip leading slashes
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return this.prefix + normalized;
  }

  async readFile(relativePath: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: this.key(relativePath),
    });
    const response = await this.client.send(command);
    return (await response.Body?.transformToString('utf-8')) ?? '';
  }

  async listDir(relativePath: string): Promise<DirEntry[]> {
    let dirPrefix = this.key(relativePath);
    if (!dirPrefix.endsWith('/')) dirPrefix += '/';

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: dirPrefix,
      Delimiter: '/',
    });
    const response = await this.client.send(command);
    const entries: DirEntry[] = [];

    // Directories come back as CommonPrefixes
    if (response.CommonPrefixes) {
      for (const cp of response.CommonPrefixes) {
        if (!cp.Prefix) continue;
        const name = cp.Prefix.slice(dirPrefix.length).replace(/\/$/, '');
        if (name) {
          entries.push({ name, isDirectory: true });
        }
      }
    }

    // Files come back as Contents
    if (response.Contents) {
      for (const obj of response.Contents) {
        if (!obj.Key) continue;
        const name = obj.Key.slice(dirPrefix.length);
        // Skip the directory marker itself and entries with nested slashes
        if (!name || name.includes('/')) continue;
        entries.push({ name, isDirectory: false });
      }
    }

    return entries;
  }

  async exists(relativePath: string): Promise<boolean> {
    // Try as a file first
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: this.key(relativePath),
      });
      await this.client.send(command);
      return true;
    } catch {
      // Not a file — check if it's a directory prefix
      return this.isDirectory(relativePath);
    }
  }

  async isDirectory(relativePath: string): Promise<boolean> {
    let dirPrefix = this.key(relativePath);
    if (!dirPrefix.endsWith('/')) dirPrefix += '/';

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: dirPrefix,
      MaxKeys: 1,
    });
    const response = await this.client.send(command);
    return (response.KeyCount ?? 0) > 0;
  }

  async fileSize(relativePath: string): Promise<number> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: this.key(relativePath),
    });
    const response = await this.client.send(command);
    return response.ContentLength ?? 0;
  }
}
