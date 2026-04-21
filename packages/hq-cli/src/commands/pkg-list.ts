/**
 * hq packages list — show installed packages and available entitlements (US-005)
 *
 * Graceful offline: if registry is unreachable, show cached data with a note.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { findHqRoot } from '../utils/hq-root.js';
import { readRegistry } from '../utils/registry.js';
import { loadCachedTokens, isExpiring } from '@indigoai-us/hq-cloud';
import {
  getRegistryUrl,
  RegistryClient,
  type EntitlementEntry,
} from '../utils/registry-client.js';

export function registerPackageListCommand(parent: Command): void {
  parent
    .command('list')
    .alias('ls')
    .description('List installed and available packages')
    .action(async () => {
      try {
        await listPackages();
      } catch (error) {
        console.error(
          chalk.red('List failed:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}

async function listPackages(): Promise<void> {
  const hqRoot = findHqRoot();
  const installed = readRegistry(hqRoot);

  // Print installed packages
  if (installed.length > 0) {
    console.log(chalk.bold('Installed packages:\n'));
    for (const pkg of installed) {
      const scope = pkg.scope ? chalk.dim(` (${pkg.scope})`) : '';
      console.log(`  ${chalk.green(pkg.slug)}@${pkg.version}${scope}`);
      console.log(
        chalk.dim(
          `    Installed: ${pkg.installed_at.slice(0, 10)}  Updated: ${pkg.updated_at.slice(0, 10)}`
        )
      );
    }
    console.log();
  } else {
    console.log(chalk.dim('No packages installed.\n'));
  }

  // Try to show available (but not installed) packages from entitlements
  let entitlements: EntitlementEntry[] = [];
  let offline = false;

  try {
    const cached = loadCachedTokens();
    if (cached && !isExpiring(cached, 120)) {
      const registryUrl = getRegistryUrl();
      const client = new RegistryClient(
        registryUrl,
        cached.accessToken
      );
      const result = await client.getMyEntitlements();
      entitlements = result.entitlements;
    }
  } catch {
    offline = true;
  }

  const installedSlugs = new Set(installed.map((p) => p.slug));
  const available = entitlements.filter((e) => !installedSlugs.has(e.slug));

  if (available.length > 0) {
    console.log(chalk.bold('Available (not installed):\n'));
    for (const ent of available) {
      console.log(
        `  ${chalk.cyan(ent.slug)} ${chalk.dim(`[${ent.tier}]`)}  ${chalk.yellow('available')}`
      );
    }
    console.log(
      chalk.dim('\nRun "hq packages install <slug>" to install.\n')
    );
  }

  if (offline) {
    console.log(
      chalk.yellow(
        'Note: Could not reach registry — showing cached data only.'
      )
    );
  }
}
