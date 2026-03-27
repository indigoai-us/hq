/**
 * Acceptance tests for US-008: hq list
 *
 * Test strategy:
 *  - Real runnable tests for installed-packages.ts list flows (pure FS utils)
 *  - Acceptance-spec tests for pkg-list.ts core flows (documented inline with
 *    runnable assertions where the code is unit-testable without process.exit mocking)
 *
 * Run: node --import tsx --test src/commands/pkg-list.test.ts
 * (Or via any runner that supports node:test with ESM + tsx)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getAllInstalled, setInstalled } from '../utils/installed-packages.js';
import type { InstalledPackage } from '../types/package-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal fake HQ root with workers/registry.yaml present. */
async function makeFakeHQRoot(base: string): Promise<string> {
  await mkdir(path.join(base, 'workers'), { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(base, 'workers', 'registry.yaml'), 'workers: []\n', 'utf8');
  return base;
}

const globalPackage: InstalledPackage = {
  name: 'dev-team',
  version: '1.0.0',
  type: 'worker-pack',
  installedAt: '2026-01-15T10:00:00.000Z',
  files: [path.join('workers', 'public', 'dev-worker')],
  publisher: 'anthropic',
  // no company → global scope
};

const companyPackage: InstalledPackage = {
  name: 'indigo-commands',
  version: '2.1.0',
  type: 'command-set',
  installedAt: '2026-02-20T08:30:00.000Z',
  files: [path.join('.claude', 'commands', 'indigo-deploy.md')],
  publisher: 'anthropic',
  company: 'indigo',
};

// ─── AC-1: Two packages (1 global, 1 company-scoped) both appear in getAllInstalled ──

describe('hq list — AC-1: all installed packages appear in getAllInstalled', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-list-ac1-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('getAllInstalled returns both global and company-scoped packages', async () => {
    await setInstalled(tmpDir, globalPackage);
    await setInstalled(tmpDir, companyPackage);

    const all = await getAllInstalled(tmpDir);
    const names = Object.keys(all);

    assert.ok(names.includes('dev-team'), 'global package should be present');
    assert.ok(names.includes('indigo-commands'), 'company-scoped package should be present');
    assert.equal(names.length, 2, 'should have exactly 2 packages');
  });

  it('global package has no company field', async () => {
    const all = await getAllInstalled(tmpDir);
    assert.equal(all['dev-team']?.company, undefined, 'global package should have no company');
  });

  it('company-scoped package has company field set', async () => {
    const all = await getAllInstalled(tmpDir);
    assert.equal(all['indigo-commands']?.company, 'indigo', 'company package should have company=indigo');
  });
});

// ─── AC-2: --company filter returns only company-scoped packages ──────────────
//
// pkg-list.ts filters entries by pkg.company === options.company
// We verify the data layer supports this by checking the company field on returned entries.

describe('hq list — AC-2: --company filter returns only matching packages', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-list-ac2-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('filtering by company=indigo returns only indigo package', async () => {
    await setInstalled(tmpDir, globalPackage);
    await setInstalled(tmpDir, companyPackage);

    const all = await getAllInstalled(tmpDir);
    const filtered = Object.values(all).filter(pkg => pkg.company === 'indigo');

    assert.equal(filtered.length, 1, 'should return exactly 1 package for company=indigo');
    assert.equal(filtered[0].name, 'indigo-commands', 'filtered result should be indigo-commands');
  });

  it('filtering by company=indigo excludes global package', async () => {
    const all = await getAllInstalled(tmpDir);
    const filtered = Object.values(all).filter(pkg => pkg.company === 'indigo');

    const names = filtered.map(p => p.name);
    assert.ok(!names.includes('dev-team'), 'global package should be excluded by company filter');
  });

  it('filtering by an unknown company returns empty array', async () => {
    const all = await getAllInstalled(tmpDir);
    const filtered = Object.values(all).filter(pkg => pkg.company === 'nonexistent-co');

    assert.equal(filtered.length, 0, 'no packages should match an unknown company');
  });
});

// ─── AC-3: Empty installed.json → getAllInstalled returns empty object ────────
//
// pkg-list.ts: if no packages after filtering, prints "(no packages installed)"
// We test that getAllInstalled returns {} when installed.json is absent or empty.

describe('hq list — AC-3: empty installed.json → getAllInstalled returns empty object', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-list-ac3-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('getAllInstalled returns empty object when installed.json does not exist', async () => {
    const result = await getAllInstalled(tmpDir);
    assert.deepEqual(result, {}, 'should return empty object when no installed.json');
  });

  it('getAllInstalled returns empty object after explicit empty install', async () => {
    // Write an installed.json with no packages
    const { writeFile, mkdir: mkdirFs } = await import('node:fs/promises');
    await mkdirFs(path.join(tmpDir, 'packages'), { recursive: true });
    await writeFile(
      path.join(tmpDir, 'packages', 'installed.json'),
      JSON.stringify({ version: '1', packages: {} }, null, 2) + '\n',
      'utf8'
    );

    const result = await getAllInstalled(tmpDir);
    assert.deepEqual(result, {}, 'should return empty object for installed.json with empty packages');
  });

  it('Object.values of empty result has length 0', async () => {
    const result = await getAllInstalled(tmpDir);
    const entries = Object.values(result);
    // pkg-list.ts: if (entries.length === 0) → print "(no packages installed)"
    assert.equal(entries.length, 0, 'entries array should be empty — triggers "(no packages installed)" message');
  });
});
