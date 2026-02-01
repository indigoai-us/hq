/**
 * hq modules add command (US-003)
 */

import { Command } from 'commander';
import { findHqRoot, addModule, parseRepoName, isValidRepoUrl } from '../utils/manifest.js';
import type { ModuleDefinition, SyncStrategy } from '../types.js';

export function registerAddCommand(program: Command): void {
  program
    .command('add <repo-url>')
    .description('Add a module to the manifest')
    .option('--as <name>', 'Module name (defaults to repo name)')
    .option('--branch <branch>', 'Git branch to track', 'main')
    .option('--strategy <strategy>', 'Sync strategy: link | merge | copy', 'link')
    .option('--path <mapping>', 'Path mapping src:dest (can repeat)', (val, prev: string[]) => [...prev, val], [])
    .action(async (repoUrl: string, options: {
      as?: string;
      branch: string;
      strategy: string;
      path: string[];
    }) => {
      try {
        // Validate repo URL
        if (!isValidRepoUrl(repoUrl)) {
          console.error('Error: Invalid repo URL. Must start with https:// or git@');
          process.exit(1);
        }

        // Parse name
        const name = options.as || parseRepoName(repoUrl);

        // Validate strategy
        const validStrategies: SyncStrategy[] = ['link', 'merge', 'copy'];
        if (!validStrategies.includes(options.strategy as SyncStrategy)) {
          console.error(`Error: Invalid strategy "${options.strategy}". Use: ${validStrategies.join(', ')}`);
          process.exit(1);
        }

        // Parse path mappings
        const paths = options.path.length > 0
          ? options.path.map(p => {
              const [src, dest] = p.split(':');
              if (!src || !dest) {
                throw new Error(`Invalid path mapping: ${p}. Format: src:dest`);
              }
              return { src, dest };
            })
          : [{ src: '.', dest: `workers/${name}` }]; // Default: entire repo to workers/

        const module: ModuleDefinition = {
          name,
          repo: repoUrl,
          branch: options.branch,
          strategy: options.strategy as SyncStrategy,
          paths,
        };

        const hqRoot = findHqRoot();
        addModule(hqRoot, module);

        console.log(`Added module "${name}"`);
        console.log(`  Repo: ${repoUrl}`);
        console.log(`  Branch: ${options.branch}`);
        console.log(`  Strategy: ${options.strategy}`);
        console.log(`  Paths: ${paths.map(p => `${p.src} -> ${p.dest}`).join(', ')}`);
        console.log('\nRun "hq modules sync" to fetch and sync the module.');

      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
