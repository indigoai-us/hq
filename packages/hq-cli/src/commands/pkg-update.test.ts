/**
 * Acceptance tests for US-007: hq update [package]
 *
 * Test strategy:
 *   - Unit tests for pure functions: isNewer(), deepMerge()
 *   - Integration tests for installed-packages.ts update flows (getAllInstalled, setInstalled)
 *   - Acceptance-spec tests document update orchestration logic
 *
 * Run: node --import tsx --test src/commands/pkg-update.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isNewer, deepMerge } from './pkg-update.js';
import { getInstalled, setInstalled, getAllInstalled } from '../utils/installed-packages.js';
import type { InstalledPackage } from '../types/package-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeFakeHQRoot(base: string): Promise<string> {
  await mkdir(path.join(base, 'workers'), { recursive: true });
  await writeFile(path.join(base, 'workers', 'registry.yaml'), 'workers: []\n', 'utf8');
  return base;
}

const devTeamPkg: InstalledPackage = {
  name: 'dev-team',
  version: '1.0.0',
  type: 'worker-pack',
  installedAt: '2026-01-01T00:00:00.000Z',
  files: ['workers/public/dev-worker/'],
  publisher: 'indigo',
};

// ─── isNewer() — semver comparison ───────────────────────────────────────────

describe('isNewer()', () => {
  it('returns true when major version is higher', () => {
    assert.equal(isNewer('2.0.0', '1.9.9'), true);
  });

  it('returns true when minor version is higher', () => {
    assert.equal(isNewer('1.1.0', '1.0.9'), true);
  });

  it('returns true when patch version is higher', () => {
    assert.equal(isNewer('1.0.1', '1.0.0'), true);
  });

  it('returns false when versions are equal', () => {
    assert.equal(isNewer('1.0.0', '1.0.0'), false);
  });

  it('returns false when registry version is lower', () => {
    assert.equal(isNewer('1.0.0', '2.0.0'), false);
  });

  it('handles v-prefix correctly', () => {
    assert.equal(isNewer('v1.1.0', 'v1.0.0'), true);
    assert.equal(isNewer('v1.0.0', 'v1.0.0'), false);
  });
});

// ─── deepMerge() — merge semantics ───────────────────────────────────────────

describe('deepMerge() — object merging', () => {
  it('merges top-level object keys from remote into local', () => {
    const local = { a: 1, b: 2 };
    const remote = { b: 99, c: 3 };
    const result = deepMerge(local, remote) as Record<string, number>;
    assert.equal(result['a'], 1);  // kept from local
    assert.equal(result['b'], 99); // remote wins on conflict
    assert.equal(result['c'], 3);  // new key from remote
  });

  it('recursively merges nested objects', () => {
    const local = { config: { timeout: 30, retries: 3 } };
    const remote = { config: { timeout: 60, verbose: true } };
    const result = deepMerge(local, remote) as { config: Record<string, unknown> };
    assert.equal(result.config['timeout'], 60);   // remote wins
    assert.equal(result.config['retries'], 3);    // kept from local
    assert.equal(result.config['verbose'], true); // new from remote
  });
});

describe('deepMerge() — string array union', () => {
  it('unions two string arrays by value', () => {
    const local = ['a', 'b', 'c'];
    const remote = ['b', 'c', 'd'];
    const result = deepMerge(local, remote) as string[];
    assert.deepEqual(result, ['a', 'b', 'c', 'd']);
  });

  it('preserves local order and appends new remote entries', () => {
    const local = ['x', 'y'];
    const remote = ['z', 'x'];
    const result = deepMerge(local, remote) as string[];
    // 'x' deduped, 'y' kept, 'z' added
    assert.ok(result.includes('x'));
    assert.ok(result.includes('y'));
    assert.ok(result.includes('z'));
    assert.equal(result.length, 3);
  });

  it('returns an empty array if both inputs are empty', () => {
    const result = deepMerge([], []) as string[];
    assert.deepEqual(result, []);
  });
});

describe('deepMerge() — non-string arrays', () => {
  it('replaces local with remote for non-string arrays', () => {
    const local = [{ id: 1 }, { id: 2 }];
    const remote = [{ id: 3 }];
    const result = deepMerge(local, remote);
    assert.deepEqual(result, [{ id: 3 }]);
  });
});

describe('deepMerge() — scalars', () => {
  it('remote value wins for scalar conflicts', () => {
    assert.equal(deepMerge('local', 'remote'), 'remote');
    assert.equal(deepMerge(1, 2), 2);
    assert.equal(deepMerge(true, false), false);
  });

  it('handles null inputs gracefully (remote wins)', () => {
    assert.equal(deepMerge(null, 'remote'), 'remote');
    assert.equal(deepMerge('local', null), null);
  });
});

describe('deepMerge() — YAML-style document merge', () => {
  it('merges a worker.yaml-style document', () => {
    const local = {
      name: 'dev-worker',
      skills: ['code-review', 'testing'],
      config: { model: 'sonnet', maxTokens: 8192 },
    };
    const remote = {
      name: 'dev-worker',
      skills: ['code-review', 'deploy'],
      config: { maxTokens: 16384, streaming: true },
      version: '1.1.0',
    };
    const result = deepMerge(local, remote) as typeof local & { version: string };
    // String array union
    assert.deepEqual((result as Record<string, unknown>)['skills'], ['code-review', 'testing', 'deploy']);
    // Nested object merge
    const config = (result as Record<string, unknown>)['config'] as Record<string, unknown>;
    assert.equal(config['model'], 'sonnet');          // kept from local
    assert.equal(config['maxTokens'], 16384);         // remote wins
    assert.equal(config['streaming'], true);          // new from remote
    // New top-level key from remote
    assert.equal(result.version, '1.1.0');
  });
});

// ─── getAllInstalled() — integration tests ────────────────────────────────────

describe('getAllInstalled()', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-getall-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty object when no packages installed', async () => {
    const all = await getAllInstalled(tmpDir);
    assert.deepEqual(all, {});
  });

  it('returns all installed packages keyed by name', async () => {
    const pkgA: InstalledPackage = { ...devTeamPkg, name: 'pkg-a' };
    const pkgB: InstalledPackage = { ...devTeamPkg, name: 'pkg-b' };
    await setInstalled(tmpDir, pkgA);
    await setInstalled(tmpDir, pkgB);

    const all = await getAllInstalled(tmpDir);
    assert.ok('pkg-a' in all);
    assert.ok('pkg-b' in all);
    assert.equal(all['pkg-a']?.name, 'pkg-a');
    assert.equal(all['pkg-b']?.name, 'pkg-b');
  });
});

// ─── Update flow — installed.json state transitions ──────────────────────────

describe('hq update — AC-1: updatedAt is set and version is bumped after update', () => {
  /**
   * Acceptance criterion:
   *   Given dev-team v1.0.0 is installed and v1.1.0 is on registry,
   *   when running 'hq update dev-team',
   *   then the package updates to v1.1.0 and installed.json reflects the new state.
   *
   * The underlying data layer is fully testable. The test below verifies
   * that setInstalled() correctly persists the updated record that
   * updateOnePackage() would write on success.
   */
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-update-ac1-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('setInstalled writes new version and updatedAt — getInstalled reads back correctly', async () => {
    await setInstalled(tmpDir, devTeamPkg);

    // Simulate the update record that updateOnePackage() writes
    const updateRecord: InstalledPackage = {
      ...devTeamPkg,
      version: '1.1.0',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    await setInstalled(tmpDir, updateRecord);

    const saved = await getInstalled(tmpDir, 'dev-team');
    assert.ok(saved !== null);
    assert.equal(saved.version, '1.1.0');
    assert.equal(saved.updatedAt, '2026-02-01T00:00:00.000Z');
    assert.equal(saved.installedAt, devTeamPkg.installedAt); // preserved
  });
});

describe('hq update — AC-2: all packages up to date message', () => {
  /**
   * Acceptance criterion:
   *   Given all packages are at latest version,
   *   when running 'hq update',
   *   then a message says 'all packages up to date'.
   *
   * isNewer() is the guard that determines whether an update is needed.
   * When registry version === installed version, isNewer returns false,
   * and updateOnePackage() returns 'up-to-date' without downloading anything.
   */
  it('isNewer returns false when registry version equals installed version', () => {
    assert.equal(isNewer('1.0.0', '1.0.0'), false);
    // updateOnePackage() would skip download and return 'up-to-date'
    // The outer loop would set updatedCount = 0 and print "All packages up to date."
  });

  it('isNewer returns false when installed version is newer than registry', () => {
    // Edge case: locally pinned at a newer version — should not downgrade
    assert.equal(isNewer('1.0.0', '1.1.0'), false);
  });
});

describe('hq update — merge semantics for YAML files (documented spec)', () => {
  /**
   * The PRD specifies:
   *   "For YAML/JSON files: deep merge object keys, union by value for string arrays"
   *
   * These tests confirm the merge engine satisfies the spec for representative
   * YAML structures found in worker.yaml and hq-package.yaml files.
   */

  it('new fields from remote are added to local YAML document', () => {
    const local = { name: 'my-worker', version: '1.0.0' };
    const remote = { name: 'my-worker', version: '1.1.0', tags: ['ai', 'coding'] };
    const merged = deepMerge(local, remote) as Record<string, unknown>;
    assert.deepEqual(merged['tags'], ['ai', 'coding']);
    assert.equal(merged['version'], '1.1.0');
    assert.equal(merged['name'], 'my-worker');
  });

  it('existing string array fields are unioned (not replaced)', () => {
    const local = { skills: ['review', 'testing'] };
    const remote = { skills: ['review', 'deploy'] };
    const merged = deepMerge(local, remote) as { skills: string[] };
    assert.ok(merged.skills.includes('review'));
    assert.ok(merged.skills.includes('testing'));
    assert.ok(merged.skills.includes('deploy'));
    assert.equal(merged.skills.length, 3); // no duplicates
  });
});
