/**
 * hq search <query> — search registry (US-009)
 */

import chalk from 'chalk';
import { Command } from 'commander';

import { registryClient } from '../utils/registry-client.js';
import type { RegistryPackage } from '../utils/registry-client.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pad a string to a minimum width. */
function pad(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

/** Truncate a string with ellipsis if it exceeds maxLen. */
function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

// ─── Main search logic ────────────────────────────────────────────────────────

async function searchPackages(query: string): Promise<void> {
  console.log(chalk.dim(`Searching registry for "${query}"…`));

  let packages: RegistryPackage[];
  let totalCount: number;
  try {
    const result = await registryClient.listPackages(query);
    packages = result.data;
    totalCount = result.meta.total;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error searching registry: ${msg}`));
    process.exit(1);
  }

  if (packages.length === 0) {
    console.log(chalk.dim('no packages found'));
    return;
  }

  // Compute column widths
  const COL_NAME = Math.max(4, ...packages.map(p => p.name.length));
  const COL_TYPE = Math.max(4, ...packages.map(p => p.type.length));
  const COL_VERSION = Math.max(7, ...packages.map(p => p.version.length));
  const COL_DOWNLOADS = Math.max(9, ...packages.map(p => String(p.downloadCount ?? 0).length));
  const COL_DESC = 48; // fixed max for description

  // Print header
  const header =
    chalk.bold(pad('Name', COL_NAME)) + '  ' +
    chalk.bold(pad('Type', COL_TYPE)) + '  ' +
    chalk.bold(pad('Version', COL_VERSION)) + '  ' +
    chalk.bold(pad('Downloads', COL_DOWNLOADS)) + '  ' +
    chalk.bold('Description');
  console.log('\n' + header);

  const divider =
    '─'.repeat(COL_NAME) + '  ' +
    '─'.repeat(COL_TYPE) + '  ' +
    '─'.repeat(COL_VERSION) + '  ' +
    '─'.repeat(COL_DOWNLOADS) + '  ' +
    '─'.repeat(COL_DESC);
  console.log(chalk.dim(divider));

  // Print rows
  for (const pkg of packages) {
    const downloads = String(pkg.downloadCount ?? 0);
    const desc = truncate(pkg.description ?? '', COL_DESC);
    const row =
      chalk.bold(pad(pkg.name, COL_NAME)) + '  ' +
      chalk.cyan(pad(pkg.type, COL_TYPE)) + '  ' +
      chalk.dim(pad(pkg.version, COL_VERSION)) + '  ' +
      chalk.dim(pad(downloads, COL_DOWNLOADS)) + '  ' +
      desc;
    console.log(row);
  }

  if (packages.length < totalCount) {
    console.log(chalk.dim(`\nShowing ${packages.length} of ${totalCount} packages — refine your query to narrow results`));
  } else {
    console.log(chalk.dim(`\n${totalCount} package${totalCount === 1 ? '' : 's'} found`));
  }
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerPkgSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search the HQ registry for packages')
    .action(async (query: string) => {
      await searchPackages(query);
    });
}
