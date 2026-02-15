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
import { registerAuthCommand } from "./commands/auth.js";
import { registerCloudSetupCommand } from "./commands/cloud-setup.js";

const program = new Command();

program
  .name("hq")
  .description("HQ management CLI — modules and cloud sync")
  .version("5.1.0");

// Module management subcommand group
const modulesCmd = program
  .command("modules")
  .description("Module management commands");

registerAddCommand(modulesCmd);
registerSyncCommand(modulesCmd);
registerListCommand(modulesCmd);
registerUpdateCommand(modulesCmd);

// Cloud sync subcommand group
const syncCmd = program
  .command("sync")
  .description("Cloud sync commands — sync HQ files via API proxy");

registerCloudCommands(syncCmd);

// Authentication commands (hq auth login|logout|status)
registerAuthCommand(program);

// Cloud session management (hq cloud setup-token|status)
registerCloudSetupCommand(program);

program.parse();
