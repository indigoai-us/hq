/**
 * hq login — opens browser for Cognito auth via Google OAuth
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { browserLogin, loadCachedTokens, isExpiring } from '@indigoai-us/hq-cloud';
import { DEFAULT_COGNITO } from '../utils/cognito-session.js';

function peekIdToken(idToken: string): { email?: string; sub?: string } {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return {};
    const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString('utf-8'));
    return { email: decoded.email, sub: decoded.sub };
  } catch {
    return {};
  }
}

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with HQ via Cognito (Google OAuth)')
    .action(async () => {
      try {
        const existing = loadCachedTokens();
        if (existing && !isExpiring(existing, 120)) {
          const who = peekIdToken(existing.idToken).email ?? 'cached session';
          console.log(chalk.green(`Already logged in as ${who}. Run \`hq logout\` to switch accounts.`));
          return;
        }

        console.log('Opening browser for authentication...');
        const tokens = await browserLogin(DEFAULT_COGNITO);
        const who = peekIdToken(tokens.idToken).email ?? 'HQ';
        console.log(chalk.green(`Logged in as ${who}`));
      } catch (error) {
        console.error(
          chalk.red('Login failed:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}
