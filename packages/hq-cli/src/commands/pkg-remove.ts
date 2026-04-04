/**
 * hq packages remove <slug> — archive and unregister a package (US-005)
 *
 * 1. Archive packages/installed/<slug>/ to packages/.archive/<slug>-<timestamp>/
 * 2. Remove entry from packages/registry.yaml
 * 3. Print next-step message
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { findHqRoot } from '../utils/hq-root.js';
import { removeFromRegistry, readRegistry } from '../utils/registry.js';

export function registerPackageRemoveCommand(parent: Command): void {
  parent
    .command('remove <slug>')
    .description('Remove an installed package (archives it first)')
    .action(async (slug: string) => {
      try {
        await removePackage(slug);
      } catch (error) {
        console.error(
          chalk.red('Remove failed:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}

async function removePackage(slug: string): Promise<void> {
  const hqRoot = findHqRoot();
  const installDir = path.resolve(hqRoot, 'packages', 'installed', slug);

  // Verify it is actually installed
  const entries = readRegistry(hqRoot);
  const entry = entries.find((e) => e.slug === slug);
  if (!entry && !fs.existsSync(installDir)) {
    throw new Error(`Package "${slug}" is not installed.`);
  }

  // 1. Archive
  if (fs.existsSync(installDir)) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const archiveDir = path.resolve(
      hqRoot,
      'packages',
      '.archive',
      `${slug}-${timestamp}`
    );
    fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
    fs.renameSync(installDir, archiveDir);
    console.log(chalk.dim(`Archived to packages/.archive/${slug}-${timestamp}/`));
  }

  // 2. Remove from registry.yaml
  removeFromRegistry(hqRoot, slug);

  console.log(chalk.green(`\nRemoved ${slug}.`));
  console.log(
    chalk.cyan(
      'Run /package-remove ' + slug + ' in Claude to clean up merged content.'
    )
  );
}
