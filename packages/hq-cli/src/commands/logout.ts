/**
 * hq logout — clears cached session (US-004)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { clearToken } from '../utils/token-store.js';

export function registerLogoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Log out and clear cached credentials')
    .action(async () => {
      try {
        await clearToken();
        console.log(chalk.green('Logged out successfully'));
      } catch (error) {
        console.error(
          chalk.red('Logout failed:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}
