/**
 * hq logout — clears cached Cognito session
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { clearCachedTokens, loadCachedTokens } from '@indigoai-us/hq-cloud';

export function registerLogoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Log out and clear cached credentials')
    .action(async () => {
      try {
        const existing = loadCachedTokens();
        if (!existing) {
          console.log(chalk.yellow('No cached HQ session'));
          return;
        }
        clearCachedTokens();
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
