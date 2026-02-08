import { describe, it, expect, beforeEach } from 'vitest';
import { ShareService } from '../sharing/share-service.js';
import { ShareStore } from '../sharing/share-store.js';
import type { CreateShareInput } from '../sharing/types.js';

const TEST_BUCKET = 'hq-cloud-files-test';

describe('ShareService', () => {
  let store: ShareStore;
  let service: ShareService;

  beforeEach(() => {
    store = new ShareStore();
    service = new ShareService(store, {
      bucketName: TEST_BUCKET,
      maxPathsPerShare: 100,
      maxSharesPerOwner: 5,
    });
  });

  const validInput: CreateShareInput = {
    ownerId: 'user-alice',
    recipientId: 'user-bob',
    paths: ['knowledge/public/', 'projects/shared/'],
    permissions: ['read'],
  };

  describe('createShare', () => {
    it('should create a valid share', () => {
      const result = service.createShare(validInput);
      expect(result.validation.valid).toBe(true);
      expect(result.share).toBeDefined();
      expect(result.share.ownerId).toBe('user-alice');
      expect(result.share.recipientId).toBe('user-bob');
      expect(result.share.status).toBe('active');
    });

    it('should reject invalid input', () => {
      const result = service.createShare({
        ...validInput,
        ownerId: '',
      });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.length).toBeGreaterThan(0);
    });

    it('should enforce max shares per owner', () => {
      // Create max shares
      for (let i = 0; i < 5; i++) {
        service.createShare({
          ...validInput,
          recipientId: `user-${i}`,
          paths: [`path${i}/`],
        });
      }

      const result = service.createShare({
        ...validInput,
        recipientId: 'user-extra',
        paths: ['extra/'],
      });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((e) => e.includes('Maximum'))).toBe(true);
    });

    it('should reject duplicate share with overlapping paths', () => {
      service.createShare(validInput);

      const result = service.createShare({
        ...validInput,
        paths: ['knowledge/public/', 'new-path/'],
      });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((e) => e.includes('overlapping'))).toBe(true);
    });

    it('should allow same owner to share different paths to same recipient', () => {
      service.createShare(validInput);

      const result = service.createShare({
        ...validInput,
        paths: ['workers/shared/'],
      });
      expect(result.validation.valid).toBe(true);
    });
  });

  describe('getShare', () => {
    it('should retrieve a share by ID', () => {
      const { share } = service.createShare(validInput);
      const retrieved = service.getShare(share.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(share.id);
    });

    it('should return undefined for non-existent share', () => {
      expect(service.getShare('share-nope')).toBeUndefined();
    });
  });

  describe('updateShare', () => {
    it('should add paths to a share', () => {
      const { share } = service.createShare(validInput);
      const result = service.updateShare(share.id, {
        addPaths: ['workers/shared/'],
      });
      expect(result.validation.valid).toBe(true);
      expect(result.share!.paths).toContain('workers/shared/');
    });

    it('should remove paths from a share', () => {
      const { share } = service.createShare(validInput);
      const result = service.updateShare(share.id, {
        removePaths: ['knowledge/public/'],
      });
      expect(result.validation.valid).toBe(true);
      expect(result.share!.paths).not.toContain('knowledge/public/');
    });

    it('should reject invalid paths', () => {
      const { share } = service.createShare(validInput);
      const result = service.updateShare(share.id, {
        addPaths: ['../traversal/'],
      });
      expect(result.validation.valid).toBe(false);
    });

    it('should return not found for non-existent share', () => {
      const result = service.updateShare('share-nope', { label: 'Test' });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('should reject updating a revoked share', () => {
      const { share } = service.createShare(validInput);
      service.revokeShare(share.id);
      const result = service.updateShare(share.id, { label: 'Test' });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((e) => e.includes('revoked'))).toBe(true);
    });

    it('should reject invalid expiresAt', () => {
      const { share } = service.createShare(validInput);
      const result = service.updateShare(share.id, { expiresAt: 'not-a-date' });
      expect(result.validation.valid).toBe(false);
    });

    it('should reject past expiresAt', () => {
      const { share } = service.createShare(validInput);
      const past = new Date(Date.now() - 86400000).toISOString();
      const result = service.updateShare(share.id, { expiresAt: past });
      expect(result.validation.valid).toBe(false);
    });

    it('should enforce max paths per share', () => {
      const { share } = service.createShare(validInput);

      const manyPaths = Array.from({ length: 100 }, (_, i) => `path${i}/`);
      const result = service.updateShare(share.id, { addPaths: manyPaths });
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((e) => e.includes('Maximum'))).toBe(true);
    });
  });

  describe('revokeShare', () => {
    it('should revoke an active share', () => {
      const { share } = service.createShare(validInput);
      const revoked = service.revokeShare(share.id);
      expect(revoked).toBeDefined();
      expect(revoked!.status).toBe('revoked');
    });

    it('should return undefined for non-existent share', () => {
      expect(service.revokeShare('share-nope')).toBeUndefined();
    });
  });

  describe('deleteShare', () => {
    it('should delete a share', () => {
      const { share } = service.createShare(validInput);
      expect(service.deleteShare(share.id)).toBe(true);
      expect(service.getShare(share.id)).toBeUndefined();
    });

    it('should return false for non-existent share', () => {
      expect(service.deleteShare('share-nope')).toBe(false);
    });
  });

  describe('listShares', () => {
    it('should list shares with filters', () => {
      service.createShare(validInput);
      service.createShare({
        ...validInput,
        recipientId: 'user-carol',
        paths: ['workers/'],
      });

      const all = service.listShares({});
      expect(all.length).toBe(2);

      const byRecipient = service.listShares({ recipientId: 'user-bob' });
      expect(byRecipient.length).toBe(1);
    });
  });

  describe('checkAccess', () => {
    it('should confirm access for shared path', () => {
      service.createShare(validInput);
      const share = service.checkAccess('user-bob', 'user-alice', 'knowledge/public/doc.md');
      expect(share).toBeDefined();
    });

    it('should deny access for non-shared path', () => {
      service.createShare(validInput);
      const share = service.checkAccess('user-bob', 'user-alice', 'knowledge/private/');
      expect(share).toBeUndefined();
    });

    it('should deny access after revocation', () => {
      const { share } = service.createShare(validInput);
      service.revokeShare(share.id);
      const access = service.checkAccess('user-bob', 'user-alice', 'knowledge/public/');
      expect(access).toBeUndefined();
    });
  });

  describe('getReceivedShares', () => {
    it('should return shares received by user', () => {
      service.createShare(validInput);
      service.createShare({
        ownerId: 'user-carol',
        recipientId: 'user-bob',
        paths: ['workers/'],
      });

      const received = service.getReceivedShares('user-bob');
      expect(received.length).toBe(2);
    });
  });

  describe('getOwnedShares', () => {
    it('should return shares owned by user', () => {
      service.createShare(validInput);
      service.createShare({
        ...validInput,
        recipientId: 'user-carol',
        paths: ['workers/'],
      });

      const owned = service.getOwnedShares('user-alice');
      expect(owned.length).toBe(2);
    });
  });

  describe('generateSharePolicy', () => {
    it('should generate S3 policy for active share', () => {
      const { share } = service.createShare(validInput);
      const policy = service.generateSharePolicy(share.id);

      expect(policy).toBeDefined();
      expect(policy!.shareId).toBe(share.id);
      expect(policy!.bucketName).toBe(TEST_BUCKET);
      expect(policy!.policyStatements.length).toBeGreaterThan(0);

      const stmt = policy!.policyStatements[0]!;
      expect(stmt.sid).toBe('ShareReadAccess');
      expect(stmt.actions).toContain('s3:GetObject');
      expect(stmt.resources.length).toBe(2);
      expect(stmt.resources).toContain(
        `arn:aws:s3:::${TEST_BUCKET}/user-alice/hq/knowledge/public/*`
      );
      expect(stmt.resources).toContain(
        `arn:aws:s3:::${TEST_BUCKET}/user-alice/hq/projects/shared/*`
      );
    });

    it('should return undefined for revoked share', () => {
      const { share } = service.createShare(validInput);
      service.revokeShare(share.id);
      expect(service.generateSharePolicy(share.id)).toBeUndefined();
    });

    it('should return undefined for non-existent share', () => {
      expect(service.generateSharePolicy('share-nope')).toBeUndefined();
    });
  });

  describe('generateAwsPolicyDocument', () => {
    it('should generate AWS-formatted policy document', () => {
      const { share } = service.createShare(validInput);
      const doc = service.generateAwsPolicyDocument(share.id);

      expect(doc).toBeDefined();
      expect(doc!['Version']).toBe('2012-10-17');
      expect(Array.isArray(doc!['Statement'])).toBe(true);
    });

    it('should return undefined for inactive share', () => {
      const { share } = service.createShare(validInput);
      service.revokeShare(share.id);
      expect(service.generateAwsPolicyDocument(share.id)).toBeUndefined();
    });
  });

  describe('getAccessiblePaths', () => {
    it('should aggregate all accessible paths for a user', () => {
      service.createShare(validInput);
      service.createShare({
        ownerId: 'user-carol',
        recipientId: 'user-bob',
        paths: ['workers/shared/'],
        label: 'Carol Workers',
      });

      const accessible = service.getAccessiblePaths('user-bob');
      expect(accessible.length).toBe(2);

      const aliceShare = accessible.find((a) => a.ownerId === 'user-alice');
      expect(aliceShare).toBeDefined();
      expect(aliceShare!.paths).toEqual(['knowledge/public/', 'projects/shared/']);

      const carolShare = accessible.find((a) => a.ownerId === 'user-carol');
      expect(carolShare).toBeDefined();
      expect(carolShare!.paths).toEqual(['workers/shared/']);
      expect(carolShare!.label).toBe('Carol Workers');
    });

    it('should return empty array for user with no shares', () => {
      const accessible = service.getAccessiblePaths('user-nobody');
      expect(accessible).toEqual([]);
    });

    it('should not include revoked shares', () => {
      const { share } = service.createShare(validInput);
      service.revokeShare(share.id);

      const accessible = service.getAccessiblePaths('user-bob');
      expect(accessible).toEqual([]);
    });
  });
});
