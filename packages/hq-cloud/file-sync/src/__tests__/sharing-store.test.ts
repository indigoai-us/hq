import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShareStore,
  validateCreateShareInput,
} from '../sharing/share-store.js';
import type { CreateShareInput } from '../sharing/types.js';

describe('ShareStore', () => {
  let store: ShareStore;

  beforeEach(() => {
    store = new ShareStore();
  });

  const validInput: CreateShareInput = {
    ownerId: 'user-alice',
    recipientId: 'user-bob',
    paths: ['knowledge/public/', 'projects/shared/'],
    permissions: ['read'],
  };

  describe('create', () => {
    it('should create a share with valid input', () => {
      const share = store.create(validInput);

      expect(share.id).toMatch(/^share-/);
      expect(share.ownerId).toBe('user-alice');
      expect(share.recipientId).toBe('user-bob');
      expect(share.paths).toEqual(['knowledge/public/', 'projects/shared/']);
      expect(share.permissions).toEqual(['read']);
      expect(share.status).toBe('active');
      expect(share.createdAt).toBeInstanceOf(Date);
      expect(share.updatedAt).toBeInstanceOf(Date);
      expect(share.expiresAt).toBeNull();
      expect(share.label).toBeNull();
    });

    it('should default to read permission when not specified', () => {
      const input: CreateShareInput = {
        ownerId: 'user-alice',
        recipientId: 'user-bob',
        paths: ['knowledge/'],
      };
      const share = store.create(input);
      expect(share.permissions).toEqual(['read']);
    });

    it('should set expiration date when provided', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const share = store.create({ ...validInput, expiresAt: future });
      expect(share.expiresAt).toBeInstanceOf(Date);
      expect(share.expiresAt!.toISOString()).toBe(future);
    });

    it('should set label when provided', () => {
      const share = store.create({ ...validInput, label: 'Shared Knowledge' });
      expect(share.label).toBe('Shared Knowledge');
    });

    it('should generate unique IDs for each share', () => {
      const share1 = store.create(validInput);
      const share2 = store.create({
        ...validInput,
        recipientId: 'user-carol',
      });
      expect(share1.id).not.toBe(share2.id);
    });
  });

  describe('get', () => {
    it('should return a share by ID', () => {
      const created = store.create(validInput);
      const retrieved = store.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return undefined for non-existent ID', () => {
      expect(store.get('share-nonexistent')).toBeUndefined();
    });

    it('should auto-expire shares past their expiration', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const share = store.create({ ...validInput, expiresAt: past });
      // Manually set the expiresAt to past (since validation would normally reject)
      // The store create doesn't validate, that's the service's job
      const retrieved = store.get(share.id);
      expect(retrieved!.status).toBe('expired');
    });
  });

  describe('exists', () => {
    it('should return true for existing share', () => {
      const share = store.create(validInput);
      expect(store.exists(share.id)).toBe(true);
    });

    it('should return false for non-existent share', () => {
      expect(store.exists('share-nope')).toBe(false);
    });
  });

  describe('update', () => {
    it('should add paths to a share', () => {
      const share = store.create(validInput);
      const updated = store.update(share.id, { addPaths: ['workers/shared/'] });
      expect(updated!.paths).toContain('workers/shared/');
      expect(updated!.paths).toContain('knowledge/public/');
      expect(updated!.paths.length).toBe(3);
    });

    it('should not add duplicate paths', () => {
      const share = store.create(validInput);
      const updated = store.update(share.id, { addPaths: ['knowledge/public/'] });
      expect(updated!.paths.filter((p) => p === 'knowledge/public/').length).toBe(1);
    });

    it('should remove paths from a share', () => {
      const share = store.create(validInput);
      const updated = store.update(share.id, { removePaths: ['knowledge/public/'] });
      expect(updated!.paths).not.toContain('knowledge/public/');
      expect(updated!.paths).toContain('projects/shared/');
    });

    it('should update permissions', () => {
      const share = store.create(validInput);
      const updated = store.update(share.id, { permissions: ['read'] });
      expect(updated!.permissions).toEqual(['read']);
    });

    it('should update expiration', () => {
      const share = store.create(validInput);
      const future = new Date(Date.now() + 86400000).toISOString();
      const updated = store.update(share.id, { expiresAt: future });
      expect(updated!.expiresAt).toBeInstanceOf(Date);
    });

    it('should clear expiration when set to null', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const share = store.create({ ...validInput, expiresAt: future });
      const updated = store.update(share.id, { expiresAt: null });
      expect(updated!.expiresAt).toBeNull();
    });

    it('should update label', () => {
      const share = store.create(validInput);
      const updated = store.update(share.id, { label: 'New Label' });
      expect(updated!.label).toBe('New Label');
    });

    it('should update updatedAt timestamp', () => {
      const share = store.create(validInput);
      const originalUpdatedAt = share.updatedAt.getTime();

      // Small delay to ensure different timestamp
      const updated = store.update(share.id, { label: 'Test' });
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt);
    });

    it('should return undefined for non-existent share', () => {
      expect(store.update('share-nope', { label: 'Test' })).toBeUndefined();
    });

    it('should return undefined for revoked share', () => {
      const share = store.create(validInput);
      store.revoke(share.id);
      expect(store.update(share.id, { label: 'Test' })).toBeUndefined();
    });
  });

  describe('revoke', () => {
    it('should set share status to revoked', () => {
      const share = store.create(validInput);
      const revoked = store.revoke(share.id);
      expect(revoked!.status).toBe('revoked');
    });

    it('should be idempotent', () => {
      const share = store.create(validInput);
      store.revoke(share.id);
      const revokedAgain = store.revoke(share.id);
      expect(revokedAgain!.status).toBe('revoked');
    });

    it('should return undefined for non-existent share', () => {
      expect(store.revoke('share-nope')).toBeUndefined();
    });

    it('should update updatedAt on revoke', () => {
      const share = store.create(validInput);
      const revoked = store.revoke(share.id);
      expect(revoked!.updatedAt.getTime()).toBeGreaterThanOrEqual(share.createdAt.getTime());
    });
  });

  describe('delete', () => {
    it('should remove a share', () => {
      const share = store.create(validInput);
      expect(store.delete(share.id)).toBe(true);
      expect(store.exists(share.id)).toBe(false);
    });

    it('should return false for non-existent share', () => {
      expect(store.delete('share-nope')).toBe(false);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      store.create({
        ownerId: 'alice',
        recipientId: 'bob',
        paths: ['knowledge/'],
      });
      store.create({
        ownerId: 'alice',
        recipientId: 'carol',
        paths: ['projects/'],
      });
      store.create({
        ownerId: 'bob',
        recipientId: 'alice',
        paths: ['workers/'],
      });
    });

    it('should return all shares with empty query', () => {
      const results = store.query({});
      expect(results.length).toBe(3);
    });

    it('should filter by ownerId', () => {
      const results = store.query({ ownerId: 'alice' });
      expect(results.length).toBe(2);
      expect(results.every((s) => s.ownerId === 'alice')).toBe(true);
    });

    it('should filter by recipientId', () => {
      const results = store.query({ recipientId: 'bob' });
      expect(results.length).toBe(1);
      expect(results[0]!.recipientId).toBe('bob');
    });

    it('should filter by status', () => {
      const shares = store.query({});
      if (shares[0]) {
        store.revoke(shares[0].id);
      }

      const activeResults = store.query({ status: 'active' });
      expect(activeResults.length).toBe(2);

      const revokedResults = store.query({ status: 'revoked' });
      expect(revokedResults.length).toBe(1);
    });

    it('should combine filters', () => {
      const results = store.query({ ownerId: 'alice', recipientId: 'bob' });
      expect(results.length).toBe(1);
    });

    it('should sort by createdAt descending', () => {
      const results = store.query({});
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          results[i]!.createdAt.getTime()
        );
      }
    });
  });

  describe('getReceivedShares', () => {
    it('should return active shares for a recipient', () => {
      store.create({
        ownerId: 'alice',
        recipientId: 'bob',
        paths: ['knowledge/'],
      });
      store.create({
        ownerId: 'carol',
        recipientId: 'bob',
        paths: ['projects/'],
      });
      store.create({
        ownerId: 'alice',
        recipientId: 'carol',
        paths: ['workers/'],
      });

      const received = store.getReceivedShares('bob');
      expect(received.length).toBe(2);
      expect(received.every((s) => s.recipientId === 'bob')).toBe(true);
    });

    it('should not return revoked shares', () => {
      const share = store.create({
        ownerId: 'alice',
        recipientId: 'bob',
        paths: ['knowledge/'],
      });
      store.revoke(share.id);

      const received = store.getReceivedShares('bob');
      expect(received.length).toBe(0);
    });
  });

  describe('getOwnedShares', () => {
    it('should return active shares for an owner', () => {
      store.create({
        ownerId: 'alice',
        recipientId: 'bob',
        paths: ['knowledge/'],
      });
      store.create({
        ownerId: 'alice',
        recipientId: 'carol',
        paths: ['projects/'],
      });

      const owned = store.getOwnedShares('alice');
      expect(owned.length).toBe(2);
    });
  });

  describe('checkAccess', () => {
    it('should return share when recipient has access to exact path', () => {
      store.create({
        ownerId: 'alice',
        recipientId: 'bob',
        paths: ['knowledge/public/'],
      });

      const share = store.checkAccess('bob', 'alice', 'knowledge/public/');
      expect(share).toBeDefined();
      expect(share!.ownerId).toBe('alice');
    });

    it('should return share when path is under shared prefix', () => {
      store.create({
        ownerId: 'alice',
        recipientId: 'bob',
        paths: ['knowledge/public/'],
      });

      const share = store.checkAccess('bob', 'alice', 'knowledge/public/docs/readme.md');
      expect(share).toBeDefined();
    });

    it('should return undefined when no access', () => {
      store.create({
        ownerId: 'alice',
        recipientId: 'bob',
        paths: ['knowledge/public/'],
      });

      const share = store.checkAccess('bob', 'alice', 'knowledge/private/secrets.md');
      expect(share).toBeUndefined();
    });

    it('should not grant access through revoked shares', () => {
      const share = store.create({
        ownerId: 'alice',
        recipientId: 'bob',
        paths: ['knowledge/public/'],
      });
      store.revoke(share.id);

      const access = store.checkAccess('bob', 'alice', 'knowledge/public/');
      expect(access).toBeUndefined();
    });
  });

  describe('count and clear', () => {
    it('should return correct count', () => {
      expect(store.count()).toBe(0);
      store.create(validInput);
      expect(store.count()).toBe(1);
      store.create({ ...validInput, recipientId: 'user-carol' });
      expect(store.count()).toBe(2);
    });

    it('should clear all shares', () => {
      store.create(validInput);
      store.create({ ...validInput, recipientId: 'user-carol' });
      store.clear();
      expect(store.count()).toBe(0);
    });
  });
});

describe('validateCreateShareInput', () => {
  const validInput: CreateShareInput = {
    ownerId: 'user-alice',
    recipientId: 'user-bob',
    paths: ['knowledge/public/'],
    permissions: ['read'],
  };

  it('should pass for valid input', () => {
    const result = validateCreateShareInput(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject missing ownerId', () => {
    const result = validateCreateShareInput({ ...validInput, ownerId: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ownerId'))).toBe(true);
  });

  it('should reject missing recipientId', () => {
    const result = validateCreateShareInput({ ...validInput, recipientId: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('recipientId'))).toBe(true);
  });

  it('should reject sharing with yourself', () => {
    const result = validateCreateShareInput({
      ...validInput,
      recipientId: validInput.ownerId,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('yourself'))).toBe(true);
  });

  it('should reject empty paths array', () => {
    const result = validateCreateShareInput({ ...validInput, paths: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('paths'))).toBe(true);
  });

  it('should reject paths with path traversal', () => {
    const result = validateCreateShareInput({
      ...validInput,
      paths: ['knowledge/../secrets/'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('traversal'))).toBe(true);
  });

  it('should reject absolute paths', () => {
    const result = validateCreateShareInput({
      ...validInput,
      paths: ['/etc/passwd'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Absolute'))).toBe(true);
  });

  it('should reject invalid characters in paths', () => {
    const result = validateCreateShareInput({
      ...validInput,
      paths: ['knowledge/<script>/'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid path'))).toBe(true);
  });

  it('should reject duplicate paths', () => {
    const result = validateCreateShareInput({
      ...validInput,
      paths: ['knowledge/', 'knowledge/'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('should reject too many paths', () => {
    const paths = Array.from({ length: 101 }, (_, i) => `path${i}/`);
    const result = validateCreateShareInput({ ...validInput, paths });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Maximum'))).toBe(true);
  });

  it('should reject invalid permissions', () => {
    const result = validateCreateShareInput({
      ...validInput,
      permissions: ['execute' as 'read'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('permission'))).toBe(true);
  });

  it('should accept write permission', () => {
    const result = validateCreateShareInput({
      ...validInput,
      permissions: ['read', 'write'],
    });
    expect(result.valid).toBe(true);
  });

  it('should reject past expiration date', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const result = validateCreateShareInput({
      ...validInput,
      expiresAt: past,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('future'))).toBe(true);
  });

  it('should reject invalid expiration date', () => {
    const result = validateCreateShareInput({
      ...validInput,
      expiresAt: 'not-a-date',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ISO 8601'))).toBe(true);
  });

  it('should accept null expiration', () => {
    const result = validateCreateShareInput({
      ...validInput,
      expiresAt: null,
    });
    expect(result.valid).toBe(true);
  });

  it('should reject invalid ownerId format', () => {
    const result = validateCreateShareInput({
      ...validInput,
      ownerId: 'user alice!',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ownerId'))).toBe(true);
  });

  it('should reject invalid recipientId format', () => {
    const result = validateCreateShareInput({
      ...validInput,
      recipientId: 'user@bob',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('recipientId'))).toBe(true);
  });
});
