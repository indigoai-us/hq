#!/usr/bin/env node
import { Command } from 'commander';
import { modulesAddCommand } from './commands/modules-add.js';
import { modulesListCommand } from './commands/modules-list.js';
import { modulesSyncCommand } from './commands/modules-sync.js';

const program = new Command();

program
  .name('hq')
  .description('HQ command-line interface')
  .version('0.1.0');

// Modules command group
const modulesCommand = new Command('modules')
  .description('Manage HQ modules');

modulesCommand.addCommand(modulesAddCommand);
modulesCommand.addCommand(modulesListCommand);
modulesCommand.addCommand(modulesSyncCommand);
program.addCommand(modulesCommand);

program.parse();
