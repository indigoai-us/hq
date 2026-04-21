/**
 * hq whoami — displays current user or 'not logged in'
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadCachedTokens, isExpiring } from '@indigoai-us/hq-cloud';

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

export function registerWhoamiCommand(program: Command): void {
  program
    .command('whoami')
    .description('Show the currently authenticated user')
    .action(async () => {
      try {
        const cached = loadCachedTokens();

        if (!cached) {
          console.log("Not logged in. Run 'hq login' to authenticate.");
          return;
        }

        if (isExpiring(cached, 0)) {
          const who = peekIdToken(cached.idToken).email ?? 'unknown';
          console.log(
            chalk.yellow(`Session expired for ${who}. Run 'hq login' to re-authenticate.`)
          );
          return;
        }

        const { email, sub } = peekIdToken(cached.idToken);
        console.log(`Logged in as ${email ?? 'unknown'}${sub ? ` (${sub})` : ''}`);
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}
