import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SyncStateManager } from '../download/sync-state.js';
import type { S3ObjectInfo } from '../download/types.js';

describe('SyncStateManager', () => {
  let tmpDir: string;
  let stateFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sync-state-test-'));
    stateFilePath = path.join(tmpDir, '.hq-sync-state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeS3Object(relativePath: string, lastModified?: number): S3ObjectInfo {
    return {
      key: `user1/hq/${relativePath}`,
      relativePath,
      lastModified: lastModified ?? Date.now(),
      size: 1024,
      etag: `"etag-${relativePath}"`,
    };
  }

  describe('initial state', () => {
    it('should start with zero entries', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      expect(manager.size).toBe(0);
    });

    it('should start with null lastPollAt', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      expect(manager.lastPollAt).toBeNull();
    });
  });

  describe('entry management', () => {
    it('should track a new entry after updateEntry', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      const obj = makeS3Object('knowledge/file.md');

      manager.updateEntry(obj);

      expect(manager.size).toBe(1);
      const entry = manager.getEntry('knowledge/file.md');
      expect(entry).toBeDefined();
      expect(entry!.relativePath).toBe('knowledge/file.md');
      expect(entry!.lastModified).toBe(obj.lastModified);
      expect(entry!.etag).toBe(obj.etag);
      expect(entry!.size).toBe(obj.size);
      expect(entry!.syncedAt).toBeGreaterThan(0);
    });

    it('should return undefined for untracked paths', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      expect(manager.getEntry('nonexistent.txt')).toBeUndefined();
    });

    it('should remove entries', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      manager.updateEntry(makeS3Object('file.txt'));
      expect(manager.size).toBe(1);

      manager.removeEntry('file.txt');
      expect(manager.size).toBe(0);
      expect(manager.getEntry('file.txt')).toBeUndefined();
    });

    it('should not error when removing non-existent entry', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      expect(() => manager.removeEntry('nonexistent.txt')).not.toThrow();
    });

    it('should list tracked paths', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      manager.updateEntry(makeS3Object('a.txt'));
      manager.updateEntry(makeS3Object('b.txt'));

      const paths = manager.getTrackedPaths();
      expect(paths).toContain('a.txt');
      expect(paths).toContain('b.txt');
      expect(paths).toHaveLength(2);
    });

    it('should return all entries as array', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      manager.updateEntry(makeS3Object('a.txt'));
      manager.updateEntry(makeS3Object('b.txt'));

      const entries = manager.getAllEntries();
      expect(entries).toHaveLength(2);
    });

    it('should clear all entries', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      manager.updateEntry(makeS3Object('a.txt'));
      manager.updateEntry(makeS3Object('b.txt'));

      manager.clear();
      expect(manager.size).toBe(0);
      expect(manager.lastPollAt).toBeNull();
    });
  });

  describe('change detection', () => {
    it('should detect new files', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      const obj = makeS3Object('new-file.txt');

      expect(manager.hasChanged(obj)).toBe(true);
    });

    it('should not detect unchanged files', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      const obj = makeS3Object('file.txt', 1700000000000);

      manager.updateEntry(obj);
      expect(manager.hasChanged(obj)).toBe(false);
    });

    it('should detect modified files by lastModified', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      const obj = makeS3Object('file.txt', 1700000000000);
      manager.updateEntry(obj);

      const modifiedObj = { ...obj, lastModified: 1700000001000 };
      expect(manager.hasChanged(modifiedObj)).toBe(true);
    });

    it('should detect modified files by etag', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      const obj = makeS3Object('file.txt', 1700000000000);
      manager.updateEntry(obj);

      const modifiedObj = { ...obj, etag: '"different-etag"' };
      expect(manager.hasChanged(modifiedObj)).toBe(true);
    });
  });

  describe('poll tracking', () => {
    it('should record poll timestamp', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      const before = Date.now();

      manager.recordPoll();

      expect(manager.lastPollAt).not.toBeNull();
      expect(manager.lastPollAt!).toBeGreaterThanOrEqual(before);
    });
  });

  describe('persistence', () => {
    it('should save and load state', () => {
      const manager1 = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      manager1.updateEntry(makeS3Object('file1.txt', 1700000000000));
      manager1.updateEntry(makeS3Object('file2.txt', 1700000001000));
      manager1.recordPoll();
      manager1.forceSave();

      const manager2 = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      manager2.load();

      expect(manager2.size).toBe(2);
      expect(manager2.getEntry('file1.txt')).toBeDefined();
      expect(manager2.getEntry('file2.txt')).toBeDefined();
      expect(manager2.lastPollAt).not.toBeNull();
    });

    it('should not save when not dirty', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      manager.save();

      // File should not be created since nothing changed
      expect(fs.existsSync(stateFilePath)).toBe(false);
    });

    it('should create parent directories on save', () => {
      const deepPath = path.join(tmpDir, 'a', 'b', 'state.json');
      const manager = new SyncStateManager(deepPath, 'user1', 'user1/hq/');
      manager.updateEntry(makeS3Object('file.txt'));
      manager.save();

      expect(fs.existsSync(deepPath)).toBe(true);
    });

    it('should handle corrupt state file gracefully', () => {
      fs.writeFileSync(stateFilePath, 'not valid json', 'utf-8');

      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      expect(() => manager.load()).not.toThrow();
      expect(manager.size).toBe(0);
    });

    it('should handle missing state file gracefully', () => {
      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      expect(() => manager.load()).not.toThrow();
      expect(manager.size).toBe(0);
    });

    it('should handle wrong version state file', () => {
      fs.writeFileSync(
        stateFilePath,
        JSON.stringify({ version: 99, entries: { 'x.txt': {} } }),
        'utf-8'
      );

      const manager = new SyncStateManager(stateFilePath, 'user1', 'user1/hq/');
      manager.load();
      expect(manager.size).toBe(0);
    });
  });
});
