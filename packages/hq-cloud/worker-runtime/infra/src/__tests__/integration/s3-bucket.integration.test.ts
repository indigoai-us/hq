/**
 * S3 Bucket Integration Tests
 *
 * Validates the deployed S3 bucket:
 * - Bucket exists and is accessible
 * - Upload/download cycle works
 * - Versioning is enabled
 * - Lifecycle rules are configured
 *
 * Requires: AWS credentials with S3 access, bucket deployed via CDK
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetBucketLifecycleConfigurationCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3';

const BUCKET_NAME = process.env['HQ_TEST_BUCKET'] ?? 'hq-cloud-files-dev';
const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const TEST_PREFIX = `integration-test/${Date.now()}`;

const s3 = new S3Client({ region: REGION });
const cleanupKeys: string[] = [];

afterAll(async () => {
  // Clean up test objects
  for (const key of cleanupKeys) {
    try {
      // Delete all versions
      const versions = await s3.send(
        new ListObjectVersionsCommand({ Bucket: BUCKET_NAME, Prefix: key })
      );
      for (const version of versions.Versions ?? []) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: version.Key!,
            VersionId: version.VersionId,
          })
        );
      }
      for (const marker of versions.DeleteMarkers ?? []) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: marker.Key!,
            VersionId: marker.VersionId,
          })
        );
      }
    } catch {
      // Best effort cleanup
    }
  }
});

describe('S3 Bucket Integration', () => {
  it('bucket exists and is accessible', async () => {
    const response = await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    expect(response.$metadata.httpStatusCode).toBe(200);
  });

  it('upload and download cycle works', async () => {
    const key = `${TEST_PREFIX}/test-file.txt`;
    const content = `Integration test at ${new Date().toISOString()}`;
    cleanupKeys.push(key);

    // Upload
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: content,
        ContentType: 'text/plain',
      })
    );

    // Download
    const response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
    );
    const body = await response.Body!.transformToString();
    expect(body).toBe(content);
  });

  it('versioning is enabled', async () => {
    const response = await s3.send(
      new GetBucketVersioningCommand({ Bucket: BUCKET_NAME })
    );
    expect(response.Status).toBe('Enabled');
  });

  it('lifecycle rules are configured', async () => {
    const response = await s3.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: BUCKET_NAME })
    );
    expect(response.Rules).toBeDefined();
    expect(response.Rules!.length).toBeGreaterThan(0);

    const ruleIds = response.Rules!.map((r) => r.ID);
    expect(ruleIds).toContain('expire-incomplete-multipart');
    expect(ruleIds).toContain('expire-noncurrent-versions');
  });

  it('versioning creates new versions on overwrite', async () => {
    const key = `${TEST_PREFIX}/versioned-file.txt`;
    cleanupKeys.push(key);

    // Write version 1
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: 'version-1',
      })
    );

    // Write version 2
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: 'version-2',
      })
    );

    // List versions
    const versions = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: BUCKET_NAME,
        Prefix: key,
      })
    );

    expect(versions.Versions!.length).toBeGreaterThanOrEqual(2);
  });
});
