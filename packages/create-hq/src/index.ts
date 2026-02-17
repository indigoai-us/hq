#!/usr/bin/env node

import { Command } from "commander";
import { scaffold } from "./scaffold.js";

const program = new Command();

program
  .name("create-hq")
  .description("Create a new HQ — Personal OS for AI Workers")
  .version("6.0.0")
  .argument("[directory]", "target directory (default: 'hq' for new install, '.' for --upgrade)")
  .option("--skip-deps", "skip dependency checks")
  .option("--skip-cli", "don't install @indigoai-us/hq-cli globally")
  .option("--skip-cloud", "don't prompt for cloud setup")
  .option("--upgrade", "upgrade an existing HQ directory (non-destructive)")
  .action(async (directory: string | undefined, options) => {
    try {
      // Default to current directory for --upgrade, 'hq' for fresh install
      const dir = directory ?? (options.upgrade ? "." : "hq");
      await scaffold(dir, options);
    } catch (err) {
      console.error(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      process.exit(1);
    }
  });

program.parse();
