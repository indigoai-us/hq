/**
 * Acceptance tests for US-017: hq doctor
 *
 * Test strategy:
 *  - Unit tests for each check function in isolation
 *  - Uses temp directories to simulate healthy and broken HQ instances
 *
 * Run: node --import tsx --test src/commands/doctor.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkInstalledPackages,
  checkSymlinks,
} from './doctor.js';

// ─── Fake HQ root helpers ──────────────────────────────────────────────────────

async function makeFakeHQRoot(base: string): Promise<string> {
  await mkdir(path.join(base, 'workers'), { recursive: true });
  await writeFile(path.join(base, 'workers', 'registry.yaml'), 'workers: []\n', 'utf8');
  return base;
}

async function writeInstalledJson(
  hqRoot: string,
  packages: Record<string, { files: string[]; version?: string; type?: string }>
): Promise<void> {
  const data = {
    version: '1',
    packages: Object.fromEntries(
      Object.entries(packages).map(([name, p]) => [
        name,
        {
          name,
          version: p.version ?? '1.0.0',
          type: p.type ?? 'worker-pack',
          installedAt: new Date().toISOString(),
          files: p.files,
        },
      ])
    ),
  };
  const dir = path.join(hqRoot, 'packages');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'installed.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ─── AC-2: installed packages check ──────────────────────────────────────────

describe('hq doctor — AC-2: installed packages check', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-doctor-ac2-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns pass when no packages are installed', async () => {
    const result = await checkInstalledPackages(tmpDir);
    assert.equal(result.status, 'pass');
    assert.match(result.detail, /no packages installed/);
  });

  it('returns pass when all installed files exist on disk', async () => {
    // Create the file on disk
    const workerPath = path.join(tmpDir, 'workers', 'my-worker.yaml');
    await writeFile(workerPath, 'name: my-worker\n', 'utf8');

    await writeInstalledJson(tmpDir, {
      'test-pkg': { files: ['workers/my-worker.yaml'] },
    });

    const result = await checkInstalledPackages(tmpDir);
    assert.equal(result.status, 'pass');
    assert.match(result.detail, /1 package\(s\) verified/);
  });

  it('returns fail when an installed file is missing from disk', async () => {
    await writeInstalledJson(tmpDir, {
      'ghost-pkg': { files: ['workers/ghost-worker.yaml'] },
    });

    const result = await checkInstalledPackages(tmpDir);
    assert.equal(result.status, 'fail');
    assert.match(result.detail, /missing file/);
  });
});

// ─── AC-3: symlink check ──────────────────────────────────────────────────────

describe('hq doctor — AC-3: symlink check', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-doctor-ac3-'));
    await makeFakeHQRoot(tmpDir);
    await mkdir(path.join(tmpDir, 'knowledge'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns pass when there are no symlinks', async () => {
    const result = await checkSymlinks(tmpDir);
    assert.equal(result.status, 'pass');
    assert.match(result.detail, /no broken symlinks/);
  });

  it('returns pass for a valid symlink', async () => {
    const target = path.join(tmpDir, 'workers', 'real-worker.yaml');
    const link = path.join(tmpDir, 'workers', 'linked-worker.yaml');
    await writeFile(target, 'name: real\n', 'utf8');
    await symlink(target, link);

    const result = await checkSymlinks(tmpDir);
    assert.equal(result.status, 'pass');
  });

  it('returns fail when a symlink in workers/ is broken', async () => {
    const brokenLink = path.join(tmpDir, 'workers', 'broken-link.yaml');
    await symlink('/nonexistent/path/does-not-exist.yaml', brokenLink);

    const result = await checkSymlinks(tmpDir);
    assert.equal(result.status, 'fail');
    assert.match(result.detail, /broken symlink/);
    assert.match(result.detail, /broken-link\.yaml/);
  });
});
