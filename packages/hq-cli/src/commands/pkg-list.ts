/**
 * hq list — list installed packages (US-008)
 */

import chalk from 'chalk';
import { Command } from 'commander';

import { getAllInstalled } from '../utils/installed-packages.js';
import { findHQRoot } from '../utils/hq-root.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO8601 date string as YYYY-MM-DD. */
function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Pad a string to a minimum width. */
function pad(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

// ─── Main list logic ──────────────────────────────────────────────────────────

async function listPackages(options: { company?: string }): Promise<void> {
  // 1. Find HQ root
  let hqRoot: string;
  try {
    hqRoot = await findHQRoot();
  } catch {
    console.error(chalk.red(`Error: not inside an HQ installation (workers/registry.yaml not found)`));
    process.exit(1);
  }

  // 2. Load all installed packages
  const all = await getAllInstalled(hqRoot);

  // 3. Apply --company filter if specified
  let entries = Object.values(all);
  if (options.company !== undefined) {
    entries = entries.filter(pkg => pkg.company === options.company);
  }

  // 4. Handle empty result
  if (entries.length === 0) {
    console.log(chalk.dim('(no packages installed)'));
    return;
  }

  // 5. Sort alphabetically by name
  entries.sort((a, b) => a.name.localeCompare(b.name));

  // 6. Compute column widths
  const COL_NAME = Math.max(4, ...entries.map(p => p.name.length));
  const COL_VERSION = Math.max(7, ...entries.map(p => p.version.length));
  const COL_TYPE = Math.max(4, ...entries.map(p => p.type.length));
  const COL_COMPANY = Math.max(7, ...entries.map(p => (p.company ?? '-').length));
  const COL_INSTALLED = 10; // YYYY-MM-DD is always 10 chars

  // 7. Print header
  const header =
    chalk.bold(pad('Name', COL_NAME)) + '  ' +
    chalk.bold(pad('Version', COL_VERSION)) + '  ' +
    chalk.bold(pad('Type', COL_TYPE)) + '  ' +
    chalk.bold(pad('Company', COL_COMPANY)) + '  ' +
    chalk.bold(pad('Installed', COL_INSTALLED));
  console.log(header);

  const divider =
    '─'.repeat(COL_NAME) + '  ' +
    '─'.repeat(COL_VERSION) + '  ' +
    '─'.repeat(COL_TYPE) + '  ' +
    '─'.repeat(COL_COMPANY) + '  ' +
    '─'.repeat(COL_INSTALLED);
  console.log(chalk.dim(divider));

  // 8. Print rows
  for (const pkg of entries) {
    const company = pkg.company ?? '-';
    const installed = shortDate(pkg.installedAt);
    const row =
      pad(pkg.name, COL_NAME) + '  ' +
      chalk.dim(pad(pkg.version, COL_VERSION)) + '  ' +
      chalk.cyan(pad(pkg.type, COL_TYPE)) + '  ' +
      (pkg.company ? chalk.magenta(pad(company, COL_COMPANY)) : chalk.dim(pad(company, COL_COMPANY))) + '  ' +
      chalk.dim(pad(installed, COL_INSTALLED));
    console.log(row);
  }
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerPkgListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List installed packages')
    .option('--company <co>', 'Filter to company-scoped packages')
    .action(async (options: { company?: string }) => {
      await listPackages(options);
    });
}
