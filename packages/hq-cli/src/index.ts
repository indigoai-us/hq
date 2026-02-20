#!/usr/bin/env node

/**
 * HQ CLI - Module management and cloud sync for HQ
 */

import { Command } from "commander";
import { createRequire } from "module";
import { registerAddCommand } from "./commands/add.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerListCommand } from "./commands/list.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerCloudCommands } from "./commands/cloud.js";
import { registerAuthCommand } from "./commands/auth.js";
import { registerCloudSetupCommand } from "./commands/cloud-setup.js";
import { registerHiampCommands } from "./commands/hiamp.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("hq")
  .description("HQ management CLI — modules and cloud sync")
  .version(pkg.version);

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

// HIAMP protocol commands (hq hiamp check|listen|status|send)
const hiampCmd = program
  .command("hiamp")
  .description("HIAMP protocol — heartbeat, messaging, and status");

registerHiampCommands(hiampCmd);

program.parse();
