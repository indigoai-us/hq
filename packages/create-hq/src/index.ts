#!/usr/bin/env node

import { Command } from "commander";
import { scaffold } from "./scaffold.js";

const program = new Command();

program
  .name("create-hq")
  .description("Create a new HQ — Personal OS for AI Workers")
  .version("5.0.0")
  .argument("[directory]", "where to create HQ", "hq")
  .option("--skip-deps", "skip dependency checks")
  .option("--skip-cli", "don't install @indigoai/hq-cli globally")
  .option("--skip-sync", "don't prompt for cloud sync setup")
  .action(async (directory: string, options) => {
    try {
      await scaffold(directory, options);
    } catch (err) {
      console.error(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      process.exit(1);
    }
  });

program.parse();
