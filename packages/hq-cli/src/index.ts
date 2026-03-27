#!/usr/bin/env node

/**
 * HQ CLI - Module management and cloud sync for HQ
 */

import { Command } from "commander";
import { registerAddCommand } from "./commands/add.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerListCommand } from "./commands/list.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerCloudCommands } from "./commands/cloud.js";
import { registerInstallCommand } from "./commands/install.js";
import { registerRemoveCommand } from "./commands/remove.js";
import { registerPkgUpdateCommand } from "./commands/pkg-update.js";
import { registerPkgListCommand } from "./commands/pkg-list.js";
import { registerPkgSearchCommand } from "./commands/pkg-search.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerPublishCommand } from "./commands/publish.js";
import { registerCoreStatusCommand } from "./commands/core-status.js";

const program = new Command();

program
  .name("hq")
  .description("HQ management CLI — modules and cloud sync")
  .version("5.0.0");

// Package management — top-level commands
registerLoginCommand(program);
registerPublishCommand(program);
registerInstallCommand(program);
registerRemoveCommand(program);
registerPkgUpdateCommand(program);
registerPkgListCommand(program);
registerPkgSearchCommand(program);

// Module management subcommand group
const modulesCmd = program
  .command("modules")
  .description("Module management commands");

registerAddCommand(modulesCmd);
registerSyncCommand(modulesCmd);
registerListCommand(modulesCmd);
registerUpdateCommand(modulesCmd);

// Core governance subcommand group
const coreCmd = program
  .command("core")
  .description("Kernel governance commands — manage and verify HQ core integrity");

registerCoreStatusCommand(coreCmd);

// Cloud sync subcommand group
const syncCmd = program
  .command("sync")
  .description("Cloud sync commands — sync HQ to S3 for mobile access");

registerCloudCommands(syncCmd);

program.parse();
