/**
 * hq modules update command (US-008)
 * Updates lock for specific module
 */

import * as path from 'path';
import { Command } from 'commander';
import { findHqRoot, readManifest, readLock, writeLock, getModulesDir } from '../utils/manifest.js';
import { fetchRepo, pullRepo, getCurrentCommit, isRepo } from '../utils/git.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update [module-name]')
    .description('Update lock for a specific module (or all if no name given)')
    .action(async (moduleName?: string) => {
      try {
        const hqRoot = findHqRoot();
        const manifest = readManifest(hqRoot);

        if (!manifest || manifest.modules.length === 0) {
          console.log('No modules in manifest.');
          return;
        }

        let lock = readLock(hqRoot);
        if (!lock) {
          lock = { version: '1', locked: {} };
        }

        const modulesDir = getModulesDir(hqRoot);
        const modulesToUpdate = moduleName
          ? manifest.modules.filter(m => m.name === moduleName)
          : manifest.modules;

        if (moduleName && modulesToUpdate.length === 0) {
          console.error(`Module "${moduleName}" not found in manifest.`);
          process.exit(1);
        }

        for (const module of modulesToUpdate) {
          const moduleDir = path.join(modulesDir, module.name);

          if (!await isRepo(moduleDir)) {
            console.log(`  ${module.name}: not installed, skipping`);
            continue;
          }

          console.log(`  ${module.name}: fetching...`);
          await fetchRepo(moduleDir);
          await pullRepo(moduleDir);

          const commit = await getCurrentCommit(moduleDir);
          const oldCommit = lock.locked[module.name];
          lock.locked[module.name] = commit;

          if (oldCommit === commit) {
            console.log(`  ${module.name}: already up to date @ ${commit.slice(0, 7)}`);
          } else {
            console.log(`  ${module.name}: updated ${oldCommit?.slice(0, 7) || 'none'} -> ${commit.slice(0, 7)}`);
          }
        }

        writeLock(hqRoot, lock);
        console.log('\nLock file updated.');

      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
