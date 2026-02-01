/**
 * Daemon worker — runs as a detached child process
 * Watches HQ directory and syncs changes to S3
 */

import { SyncWatcher } from "./watcher.js";

const hqRoot = process.argv[2];

if (!hqRoot) {
  console.error("Usage: daemon-worker <hq-root>");
  process.exit(1);
}

const watcher = new SyncWatcher(hqRoot);
watcher.start();

// Handle graceful shutdown
process.on("SIGTERM", () => {
  watcher.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  watcher.stop();
  process.exit(0);
});

// Keep process alive
setInterval(() => {
  // Heartbeat — could add remote change polling here
}, 30_000);
