import { describe, it, expect } from 'vitest';
import { HQ_FOLDER_STRUCTURE } from '../s3/types.js';
import { buildBucketConfig } from '../s3/config.js';

/**
 * Unit tests for S3BucketManager.
 *
 * Note: The BucketManager class requires AWS SDK calls, so full integration
 * tests are deferred to a live AWS environment. These tests verify the
 * configuration and path logic that can be tested without AWS credentials.
 */
describe('S3BucketManager (unit)', () => {
  describe('HQ Folder Structure', () => {
    it('should define all required HQ folders', () => {
      expect(HQ_FOLDER_STRUCTURE).toContain('knowledge/');
      expect(HQ_FOLDER_STRUCTURE).toContain('projects/');
      expect(HQ_FOLDER_STRUCTURE).toContain('workers/');
      expect(HQ_FOLDER_STRUCTURE).toContain('workspace/');
      expect(HQ_FOLDER_STRUCTURE).toContain('workspace/checkpoints/');
      expect(HQ_FOLDER_STRUCTURE).toContain('workspace/threads/');
      expect(HQ_FOLDER_STRUCTURE).toContain('workspace/orchestrator/');
      expect(HQ_FOLDER_STRUCTURE).toContain('workspace/learnings/');
      expect(HQ_FOLDER_STRUCTURE).toContain('social-content/');
      expect(HQ_FOLDER_STRUCTURE).toContain('social-content/drafts/');
    });

    it('should have trailing slashes on all folders', () => {
      for (const folder of HQ_FOLDER_STRUCTURE) {
        expect(folder.endsWith('/')).toBe(true);
      }
    });
  });

  describe('User path logic', () => {
    it('should normalize Windows paths to S3 format', () => {
      // Simulating getUserPath logic
      const localPath = 'knowledge\\public\\README.md';
      const userId = 'user-123';
      const normalized = localPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const s3Path = `${userId}/hq/${normalized}`;

      expect(s3Path).toBe('user-123/hq/knowledge/public/README.md');
    });

    it('should handle Unix paths correctly', () => {
      const localPath = 'projects/my-project/prd.json';
      const userId = 'user-456';
      const normalized = localPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const s3Path = `${userId}/hq/${normalized}`;

      expect(s3Path).toBe('user-456/hq/projects/my-project/prd.json');
    });

    it('should strip leading slashes', () => {
      const localPath = '/workers/dev-team/worker.yaml';
      const userId = 'user-789';
      const normalized = localPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const s3Path = `${userId}/hq/${normalized}`;

      expect(s3Path).toBe('user-789/hq/workers/dev-team/worker.yaml');
    });

    it('should build correct S3 URI', () => {
      const bucketName = 'hq-cloud-files-development';
      const userId = 'user-123';
      const localPath = 'knowledge/index.md';
      const normalized = localPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const uri = `s3://${bucketName}/${userId}/hq/${normalized}`;

      expect(uri).toBe(
        's3://hq-cloud-files-development/user-123/hq/knowledge/index.md'
      );
    });
  });

  describe('Default bucket config', () => {
    it('should always have versioning enabled', () => {
      const config = buildBucketConfig();
      expect(config.versioning).toBe(true);
    });

    it('should always have encryption enabled', () => {
      const config = buildBucketConfig();
      expect(config.encryption.algorithm).toBeDefined();
      expect(config.encryption.bucketKeyEnabled).toBe(true);
    });

    it('should block all public access', () => {
      const config = buildBucketConfig();
      expect(config.publicAccessBlock.blockPublicAcls).toBe(true);
      expect(config.publicAccessBlock.ignorePublicAcls).toBe(true);
      expect(config.publicAccessBlock.blockPublicPolicy).toBe(true);
      expect(config.publicAccessBlock.restrictPublicBuckets).toBe(true);
    });
  });
});
