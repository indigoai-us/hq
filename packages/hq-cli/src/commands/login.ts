/**
 * hq login — opens browser for Clerk auth, caches token (US-004)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { startAuthFlow } from '../utils/auth.js';
import { saveToken } from '../utils/token-store.js';
import { getRegistryUrl } from '../utils/registry-client.js';

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with the HQ package registry')
    .action(async () => {
      try {
        const registryUrl = getRegistryUrl();
        const token = await startAuthFlow(registryUrl);
        await saveToken(token);
        console.log(chalk.green(`Logged in as ${token.email}`));
      } catch (error) {
        console.error(
          chalk.red('Login failed:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}
