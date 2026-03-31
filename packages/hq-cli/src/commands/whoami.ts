/**
 * hq whoami — displays current user or 'not logged in' (US-004)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadToken, isTokenExpired } from '../utils/token-store.js';

export function registerWhoamiCommand(program: Command): void {
  program
    .command('whoami')
    .description('Show the currently authenticated user')
    .action(async () => {
      try {
        const token = await loadToken();

        if (!token) {
          console.log("Not logged in. Run 'hq login' to authenticate.");
          return;
        }

        if (isTokenExpired(token)) {
          console.log(
            chalk.yellow(`Session expired for ${token.email}. Run 'hq login' to re-authenticate.`)
          );
          return;
        }

        console.log(`Logged in as ${token.email} (${token.user_id})`);
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}
