/**
 * hq modules sync command (US-004)
 * Enhanced with --dry-run, --module, --no-interactive flags.
 * Features ported from modules/cli/src/commands/modules-sync.ts
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
import type { ConflictState } from '../utils/conflict.js';

async function syncModule(
  module: ModuleDefinition,
  moduleDir: string,
  hqRoot: string,
  locked: boolean,
  lockData: ModuleLock | null,
  interactive: boolean,
  conflictState: ConflictState
): Promise<SyncResult> {
  const repoExists = await isRepo(moduleDir);

  // Clone or fetch
  if (!repoExists) {
    console.log(`  Cloning ${module.name}...`);
    await cloneRepo(module.repo, moduleDir, module.branch);
  } else {
    console.log(`  Fetching ${module.name}...`);
    await fetchRepo(moduleDir);

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
      result = await mergeSync(module, moduleDir, hqRoot, { interactive, conflictState });
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
    .option('--module <name>', 'Sync only a specific module')
    .option('--dry-run', 'Show what would be synced without making changes')
    .option('--no-interactive', 'Skip interactive conflict prompts (auto-keep local on conflict)')
    .action(async (options: {
      locked?: boolean;
      module?: string;
      dryRun?: boolean;
      interactive?: boolean;
    }) => {
      try {
        const hqRoot = findHqRoot();
        const manifest = readManifest(hqRoot);

        if (!manifest || manifest.modules.length === 0) {
          console.log('No modules in manifest. Use "hq modules add" to add modules.');
          return;
        }

        // Filter to specific module if requested
        let modulesToSync = manifest.modules;
        if (options.module) {
          modulesToSync = manifest.modules.filter(m => m.name === options.module);
          if (modulesToSync.length === 0) {
            console.error(`Error: Module "${options.module}" not found in manifest.`);
            console.error('Available modules: ' + manifest.modules.map(m => m.name).join(', '));
            process.exit(1);
          }
        }

        // Dry-run: show what would be synced
        if (options.dryRun) {
          console.log('\n--- DRY RUN ---\n');
          for (const module of modulesToSync) {
            console.log(`Would sync: ${module.name}`);
            console.log(`  Repo:     ${module.repo}`);
            console.log(`  Branch:   ${module.branch || 'main'}`);
            console.log(`  Strategy: ${module.strategy}`);
            for (const p of module.paths) {
              console.log(`  Path:     ${p.src} -> ${p.dest}`);
            }
          }
          return;
        }

        const modulesDir = getModulesDir(hqRoot);
        if (!fs.existsSync(modulesDir)) {
          fs.mkdirSync(modulesDir, { recursive: true });
        }

        ensureGitignore(hqRoot, 'modules/');

        const lockData = options.locked ? readLock(hqRoot) : null;
        const results: SyncResult[] = [];
        const newLock: ModuleLock = { version: '1', locked: {} };
        const interactive = options.interactive !== false;
        const conflictState: ConflictState = { resolutions: {} };

        console.log(`Syncing ${modulesToSync.length} module(s)...\n`);

        for (const module of modulesToSync) {
          console.log(`[${module.name}]`);
          const moduleDir = path.join(modulesDir, module.name);

          const result = await syncModule(
            module,
            moduleDir,
            hqRoot,
            options.locked ?? false,
            lockData,
            interactive,
            conflictState
          );
          results.push(result);

          if (result.success) {
            const commit = await getCurrentCommit(moduleDir);
            newLock.locked[module.name] = commit;
          }

          const status = result.success ? '✓' : '✗';
          const msg = result.message || `${result.filesChanged ?? 0} files`;
          console.log(`  ${status} ${result.action}: ${msg}\n`);
        }

        // Write lock file
        if (!options.locked) {
          // Preserve locks for modules not synced when using --module
          if (options.module) {
            const existingLock = readLock(hqRoot);
            if (existingLock) {
              for (const [name, commit] of Object.entries(existingLock.locked)) {
                if (!newLock.locked[name]) {
                  newLock.locked[name] = commit;
                }
              }
            }
          }
          writeLock(hqRoot, newLock);
        }

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
