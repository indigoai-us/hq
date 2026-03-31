#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import { scaffold } from "./scaffold.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("create-hq")
  .description("Create a new HQ by Indigo — Personal OS for AI Workers")
  .version(pkg.version)
  .argument("[directory]", "where to create HQ", "hq")
  .option("--skip-deps", "skip dependency checks")
  .option("--skip-cli", "don't install @indigoai-us/hq-cli globally")
  .option("--skip-sync", "don't prompt for cloud sync setup")
  .option("--skip-packages", "don't prompt for package discovery and installation")
  .option("--tag <version>", "fetch a specific HQ version tag (e.g. v9.1.0)")
  .option("--local-template <path>", "use a local template directory instead of fetching from GitHub")
  .option("--join <token>", "join a team with an invite token after scaffolding")
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
