import { describe, it, expect } from 'vitest';
import {
  buildUserPolicy,
  buildWorkerPolicy,
  buildAdminPolicy,
  buildSharePolicy,
  toAwsPolicyDocument,
} from '../s3/policies.js';

const TEST_BUCKET = 'hq-cloud-files-test';
const TEST_USER = 'user-123';

describe('S3 IAM Policies', () => {
  describe('buildUserPolicy', () => {
    it('should scope access to user prefix', () => {
      const policy = buildUserPolicy(TEST_BUCKET, TEST_USER);

      expect(policy.version).toBe('2012-10-17');
      expect(policy.statements.length).toBeGreaterThanOrEqual(2);

      // Check list permission is scoped
      const listStmt = policy.statements.find((s) => s.sid === 'AllowListBucket');
      expect(listStmt).toBeDefined();
      expect(listStmt?.actions).toContain('s3:ListBucket');
      expect(listStmt?.conditions?.StringLike?.['s3:prefix']).toContain(
        `${TEST_USER}/hq/*`
      );

      // Check read/write permission is scoped
      const rwStmt = policy.statements.find((s) => s.sid === 'AllowUserReadWrite');
      expect(rwStmt).toBeDefined();
      expect(rwStmt?.actions).toContain('s3:GetObject');
      expect(rwStmt?.actions).toContain('s3:PutObject');
      expect(rwStmt?.actions).toContain('s3:DeleteObject');
      expect(rwStmt?.resources).toContain(
        `arn:aws:s3:::${TEST_BUCKET}/${TEST_USER}/hq/*`
      );
    });

    it('should include a deny statement for other prefixes', () => {
      const policy = buildUserPolicy(TEST_BUCKET, TEST_USER);

      const denyStmt = policy.statements.find((s) => s.sid === 'DenyOtherPrefixes');
      expect(denyStmt).toBeDefined();
      expect(denyStmt?.effect).toBe('Deny');
      expect(denyStmt?.conditions?.StringNotLike?.['s3:prefix']).toContain(
        `${TEST_USER}/hq/*`
      );
    });

    it('should include version access', () => {
      const policy = buildUserPolicy(TEST_BUCKET, TEST_USER);

      const rwStmt = policy.statements.find((s) => s.sid === 'AllowUserReadWrite');
      expect(rwStmt?.actions).toContain('s3:GetObjectVersion');
      expect(rwStmt?.actions).toContain('s3:ListBucketVersions');
    });
  });

  describe('buildWorkerPolicy', () => {
    it('should grant read/write to user prefix', () => {
      const policy = buildWorkerPolicy(TEST_BUCKET, TEST_USER);

      expect(policy.statements.length).toBeGreaterThanOrEqual(2);

      const rwStmt = policy.statements.find((s) => s.sid === 'WorkerReadWrite');
      expect(rwStmt).toBeDefined();
      expect(rwStmt?.actions).toContain('s3:GetObject');
      expect(rwStmt?.actions).toContain('s3:PutObject');
      expect(rwStmt?.resources).toContain(
        `arn:aws:s3:::${TEST_BUCKET}/${TEST_USER}/hq/*`
      );
    });

    it('should include tagging operations for workers', () => {
      const policy = buildWorkerPolicy(TEST_BUCKET, TEST_USER);

      const rwStmt = policy.statements.find((s) => s.sid === 'WorkerReadWrite');
      expect(rwStmt?.actions).toContain('s3:GetObjectTagging');
      expect(rwStmt?.actions).toContain('s3:PutObjectTagging');
    });
  });

  describe('buildAdminPolicy', () => {
    it('should grant full access to bucket', () => {
      const policy = buildAdminPolicy(TEST_BUCKET);

      expect(policy.statements).toHaveLength(1);
      const stmt = policy.statements[0];
      expect(stmt?.sid).toBe('AdminFullAccess');
      expect(stmt?.effect).toBe('Allow');
      expect(stmt?.actions).toContain('s3:*');
      expect(stmt?.resources).toContain(`arn:aws:s3:::${TEST_BUCKET}`);
      expect(stmt?.resources).toContain(`arn:aws:s3:::${TEST_BUCKET}/*`);
    });
  });

  describe('buildSharePolicy', () => {
    it('should grant read access to specific paths', () => {
      const paths = ['knowledge/public/', 'projects/shared-project/'];
      const policy = buildSharePolicy(TEST_BUCKET, TEST_USER, paths);

      expect(policy.statements).toHaveLength(1);
      const stmt = policy.statements[0];
      expect(stmt?.sid).toBe('ShareReadAccess');
      expect(stmt?.effect).toBe('Allow');
      expect(stmt?.actions).toContain('s3:GetObject');
      expect(stmt?.actions).not.toContain('s3:PutObject');
      expect(stmt?.resources).toContain(
        `arn:aws:s3:::${TEST_BUCKET}/${TEST_USER}/hq/knowledge/public/*`
      );
      expect(stmt?.resources).toContain(
        `arn:aws:s3:::${TEST_BUCKET}/${TEST_USER}/hq/projects/shared-project/*`
      );
    });
  });

  describe('toAwsPolicyDocument', () => {
    it('should convert internal policy to AWS format', () => {
      const policy = buildUserPolicy(TEST_BUCKET, TEST_USER);
      const doc = toAwsPolicyDocument(policy);

      expect(doc['Version']).toBe('2012-10-17');
      expect(Array.isArray(doc['Statement'])).toBe(true);

      const statements = doc['Statement'] as Record<string, unknown>[];
      expect(statements.length).toBeGreaterThan(0);

      const firstStmt = statements[0];
      expect(firstStmt).toHaveProperty('Sid');
      expect(firstStmt).toHaveProperty('Effect');
      expect(firstStmt).toHaveProperty('Principal');
      expect(firstStmt).toHaveProperty('Action');
      expect(firstStmt).toHaveProperty('Resource');
    });

    it('should include Condition when conditions exist', () => {
      const policy = buildUserPolicy(TEST_BUCKET, TEST_USER);
      const doc = toAwsPolicyDocument(policy);

      const statements = doc['Statement'] as Record<string, unknown>[];
      const stmtWithCondition = statements.find((s) => 'Condition' in s);
      expect(stmtWithCondition).toBeDefined();
    });

    it('should produce valid JSON', () => {
      const policy = buildAdminPolicy(TEST_BUCKET);
      const doc = toAwsPolicyDocument(policy);

      const json = JSON.stringify(doc);
      const parsed: unknown = JSON.parse(json);
      expect(parsed).toBeDefined();
    });
  });
});
