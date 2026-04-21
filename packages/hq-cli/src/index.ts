#!/usr/bin/env node

/**
 * HQ CLI - Module management, package management, and cloud sync for HQ
 */

import { Command } from "commander";
import { registerAddCommand } from "./commands/add.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerListCommand } from "./commands/list.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerCloudCommands } from "./commands/cloud.js";
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

const program = new Command();

program
  .name("hq")
  .description("HQ management CLI — modules, packages, and cloud sync")
  .version("5.5.0");

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

// Team commands (top-level)
registerTeamSyncCommand(program);

// Auth commands (top-level — Cognito OAuth)
registerLoginCommand(program);
registerLogoutCommand(program);
registerWhoamiCommand(program);
registerAuthCommands(program);

// Onboarding (top-level — Cognito + vault-service provisioning)
registerOnboardCommand(program);

program.parse();
