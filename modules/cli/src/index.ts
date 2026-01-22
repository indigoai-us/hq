#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('hq')
  .description('HQ command-line interface')
  .version('0.1.0');

program.parse();
