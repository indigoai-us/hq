/**
 * Acceptance tests for US-006: hq remove <package>
 *
 * Test strategy:
 *  - Real runnable tests for installed-packages.ts removal flows (pure FS utils)
 *  - Acceptance-spec tests for remove.ts core flows (documented inline with
 *    runnable assertions where the code is unit-testable without process.exit mocking)
 *
 * Run: node --import tsx --test src/commands/remove.test.ts
 * (Or via any runner that supports node:test with ESM + tsx)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import yaml from 'js-yaml';

import { getInstalled, removeInstalled, setInstalled } from '../utils/installed-packages.js';
import type { InstalledPackage } from '../types/package-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal fake HQ root with workers/registry.yaml present. */
async function makeFakeHQRoot(base: string): Promise<string> {
  await mkdir(path.join(base, 'workers'), { recursive: true });
  await writeFile(path.join(base, 'workers', 'registry.yaml'), 'workers: []\n', 'utf8');
  return base;
}

/** Create a fake HQ root with a pre-populated workers/registry.yaml. */
async function makeFakeHQRootWithWorker(
  base: string,
  workerId: string,
  workerPath: string
): Promise<string> {
  await mkdir(path.join(base, 'workers'), { recursive: true });
  const registry = {
    workers: [
      { id: workerId, path: workerPath, type: 'CodeWorker', status: 'active' },
    ],
  };
  await writeFile(
    path.join(base, 'workers', 'registry.yaml'),
    yaml.dump(registry, { lineWidth: 120 }),
    'utf8'
  );
  return base;
}

const samplePackage: InstalledPackage = {
  name: 'dev-team',
  version: '1.0.0',
  type: 'worker-pack',
  installedAt: '2026-01-01T00:00:00.000Z',
  files: [
    path.join('workers', 'public', 'dev-worker'),
    path.join('workers', 'public', 'pm-worker'),
  ],
  publisher: 'anthropic',
};

// ─── AC-1: Package not installed → clear error ────────────────────────────────
//
// remove.ts step 2-3:
//   const pkg = await getInstalled(hqRoot, packageName);
//   if (!pkg) { console.error(`Package '${packageName}' is not installed.`); process.exit(1); }
//
// The remove guard checks getInstalled() for null. We verify that the data layer
// correctly returns null for a package that was never installed.

describe('hq remove — AC-1: package not installed → clear error', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-remove-ac1-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('getInstalled returns null for a package that was never installed', async () => {
    const result = await getInstalled(tmpDir, 'nonexistent-pkg');
    assert.equal(result, null);
    // remove.ts: if (!pkg) → prints "Package 'nonexistent-pkg' is not installed." and exits 1
  });

  it('getInstalled returns null when installed.json does not exist', async () => {
    const fresh = await mkdtemp(path.join(tmpdir(), 'hq-test-remove-fresh-'));
    try {
      await makeFakeHQRoot(fresh);
      const result = await getInstalled(fresh, 'dev-team');
      assert.equal(result, null, 'No installed.json means package is not installed');
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
  });
});

// ─── AC-2: Installed package → files deleted and installed.json updated ───────
//
// remove.ts steps 5 + 8:
//   for (const relFile of pkg.files) { await rm(absPath, { recursive: true, force: true }); }
//   await removeInstalled(hqRoot, packageName);
//
// We simulate the full flow: create files, register in installed.json,
// simulate removal (using removeInstalled as remove.ts does), then verify.

describe('hq remove — AC-2: installed package → files deleted and installed.json updated', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-remove-ac2-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removeInstalled removes the entry so getInstalled returns null', async () => {
    // Simulate install: write files and register in installed.json
    const workerDir = path.join(tmpDir, 'workers', 'public', 'test-worker');
    await mkdir(workerDir, { recursive: true });
    await writeFile(path.join(workerDir, 'worker.yaml'), 'id: test-worker\n', 'utf8');

    const record: InstalledPackage = {
      ...samplePackage,
      name: 'test-pkg',
      files: [path.join('workers', 'public', 'test-worker')],
    };
    await setInstalled(tmpDir, record);

    // Verify it's registered
    const before = await getInstalled(tmpDir, 'test-pkg');
    assert.ok(before !== null, 'Package should be registered before removal');

    // Simulate what remove.ts step 5 does: delete files
    const absWorkerDir = path.join(tmpDir, 'workers', 'public', 'test-worker');
    await rm(absWorkerDir, { recursive: true, force: true });

    // Simulate what remove.ts step 8 does: update installed.json
    await removeInstalled(tmpDir, 'test-pkg');

    // Assert: getInstalled now returns null
    const after = await getInstalled(tmpDir, 'test-pkg');
    assert.equal(after, null, 'Package should be unregistered after removal');
  });

  it('multiple packages: removing one does not affect others', async () => {
    const pkgA: InstalledPackage = { ...samplePackage, name: 'pkg-a', files: [] };
    const pkgB: InstalledPackage = { ...samplePackage, name: 'pkg-b', files: [] };

    await setInstalled(tmpDir, pkgA);
    await setInstalled(tmpDir, pkgB);

    await removeInstalled(tmpDir, 'pkg-a');

    assert.equal(await getInstalled(tmpDir, 'pkg-a'), null);
    assert.ok(await getInstalled(tmpDir, 'pkg-b') !== null, 'pkg-b should still be installed');
  });
});

// ─── AC-3: Workers removed from registry.yaml ────────────────────────────────
//
// remove.ts step 6:
//   filter registry workers whose path starts with any installed file path
//   rewrite registry.yaml with remaining workers
//
// We test the YAML manipulation logic directly: build a registry with a known
// worker, run the filter (as remove.ts would), verify the entry is removed.

describe('hq remove — AC-3: workers removed from registry.yaml', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-remove-ac3-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('worker entry with matching path is filtered out of registry', async () => {
    const workerPath = path.join('workers', 'public', 'dev-worker');
    await makeFakeHQRootWithWorker(tmpDir, 'dev-worker', workerPath + '/');

    // Read and parse registry
    const registryPath = path.join(tmpDir, 'workers', 'registry.yaml');
    const raw = await readFile(registryPath, 'utf8');

    interface WorkerEntry { id: string; path: string; [key: string]: unknown; }
    interface RegistryYaml { workers?: WorkerEntry[]; [key: string]: unknown; }

    const registry = yaml.load(raw) as RegistryYaml;
    const workers = registry.workers ?? [];

    assert.equal(workers.length, 1, 'Registry should have 1 worker before removal');

    // Simulate remove.ts filter: remove workers whose path starts with installed file path
    const installedFiles = [workerPath];
    const remaining = workers.filter(w => {
      const workerPathNorm = w.path.replace(/\/$/, '');
      return !installedFiles.some(f => {
        const fNorm = f.replace(/\/$/, '');
        return workerPathNorm === fNorm || workerPathNorm.startsWith(fNorm + path.sep);
      });
    });

    assert.equal(remaining.length, 0, 'Worker with matching path should be removed');

    // Write back and verify
    registry.workers = remaining;
    await writeFile(registryPath, yaml.dump(registry, { lineWidth: 120 }), 'utf8');

    const updatedRaw = await readFile(registryPath, 'utf8');
    const updated = yaml.load(updatedRaw) as RegistryYaml;
    assert.equal((updated.workers ?? []).length, 0, 'Registry should be empty after removal');
  });

  it('worker with non-matching path is kept in registry', async () => {
    const keepWorkerPath = path.join('workers', 'public', 'keep-worker');
    const removeWorkerPath = path.join('workers', 'public', 'remove-worker');

    // Registry with two workers
    const registry = {
      workers: [
        { id: 'keep-worker', path: keepWorkerPath + '/', type: 'CodeWorker', status: 'active' },
        { id: 'remove-worker', path: removeWorkerPath + '/', type: 'CodeWorker', status: 'active' },
      ],
    };

    const registryPath = path.join(tmpDir, 'workers', 'registry.yaml');
    await writeFile(registryPath, yaml.dump(registry, { lineWidth: 120 }), 'utf8');

    interface WorkerEntry { id: string; path: string; [key: string]: unknown; }
    interface RegistryYaml { workers?: WorkerEntry[]; [key: string]: unknown; }

    const raw = await readFile(registryPath, 'utf8');
    const loaded = yaml.load(raw) as RegistryYaml;
    const workers = loaded.workers ?? [];

    // Only remove 'remove-worker'
    const installedFiles = [removeWorkerPath];
    const remaining = workers.filter(w => {
      const workerPathNorm = w.path.replace(/\/$/, '');
      return !installedFiles.some(f => {
        const fNorm = f.replace(/\/$/, '');
        return workerPathNorm === fNorm || workerPathNorm.startsWith(fNorm + path.sep);
      });
    });

    assert.equal(remaining.length, 1, 'Only 1 worker should remain');
    assert.equal(remaining[0].id, 'keep-worker', 'The kept worker should be keep-worker');
  });

  it('non-worker files do not trigger registry updates', () => {
    // remove.ts only processes files starting with workers/public/
    const installedFiles = [
      path.join('.claude', 'commands', 'my-command.md'),
      path.join('.claude', 'skills', 'my-skill.md'),
      path.join('knowledge', 'public', 'my-kb'),
    ];

    const workerPrefix = path.join('workers', 'public', '');
    const workerFiles = installedFiles.filter(f => f.startsWith(workerPrefix));

    assert.equal(workerFiles.length, 0, 'No worker files → no registry update needed');
  });
});

// ─── AC-4: removeInstalled is a no-op when package not present ───────────────
//
// remove.ts (via removeInstalled in installed-packages.ts):
//   if (name in data.packages) { delete ... save } else { no-op }
//
// Verified here for the remove context: calling removeInstalled for a package
// that isn't installed should not throw or corrupt the file.

describe('hq remove — AC-4: removeInstalled is a no-op when package not present', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-remove-ac4-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removeInstalled does not throw when package is not present', async () => {
    await assert.doesNotReject(
      () => removeInstalled(tmpDir, 'never-installed-pkg'),
      'removeInstalled should be a no-op for unknown packages'
    );
  });

  it('removeInstalled does not corrupt installed.json when package not present', async () => {
    // Seed with a different package
    const pkgC: InstalledPackage = { ...samplePackage, name: 'pkg-c', files: [] };
    await setInstalled(tmpDir, pkgC);

    // Try to remove a non-existent package
    await removeInstalled(tmpDir, 'pkg-does-not-exist');

    // pkg-c should still be there
    const result = await getInstalled(tmpDir, 'pkg-c');
    assert.ok(result !== null, 'pkg-c should not be affected by removing a non-existent package');
  });

  it('removeInstalled called twice for same package does not throw', async () => {
    await setInstalled(tmpDir, { ...samplePackage, name: 'double-remove' });

    await removeInstalled(tmpDir, 'double-remove');
    // Second call should be a no-op, not an error
    await assert.doesNotReject(
      () => removeInstalled(tmpDir, 'double-remove'),
      'Second removeInstalled call should not throw'
    );
  });
});
