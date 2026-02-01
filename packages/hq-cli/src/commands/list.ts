/**
 * hq modules list command (US-005)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { findHqRoot, readManifest, readLock, getModulesDir } from '../utils/manifest.js';
import { isRepo, getCurrentCommit, isBehindRemote } from '../utils/git.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List all modules and their status')
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const manifest = readManifest(hqRoot);

        if (!manifest || manifest.modules.length === 0) {
          console.log('No modules in manifest. Use "hq modules add" to add modules.');
          return;
        }

        const modulesDir = getModulesDir(hqRoot);
        const lock = readLock(hqRoot);

        console.log('Modules:\n');

        for (const module of manifest.modules) {
          const moduleDir = path.join(modulesDir, module.name);
          const installed = await isRepo(moduleDir);

          console.log(`  ${module.name}`);
          console.log(`    Repo:     ${module.repo}`);
          console.log(`    Branch:   ${module.branch || 'main'}`);
          console.log(`    Strategy: ${module.strategy}`);
          console.log(`    Paths:    ${module.paths.map(p => `${p.src} -> ${p.dest}`).join(', ')}`);

          if (installed) {
            const commit = await getCurrentCommit(moduleDir);
            const shortCommit = commit.slice(0, 7);
            const lockedCommit = lock?.locked[module.name];
            const isLocked = lockedCommit === commit;

            console.log(`    Status:   ✓ installed @ ${shortCommit}${isLocked ? ' (locked)' : ''}`);

            // Check if behind upstream
            const { behind, commits } = await isBehindRemote(moduleDir);
            if (behind) {
              console.log(`    Updates:  ${commits} commit(s) behind remote`);
            }
          } else {
            console.log(`    Status:   ✗ not installed`);
          }

          console.log();
        }

      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
