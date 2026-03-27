/**
 * hq update [package] — update installed packages (US-007)
 *
 * Merge semantics:
 *   YAML/JSON files: deep merge object keys; string arrays = union by value; other arrays = replace
 *   Other files: show abbreviated diff and prompt (accept remote / keep local)
 */

import { execSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import chalk from 'chalk';
import { Command } from 'commander';
import yaml from 'js-yaml';

import { registryClient } from '../utils/registry-client.js';
import { findHQRoot } from '../utils/hq-root.js';
import { getInstalled, getAllInstalled, setInstalled } from '../utils/installed-packages.js';
import { isTrusted } from '../utils/trusted-publishers.js';
import type { HQPackage, InstalledPackage } from '../types/package-types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPOSE_TARGETS: Record<string, string> = {
  workers: path.join('workers', 'public'),
  commands: path.join('.claude', 'commands'),
  skills: path.join('.claude', 'skills'),
  knowledge: path.join('knowledge', 'public'),
};

// ─── Semver helpers ───────────────────────────────────────────────────────────

function parseVersion(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** Returns true if `registryVersion` is strictly newer than `installedVersion`. */
export function isNewer(registryVersion: string, installedVersion: string): boolean {
  const [rMaj, rMin, rPatch] = parseVersion(registryVersion);
  const [iMaj, iMin, iPatch] = parseVersion(installedVersion);
  if (rMaj !== iMaj) return rMaj > iMaj;
  if (rMin !== iMin) return rMin > iMin;
  return rPatch > iPatch;
}

// ─── Deep merge helpers ───────────────────────────────────────────────────────

/**
 * Deep merge `remote` into `local`.
 *   - Objects: keys are recursively merged (remote wins on conflict at leaf level)
 *   - String arrays: union by value (order: local first, then new remote entries)
 *   - Other arrays: remote replaces local
 *   - Scalars: remote wins
 */
export function deepMerge(local: unknown, remote: unknown): unknown {
  if (
    local !== null &&
    remote !== null &&
    typeof local === 'object' &&
    typeof remote === 'object' &&
    !Array.isArray(local) &&
    !Array.isArray(remote)
  ) {
    const result: Record<string, unknown> = { ...(local as Record<string, unknown>) };
    for (const [key, val] of Object.entries(remote as Record<string, unknown>)) {
      if (key in result) {
        result[key] = deepMerge(result[key], val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  if (Array.isArray(local) && Array.isArray(remote)) {
    // String arrays: union by value
    if (
      local.every(x => typeof x === 'string') &&
      remote.every(x => typeof x === 'string')
    ) {
      return [...new Set([...(local as string[]), ...(remote as string[])])];
    }
    // Other arrays: replace
    return remote;
  }

  // Scalars: remote wins
  return remote;
}

function isStructuredFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.yaml' || ext === '.yml' || ext === '.json';
}

// ─── I/O helpers ─────────────────────────────────────────────────────────────

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

async function promptMergeChoice(filename: string): Promise<'remote' | 'local'> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      `  Accept remote or keep local for ${chalk.bold(filename)}? [R=remote/k=keep] `
    );
    return answer.trim().toLowerCase() === 'k' ? 'local' : 'remote';
  } finally {
    rl.close();
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// ─── Package helpers ──────────────────────────────────────────────────────────

async function readPackageManifest(dir: string): Promise<HQPackage> {
  const manifestPath = path.join(dir, 'hq-package.yaml');
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch {
    throw new Error(`hq-package.yaml not found in extracted package at ${dir}`);
  }
  return yaml.load(raw) as HQPackage;
}

async function findExtractedRoot(extractDir: string): Promise<string> {
  try {
    await stat(path.join(extractDir, 'hq-package.yaml'));
    return extractDir;
  } catch { /* not here */ }

  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory());
  if (dirs.length === 1) {
    const candidate = path.join(extractDir, dirs[0].name);
    try {
      await stat(path.join(candidate, 'hq-package.yaml'));
      return candidate;
    } catch { /* not there either */ }
  }

  throw new Error(`Could not find hq-package.yaml in extracted package under ${extractDir}`);
}

// ─── File merge ───────────────────────────────────────────────────────────────

/**
 * Merge a single file from the new package into the installed location.
 *
 * YAML/JSON: deep merge (in place).
 * Other:     show abbreviated diff and prompt unless nonInteractive (default: accept remote).
 * New file:  just copy.
 */
async function mergeFile(
  srcPath: string,
  destPath: string,
  nonInteractive: boolean
): Promise<void> {
  const destIsDir = await fileExists(destPath).then(async exists => {
    if (!exists) return false;
    const s = await stat(destPath);
    return s.isDirectory();
  });

  if (destIsDir) {
    // Directory: recurse copy (update in place)
    await cp(srcPath, destPath, { recursive: true, force: true });
    console.log(chalk.dim(`  Updated dir: ${path.basename(destPath)}`));
    return;
  }

  if (!(await fileExists(destPath))) {
    await mkdir(path.dirname(destPath), { recursive: true });
    await cp(srcPath, destPath, { recursive: true });
    console.log(chalk.dim(`  New file: ${path.basename(destPath)}`));
    return;
  }

  if (isStructuredFile(destPath)) {
    const localRaw = await readFile(destPath, 'utf8');
    const remoteRaw = await readFile(srcPath, 'utf8');
    const ext = path.extname(destPath).toLowerCase();

    if (ext === '.json') {
      const localData = JSON.parse(localRaw) as unknown;
      const remoteData = JSON.parse(remoteRaw) as unknown;
      const merged = deepMerge(localData, remoteData);
      await writeFile(destPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    } else {
      const localData = yaml.load(localRaw) as unknown;
      const remoteData = yaml.load(remoteRaw) as unknown;
      const merged = deepMerge(localData, remoteData);
      await writeFile(destPath, yaml.dump(merged as object, { lineWidth: 120 }), 'utf8');
    }
    console.log(chalk.dim(`  Merged: ${path.basename(destPath)}`));
    return;
  }

  // Non-structured file: diff and prompt
  const localContent = await readFile(destPath, 'utf8').catch(() => '<binary>');
  const remoteContent = await readFile(srcPath, 'utf8').catch(() => '<binary>');

  if (localContent === remoteContent) {
    // Identical — no action
    return;
  }

  const localLines = localContent.split('\n').slice(0, 5);
  const remoteLines = remoteContent.split('\n').slice(0, 5);
  console.log(chalk.yellow(`\n  File differs: ${path.basename(destPath)}`));
  console.log(chalk.dim('  --- local ---'));
  localLines.forEach(l => console.log(chalk.dim(`  ${l}`)));
  console.log(chalk.dim('  +++ remote ---'));
  remoteLines.forEach(l => console.log(chalk.dim(`  ${l}`)));

  if (nonInteractive) {
    await cp(srcPath, destPath, { force: true });
    console.log(chalk.dim(`  Accepted remote (non-interactive): ${path.basename(destPath)}`));
  } else {
    const choice = await promptMergeChoice(path.basename(destPath));
    if (choice === 'remote') {
      await cp(srcPath, destPath, { force: true });
      console.log(chalk.dim(`  Accepted remote: ${path.basename(destPath)}`));
    } else {
      console.log(chalk.dim(`  Kept local: ${path.basename(destPath)}`));
    }
  }
}

// ─── Single-package update ────────────────────────────────────────────────────

async function updateOnePackage(
  hqRoot: string,
  packageName: string,
  nonInteractive: boolean
): Promise<'updated' | 'up-to-date' | 'not-installed'> {
  const existing = await getInstalled(hqRoot, packageName);
  if (!existing) return 'not-installed';

  // Check registry for latest version
  let meta: Awaited<ReturnType<typeof registryClient.getPackage>>;
  try {
    meta = await registryClient.getPackage(packageName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(chalk.yellow(`  ${packageName}: skipped (registry error: ${msg})`));
    return 'up-to-date';
  }

  if (!isNewer(meta.version, existing.version)) {
    console.log(chalk.dim(`  ${packageName}: up to date (${existing.version})`));
    return 'up-to-date';
  }

  console.log(`  ${chalk.bold(packageName)}: ${existing.version} → ${chalk.green(meta.version)}`);

  // Download tarball
  let downloadInfo: Awaited<ReturnType<typeof registryClient.getDownloadInfo>>;
  try {
    downloadInfo = await registryClient.getDownloadInfo(packageName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`  ${packageName}: download info failed: ${msg}`));
    return 'up-to-date';
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'hq-update-'));
  try {
    const tarballPath = path.join(tempDir, `${packageName}.tar.gz`);
    console.log(chalk.dim(`  Downloading…`));
    await registryClient.downloadTarball(
      downloadInfo.url,
      tarballPath,
      downloadInfo.checksum
    );

    const extractDir = path.join(tempDir, 'extracted');
    await mkdir(extractDir, { recursive: true });
    execSync(`tar -xzf "${tarballPath}" -C "${extractDir}"`, { stdio: 'pipe' });

    const extractedRoot = await findExtractedRoot(extractDir);
    const manifest = await readPackageManifest(extractedRoot);

    // Trust check for on-update hook
    const publisher = meta.author ?? manifest.author ?? existing.publisher ?? 'unknown';
    const trusted = await isTrusted(publisher);
    const hasUpdateHook = !!manifest.hooks?.['on-update'];

    let runHook = false;
    if (hasUpdateHook) {
      if (trusted) {
        runHook = true;
      } else {
        console.log(
          chalk.yellow(
            `\n  Warning: "${manifest.name}" by "${publisher}" is not in your trusted list.`
          )
        );
        console.log(`  It wants to run an update hook: ${chalk.bold(manifest.hooks!['on-update']!)}`);
        if (nonInteractive) {
          console.log(chalk.dim('  Hook skipped (non-interactive).'));
        } else {
          runHook = await confirm('  Allow update hook to run?');
          if (!runHook) console.log(chalk.dim('  Hook skipped.'));
        }
      }
    }

    // Merge files
    const exposes = manifest.exposes ?? {};
    const installedFiles: string[] = [];

    for (const [exposeKey, target] of Object.entries(EXPOSE_TARGETS)) {
      const files = exposes[exposeKey as keyof typeof exposes];
      if (!files?.length) continue;

      const destBase = path.join(hqRoot, target);
      await mkdir(destBase, { recursive: true });

      for (const relFile of files) {
        const srcPath = path.join(extractedRoot, relFile);
        const destPath = path.join(destBase, path.basename(relFile));
        await mergeFile(srcPath, destPath, nonInteractive);
        installedFiles.push(path.join(target, path.basename(relFile)));
      }
    }

    // Run on-update hook
    if (hasUpdateHook && runHook) {
      const hookScript = path.join(extractedRoot, manifest.hooks!['on-update']!);
      console.log(chalk.dim(`  Running update hook…`));
      try {
        execSync(`bash "${hookScript}"`, { cwd: extractedRoot, stdio: 'inherit' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(chalk.yellow(`  Update hook failed (continuing): ${msg}`));
      }
    }

    // Cache updated on-remove hook (best-effort)
    if (manifest.hooks?.['on-remove']) {
      const hookSrc = path.join(extractedRoot, manifest.hooks['on-remove']);
      const hookDest = path.join(hqRoot, 'packages', 'hooks', manifest.name, 'on-remove.sh');
      try {
        await mkdir(path.dirname(hookDest), { recursive: true });
        await cp(hookSrc, hookDest, { force: true });
      } catch { /* best effort */ }
    }

    // Update installed.json — preserve existing fields, update version + updatedAt + files
    const updated: InstalledPackage = {
      ...existing,
      version: meta.version,
      updatedAt: new Date().toISOString(),
      files: installedFiles.length ? installedFiles : existing.files,
    };
    await setInstalled(hqRoot, updated);

    return 'updated';
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => { /* best effort */ });
  }
}

// ─── Main update orchestration ────────────────────────────────────────────────

async function updatePackages(
  packageName: string | undefined,
  nonInteractive: boolean
): Promise<void> {
  let hqRoot: string;
  try {
    hqRoot = await findHQRoot();
  } catch {
    console.error(chalk.red('Error: not inside an HQ installation (workers/registry.yaml not found)'));
    process.exit(1);
  }

  let packagesToUpdate: string[];

  if (packageName) {
    packagesToUpdate = [packageName];
  } else {
    const all = await getAllInstalled(hqRoot);
    packagesToUpdate = Object.keys(all);
    if (packagesToUpdate.length === 0) {
      console.log(chalk.dim('No packages installed.'));
      return;
    }
  }

  if (packageName) {
    console.log(chalk.dim(`Checking for update: ${packageName}…`));
  } else {
    console.log(chalk.dim(`Checking ${packagesToUpdate.length} installed package(s) for updates…`));
  }

  let updatedCount = 0;
  let upToDateCount = 0;
  const notFound: string[] = [];

  for (const name of packagesToUpdate) {
    const result = await updateOnePackage(hqRoot, name, nonInteractive);
    if (result === 'updated') {
      updatedCount++;
      console.log(chalk.green(`  ✓ ${name} updated`));
    } else if (result === 'up-to-date') {
      upToDateCount++;
    } else {
      notFound.push(name);
    }
  }

  console.log('');

  if (notFound.length) {
    for (const n of notFound) {
      console.error(chalk.red(`Package '${n}' is not installed.`));
    }
    if (packageName) process.exit(1);
  }

  if (updatedCount === 0) {
    console.log(chalk.green('All packages up to date.'));
  } else {
    console.log(chalk.green(`${updatedCount} package(s) updated.`));
    if (upToDateCount > 0) {
      console.log(chalk.dim(`${upToDateCount} package(s) already at latest version.`));
    }
  }
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerPkgUpdateCommand(program: Command): void {
  program
    .command('update [package]')
    .description('Update installed packages to their latest registry versions')
    .option('--non-interactive', 'Accept remote file changes without prompting')
    .action(async (packageName: string | undefined, options: { nonInteractive?: boolean }) => {
      await updatePackages(packageName, options.nonInteractive ?? false);
    });
}
