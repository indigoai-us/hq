/**
 * hq remove <package> — stub for US-006
 */

import { Command } from 'commander';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove <package>')
    .description('Remove an installed package')
    .action(() => {
      console.log('hq remove — not yet implemented (US-006)');
      process.exit(0);
    });
}
