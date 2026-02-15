/**
 * Background sync worker for "hq sync start".
 *
 * Forked as a detached child process. Polls for changes at a configurable
 * interval and runs a full bidirectional sync each cycle.
 *
 * Usage (internal — called by cloud.ts):
 *   node sync-worker.js <hqRoot> <intervalMs>
 */

import { fullSync, readSyncState, writeSyncState, computeLocalManifest } from './utils/sync.js';

const hqRoot = process.argv[2];
const intervalMs = parseInt(process.argv[3] ?? '30000', 10);

if (!hqRoot) {
  process.exit(1);
}

/** Run one sync cycle. */
async function syncCycle(): Promise<void> {
  try {
    const result = await fullSync(hqRoot);

    // Update state
    const manifest = computeLocalManifest(hqRoot);
    const state = readSyncState(hqRoot);
    state.running = true;
    state.pid = process.pid;
    state.lastSync = new Date().toISOString();
    state.fileCount = manifest.length;
    state.errors = result.errors;
    writeSyncState(hqRoot, state);
  } catch {
    // Log errors to state, but keep running
    try {
      const state = readSyncState(hqRoot);
      state.errors = ['Sync cycle failed — will retry next interval'];
      writeSyncState(hqRoot, state);
    } catch {
      // Can't even write state — just continue
    }
  }
}

/** Main loop. */
async function run(): Promise<void> {
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    try {
      const state = readSyncState(hqRoot);
      state.running = false;
      state.pid = undefined;
      writeSyncState(hqRoot, state);
    } catch {
      // Best-effort cleanup
    }
    process.exit(0);
  });

  process.on('SIGINT', () => {
    try {
      const state = readSyncState(hqRoot);
      state.running = false;
      state.pid = undefined;
      writeSyncState(hqRoot, state);
    } catch {
      // Best-effort cleanup
    }
    process.exit(0);
  });

  // Run first sync immediately
  await syncCycle();

  // Then poll at the configured interval
  setInterval(() => {
    void syncCycle();
  }, intervalMs);
}

void run();
