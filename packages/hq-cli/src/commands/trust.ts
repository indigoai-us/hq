/**
 * hq trust — manage trusted publishers (US-014b)
 *
 * Usage:
 *   hq trust <publisher>           Add publisher to trusted list
 *   hq trust --list                Show all trusted publishers
 *   hq trust --remove <publisher>  Remove publisher from trusted list
 */

import chalk from 'chalk';
import { Command } from 'commander';

import {
  addTrusted,
  listTrusted,
  removeTrusted,
} from '../utils/trusted-publishers.js';

// ─── Validation ───────────────────────────────────────────────────────────────

/** Sentinel values that install/update fall back to when a package has no real author. */
const SENTINEL_PUBLISHERS = new Set(['unknown', '']);

function validatePublisher(publisher: string): void {
  const trimmed = publisher.trim();
  if (trimmed.length === 0 || SENTINEL_PUBLISHERS.has(trimmed.toLowerCase())) {
    console.error(chalk.red(`Error: "${publisher}" is not a valid publisher name`));
    console.error(
      chalk.dim(
        `  Trusting "${publisher}" would allow hooks from any package without a real author to run automatically.`
      )
    );
    process.exit(1);
  }
}

// ─── Core logic ───────────────────────────────────────────────────────────────

async function runTrust(
  publisher: string | undefined,
  options: { list?: boolean; remove?: boolean }
): Promise<void> {
  // --list: show all trusted publishers
  if (options.list) {
    const publishers = await listTrusted();
    if (publishers.length === 0) {
      console.log(chalk.dim('No trusted publishers.'));
      console.log(chalk.dim('  Add one with: hq trust <publisher>'));
    } else {
      console.log(chalk.bold('Trusted publishers:'));
      for (const p of publishers) {
        console.log(`  ${chalk.green('✓')} ${p}`);
      }
    }
    return;
  }

  // --remove: remove a publisher from the trust list
  if (options.remove) {
    if (!publisher) {
      console.error(chalk.red('Error: --remove requires a publisher name'));
      console.error(chalk.dim('  Usage: hq trust --remove <publisher>'));
      process.exit(1);
    }
    await removeTrusted(publisher);
    console.log(`${chalk.green('✓')} Removed ${chalk.bold(publisher)} from trusted publishers`);
    return;
  }

  // Default: add publisher to trusted list
  if (!publisher) {
    console.error(chalk.red('Error: publisher name required'));
    console.error(chalk.dim('  Usage: hq trust <publisher>'));
    console.error(chalk.dim('         hq trust --list'));
    console.error(chalk.dim('         hq trust --remove <publisher>'));
    process.exit(1);
  }

  validatePublisher(publisher);
  await addTrusted(publisher);
  console.log(
    `${chalk.green('✓')} Trusted ${chalk.bold(publisher)}\n` +
    chalk.dim(`  Hooks from ${publisher} will now run automatically during install and update.`)
  );
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerTrustCommand(program: Command): void {
  program
    .command('trust [publisher]')
    .description('Manage trusted publishers — hooks from trusted publishers run without confirmation')
    .option('--list', 'List all trusted publishers')
    .option('--remove', 'Remove publisher from trusted list')
    .action(async (publisher: string | undefined, options: { list?: boolean; remove?: boolean }) => {
      try {
        await runTrust(publisher, options);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exit(1);
      }
    });
}
