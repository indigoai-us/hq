/**
 * hq remove <package> — uninstall a previously installed package (US-006)
 */

import { execSync } from 'node:child_process';
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import yaml from 'js-yaml';

import { findHQRoot } from '../utils/hq-root.js';
import {
  getInstalled,
  removeInstalled,
} from '../utils/installed-packages.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if a path exists on disk. */
async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove workers from workers/registry.yaml whose path starts with any
 * of the installed file paths.
 */
async function removeWorkersFromRegistry(
  hqRoot: string,
  installedFiles: string[]
): Promise<void> {
  const workerPrefix = path.join('workers', 'public', '');
  const workerFiles = installedFiles.filter(f => f.startsWith(workerPrefix));
  if (!workerFiles.length) return;

  const registryPath = path.join(hqRoot, 'workers', 'registry.yaml');
  let registryRaw: string;
  try {
    registryRaw = await readFile(registryPath, 'utf8');
  } catch {
    console.warn(chalk.yellow(`  Warning: could not read workers/registry.yaml — skipping registry cleanup`));
    return;
  }

  interface WorkerEntry {
    id: string;
    path: string;
    [key: string]: unknown;
  }
  interface RegistryYaml {
    workers?: WorkerEntry[];
    [key: string]: unknown;
  }

  const registry = yaml.load(registryRaw) as RegistryYaml;
  const workers: WorkerEntry[] = registry.workers ?? [];

  const before = workers.length;
  const remaining = workers.filter(w => {
    // Normalize the worker path (strip trailing slash for comparison)
    const workerPath = w.path.replace(/\/$/, '');
    return !workerFiles.some(installedFile => {
      const installedNorm = installedFile.replace(/\/$/, '');
      return workerPath === installedNorm || workerPath.startsWith(installedNorm + path.sep);
    });
  });

  if (remaining.length < before) {
    registry.workers = remaining;
    await writeFile(registryPath, yaml.dump(registry, { lineWidth: 120 }), 'utf8');
    console.log(chalk.dim(`  Removed ${before - remaining.length} worker(s) from registry`));
  }
}

// ─── Main remove logic ────────────────────────────────────────────────────────

async function removePackage(packageName: string): Promise<void> {
  // 1. Find HQ root
  let hqRoot: string;
  try {
    hqRoot = await findHQRoot();
  } catch {
    console.error(chalk.red(`Error: not inside an HQ installation (workers/registry.yaml not found)`));
    process.exit(1);
  }

  // 2. Read installed.json
  const pkg = await getInstalled(hqRoot, packageName);

  // 3. If not installed → error
  if (!pkg) {
    console.error(chalk.red(`Package '${packageName}' is not installed.`));
    process.exit(1);
  }

  console.log(`\nRemoving ${chalk.bold(pkg.name)} v${pkg.version}…`);

  // 4. Run on-remove hook if present (best-effort)
  if (pkg.hooks?.onRemove) {
    const hookPath = path.join(hqRoot, pkg.hooks.onRemove);
    if (await exists(hookPath)) {
      console.log(chalk.dim(`  Running on-remove hook: ${pkg.hooks.onRemove}`));
      try {
        execSync(`bash "${hookPath}"`, { cwd: hqRoot, stdio: 'inherit' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(chalk.yellow(`  Warning: on-remove hook failed (continuing): ${msg}`));
      }
    } else {
      console.warn(chalk.yellow(`  Warning: on-remove hook not found at ${hookPath} — skipping`));
    }
  }

  // 5. Delete all installed files/dirs
  for (const relFile of pkg.files) {
    const absPath = path.join(hqRoot, relFile);
    try {
      await rm(absPath, { recursive: true, force: true });
      console.log(chalk.dim(`  Removed: ${relFile}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(chalk.yellow(`  Warning: could not remove ${relFile}: ${msg}`));
    }
  }

  // 6. Remove workers from workers/registry.yaml
  await removeWorkersFromRegistry(hqRoot, pkg.files);

  // 7. Remove on-remove hook cache dir
  const hookCacheDir = path.join(hqRoot, 'packages', 'hooks', packageName);
  if (await exists(hookCacheDir)) {
    try {
      await rm(hookCacheDir, { recursive: true, force: true });
      console.log(chalk.dim(`  Removed hook cache: packages/hooks/${packageName}/`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(chalk.yellow(`  Warning: could not remove hook cache: ${msg}`));
    }
  }

  // 8. Remove entry from installed.json
  await removeInstalled(hqRoot, packageName);

  // 9. Print success
  console.log(`\n${chalk.green('✓')} ${chalk.bold(pkg.name)} removed`);
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove <package>')
    .description('Remove an installed package')
    .action(async (packageName: string) => {
      await removePackage(packageName);
    });
}
