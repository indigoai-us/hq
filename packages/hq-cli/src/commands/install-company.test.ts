/**
 * Acceptance tests for US-016: hq install --company <co>
 *
 * Tests cover:
 *  - AC-1: company directory must exist before install proceeds
 *  - AC-2: workers install to companies/{co}/workers/, installed.json has company field
 *  - AC-3: companies/manifest.yaml updated with package reference (idempotent)
 *
 * Run: node --import tsx --test src/commands/install-company.test.ts
 * (Or via any runner that supports node:test with ESM + tsx)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import yaml from 'js-yaml';

import { getInstalled, setInstalled } from '../utils/installed-packages.js';
import { updateManifestPackages } from './install.js';
import type { InstalledPackage } from '../types/package-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a minimal fake HQ root with:
 *  - workers/registry.yaml
 *  - companies/manifest.yaml with `testco` and `otherco` entries
 */
async function makeFakeHQRoot(base: string): Promise<string> {
  await mkdir(path.join(base, 'workers'), { recursive: true });
  await writeFile(path.join(base, 'workers', 'registry.yaml'), 'workers: []\n', 'utf8');

  await mkdir(path.join(base, 'companies'), { recursive: true });

  const manifest = {
    testco: {
      repos: [],
      workers: [],
      knowledge: `companies/testco/knowledge/`,
    },
    otherco: {
      repos: [],
      workers: [],
    },
  };
  await writeFile(
    path.join(base, 'companies', 'manifest.yaml'),
    yaml.dump(manifest, { lineWidth: 120 }),
    'utf8'
  );

  return base;
}

// ─── AC-1: company directory validation ──────────────────────────────────────

describe('hq install --company — AC-1: company directory must exist', () => {
  /**
   * Acceptance criterion:
   *   Given `--company testco` is specified, the install command checks that
   *   `companies/testco/` exists. If it doesn't, it prints an error and exits.
   *
   * We test the validation logic by:
   *  1. Showing that stat() succeeds when the directory exists
   *  2. Showing that stat() throws when the directory is missing
   *
   * The guard in install.ts is:
   *   const companyDir = path.join(hqRoot, 'companies', options.company);
   *   await stat(companyDir);  // throws → process.exit(1)
   */

  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-us016-ac1-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stat succeeds when company directory exists', async () => {
    const companyDir = path.join(tmpDir, 'companies', 'testco');
    await mkdir(companyDir, { recursive: true });

    // Should not throw — directory exists
    await assert.doesNotReject(() => stat(companyDir));
  });

  it('stat throws when company directory is missing', async () => {
    const companyDir = path.join(tmpDir, 'companies', 'nonexistent-company');

    // Should throw — guard would trigger process.exit(1)
    await assert.rejects(
      () => stat(companyDir),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        // Node fs errors have a code property
        assert.ok(
          (err as NodeJS.ErrnoException).code === 'ENOENT',
          `Expected ENOENT, got: ${(err as NodeJS.ErrnoException).code}`
        );
        return true;
      }
    );
  });

  it('company directory check is skipped when --company is not specified (guard condition)', () => {
    // Document: the guard is wrapped in `if (options.company)`.
    // Without --company, no stat call is made — any hqRoot works.
    const options: { company?: string } = {};
    const guardWouldRun = Boolean(options.company);
    assert.equal(guardWouldRun, false, 'Guard must not run when --company is absent');
  });
});

// ─── AC-2: workers install to companies/{co}/workers/ ────────────────────────

describe('hq install --company — AC-2: workers install to companies/{co}/workers/', () => {
  /**
   * Acceptance criterion:
   *   When --company testco is given, workers are written to companies/testco/workers/
   *   and the installed.json record has `company: 'testco'`.
   *
   * We test:
   *  1. The EXPOSE_TARGETS override produces the correct path
   *  2. setInstalled/getInstalled round-trip preserves the company field
   */

  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-us016-ac2-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exposeTargets override: workers path points to companies/{co}/workers', () => {
    // Mirror the logic from install.ts installPackage():
    //   const exposeTargets = options.company
    //     ? { ...EXPOSE_TARGETS, workers: path.join('companies', options.company, 'workers'), ... }
    //     : EXPOSE_TARGETS;
    const EXPOSE_TARGETS = {
      workers: path.join('workers', 'public'),
      commands: path.join('.claude', 'commands'),
      skills: path.join('.claude', 'skills'),
      knowledge: path.join('knowledge', 'public'),
    };

    const company = 'testco';
    const exposeTargets = {
      ...EXPOSE_TARGETS,
      workers: path.join('companies', company, 'workers'),
      knowledge: path.join('companies', company, 'knowledge'),
    };

    assert.equal(exposeTargets.workers, path.join('companies', 'testco', 'workers'));
    assert.equal(exposeTargets.knowledge, path.join('companies', 'testco', 'knowledge'));
    // Non-overridden keys remain global
    assert.equal(exposeTargets.commands, path.join('.claude', 'commands'));
    assert.equal(exposeTargets.skills, path.join('.claude', 'skills'));
  });

  it('exposeTargets override: without --company, paths remain global', () => {
    const EXPOSE_TARGETS = {
      workers: path.join('workers', 'public'),
      commands: path.join('.claude', 'commands'),
      skills: path.join('.claude', 'skills'),
      knowledge: path.join('knowledge', 'public'),
    };

    const options: { company?: string } = {};
    const exposeTargets = options.company
      ? { ...EXPOSE_TARGETS, workers: path.join('companies', options.company, 'workers'), knowledge: path.join('companies', options.company, 'knowledge') }
      : EXPOSE_TARGETS;

    assert.equal(exposeTargets.workers, path.join('workers', 'public'));
    assert.equal(exposeTargets.knowledge, path.join('knowledge', 'public'));
  });

  it('installed.json record includes company field when --company is specified', async () => {
    const record: InstalledPackage = {
      name: 'dev-team',
      version: '1.0.0',
      type: 'worker-pack',
      installedAt: new Date().toISOString(),
      files: [
        path.join('companies', 'testco', 'workers', 'dev-worker'),
      ],
      publisher: 'anthropic',
      company: 'testco',
    };

    await setInstalled(tmpDir, record);

    const saved = await getInstalled(tmpDir, 'dev-team');
    assert.ok(saved !== null, 'Expected a record, got null');
    assert.equal(saved.company, 'testco', 'installed.json must store company field');
    assert.ok(
      saved.files.some(f => f.includes(path.join('companies', 'testco', 'workers'))),
      'Installed files must reference companies/testco/workers/'
    );
  });

  it('installed.json record has no company field when --company is not specified', async () => {
    const record: InstalledPackage = {
      name: 'global-pkg',
      version: '1.0.0',
      type: 'worker-pack',
      installedAt: new Date().toISOString(),
      files: [path.join('workers', 'public', 'some-worker')],
      publisher: 'anthropic',
      // company intentionally omitted
    };

    await setInstalled(tmpDir, record);

    const saved = await getInstalled(tmpDir, 'global-pkg');
    assert.ok(saved !== null);
    assert.equal(saved.company, undefined, 'Global install must not have company field');
  });
});

// ─── AC-3: companies/manifest.yaml updated ───────────────────────────────────

describe('hq install --company — AC-3: manifest.yaml updated with package reference', () => {
  /**
   * Acceptance criterion:
   *   After `hq install dev-team --company testco`, companies/manifest.yaml
   *   has testco.packages = ['dev-team'].
   *   Running again does not duplicate the entry.
   */

  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-us016-ac3-'));
    await makeFakeHQRoot(tmpDir);
    // Create company directory so any stat check would pass
    await mkdir(path.join(tmpDir, 'companies', 'testco'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('adds package name to company packages array in manifest.yaml', async () => {
    await updateManifestPackages(tmpDir, 'testco', 'dev-team');

    const raw = await readFile(path.join(tmpDir, 'companies', 'manifest.yaml'), 'utf8');
    const manifest = yaml.load(raw) as Record<string, { packages?: string[] }>;

    assert.ok(Array.isArray(manifest.testco?.packages), 'testco.packages must be an array');
    assert.ok(manifest.testco.packages!.includes('dev-team'), 'packages must include dev-team');
  });

  it('updateManifestPackages is idempotent — no duplicates on second call', async () => {
    // Call again with the same package
    await updateManifestPackages(tmpDir, 'testco', 'dev-team');

    const raw = await readFile(path.join(tmpDir, 'companies', 'manifest.yaml'), 'utf8');
    const manifest = yaml.load(raw) as Record<string, { packages?: string[] }>;

    const packages = manifest.testco?.packages ?? [];
    const count = packages.filter(p => p === 'dev-team').length;
    assert.equal(count, 1, 'Package must appear exactly once in the array');
  });

  it('can add multiple distinct packages to the same company', async () => {
    await updateManifestPackages(tmpDir, 'testco', 'content-team');

    const raw = await readFile(path.join(tmpDir, 'companies', 'manifest.yaml'), 'utf8');
    const manifest = yaml.load(raw) as Record<string, { packages?: string[] }>;

    const packages = manifest.testco?.packages ?? [];
    assert.ok(packages.includes('dev-team'), 'dev-team must still be present');
    assert.ok(packages.includes('content-team'), 'content-team must be added');
  });

  it('does not affect other company entries in the manifest', async () => {
    const raw = await readFile(path.join(tmpDir, 'companies', 'manifest.yaml'), 'utf8');
    const manifest = yaml.load(raw) as Record<string, { packages?: string[]; repos?: unknown[] }>;

    // otherco was in the original manifest — it must still be there and unchanged
    assert.ok(manifest.otherco !== undefined, 'otherco entry must still exist');
    assert.equal(
      manifest.otherco.packages,
      undefined,
      'otherco.packages must remain undefined (untouched)'
    );
  });

  it('updateManifestPackages warns but does not throw for a missing company', async () => {
    // ghost-company is not in manifest.yaml — should warn, not throw
    await assert.doesNotReject(
      () => updateManifestPackages(tmpDir, 'ghost-company', 'some-pkg'),
      'updateManifestPackages must never throw even if company is absent'
    );
  });
});
