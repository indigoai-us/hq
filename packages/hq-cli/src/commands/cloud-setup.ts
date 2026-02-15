/**
 * hq cloud commands — cloud session management
 *
 * Subcommands:
 * - setup-token: Walk user through generating and storing a Claude OAuth token
 * - status: Show cloud readiness (auth state + Claude token state)
 * - upload: Initial HQ file upload to cloud storage
 */

import { Command } from 'commander';
import * as readline from 'readline';
import chalk from 'chalk';
import {
  readCredentials,
  isExpired,
} from '../utils/credentials.js';
import { apiRequest, getApiUrl } from '../utils/api-client.js';
import { findHqRoot } from '../utils/manifest.js';
import { runInitialUpload } from './initial-upload.js';

/** Minimum token length for basic validation */
const MIN_TOKEN_LENGTH = 20;

/**
 * Validate a Claude OAuth token string.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateClaudeToken(token: string): string | null {
  if (!token || token.trim().length === 0) {
    return 'Token cannot be empty.';
  }

  const trimmed = token.trim();

  if (trimmed.length < MIN_TOKEN_LENGTH) {
    return `Token is too short (${trimmed.length} chars). Claude tokens are typically much longer. Please check you copied the full token.`;
  }

  // Reject tokens that look like they contain whitespace in the middle (copy-paste artifacts)
  if (/\s/.test(trimmed)) {
    return 'Token contains whitespace. Please ensure you copied it correctly without line breaks.';
  }

  return null;
}

/**
 * Prompt the user for input on stdin.
 * Returns the entered string (trimmed).
 */
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Register the "hq cloud" command group with setup-token and status subcommands.
 */
export function registerCloudSetupCommand(program: Command): void {
  const cloudCmd = program
    .command('cloud')
    .description('Cloud session management — token setup and status');

  // --- hq cloud setup-token ---
  cloudCmd
    .command('setup-token')
    .description('Set up your Claude OAuth token for cloud sessions')
    .action(async () => {
      try {
        // Check auth first (AC #6)
        const creds = readCredentials();
        if (!creds || isExpired(creds)) {
          console.log(chalk.red('Not logged in to HQ Cloud.'));
          console.log('Run "hq auth login" first, then try again.');
          process.exit(1);
        }

        console.log(chalk.blue('Claude Token Setup'));
        console.log('');
        console.log('To launch cloud sessions, HQ needs your Claude OAuth token.');
        console.log('This token lets cloud containers run Claude on your behalf.');
        console.log('');
        console.log(chalk.yellow('Step 1:') + ' Open a terminal and run:');
        console.log('');
        console.log(chalk.cyan('  claude setup-token'));
        console.log('');
        console.log(chalk.yellow('Step 2:') + ' Copy the token output and paste it below.');
        console.log('');

        // Prompt for the token
        const token = await promptUser('Paste your Claude token: ');

        // Validate format (AC #2)
        const validationError = validateClaudeToken(token);
        if (validationError) {
          console.log('');
          console.log(chalk.red('Invalid token: ') + validationError);
          process.exit(1);
        }

        // Send to API (AC #3)
        console.log('');
        console.log(chalk.dim('Storing token securely...'));

        const resp = await apiRequest<{ ok: boolean; hasToken: boolean; setAt: string | null }>(
          'POST',
          '/api/settings/claude-token',
          { token: token.trim() },
        );

        if (!resp.ok) {
          console.log(chalk.red('Failed to store token: ') + (resp.error ?? `HTTP ${resp.status}`));
          process.exit(1);
        }

        // Success (AC #4)
        console.log('');
        console.log(chalk.green('Claude token stored securely.'));
        if (resp.data?.setAt) {
          console.log(chalk.dim(`  Set at: ${resp.data.setAt}`));
        }
        console.log('');
        console.log('You can now launch cloud sessions with "hq cloud" commands.');
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  // --- hq cloud status ---
  cloudCmd
    .command('status')
    .description('Show cloud readiness — authentication and Claude token status')
    .action(async () => {
      try {
        console.log(chalk.blue('HQ Cloud Status'));
        console.log('');

        // 1. Auth status
        const creds = readCredentials();
        if (!creds) {
          console.log(`  Auth:          ${chalk.red('Not logged in')}`);
          console.log(`  Claude Token:  ${chalk.dim('unknown (login first)')}`);
          console.log('');
          console.log('Run "hq auth login" to get started.');
          return;
        }

        if (isExpired(creds)) {
          console.log(`  Auth:          ${chalk.red('Session expired')}`);
          console.log(`  Claude Token:  ${chalk.dim('unknown (login first)')}`);
          console.log('');
          console.log('Run "hq auth login" to re-authenticate.');
          return;
        }

        const label = creds.email ?? creds.userId;
        console.log(`  Auth:          ${chalk.green('Logged in')} as ${label}`);
        console.log(`  API:           ${getApiUrl()}`);

        // 2. Claude token status (AC #5)
        try {
          const resp = await apiRequest<{ hasToken: boolean; setAt: string | null }>(
            'GET',
            '/api/settings/claude-token',
          );

          if (resp.ok && resp.data) {
            if (resp.data.hasToken) {
              console.log(`  Claude Token:  ${chalk.green('Configured')}`);
              if (resp.data.setAt) {
                console.log(`  Token Set At:  ${resp.data.setAt}`);
              }
            } else {
              console.log(`  Claude Token:  ${chalk.yellow('Not configured')}`);
              console.log('');
              console.log('Run "hq cloud setup-token" to configure your Claude token.');
            }
          } else {
            console.log(`  Claude Token:  ${chalk.yellow('Could not check')} (API returned ${resp.status})`);
          }
        } catch {
          console.log(`  Claude Token:  ${chalk.dim('Could not reach API')}`);
        }

        console.log('');
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  // --- hq cloud upload ---
  cloudCmd
    .command('upload')
    .description('Upload local HQ files to cloud storage (initial setup)')
    .option('--hq-root <path>', 'Path to HQ root directory (auto-detected if omitted)')
    .option('--on-conflict <action>', 'Action when remote has files: merge, replace, or skip')
    .action(async (opts: { hqRoot?: string; onConflict?: string }) => {
      try {
        // Require auth
        const creds = readCredentials();
        if (!creds || isExpired(creds)) {
          console.log(chalk.red('Not logged in to HQ Cloud.'));
          console.log('Run "hq auth login" first, then try again.');
          process.exit(1);
        }

        const hqRoot = opts.hqRoot ?? findHqRoot();

        console.log(chalk.blue('HQ Cloud — Initial Upload'));
        console.log(chalk.dim(`  HQ root: ${hqRoot}`));
        console.log('');

        const onConflict = opts.onConflict as 'merge' | 'replace' | 'skip' | undefined;

        const result = await runInitialUpload(hqRoot, {
          onConflict,
        });

        if (result.skipped) {
          process.exit(0);
        }

        if (result.failed > 0) {
          process.exit(1);
        }
      } catch (error) {
        console.error(
          chalk.red('Upload failed:'),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });
}
