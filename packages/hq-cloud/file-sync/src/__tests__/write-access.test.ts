import { describe, it, expect, beforeEach } from 'vitest';
import { ShareService } from '../sharing/share-service.js';
import { ShareStore, ShareAuditLog } from '../sharing/share-store.js';
import type { CreateShareInput } from '../sharing/types.js';

const TEST_BUCKET = 'hq-cloud-files-test';

describe('Write Access (SYNC-009)', () => {
  let store: ShareStore;
  let auditLog: ShareAuditLog;
  let service: ShareService;

  beforeEach(() => {
    store = new ShareStore();
    auditLog = new ShareAuditLog();
    service = new ShareService(store, {
      bucketName: TEST_BUCKET,
      maxPathsPerShare: 100,
      maxSharesPerOwner: 50,
    }, auditLog);
  });

  const readWriteInput: CreateShareInput = {
    ownerId: 'user-alice',
    recipientId: 'user-bob',
    paths: ['knowledge/shared/', 'projects/collab/'],
    permissions: ['read', 'write'],
  };

  const readOnlyInput: CreateShareInput = {
    ownerId: 'user-alice',
    recipientId: 'user-bob',
    paths: ['knowledge/public/'],
    permissions: ['read'],
  };

  // ─── AC1: Share permissions extended with write option ─────────

  describe('write permission support', () => {
    it('should create a share with write permission', () => {
      const result = service.createShare(readWriteInput);
      expect(result.validation.valid).toBe(true);
      expect(result.share).toBeDefined();
      expect(result.share.permissions).toContain('write');
      expect(result.share.permissions).toContain('read');
    });

    it('should create a share with read-only permission (backward compat)', () => {
      const result = service.createShare(readOnlyInput);
      expect(result.validation.valid).toBe(true);
      expect(result.share.permissions).toEqual(['read']);
      expect(result.share.permissions).not.toContain('write');
    });

    it('should default to read when no permissions specified', () => {
      const result = service.createShare({
        ownerId: 'user-alice',
        recipientId: 'user-carol',
        paths: ['knowledge/public/'],
      });
      expect(result.share.permissions).toEqual(['read']);
    });

    it('should allow updating permissions to add write', () => {
      const { share } = service.createShare(readOnlyInput);
      const result = service.updateShare(share.id, { permissions: ['read', 'write'] });
      expect(result.validation.valid).toBe(true);
      expect(result.share!.permissions).toContain('write');
    });

    it('should generate write policy for write-enabled share', () => {
      const { share } = service.createShare(readWriteInput);
      const policy = service.generateSharePolicy(share.id);

      expect(policy).toBeDefined();
      expect(policy!.policyStatements.length).toBe(2);

      const readStmt = policy!.policyStatements.find((s) => s.sid === 'ShareReadAccess');
      expect(readStmt).toBeDefined();
      expect(readStmt!.actions).toContain('s3:GetObject');

      const writeStmt = policy!.policyStatements.find((s) => s.sid === 'ShareWriteAccess');
      expect(writeStmt).toBeDefined();
      expect(writeStmt!.actions).toContain('s3:PutObject');
      expect(writeStmt!.actions).toContain('s3:DeleteObject');
    });

    it('should generate read-only policy for read-only share', () => {
      const { share } = service.createShare(readOnlyInput);
      const policy = service.generateSharePolicy(share.id);

      expect(policy).toBeDefined();
      expect(policy!.policyStatements.length).toBe(1);
      expect(policy!.policyStatements[0]!.sid).toBe('ShareReadAccess');
    });

    it('should generate correct AWS policy document for write share', () => {
      const { share } = service.createShare(readWriteInput);
      const doc = service.generateAwsPolicyDocument(share.id);

      expect(doc).toBeDefined();
      expect(doc!['Version']).toBe('2012-10-17');
      const statements = doc!['Statement'] as Array<Record<string, unknown>>;
      expect(statements.length).toBe(2);

      const writeSid = statements.find((s) => s['Sid'] === 'ShareWriteAccess');
      expect(writeSid).toBeDefined();
    });
  });

  // ─── AC2: Multiple writers supported ──────────────────────────

  describe('multiple writers', () => {
    it('should allow multiple recipients to have write access to same owner paths', () => {
      const result1 = service.createShare(readWriteInput);
      expect(result1.validation.valid).toBe(true);

      const result2 = service.createShare({
        ownerId: 'user-alice',
        recipientId: 'user-carol',
        paths: ['knowledge/shared/'],
        permissions: ['read', 'write'],
      });
      expect(result2.validation.valid).toBe(true);
    });

    it('should list all writers for a specific path', () => {
      service.createShare(readWriteInput);
      service.createShare({
        ownerId: 'user-alice',
        recipientId: 'user-carol',
        paths: ['knowledge/shared/', 'projects/other/'],
        permissions: ['read', 'write'],
      });
      service.createShare({
        ownerId: 'user-alice',
        recipientId: 'user-dave',
        paths: ['knowledge/shared/'],
        permissions: ['read'], // read-only, should NOT be in writers
      });

      const writers = service.getWritersForPath('user-alice', 'knowledge/shared/docs/readme.md');
      expect(writers.length).toBe(2);

      const recipientIds = writers.map((w) => w.recipientId);
      expect(recipientIds).toContain('user-bob');
      expect(recipientIds).toContain('user-carol');
      expect(recipientIds).not.toContain('user-dave');
    });

    it('should return empty writers list when no write shares exist', () => {
      service.createShare(readOnlyInput);
      const writers = service.getWritersForPath('user-alice', 'knowledge/public/docs/readme.md');
      expect(writers.length).toBe(0);
    });
  });

  // ─── AC3: Conflict resolution applies to shared files ─────────

  describe('conflict resolution integration', () => {
    it('should track write access for shared files via checkWriteAccess', () => {
      service.createShare(readWriteInput);

      const writeResult = service.checkWriteAccess(
        'user-bob',
        'user-alice',
        'knowledge/shared/docs/readme.md'
      );
      expect(writeResult.hasWriteAccess).toBe(true);
      expect(writeResult.share).toBeDefined();
    });

    it('should deny write access for read-only shares', () => {
      service.createShare(readOnlyInput);

      const writeResult = service.checkWriteAccess(
        'user-bob',
        'user-alice',
        'knowledge/public/docs/readme.md'
      );
      expect(writeResult.hasWriteAccess).toBe(false);
      expect(writeResult.share).toBeUndefined();
    });

    it('should deny write access for non-shared paths', () => {
      service.createShare(readWriteInput);

      const writeResult = service.checkWriteAccess(
        'user-bob',
        'user-alice',
        'knowledge/private/secrets.md'
      );
      expect(writeResult.hasWriteAccess).toBe(false);
    });

    it('should deny write access after write access revocation', () => {
      const { share } = service.createShare(readWriteInput);
      service.revokeWriteAccess(share.id);

      const writeResult = service.checkWriteAccess(
        'user-bob',
        'user-alice',
        'knowledge/shared/docs/readme.md'
      );
      expect(writeResult.hasWriteAccess).toBe(false);
    });

    it('should still allow read access after write revocation', () => {
      const { share } = service.createShare(readWriteInput);
      service.revokeWriteAccess(share.id);

      const readAccess = service.checkAccess(
        'user-bob',
        'user-alice',
        'knowledge/shared/docs/readme.md'
      );
      expect(readAccess).toBeDefined();
    });

    it('should include permissions in accessible paths', () => {
      service.createShare(readWriteInput);
      service.createShare({
        ownerId: 'user-carol',
        recipientId: 'user-bob',
        paths: ['workers/shared/'],
        permissions: ['read'],
      });

      const accessible = service.getAccessiblePaths('user-bob');
      expect(accessible.length).toBe(2);

      const alicePaths = accessible.find((a) => a.ownerId === 'user-alice');
      expect(alicePaths!.permissions).toContain('write');

      const carolPaths = accessible.find((a) => a.ownerId === 'user-carol');
      expect(carolPaths!.permissions).toEqual(['read']);
    });
  });

  // ─── AC4: Audit log of changes by user ────────────────────────

  describe('audit logging', () => {
    it('should log share creation', () => {
      const { share } = service.createShare(readWriteInput);
      const entries = service.getShareAuditLog(share.id);

      expect(entries.length).toBeGreaterThanOrEqual(1);
      const createEntry = entries.find((e) => e.action === 'share_created');
      expect(createEntry).toBeDefined();
      expect(createEntry!.userId).toBe('user-alice');
    });

    it('should log write access grant on creation', () => {
      const { share } = service.createShare(readWriteInput);
      const entries = service.getShareAuditLog(share.id);

      const writeGrant = entries.find((e) => e.action === 'write_access_granted');
      expect(writeGrant).toBeDefined();
    });

    it('should not log write grant for read-only shares', () => {
      const { share } = service.createShare(readOnlyInput);
      const entries = service.getShareAuditLog(share.id);

      const writeGrant = entries.find((e) => e.action === 'write_access_granted');
      expect(writeGrant).toBeUndefined();
    });

    it('should log share updates', () => {
      const { share } = service.createShare(readOnlyInput);
      service.updateShare(share.id, { permissions: ['read', 'write'] });

      const entries = service.getShareAuditLog(share.id);
      const updateEntry = entries.find((e) => e.action === 'share_updated');
      expect(updateEntry).toBeDefined();

      const writeGrant = entries.find((e) => e.action === 'write_access_granted');
      expect(writeGrant).toBeDefined();
    });

    it('should log write access revocation on update', () => {
      const { share } = service.createShare(readWriteInput);
      service.updateShare(share.id, { permissions: ['read'] });

      const entries = service.getShareAuditLog(share.id);
      const writeRevoke = entries.find((e) => e.action === 'write_access_revoked');
      expect(writeRevoke).toBeDefined();
    });

    it('should log share revocation', () => {
      const { share } = service.createShare(readWriteInput);
      service.revokeShare(share.id);

      const entries = service.getShareAuditLog(share.id);
      const revokeEntry = entries.find((e) => e.action === 'share_revoked');
      expect(revokeEntry).toBeDefined();
    });

    it('should record file write actions', () => {
      const { share } = service.createShare(readWriteInput);
      service.recordFileWrite(share.id, 'user-bob', 'knowledge/shared/doc.md');

      const entries = service.getShareAuditLog(share.id);
      const writeEntry = entries.find((e) => e.action === 'file_write');
      expect(writeEntry).toBeDefined();
      expect(writeEntry!.userId).toBe('user-bob');
      expect(writeEntry!.path).toBe('knowledge/shared/doc.md');
    });

    it('should record file read actions', () => {
      const { share } = service.createShare(readWriteInput);
      service.recordFileRead(share.id, 'user-bob', 'knowledge/shared/doc.md');

      const entries = service.getShareAuditLog(share.id);
      const readEntry = entries.find((e) => e.action === 'file_read');
      expect(readEntry).toBeDefined();
    });

    it('should record file delete actions', () => {
      const { share } = service.createShare(readWriteInput);
      service.recordFileDelete(share.id, 'user-bob', 'knowledge/shared/old.md');

      const entries = service.getShareAuditLog(share.id);
      const deleteEntry = entries.find((e) => e.action === 'file_delete');
      expect(deleteEntry).toBeDefined();
      expect(deleteEntry!.path).toBe('knowledge/shared/old.md');
    });

    it('should support audit log queries with filters', () => {
      const { share } = service.createShare(readWriteInput);
      service.recordFileWrite(share.id, 'user-bob', 'knowledge/shared/doc.md');
      service.recordFileWrite(share.id, 'user-bob', 'knowledge/shared/doc2.md');
      service.recordFileRead(share.id, 'user-bob', 'knowledge/shared/doc.md');

      const writeEntries = service.queryAuditLog({
        shareId: share.id,
        action: 'file_write',
      });
      expect(writeEntries.length).toBe(2);

      const userEntries = service.queryAuditLog({
        userId: 'user-bob',
        action: 'file_read',
      });
      expect(userEntries.length).toBe(1);
    });

    it('should paginate audit log results', () => {
      const { share } = service.createShare(readWriteInput);
      for (let i = 0; i < 10; i++) {
        service.recordFileWrite(share.id, 'user-bob', `knowledge/shared/doc${i}.md`);
      }

      const page1 = service.queryAuditLog({ shareId: share.id, limit: 5, offset: 0 });
      const page2 = service.queryAuditLog({ shareId: share.id, limit: 5, offset: 5 });

      expect(page1.length).toBe(5);
      expect(page2.length).toBeGreaterThanOrEqual(5); // includes create+write_grant entries too
    });
  });

  // ─── AC5: Owner can revoke write access ───────────────────────

  describe('write access revocation', () => {
    it('should revoke write access while keeping read access', () => {
      const { share } = service.createShare(readWriteInput);
      const result = service.revokeWriteAccess(share.id);

      expect(result.validation.valid).toBe(true);
      expect(result.share).toBeDefined();
      expect(result.share!.permissions).toEqual(['read']);
      expect(result.share!.permissions).not.toContain('write');
    });

    it('should fail revoking write from read-only share', () => {
      const { share } = service.createShare(readOnlyInput);
      const result = service.revokeWriteAccess(share.id);

      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((e) => e.includes('does not have write'))).toBe(true);
    });

    it('should fail revoking write from non-existent share', () => {
      const result = service.revokeWriteAccess('share-nonexistent');
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('should fail revoking write from revoked share', () => {
      const { share } = service.createShare(readWriteInput);
      service.revokeShare(share.id);
      const result = service.revokeWriteAccess(share.id);

      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((e) => e.includes('non-active'))).toBe(true);
    });

    it('should log write access revocation', () => {
      const { share } = service.createShare(readWriteInput);
      service.revokeWriteAccess(share.id);

      const entries = service.getShareAuditLog(share.id);
      const revokeEntry = entries.find(
        (e) => e.action === 'write_access_revoked' && e.details?.includes('retaining read')
      );
      expect(revokeEntry).toBeDefined();
    });

    it('should generate read-only policy after write revocation', () => {
      const { share } = service.createShare(readWriteInput);
      service.revokeWriteAccess(share.id);

      const policy = service.generateSharePolicy(share.id);
      expect(policy).toBeDefined();
      expect(policy!.policyStatements.length).toBe(1);
      expect(policy!.policyStatements[0]!.sid).toBe('ShareReadAccess');
    });

    it('should reflect revocation in accessible paths', () => {
      const { share } = service.createShare(readWriteInput);
      service.revokeWriteAccess(share.id);

      const accessible = service.getAccessiblePaths('user-bob');
      expect(accessible.length).toBe(1);
      expect(accessible[0]!.permissions).toEqual(['read']);
    });
  });

  // ─── ShareAuditLog standalone tests ───────────────────────────

  describe('ShareAuditLog', () => {
    it('should enforce max entries limit', () => {
      const smallLog = new ShareAuditLog(5);
      for (let i = 0; i < 10; i++) {
        smallLog.record({
          shareId: 'share-1',
          userId: 'user-alice',
          action: 'file_write',
          path: `file${i}.md`,
        });
      }
      expect(smallLog.count()).toBe(5);
    });

    it('should generate unique entry IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const entry = auditLog.record({
          shareId: 'share-1',
          userId: 'user-alice',
          action: 'file_write',
        });
        ids.add(entry.id);
      }
      expect(ids.size).toBe(20);
    });

    it('should clear all entries', () => {
      auditLog.record({
        shareId: 'share-1',
        userId: 'user-alice',
        action: 'file_write',
      });
      auditLog.clear();
      expect(auditLog.count()).toBe(0);
    });

    it('should get entries by user ID', () => {
      auditLog.record({
        shareId: 'share-1',
        userId: 'user-alice',
        action: 'file_write',
      });
      auditLog.record({
        shareId: 'share-2',
        userId: 'user-bob',
        action: 'file_read',
      });

      const aliceEntries = auditLog.getByUserId('user-alice');
      expect(aliceEntries.length).toBe(1);
      expect(aliceEntries[0]!.userId).toBe('user-alice');
    });

    it('should filter by date range', () => {
      const before = new Date(Date.now() - 1000);
      auditLog.record({
        shareId: 'share-1',
        userId: 'user-alice',
        action: 'file_write',
      });
      const after = new Date(Date.now() + 1000);

      const entries = auditLog.query({ after: before, before: after });
      expect(entries.length).toBe(1);

      const futureEntries = auditLog.query({ after });
      expect(futureEntries.length).toBe(0);
    });
  });

  // ─── ShareStore write access methods ──────────────────────────

  describe('ShareStore write access', () => {
    it('should check write access via store', () => {
      store.create(readWriteInput);

      const writeShare = store.checkWriteAccess('user-bob', 'user-alice', 'knowledge/shared/doc.md');
      expect(writeShare).toBeDefined();
      expect(writeShare!.permissions).toContain('write');
    });

    it('should not return read-only shares for write access check', () => {
      store.create(readOnlyInput);

      const writeShare = store.checkWriteAccess('user-bob', 'user-alice', 'knowledge/public/doc.md');
      expect(writeShare).toBeUndefined();
    });

    it('should get all writers for a path', () => {
      store.create(readWriteInput);
      store.create({
        ownerId: 'user-alice',
        recipientId: 'user-carol',
        paths: ['knowledge/shared/'],
        permissions: ['read', 'write'],
      });
      store.create({
        ownerId: 'user-alice',
        recipientId: 'user-dave',
        paths: ['knowledge/shared/'],
        permissions: ['read'],
      });

      const writers = store.getWritersForPath('user-alice', 'knowledge/shared/doc.md');
      expect(writers.length).toBe(2);
    });
  });
});
