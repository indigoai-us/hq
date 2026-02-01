/**
 * hq modules sync command (US-004)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
  findHqRoot,
  readManifest,
  readLock,
  writeLock,
  getModulesDir,
} from '../utils/manifest.js';
import {
  cloneRepo,
  fetchRepo,
  pullRepo,
  getCurrentCommit,
  checkoutCommit,
  isRepo,
  ensureGitignore,
} from '../utils/git.js';
import { linkSync } from '../strategies/link.js';
import { mergeSync } from '../strategies/merge.js';
import type { ModuleDefinition, ModuleLock, SyncResult } from '../types.js';

async function syncModule(
  module: ModuleDefinition,
  moduleDir: string,
  hqRoot: string,
  locked: boolean,
  lockData: ModuleLock | null
): Promise<SyncResult> {
  const repoExists = await isRepo(moduleDir);

  // Clone or fetch
  if (!repoExists) {
    console.log(`  Cloning ${module.name}...`);
    await cloneRepo(module.repo, moduleDir, module.branch);
  } else {
    console.log(`  Fetching ${module.name}...`);
    await fetchRepo(moduleDir);

    // Checkout locked commit if --locked
    if (locked && lockData?.locked[module.name]) {
      await checkoutCommit(moduleDir, lockData.locked[module.name]);
    } else {
      await pullRepo(moduleDir);
    }
  }

  // Apply sync strategy
  console.log(`  Syncing with strategy: ${module.strategy}`);
  let result: SyncResult;

  switch (module.strategy) {
    case 'link':
      result = await linkSync(module, moduleDir, hqRoot);
      break;
    case 'merge':
    case 'copy':
      result = await mergeSync(module, moduleDir, hqRoot);
      break;
    default:
      result = {
        module: module.name,
        success: false,
        action: 'skipped',
        message: `Unknown strategy: ${module.strategy}`,
      };
  }

  return result;
}

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Sync all modules from manifest')
    .option('--locked', 'Use locked versions from modules.lock')
    .action(async (options: { locked?: boolean }) => {
      try {
        const hqRoot = findHqRoot();
        const manifest = readManifest(hqRoot);

        if (!manifest || manifest.modules.length === 0) {
          console.log('No modules in manifest. Use "hq modules add" to add modules.');
          return;
        }

        const modulesDir = getModulesDir(hqRoot);
        if (!fs.existsSync(modulesDir)) {
          fs.mkdirSync(modulesDir, { recursive: true });
        }

        // Ensure modules/ is gitignored
        ensureGitignore(hqRoot, 'modules/');

        const lockData = options.locked ? readLock(hqRoot) : null;
        const results: SyncResult[] = [];
        const newLock: ModuleLock = { version: '1', locked: {} };

        console.log(`Syncing ${manifest.modules.length} module(s)...\n`);

        for (const module of manifest.modules) {
          console.log(`[${module.name}]`);
          const moduleDir = path.join(modulesDir, module.name);

          const result = await syncModule(
            module,
            moduleDir,
            hqRoot,
            options.locked ?? false,
            lockData
          );
          results.push(result);

          // Record commit for lock file
          if (result.success) {
            const commit = await getCurrentCommit(moduleDir);
            newLock.locked[module.name] = commit;
          }

          const status = result.success ? '✓' : '✗';
          const msg = result.message || `${result.filesChanged ?? 0} files`;
          console.log(`  ${status} ${result.action}: ${msg}\n`);
        }

        // Write lock file (US-008)
        if (!options.locked) {
          writeLock(hqRoot, newLock);
        }

        // Summary
        const success = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`Done: ${success} succeeded, ${failed} failed`);

        if (failed > 0) {
          process.exit(1);
        }

      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
