/**
 * Daemon worker — runs as a detached child process
 * Watches HQ directory and syncs changes to S3
 *
 * Day 1: not invoked by CLI surface; retained for future automatic-sync milestone.
 * When re-enabled, this worker will need to resolve an EntityContext before
 * constructing the SyncWatcher. The process argv will need to include company
 * context (slug or UID) and vault-service config.
 */

// Day 1: SyncWatcher now requires an EntityContext.
// This file is retained for the automatic-sync milestone but is not functional
// until the daemon startup path is updated to resolve entity context.

const hqRoot = process.argv[2];

if (!hqRoot) {
  console.error("Usage: daemon-worker <hq-root>");
  process.exit(1);
}

console.error(
  "Day 1: daemon-worker is not yet wired to entity context resolution. " +
  "Use 'hq share' and 'hq sync' for manual sync.",
);
process.exit(1);
