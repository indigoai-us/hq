#!/usr/bin/env node

/**
 * HQ CLI - Module management, package management, and cloud sync for HQ
 */

import { Command } from "commander";
import { initSentry, Sentry } from "./sentry.js";
import { registerAddCommand } from "./commands/add.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerListCommand } from "./commands/list.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerCloudCommands } from "./commands/cloud.js";
import { registerCloudProvisionCommands } from "./commands/cloud-provision.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { registerWhoamiCommand } from "./commands/whoami.js";
import { registerOnboardCommand } from "./commands/onboard.js";
import { registerPackageInstallCommand } from "./commands/pkg-install.js";
import { registerPackageRemoveCommand } from "./commands/pkg-remove.js";
import { registerPackageUpdateCommand } from "./commands/pkg-update.js";
import { registerPackageListCommand } from "./commands/pkg-list.js";
import { registerTeamSyncCommand } from "./commands/team-sync.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerSecretsCommand } from "./commands/secrets.js";
import { registerRunCommand } from "./commands/run.js";
import { registerGroupsCommand } from "./commands/groups.js";
import { registerFilesCommand } from "./commands/files.js";

initSentry();

const program = new Command();

program
  .name("hq")
  .description("HQ management CLI — modules, packages, and cloud sync")
  .version("5.8.6");

// Module management subcommand group
const modulesCmd = program
  .command("modules")
  .description("Module management commands");

registerAddCommand(modulesCmd);
registerSyncCommand(modulesCmd);
registerListCommand(modulesCmd);
registerUpdateCommand(modulesCmd);

// Package management subcommand group
const packagesCmd = program
  .command("packages")
  .description("Package management commands");

registerPackageInstallCommand(packagesCmd);
registerPackageRemoveCommand(packagesCmd);
registerPackageUpdateCommand(packagesCmd);
registerPackageListCommand(packagesCmd);

// Top-level shortcuts for package commands
// "hq install <slug>" = "hq packages install <slug>"
// "hq remove <slug>"  = "hq packages remove <slug>"
registerPackageInstallCommand(program);
registerPackageRemoveCommand(program);

// Cloud sync subcommand group
const syncCmd = program
  .command("sync")
  .description("Cloud sync commands — sync HQ to S3 for mobile access");

registerCloudCommands(syncCmd);

// Cloud provisioning subcommand group (entity + bucket + initial sync)
// Distinct from `hq sync` which assumes provisioning has already happened.
const cloudCmd = program
  .command("cloud")
  .description(
    "Cloud commands — provision entities and manage cloud-backed companies",
  );

registerCloudProvisionCommands(cloudCmd);

// Team commands (top-level)
registerTeamSyncCommand(program);

// Auth commands (top-level — Cognito OAuth)
registerLoginCommand(program);
registerLogoutCommand(program);
registerWhoamiCommand(program);
registerAuthCommands(program);

// Secrets management (subcommand group — hq secrets set|get|list|delete|exec|generate-link|cache)
registerSecretsCommand(program);

// Schema-driven dev runner — hq run [options] -- <cmd>
registerRunCommand(program);

// Groups management (subcommand group — hq groups create|delete|add|remove|list|members)
registerGroupsCommand(program);

// Files ACL management (subcommand group — hq files share|unshare|acl)
registerFilesCommand(program);

// Onboarding (top-level — Cognito + vault-service provisioning)
registerOnboardCommand(program);

(async () => {
  try {
    await program.parseAsync();
  } catch (err) {
    Sentry.captureException(err);
    process.exitCode = 1;
  } finally {
    await Sentry.flush(2000);
  }
})();
