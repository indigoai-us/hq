/**
 * hq sync commands — cloud sync management
 * Bridges hq-cli to @indigoai/hq-cloud
 */

import { Command } from "commander";
import { findHqRoot } from "../utils/manifest.js";

export function registerCloudCommands(program: Command): void {
  program
    .command("init")
    .description("Authenticate with IndigoAI and set up cloud sync")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const { initSync } = await import("@indigoai/hq-cloud");
        await initSync(hqRoot);
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    });

  program
    .command("start")
    .description("Start the background sync daemon")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const { startDaemon } = await import("@indigoai/hq-cloud");
        await startDaemon(hqRoot);
        console.log("Sync daemon started. Use 'hq sync status' to check.");
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    });

  program
    .command("stop")
    .description("Stop the sync daemon")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const { stopDaemon } = await import("@indigoai/hq-cloud");
        await stopDaemon(hqRoot);
        console.log("Sync daemon stopped.");
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    });

  program
    .command("status")
    .description("Show sync status")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const { getStatus } = await import("@indigoai/hq-cloud");
        const status = await getStatus(hqRoot);
        console.log(`  State:      ${status.running ? "running" : "stopped"}`);
        console.log(`  Last sync:  ${status.lastSync || "never"}`);
        console.log(`  Files:      ${status.fileCount} tracked`);
        console.log(`  Bucket:     ${status.bucket || "not configured"}`);
        if (status.errors.length > 0) {
          console.log(`  Errors:     ${status.errors.length}`);
          for (const err of status.errors.slice(0, 5)) {
            console.log(`    - ${err}`);
          }
        }
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    });

  program
    .command("push")
    .description("Force push all local changes to cloud")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const { pushAll } = await import("@indigoai/hq-cloud");
        const result = await pushAll(hqRoot);
        console.log(`Pushed ${result.filesUploaded} files to cloud.`);
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    });

  program
    .command("pull")
    .description("Force pull all cloud changes to local")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const { pullAll } = await import("@indigoai/hq-cloud");
        const result = await pullAll(hqRoot);
        console.log(`Pulled ${result.filesDownloaded} files from cloud.`);
      } catch (error) {
        console.error(
          "Error:",
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    });
}
