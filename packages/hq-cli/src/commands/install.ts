/**
 * hq install <package> — install a package from the registry (US-005)
 */

import { execSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
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
import {
  getInstalled,
  setInstalled,
} from '../utils/installed-packages.js';
import { isTrusted } from '../utils/trusted-publishers.js';
import type { HQPackage, InstalledPackage } from '../types/package-types.js';

// ─── Install target mapping ───────────────────────────────────────────────────

const EXPOSE_TARGETS: Record<string, string> = {
  workers: path.join('workers', 'public'),
  commands: path.join('.claude', 'commands'),
  skills: path.join('.claude', 'skills'),
  knowledge: path.join('knowledge', 'public'),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Prompt the user for a yes/no answer. Returns true for yes. */
async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

/** Read and parse hq-package.yaml from a directory. */
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

/**
 * Find the root of the extracted package contents.
 * tar -xzf typically creates a single top-level directory; we look for it.
 * If hq-package.yaml exists directly in extractDir, return extractDir.
 */
async function findExtractedRoot(extractDir: string): Promise<string> {
  // Check if manifest is directly here
  try {
    await stat(path.join(extractDir, 'hq-package.yaml'));
    return extractDir;
  } catch { /* not here */ }

  // Look one level down — find first directory
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

  throw new Error(
    `Could not find hq-package.yaml in extracted package under ${extractDir}`
  );
}

/**
 * Update workers/registry.yaml with new worker entries from a package.
 * Idempotent — skips workers already present (matched by id).
 */
async function updateWorkersRegistry(
  hqRoot: string,
  manifest: HQPackage,
  extractedRoot: string,
  installedFiles: string[]
): Promise<void> {
  if (!manifest.exposes?.workers?.length) return;

  const registryPath = path.join(hqRoot, 'workers', 'registry.yaml');
  let registryRaw: string;
  try {
    registryRaw = await readFile(registryPath, 'utf8');
  } catch {
    console.warn(chalk.yellow(`  Warning: could not read workers/registry.yaml — skipping registry update`));
    return;
  }

  interface WorkerEntry {
    id: string;
    path: string;
    type?: string;
    status?: string;
    description?: string;
    [key: string]: unknown;
  }
  interface RegistryYaml {
    workers?: WorkerEntry[];
    [key: string]: unknown;
  }

  const registry = yaml.load(registryRaw) as RegistryYaml;
  const workers: WorkerEntry[] = registry.workers ?? [];
  const existingIds = new Set(workers.map(w => w.id));

  let changed = false;
  for (const workerRelPath of manifest.exposes.workers) {
    // The worker path relative to hq root after installation
    const installedRelPath = path.join(
      EXPOSE_TARGETS.workers,
      path.basename(workerRelPath)
    );
    // Use the directory name as the worker id
    const workerId = path.basename(workerRelPath).replace(/\.yaml$/, '');

    if (existingIds.has(workerId)) {
      console.log(chalk.dim(`  Worker ${workerId} already in registry — skipping`));
      continue;
    }

    workers.push({
      id: workerId,
      path: installedRelPath + (installedRelPath.endsWith('/') ? '' : '/'),
      type: 'CodeWorker',
      status: 'active',
      description: manifest.description,
    });
    existingIds.add(workerId);
    installedFiles.push(installedRelPath);
    changed = true;
    console.log(chalk.dim(`  Registered worker: ${workerId}`));
  }

  if (changed) {
    registry.workers = workers;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(registryPath, yaml.dump(registry, { lineWidth: 120 }), 'utf8');
  }
}

// ─── Main install logic ───────────────────────────────────────────────────────

async function installPackage(packageName: string): Promise<void> {
  // 1. Find HQ root
  let hqRoot: string;
  try {
    hqRoot = await findHQRoot();
  } catch {
    console.error(chalk.red(`Error: not inside an HQ installation (workers/registry.yaml not found)`));
    process.exit(1);
  }

  // 2. Check already installed
  const existing = await getInstalled(hqRoot, packageName);
  if (existing) {
    console.log(
      chalk.yellow(`Package ${chalk.bold(packageName)} is already installed (version ${existing.version}).`) +
      '\nUse `hq update` to upgrade.'
    );
    process.exit(0);
  }

  // 3. Fetch package metadata
  console.log(chalk.dim(`Fetching metadata for ${packageName}…`));
  let meta: Awaited<ReturnType<typeof registryClient.getPackage>>;
  try {
    meta = await registryClient.getPackage(packageName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error fetching package: ${msg}`));
    process.exit(1);
  }

  // 4. Fetch download info
  console.log(chalk.dim(`Resolving download URL…`));
  let downloadInfo: Awaited<ReturnType<typeof registryClient.getDownloadInfo>>;
  try {
    downloadInfo = await registryClient.getDownloadInfo(packageName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error fetching download info: ${msg}`));
    process.exit(1);
  }

  // 5. Create temp dir
  const tempDir = await mkdtemp(path.join(tmpdir(), 'hq-install-'));

  try {
    // 6 + 7. Download tarball (downloadTarball validates SHA256 internally)
    const tarballPath = path.join(tempDir, `${packageName}.tar.gz`);
    console.log(chalk.dim(`Downloading ${packageName}@${meta.version}…`));
    try {
      await registryClient.downloadTarball(
        downloadInfo.url,
        tarballPath,
        downloadInfo.checksum
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Download failed: ${msg}`));
      process.exit(1);
    }
    console.log(chalk.dim(`  Download complete, checksum verified`));

    // 8. Extract tarball
    const extractDir = path.join(tempDir, 'extracted');
    await mkdir(extractDir, { recursive: true });
    try {
      execSync(`tar -xzf "${tarballPath}" -C "${extractDir}"`, { stdio: 'pipe' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Extraction failed: ${msg}`));
      process.exit(1);
    }

    // 9. Read hq-package.yaml
    const extractedRoot = await findExtractedRoot(extractDir);
    const manifest = await readPackageManifest(extractedRoot);

    console.log(`\nInstalling ${chalk.bold(manifest.name)} v${manifest.version}`);
    if (manifest.description) {
      console.log(chalk.dim(`  ${manifest.description}`));
    }

    // 10. Trust check — prompt if publisher not in trusted list
    const publisher = meta.author ?? manifest.author ?? 'unknown';
    const trusted = await isTrusted(publisher);
    const hasHook = !!manifest.hooks?.['on-install'];

    let runHook = false;
    if (hasHook) {
      if (trusted) {
        runHook = true;
      } else {
        console.log(
          chalk.yellow(
            `\nWarning: Package "${manifest.name}" by publisher "${publisher}" is not in your trusted-publishers list.`
          )
        );
        console.log(
          `It wants to run an install hook: ${chalk.bold(manifest.hooks!['on-install']!)}`
        );
        runHook = await confirm('Allow this hook to run?');
        if (!runHook) {
          console.log(chalk.dim('  Hook skipped.'));
        }
      }
    }

    // 11 + 12. Map exposes → install targets, copy files
    const installedFiles: string[] = [];
    const exposes = manifest.exposes ?? {};

    for (const [exposeKey, target] of Object.entries(EXPOSE_TARGETS)) {
      const files = exposes[exposeKey as keyof typeof exposes];
      if (!files?.length) continue;

      const destBase = path.join(hqRoot, target);
      await mkdir(destBase, { recursive: true });

      for (const relFile of files) {
        const srcPath = path.join(extractedRoot, relFile);
        const destPath = path.join(destBase, path.basename(relFile));
        try {
          await cp(srcPath, destPath, { recursive: true, force: true });
          const installedRel = path.join(target, path.basename(relFile));
          installedFiles.push(installedRel);
          console.log(chalk.dim(`  Installed: ${installedRel}`));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(chalk.red(`  Failed to copy ${relFile}: ${msg}`));
          process.exit(1);
        }
      }
    }

    // 13. Run on-install hook (if approved)
    if (hasHook && runHook) {
      const hookScript = path.join(extractedRoot, manifest.hooks!['on-install']!);
      console.log(chalk.dim(`\nRunning install hook: ${manifest.hooks!['on-install']!}`));
      try {
        execSync(`bash "${hookScript}"`, {
          cwd: extractedRoot,
          stdio: 'inherit',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Install hook failed: ${msg}`));
        process.exit(1);
      }
    }

    // 14. ATOMIC: update installed.json only after all files + hooks succeeded
    const record: InstalledPackage = {
      name: manifest.name,
      version: manifest.version,
      type: manifest.type,
      installedAt: new Date().toISOString(),
      files: installedFiles,
      repo: manifest.repo,
      publisher,
    };
    await setInstalled(hqRoot, record);

    // 15. Update workers/registry.yaml if package exposes workers
    await updateWorkersRegistry(hqRoot, manifest, extractedRoot, installedFiles);

    console.log(
      `\n${chalk.green('✓')} ${chalk.bold(manifest.name)} v${manifest.version} installed successfully`
    );
    if (installedFiles.length) {
      console.log(chalk.dim(`  ${installedFiles.length} file(s) installed`));
    }
  } finally {
    // 16. Always clean up temp dir
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  }
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerInstallCommand(program: Command): void {
  program
    .command('install <package>')
    .description('Install a package from the HQ registry')
    .action(async (packageName: string) => {
      await installPackage(packageName);
    });
}
