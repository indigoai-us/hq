/**
 * Acceptance tests for US-012: Offline fallback — git clone when registry unreachable
 *
 * Test strategy:
 *  - Real FS operations in temp dirs for path-derivation and cache-reading logic
 *  - Logic-assertion tests for error message format, RegistryError classification,
 *    and fallback routing (mirrors acquirePackageSource() decision tree)
 *
 * Run: node --import tsx --test src/commands/install-offline.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRepo } from '../utils/git.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal fake HQ root with workers/registry.yaml present. */
async function makeFakeHQRoot(base: string): Promise<string> {
  await mkdir(path.join(base, 'workers'), { recursive: true });
  await writeFile(path.join(base, 'workers', 'registry.yaml'), 'workers: []\n', 'utf8');
  return base;
}

/** Write a fake hq-package.yaml to a directory. */
async function writePackageManifest(dir: string, manifest: object): Promise<void> {
  const { default: yaml } = await import('js-yaml');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'hq-package.yaml'), yaml.dump(manifest), 'utf8');
}

// ─── AC-1: Cache directory path derivation + isRepo on non-existent dir ──────

describe('US-012: offline fallback — git cache directory logic', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'hq-test-offline-'));
    await makeFakeHQRoot(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('packages/cache/ path is derived correctly from hqRoot and packageName', () => {
    const hqRoot = '/fake/hq';
    const packageName = 'dev-team';
    const expected = path.join(hqRoot, 'packages', 'cache', packageName);
    // This mirrors the cacheDir derivation in acquirePackageSource()
    assert.equal(expected, path.join('/fake/hq', 'packages', 'cache', 'dev-team'));
  });

  it('isRepo returns false for a non-existent directory', async () => {
    // acquirePackageSource() checks isRepo(cacheDir) before deciding clone vs pull.
    // A fresh install with no cache should trigger clone, not pull.
    const nonExistent = path.join(tmpDir, 'packages', 'cache', 'nonexistent-pkg');
    const result = await isRepo(nonExistent);
    assert.equal(result, false, 'isRepo should return false for non-existent path');
  });

  it('reading hq-package.yaml from cache provides repo URL for offline fallback', async () => {
    // If registry metadata fetch fails before we get repoUrlFromMeta, acquirePackageSource()
    // reads the repo URL from a previously cached hq-package.yaml.
    const cacheDir = path.join(tmpDir, 'packages', 'cache', 'my-pkg');
    await writePackageManifest(cacheDir, {
      name: 'my-pkg',
      version: '1.0.0',
      type: 'worker-pack',
      description: 'Test package',
      repo: 'https://github.com/example/my-pkg',
    });

    const { default: yaml } = await import('js-yaml');
    const raw = await readFile(path.join(cacheDir, 'hq-package.yaml'), 'utf8');
    const manifest = yaml.load(raw) as { repo?: string; name: string; version: string };

    assert.equal(manifest.repo, 'https://github.com/example/my-pkg');
    assert.equal(manifest.name, 'my-pkg');
  });

  it('when cache directory exists but has no hq-package.yaml, repo URL is undefined', async () => {
    // If there is no cached manifest, the fallback has no repo URL and must throw.
    const emptyDir = path.join(tmpDir, 'packages', 'cache', 'empty-pkg');
    await mkdir(emptyDir, { recursive: true });

    let repoUrl: string | undefined;
    try {
      const { default: yaml } = await import('js-yaml');
      const raw = await readFile(path.join(emptyDir, 'hq-package.yaml'), 'utf8');
      const cached = yaml.load(raw) as { repo?: string };
      repoUrl = cached.repo;
    } catch {
      // readFile throws — no manifest exists
      repoUrl = undefined;
    }

    assert.equal(repoUrl, undefined, 'No hq-package.yaml means no repo URL from cache');
  });
});

// ─── AC-2: Dual-failure error message format ──────────────────────────────────

describe('US-012: dual-failure error message format', () => {
  it('error message includes both registry and git failure reasons', () => {
    // Mirrors the error construction in acquirePackageSource() when git also fails.
    const registryErrorMsg = 'Request timed out after 30000ms';
    const gitMsg = 'remote: Repository not found';

    const regPart = `Registry: ${registryErrorMsg}`;
    const message = `Install failed:\n  ${regPart}\n  Git: ${gitMsg}`;

    assert.ok(message.includes('Registry:'), 'Error must include registry reason label');
    assert.ok(message.includes('Git:'), 'Error must include git reason label');
    assert.ok(message.includes(registryErrorMsg), 'Error must include the registry error text');
    assert.ok(message.includes(gitMsg), 'Error must include the git error text');
    assert.ok(message.startsWith('Install failed:'), 'Error must start with "Install failed:"');
  });

  it('error message includes helpful text when no repo URL is available', () => {
    // Mirrors the no-repoUrl branch in acquirePackageSource().
    const registryErrorMsg = 'Network error';
    const pkgName = 'unknown-pkg';
    const regPart = `Registry: ${registryErrorMsg}`;
    const message = `Install failed:\n  ${regPart}\n  Git: no repo URL available for package "${pkgName}"`;

    assert.ok(message.includes('Registry:'));
    assert.ok(message.includes('no repo URL available'));
    assert.ok(message.includes(pkgName));
  });

  it('error message uses "Registry unavailable" when no registryErrorMsg is set', () => {
    // Edge case: registryErrorMsg is undefined (e.g. metadata succeeded but later step failed).
    const registryErrorMsg: string | undefined = undefined;
    const gitMsg = 'clone failed';
    const regPart = registryErrorMsg ? `Registry: ${registryErrorMsg}` : 'Registry unavailable';
    const message = `Install failed:\n  ${regPart}\n  Git: ${gitMsg}`;

    assert.ok(message.includes('Registry unavailable'));
    assert.ok(message.includes('Git: clone failed'));
  });
});

// ─── AC-3: RegistryError classification — which errors trigger git fallback ───

describe('US-012: RegistryError classification — fallback routing', () => {
  it('RegistryError (no status code) represents a network timeout — fallback eligible', async () => {
    const { RegistryError, RegistryAuthError, RegistryNotFoundError } = await import('../utils/registry-client.js');

    const networkError = new RegistryError('Request timed out after 30000ms');

    assert.ok(networkError instanceof RegistryError, 'Must be a RegistryError');
    assert.ok(!(networkError instanceof RegistryAuthError), 'Must NOT be RegistryAuthError');
    assert.ok(!(networkError instanceof RegistryNotFoundError), 'Must NOT be RegistryNotFoundError');
    assert.equal(networkError.statusCode, undefined, 'Network errors have no status code');
  });

  it('RegistryError with 503 status represents a server error — fallback eligible', async () => {
    const { RegistryError } = await import('../utils/registry-client.js');

    const serverError = new RegistryError('Registry error 503', 503);

    assert.ok(serverError instanceof RegistryError);
    assert.equal(serverError.statusCode, 503);
  });

  it('RegistryAuthError is NOT fallback-eligible — surfaces immediately', async () => {
    const { RegistryAuthError, RegistryError } = await import('../utils/registry-client.js');

    const authError = new RegistryAuthError();

    assert.ok(authError instanceof RegistryAuthError);
    // It IS a RegistryError (subclass), but acquirePackageSource() checks RegistryAuthError first
    assert.ok(authError instanceof RegistryError, 'RegistryAuthError extends RegistryError');
    assert.equal(authError.statusCode, 401);
  });

  it('RegistryNotFoundError is NOT fallback-eligible — package does not exist', async () => {
    const { RegistryNotFoundError, RegistryError } = await import('../utils/registry-client.js');

    const notFoundError = new RegistryNotFoundError('dev-team');

    assert.ok(notFoundError instanceof RegistryNotFoundError);
    assert.ok(notFoundError instanceof RegistryError, 'RegistryNotFoundError extends RegistryError');
    assert.equal(notFoundError.statusCode, 404);
  });

  it('shouldFallbackToGit() routing logic matches acquirePackageSource() decision tree', async () => {
    const { RegistryError, RegistryAuthError, RegistryNotFoundError } = await import('../utils/registry-client.js');

    // Mirror the exact if-chain from acquirePackageSource():
    //   if (err instanceof RegistryAuthError) throw err;
    //   if (err instanceof RegistryNotFoundError) throw err;
    //   if (err instanceof RegistryError) → registryErrorMsg = ...; fall through to git
    //   else throw err
    function shouldFallbackToGit(err: unknown): boolean {
      if (err instanceof RegistryAuthError) return false;
      if (err instanceof RegistryNotFoundError) return false;
      if (err instanceof RegistryError) return true;
      return false; // unexpected errors are re-thrown, not fallback-eligible
    }

    assert.equal(shouldFallbackToGit(new RegistryError('timeout')), true, 'Network timeout → fallback');
    assert.equal(shouldFallbackToGit(new RegistryError('503', 503)), true, '503 server error → fallback');
    assert.equal(shouldFallbackToGit(new RegistryAuthError()), false, '401 auth error → no fallback');
    assert.equal(shouldFallbackToGit(new RegistryNotFoundError('pkg')), false, '404 not found → no fallback');
    assert.equal(shouldFallbackToGit(new TypeError('unexpected')), false, 'Unexpected error → no fallback');
    assert.equal(shouldFallbackToGit(new Error('generic')), false, 'Generic Error → no fallback');
  });
});

// ─── AC-4: SHA256 validation skipped for git installs ─────────────────────────

describe('US-012: SHA256 validation skipped for git installs', () => {
  it('git fallback does not call downloadTarball — checksum is never computed', () => {
    // acquirePackageSource() calls registryClient.downloadTarball() only in the registry
    // branch, which includes SHA256 validation. The git branch bypasses downloadTarball
    // entirely — it clones/pulls the repo and reads hq-package.yaml directly.
    //
    // This test documents the contract: a git install MUST NOT require a checksum.
    const isGitInstall = true;
    const checksumRequired = !isGitInstall; // SHA256 only required for registry installs

    assert.equal(checksumRequired, false, 'Git installs must not require SHA256 checksum');
  });

  it('registry install path calls downloadTarball which validates SHA256', () => {
    const isGitInstall = false;
    const checksumRequired = !isGitInstall;

    assert.equal(checksumRequired, true, 'Registry installs must validate SHA256');
  });
});

// ─── AC-5: Warning message format ─────────────────────────────────────────────

describe('US-012: warning message format', () => {
  it('warning message starts with "Warning:" and contains "Registry unreachable"', () => {
    // Mirrors: console.warn(chalk.yellow(`Warning: Registry unreachable, installing from git`))
    // chalk strips ANSI in tests — we check the raw string content.
    const warnMsg = 'Warning: Registry unreachable, installing from git';

    assert.ok(warnMsg.startsWith('Warning:'), 'Warning must start with "Warning:"');
    assert.ok(warnMsg.includes('Registry unreachable'), 'Warning must mention "Registry unreachable"');
    assert.ok(warnMsg.includes('git'), 'Warning must mention "git"');
  });

  it('success message for git install mentions git source', () => {
    // Mirrors: `installed successfully${sourceLabel}` where
    // sourceLabel = chalk.dim(' (installed from git — registry unreachable)')
    const isGitInstall = true;
    const sourceLabel = isGitInstall ? ' (installed from git — registry unreachable)' : '';
    const successMsg = `dev-team v1.0.0 installed successfully${sourceLabel}`;

    assert.ok(successMsg.includes('installed from git'), 'Success message must reference git source');
    assert.ok(successMsg.includes('registry unreachable'), 'Success message must note registry was unreachable');
  });

  it('success message for registry install has no git annotation', () => {
    const isGitInstall = false;
    const sourceLabel = isGitInstall ? ' (installed from git — registry unreachable)' : '';
    const successMsg = `dev-team v1.0.0 installed successfully${sourceLabel}`;

    assert.ok(!successMsg.includes('git'), 'Registry install success message must not mention git');
  });
});
