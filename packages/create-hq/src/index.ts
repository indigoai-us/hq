#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import { scaffold } from "./scaffold.js";
import { runInviteCommand } from "./invite-command.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("create-hq")
  .description("Create a new HQ by Indigo — Personal OS for AI Workers")
  .version(pkg.version)
  .argument("[directory]", "where to create HQ (prompts if omitted)")
  .option("--skip-deps", "skip dependency checks")
  .option("--skip-cli", "don't install @indigoai-us/hq-cli globally")
  .option("--skip-sync", "don't prompt for cloud sync setup")
  .option("--skip-packages", "don't prompt for package discovery and installation")
  .option("--minimal", "install the hq-core scaffold only — skip all recommended content packs")
  .option("--full", "install the hq-core scaffold plus all recommended content packs without prompting")
  .option("--tag <version>", "fetch a specific HQ version tag (e.g. v12.0.0)")
  .option("--local-template <path>", "use a local hq-core directory instead of fetching from GitHub")
  .option("--join <token>", "join a team with an invite token (interactive prompt)")
  .option("--invite <token>", "join a team via invite — direct, no extra prompts")
  .action(async (directory: string | undefined, options) => {
    if (options.minimal && options.full) {
      console.error(
        "Error: --minimal and --full are mutually exclusive. Pick one."
      );
      process.exit(1);
    }
    try {
      await scaffold(directory, options);
    } catch (err) {
      console.error(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      process.exit(1);
    }
  });

// Standalone invite subcommand for admins to generate invites
program
  .command("invite")
  .description("Generate an invite code for a new team member")
  .action(async () => {
    try {
      await runInviteCommand();
    } catch (err) {
      console.error(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      process.exit(1);
    }
  });

program.parse();
