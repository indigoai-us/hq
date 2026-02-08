import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConflictDetector } from '../conflict/conflict-detector.js';
import { ConflictResolver } from '../conflict/conflict-resolver.js';
import { ConflictLog } from '../conflict/conflict-log.js';
import type {
  ConflictCheckInput,
  SyncConflict,
} from '../conflict/types.js';
import { DEFAULT_CONFLICT_CONFIG } from '../conflict/types.js';
import type { Logger } from 'pino';

function createMockLogger(): Logger {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function makeCheckInput(overrides?: Partial<ConflictCheckInput>): ConflictCheckInput {
  return {
    relativePath: 'docs/readme.md',
    localAbsolutePath: '/hq/docs/readme.md',
    localHash: 'local-hash-new',
    localSizeBytes: 1024,
    localLastModified: 1700000002000,
    s3Key: 'user1/hq/docs/readme.md',
    remoteHash: 'remote-hash-new',
    remoteEtag: '"new-etag"',
    remoteSizeBytes: 2048,
    remoteLastModified: 1700000003000,
    lastSyncedHash: 'synced-hash-old',
    lastSyncedEtag: '"old-etag"',
    ...overrides,
  };
}

function makeSyncConflict(overrides?: Partial<SyncConflict>): SyncConflict {
  return {
    id: 'conflict-test-123',
    relativePath: 'docs/readme.md',
    local: {
      relativePath: 'docs/readme.md',
      currentHash: 'local-hash-new',
      lastSyncedHash: 'synced-hash-old',
      sizeBytes: 1024,
      lastModified: 1700000002000,
    },
    remote: {
      s3Key: 'user1/hq/docs/readme.md',
      relativePath: 'docs/readme.md',
      currentHash: 'remote-hash-new',
      lastSyncedEtag: '"old-etag"',
      currentEtag: '"new-etag"',
      sizeBytes: 2048,
      lastModified: 1700000003000,
    },
    status: 'detected',
    strategy: 'keep_both',
    detectedAt: 1700000004000,
    resolvedAt: null,
    conflictFilePath: null,
    error: null,
    ...overrides,
  };
}

// ============================================================
// ConflictDetector tests
// ============================================================
describe('ConflictDetector', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('checkConflict', () => {
    it('should detect a conflict when both local and remote changed', () => {
      const detector = new ConflictDetector(logger);
      const input = makeCheckInput();

      const conflict = detector.checkConflict(input);

      expect(conflict).not.toBeNull();
      expect(conflict!.relativePath).toBe('docs/readme.md');
      expect(conflict!.status).toBe('detected');
      expect(conflict!.strategy).toBe('keep_both');
      expect(conflict!.local.currentHash).toBe('local-hash-new');
      expect(conflict!.local.lastSyncedHash).toBe('synced-hash-old');
      expect(conflict!.remote.currentEtag).toBe('"new-etag"');
      expect(conflict!.remote.lastSyncedEtag).toBe('"old-etag"');
      expect(conflict!.id).toMatch(/^conflict-/);
      expect(conflict!.detectedAt).toBeGreaterThan(0);
      expect(conflict!.resolvedAt).toBeNull();
    });

    it('should return null when only local changed (no conflict)', () => {
      const detector = new ConflictDetector(logger);
      const input = makeCheckInput({
        // Remote hasn't changed (ETag matches last sync)
        remoteEtag: '"old-etag"',
        remoteHash: 'synced-hash-old',
      });

      const conflict = detector.checkConflict(input);

      expect(conflict).toBeNull();
    });

    it('should return null when only remote changed (no conflict)', () => {
      const detector = new ConflictDetector(logger);
      const input = makeCheckInput({
        // Local hasn't changed (hash matches last sync)
        localHash: 'synced-hash-old',
      });

      const conflict = detector.checkConflict(input);

      expect(conflict).toBeNull();
    });

    it('should return null when neither side changed', () => {
      const detector = new ConflictDetector(logger);
      const input = makeCheckInput({
        localHash: 'synced-hash-old',
        remoteEtag: '"old-etag"',
        remoteHash: 'synced-hash-old',
      });

      const conflict = detector.checkConflict(input);

      expect(conflict).toBeNull();
    });

    it('should detect conflict when both sides are new (never synced)', () => {
      const detector = new ConflictDetector(logger);
      const input = makeCheckInput({
        lastSyncedHash: '',
        lastSyncedEtag: '',
      });

      const conflict = detector.checkConflict(input);

      expect(conflict).not.toBeNull();
      expect(conflict!.status).toBe('detected');
    });

    it('should use default strategy (keep_both)', () => {
      const detector = new ConflictDetector(logger);
      const input = makeCheckInput();

      const conflict = detector.checkConflict(input);

      expect(conflict).not.toBeNull();
      expect(conflict!.strategy).toBe('keep_both');
    });

    it('should use configured default strategy', () => {
      const detector = new ConflictDetector(logger, {
        defaultStrategy: 'remote_wins',
      });
      const input = makeCheckInput();

      const conflict = detector.checkConflict(input);

      expect(conflict).not.toBeNull();
      expect(conflict!.strategy).toBe('remote_wins');
    });

    it('should use strategy overrides for matching paths', () => {
      const detector = new ConflictDetector(logger, {
        strategyOverrides: {
          'docs/**': 'local_wins',
          '*.config': 'remote_wins',
        },
      });

      const docsInput = makeCheckInput({ relativePath: 'docs/readme.md' });
      const configInput = makeCheckInput({ relativePath: 'app.config' });
      const otherInput = makeCheckInput({ relativePath: 'src/main.ts' });

      const docsConflict = detector.checkConflict(docsInput);
      const configConflict = detector.checkConflict(configInput);
      const otherConflict = detector.checkConflict(otherInput);

      expect(docsConflict!.strategy).toBe('local_wins');
      expect(configConflict!.strategy).toBe('remote_wins');
      expect(otherConflict!.strategy).toBe('keep_both');
    });

    it('should set status to deferred for manual strategy', () => {
      const detector = new ConflictDetector(logger, {
        defaultStrategy: 'manual',
      });
      const input = makeCheckInput();

      const conflict = detector.checkConflict(input);

      expect(conflict).not.toBeNull();
      expect(conflict!.status).toBe('deferred');
      expect(conflict!.strategy).toBe('manual');
    });

    it('should detect conflict based on ETag change alone', () => {
      const detector = new ConflictDetector(logger);
      const input = makeCheckInput({
        // Local changed
        localHash: 'local-hash-new',
        lastSyncedHash: 'synced-hash-old',
        // Remote ETag changed, no content hash to compare
        remoteEtag: '"new-etag"',
        lastSyncedEtag: '"old-etag"',
        remoteHash: '',
      });

      const conflict = detector.checkConflict(input);

      expect(conflict).not.toBeNull();
    });
  });

  describe('checkConflicts (batch)', () => {
    it('should return only files with actual conflicts', () => {
      const detector = new ConflictDetector(logger);
      const inputs = [
        makeCheckInput({ relativePath: 'file1.txt' }), // conflict
        makeCheckInput({
          relativePath: 'file2.txt',
          localHash: 'synced-hash-old', // no local change
        }),
        makeCheckInput({ relativePath: 'file3.txt' }), // conflict
      ];

      const conflicts = detector.checkConflicts(inputs);

      expect(conflicts).toHaveLength(2);
      expect(conflicts[0]!.relativePath).toBe('file1.txt');
      expect(conflicts[1]!.relativePath).toBe('file3.txt');
    });

    it('should return empty array when no conflicts found', () => {
      const detector = new ConflictDetector(logger);
      const inputs = [
        makeCheckInput({
          relativePath: 'file1.txt',
          localHash: 'synced-hash-old',
        }),
      ];

      const conflicts = detector.checkConflicts(inputs);

      expect(conflicts).toHaveLength(0);
    });

    it('should handle empty input array', () => {
      const detector = new ConflictDetector(logger);
      const conflicts = detector.checkConflicts([]);

      expect(conflicts).toHaveLength(0);
    });
  });
});

// ============================================================
// ConflictResolver tests
// ============================================================
describe('ConflictResolver', () => {
  let tmpDir: string;
  let logger: Logger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-conflict-resolve-test-'));
    logger = createMockLogger();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('keep_both strategy', () => {
    it('should rename local file to .conflict path', () => {
      // Create the local file
      const docsDir = path.join(tmpDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'readme.md'), 'local content');

      const resolver = new ConflictResolver(tmpDir, logger);
      const conflict = makeSyncConflict({ strategy: 'keep_both' });

      const result = resolver.resolve(conflict);

      expect(result.success).toBe(true);
      expect(result.action).toContain('keep_both');
      expect(conflict.status).toBe('resolved');
      expect(conflict.resolvedAt).toBeGreaterThan(0);
      expect(conflict.conflictFilePath).not.toBeNull();
      expect(conflict.conflictFilePath).toContain('.conflict');
      expect(conflict.conflictFilePath).toContain('.md');

      // Original file should be gone
      expect(fs.existsSync(path.join(docsDir, 'readme.md'))).toBe(false);

      // Conflict file should exist
      const conflictAbsPath = path.join(tmpDir, conflict.conflictFilePath!);
      expect(fs.existsSync(conflictAbsPath)).toBe(true);
      expect(fs.readFileSync(conflictAbsPath, 'utf-8')).toBe('local content');
    });

    it('should include timestamp in conflict filename by default', () => {
      const docsDir = path.join(tmpDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'readme.md'), 'content');

      const resolver = new ConflictResolver(tmpDir, logger);
      const conflict = makeSyncConflict({ strategy: 'keep_both' });

      resolver.resolve(conflict);

      // Should match pattern: docs/readme.{timestamp}.conflict.md
      expect(conflict.conflictFilePath).toMatch(
        /^docs[/\\]readme\.\d+\.conflict\.md$/
      );
    });

    it('should not include timestamp when disabled', () => {
      const docsDir = path.join(tmpDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'readme.md'), 'content');

      const resolver = new ConflictResolver(tmpDir, logger, {
        timestampConflictFiles: false,
      });
      const conflict = makeSyncConflict({ strategy: 'keep_both' });

      resolver.resolve(conflict);

      expect(conflict.conflictFilePath).toMatch(
        /^docs[/\\]readme\.conflict\.md$/
      );
    });

    it('should handle files without extensions', () => {
      fs.writeFileSync(path.join(tmpDir, 'Makefile'), 'content');

      const resolver = new ConflictResolver(tmpDir, logger, {
        timestampConflictFiles: false,
      });
      const conflict = makeSyncConflict({
        relativePath: 'Makefile',
        strategy: 'keep_both',
      });

      resolver.resolve(conflict);

      expect(conflict.conflictFilePath).toBe('Makefile.conflict');
    });

    it('should succeed when local file already removed', () => {
      // Don't create the file
      const resolver = new ConflictResolver(tmpDir, logger);
      const conflict = makeSyncConflict({ strategy: 'keep_both' });

      const result = resolver.resolve(conflict);

      expect(result.success).toBe(true);
      expect(conflict.status).toBe('resolved');
    });
  });

  describe('local_wins strategy', () => {
    it('should mark as resolved without filesystem changes', () => {
      const docsDir = path.join(tmpDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'readme.md'), 'local content');

      const resolver = new ConflictResolver(tmpDir, logger);
      const conflict = makeSyncConflict({ strategy: 'local_wins' });

      const result = resolver.resolve(conflict);

      expect(result.success).toBe(true);
      expect(result.action).toContain('local_wins');
      expect(conflict.status).toBe('resolved');
      expect(conflict.resolvedAt).toBeGreaterThan(0);

      // Local file should still exist unchanged
      expect(fs.readFileSync(path.join(docsDir, 'readme.md'), 'utf-8')).toBe('local content');
    });
  });

  describe('remote_wins strategy', () => {
    it('should mark as resolved and indicate remote overwrite', () => {
      const resolver = new ConflictResolver(tmpDir, logger);
      const conflict = makeSyncConflict({ strategy: 'remote_wins' });

      const result = resolver.resolve(conflict);

      expect(result.success).toBe(true);
      expect(result.action).toContain('remote_wins');
      expect(conflict.status).toBe('resolved');
      expect(conflict.resolvedAt).toBeGreaterThan(0);
    });
  });

  describe('manual strategy', () => {
    it('should set status to deferred', () => {
      const resolver = new ConflictResolver(tmpDir, logger);
      const conflict = makeSyncConflict({ strategy: 'manual' });

      const result = resolver.resolve(conflict);

      expect(result.success).toBe(true);
      expect(result.action).toContain('manual');
      expect(conflict.status).toBe('deferred');
      expect(conflict.resolvedAt).toBeNull();
    });
  });

  describe('resolveWithStrategy', () => {
    it('should override the conflict strategy and resolve', () => {
      const docsDir = path.join(tmpDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'readme.md'), 'content');

      const resolver = new ConflictResolver(tmpDir, logger);
      const conflict = makeSyncConflict({ strategy: 'manual' });

      const result = resolver.resolveWithStrategy(conflict, 'local_wins');

      expect(result.success).toBe(true);
      expect(conflict.strategy).toBe('local_wins');
      expect(conflict.status).toBe('resolved');
    });
  });

  describe('error handling', () => {
    it('should handle filesystem errors gracefully', () => {
      // Create a directory where the conflict rename target would go,
      // but make the source file path invalid
      const resolver = new ConflictResolver(tmpDir, logger);
      const conflict = makeSyncConflict({
        relativePath: 'nonexistent/deeply/nested/file.txt',
        strategy: 'keep_both',
      });

      // File doesn't exist, so keep_both should succeed (no rename needed)
      const result = resolver.resolve(conflict);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================
// ConflictLog tests
// ============================================================
describe('ConflictLog', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('add and get', () => {
    it('should add and retrieve conflicts by ID', () => {
      const log = new ConflictLog(logger);
      const conflict = makeSyncConflict({ id: 'test-1' });

      log.add(conflict);

      expect(log.size).toBe(1);
      expect(log.get('test-1')).toBe(conflict);
    });

    it('should return undefined for unknown IDs', () => {
      const log = new ConflictLog(logger);

      expect(log.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getByPath', () => {
    it('should return the most recent unresolved conflict for a path', () => {
      const log = new ConflictLog(logger);

      const older = makeSyncConflict({
        id: 'older',
        relativePath: 'file.txt',
        detectedAt: 1700000000000,
      });
      const newer = makeSyncConflict({
        id: 'newer',
        relativePath: 'file.txt',
        detectedAt: 1700000001000,
      });

      log.add(older);
      log.add(newer);

      expect(log.getByPath('file.txt')?.id).toBe('newer');
    });

    it('should skip resolved conflicts', () => {
      const log = new ConflictLog(logger);

      const resolved = makeSyncConflict({
        id: 'resolved',
        relativePath: 'file.txt',
        status: 'resolved',
        detectedAt: 1700000002000,
      });
      const unresolved = makeSyncConflict({
        id: 'unresolved',
        relativePath: 'file.txt',
        detectedAt: 1700000001000,
      });

      log.add(resolved);
      log.add(unresolved);

      expect(log.getByPath('file.txt')?.id).toBe('unresolved');
    });

    it('should return undefined when no unresolved conflict exists', () => {
      const log = new ConflictLog(logger);
      const resolved = makeSyncConflict({
        id: 'resolved',
        relativePath: 'file.txt',
        status: 'resolved',
      });

      log.add(resolved);

      expect(log.getByPath('file.txt')).toBeUndefined();
    });
  });

  describe('hasUnresolvedConflict', () => {
    it('should return true when an unresolved conflict exists', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ relativePath: 'file.txt', status: 'detected' }));

      expect(log.hasUnresolvedConflict('file.txt')).toBe(true);
    });

    it('should return true for deferred conflicts', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ relativePath: 'file.txt', status: 'deferred' }));

      expect(log.hasUnresolvedConflict('file.txt')).toBe(true);
    });

    it('should return false when only resolved conflicts exist', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ relativePath: 'file.txt', status: 'resolved' }));

      expect(log.hasUnresolvedConflict('file.txt')).toBe(false);
    });

    it('should return false for unknown paths', () => {
      const log = new ConflictLog(logger);

      expect(log.hasUnresolvedConflict('unknown.txt')).toBe(false);
    });
  });

  describe('update', () => {
    it('should update an existing conflict', () => {
      const log = new ConflictLog(logger);
      const conflict = makeSyncConflict({ id: 'test-1', status: 'detected' });

      log.add(conflict);

      conflict.status = 'resolved';
      conflict.resolvedAt = Date.now();
      log.update(conflict);

      expect(log.get('test-1')?.status).toBe('resolved');
    });

    it('should not add new conflicts via update', () => {
      const log = new ConflictLog(logger);
      const conflict = makeSyncConflict({ id: 'nonexistent' });

      log.update(conflict);

      expect(log.size).toBe(0);
    });
  });

  describe('remove', () => {
    it('should remove a conflict by ID', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: 'test-1' }));

      expect(log.remove('test-1')).toBe(true);
      expect(log.size).toBe(0);
    });

    it('should return false for unknown IDs', () => {
      const log = new ConflictLog(logger);

      expect(log.remove('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return all conflicts with counts', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1', status: 'detected' }));
      log.add(makeSyncConflict({ id: '2', status: 'resolved', resolvedAt: Date.now() }));
      log.add(makeSyncConflict({ id: '3', status: 'deferred' }));

      const result = log.list();

      expect(result.total).toBe(3);
      expect(result.unresolved).toBe(1);
      expect(result.resolved).toBe(1);
      expect(result.deferred).toBe(1);
      expect(result.conflicts).toHaveLength(3);
    });

    it('should filter by status', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1', status: 'detected' }));
      log.add(makeSyncConflict({ id: '2', status: 'resolved' }));
      log.add(makeSyncConflict({ id: '3', status: 'deferred' }));

      const result = log.list({ status: 'detected' });

      expect(result.total).toBe(1);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]!.id).toBe('1');
    });

    it('should filter by path prefix', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1', relativePath: 'docs/readme.md' }));
      log.add(makeSyncConflict({ id: '2', relativePath: 'docs/guide.md' }));
      log.add(makeSyncConflict({ id: '3', relativePath: 'src/main.ts' }));

      const result = log.list({ pathPrefix: 'docs/' });

      expect(result.total).toBe(2);
      expect(result.conflicts).toHaveLength(2);
    });

    it('should sort by detectedAt descending by default', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1', detectedAt: 1700000001000 }));
      log.add(makeSyncConflict({ id: '2', detectedAt: 1700000003000 }));
      log.add(makeSyncConflict({ id: '3', detectedAt: 1700000002000 }));

      const result = log.list();

      expect(result.conflicts[0]!.id).toBe('2');
      expect(result.conflicts[1]!.id).toBe('3');
      expect(result.conflicts[2]!.id).toBe('1');
    });

    it('should sort by relativePath ascending', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1', relativePath: 'c.txt' }));
      log.add(makeSyncConflict({ id: '2', relativePath: 'a.txt' }));
      log.add(makeSyncConflict({ id: '3', relativePath: 'b.txt' }));

      const result = log.list({
        sortBy: 'relativePath',
        sortDirection: 'asc',
      });

      expect(result.conflicts[0]!.id).toBe('2');
      expect(result.conflicts[1]!.id).toBe('3');
      expect(result.conflicts[2]!.id).toBe('1');
    });

    it('should paginate results', () => {
      const log = new ConflictLog(logger);
      for (let i = 0; i < 10; i++) {
        log.add(makeSyncConflict({
          id: `conflict-${i}`,
          detectedAt: 1700000000000 + i * 1000,
        }));
      }

      const page1 = log.list({ limit: 3, offset: 0 });
      const page2 = log.list({ limit: 3, offset: 3 });

      expect(page1.conflicts).toHaveLength(3);
      expect(page2.conflicts).toHaveLength(3);
      expect(page1.total).toBe(10);
      // Pages should be different conflicts
      expect(page1.conflicts[0]!.id).not.toBe(page2.conflicts[0]!.id);
    });
  });

  describe('getUnresolved and getDeferred', () => {
    it('should return unresolved conflicts (detected + deferred)', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1', status: 'detected' }));
      log.add(makeSyncConflict({ id: '2', status: 'resolved' }));
      log.add(makeSyncConflict({ id: '3', status: 'deferred' }));

      const unresolved = log.getUnresolved();

      expect(unresolved).toHaveLength(2);
      expect(unresolved.map((c) => c.id).sort()).toEqual(['1', '3']);
    });

    it('should return only deferred conflicts', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1', status: 'detected' }));
      log.add(makeSyncConflict({ id: '2', status: 'deferred' }));

      const deferred = log.getDeferred();

      expect(deferred).toHaveLength(1);
      expect(deferred[0]!.id).toBe('2');
    });
  });

  describe('clear and clearResolved', () => {
    it('should clear all conflicts', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1' }));
      log.add(makeSyncConflict({ id: '2' }));

      log.clear();

      expect(log.size).toBe(0);
    });

    it('should clear only resolved conflicts', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1', status: 'detected' }));
      log.add(makeSyncConflict({ id: '2', status: 'resolved' }));
      log.add(makeSyncConflict({ id: '3', status: 'deferred' }));

      const removed = log.clearResolved();

      expect(removed).toBe(1);
      expect(log.size).toBe(2);
      expect(log.get('1')).toBeDefined();
      expect(log.get('2')).toBeUndefined();
      expect(log.get('3')).toBeDefined();
    });
  });

  describe('toJSON and fromJSON', () => {
    it('should export and import conflicts', () => {
      const log = new ConflictLog(logger);
      log.add(makeSyncConflict({ id: '1' }));
      log.add(makeSyncConflict({ id: '2' }));

      const exported = log.toJSON();
      expect(exported).toHaveLength(2);

      const newLog = new ConflictLog(logger);
      newLog.fromJSON(exported);

      expect(newLog.size).toBe(2);
      expect(newLog.get('1')).toBeDefined();
      expect(newLog.get('2')).toBeDefined();
    });
  });

  describe('capacity management', () => {
    it('should evict oldest resolved conflict when over capacity', () => {
      const log = new ConflictLog(logger, { maxLogEntries: 3 });

      log.add(makeSyncConflict({
        id: 'old-resolved',
        status: 'resolved',
        detectedAt: 1700000000000,
      }));
      log.add(makeSyncConflict({
        id: 'unresolved',
        status: 'detected',
        detectedAt: 1700000001000,
      }));
      log.add(makeSyncConflict({
        id: 'newer-resolved',
        status: 'resolved',
        detectedAt: 1700000002000,
      }));

      // Adding a 4th should evict old-resolved (oldest resolved)
      log.add(makeSyncConflict({
        id: 'newest',
        status: 'detected',
        detectedAt: 1700000003000,
      }));

      expect(log.size).toBe(3);
      expect(log.get('old-resolved')).toBeUndefined();
      expect(log.get('unresolved')).toBeDefined();
      expect(log.get('newer-resolved')).toBeDefined();
      expect(log.get('newest')).toBeDefined();
    });

    it('should evict oldest overall if no resolved conflicts to evict', () => {
      const log = new ConflictLog(logger, { maxLogEntries: 2 });

      log.add(makeSyncConflict({
        id: 'oldest',
        status: 'detected',
        detectedAt: 1700000000000,
      }));
      log.add(makeSyncConflict({
        id: 'newer',
        status: 'detected',
        detectedAt: 1700000001000,
      }));
      log.add(makeSyncConflict({
        id: 'newest',
        status: 'detected',
        detectedAt: 1700000002000,
      }));

      expect(log.size).toBe(2);
      expect(log.get('oldest')).toBeUndefined();
    });
  });
});

// ============================================================
// Integration tests (Detector + Resolver + Log)
// ============================================================
describe('Conflict module integration', () => {
  let tmpDir: string;
  let logger: Logger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-conflict-integration-test-'));
    logger = createMockLogger();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect, log, and resolve a conflict end-to-end', () => {
    // 1. Detect the conflict
    const detector = new ConflictDetector(logger);
    const input = makeCheckInput();
    const conflict = detector.checkConflict(input);
    expect(conflict).not.toBeNull();

    // 2. Log the conflict
    const conflictLog = new ConflictLog(logger);
    conflictLog.add(conflict!);
    expect(conflictLog.hasUnresolvedConflict('docs/readme.md')).toBe(true);

    // 3. Create the local file for resolution
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'readme.md'), 'local version');

    // 4. Resolve the conflict
    const resolver = new ConflictResolver(tmpDir, logger);
    const result = resolver.resolve(conflict!);
    expect(result.success).toBe(true);

    // 5. Update the log
    conflictLog.update(conflict!);

    // 6. Verify final state
    expect(conflict!.status).toBe('resolved');
    expect(conflict!.conflictFilePath).not.toBeNull();

    const listing = conflictLog.list();
    expect(listing.resolved).toBe(1);
    expect(listing.unresolved).toBe(0);
  });

  it('should handle multiple conflicts in a batch flow', () => {
    const detector = new ConflictDetector(logger);
    const conflictLog = new ConflictLog(logger);
    const resolver = new ConflictResolver(tmpDir, logger);

    // Detect conflicts
    const inputs = [
      makeCheckInput({ relativePath: 'file1.txt' }),
      makeCheckInput({ relativePath: 'file2.txt' }),
      makeCheckInput({
        relativePath: 'file3.txt',
        localHash: 'synced-hash-old', // no local change
      }),
    ];

    const conflicts = detector.checkConflicts(inputs);
    expect(conflicts).toHaveLength(2);

    // Log conflicts
    for (const c of conflicts) {
      conflictLog.add(c);
    }

    // Create local files
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'content1');
    fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'content2');

    // Resolve conflicts
    for (const c of conflicts) {
      const result = resolver.resolve(c);
      expect(result.success).toBe(true);
      conflictLog.update(c);
    }

    // Verify
    const listing = conflictLog.list();
    expect(listing.resolved).toBe(2);
    expect(listing.unresolved).toBe(0);
  });

  it('should support re-resolving a deferred conflict with a different strategy', () => {
    const detector = new ConflictDetector(logger, { defaultStrategy: 'manual' });
    const conflictLog = new ConflictLog(logger);
    const resolver = new ConflictResolver(tmpDir, logger);

    const input = makeCheckInput();
    const conflict = detector.checkConflict(input);
    expect(conflict).not.toBeNull();
    expect(conflict!.status).toBe('deferred');

    conflictLog.add(conflict!);
    expect(conflictLog.getDeferred()).toHaveLength(1);

    // User decides to use local_wins
    const result = resolver.resolveWithStrategy(conflict!, 'local_wins');
    expect(result.success).toBe(true);
    expect(conflict!.status).toBe('resolved');
    expect(conflict!.strategy).toBe('local_wins');

    conflictLog.update(conflict!);
    expect(conflictLog.getDeferred()).toHaveLength(0);
  });
});

// ============================================================
// DEFAULT_CONFLICT_CONFIG tests
// ============================================================
describe('DEFAULT_CONFLICT_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_CONFLICT_CONFIG.defaultStrategy).toBe('keep_both');
    expect(DEFAULT_CONFLICT_CONFIG.strategyOverrides).toEqual({});
    expect(DEFAULT_CONFLICT_CONFIG.maxLogEntries).toBe(1000);
    expect(DEFAULT_CONFLICT_CONFIG.conflictSuffix).toBe('.conflict');
    expect(DEFAULT_CONFLICT_CONFIG.timestampConflictFiles).toBe(true);
  });
});
