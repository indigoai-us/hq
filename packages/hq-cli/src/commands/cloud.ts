/**
 * hq sync commands — cloud sync management via API proxy
 *
 * All sync operations go through the hq-cloud API (authenticated with Clerk
 * tokens from US-002). No AWS credentials or direct S3 access needed.
 *
 * Commands:
 *   hq sync push    — Upload changed local files to cloud
 *   hq sync pull    — Download changed cloud files to local
 *   hq sync start   — Begin background auto-sync watcher
 *   hq sync stop    — Halt the background watcher
 *   hq sync status  — Show sync state, last sync time, file counts
 */

import { Command } from 'commander';
import { fork } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { findHqRoot } from '../utils/manifest.js';
import { readCredentials, isExpired } from '../utils/credentials.js';
import {
  pushChanges,
  pullChanges,
  fullSync,
  computeLocalManifest,
  readSyncState,
  writeSyncState,
  getQuota,
  type CloudSyncState,
} from '../utils/sync.js';

/**
 * Verify that the user is authenticated before running sync commands.
 * Throws if not logged in or token is expired.
 */
function requireAuth(): void {
  const creds = readCredentials();
  if (!creds) {
    throw new Error('Not logged in. Run "hq auth login" first.');
  }
  if (isExpired(creds)) {
    throw new Error('Session expired. Run "hq auth login" to re-authenticate.');
  }
}

/**
 * Check if a background sync process is actually running (not just recorded).
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function registerCloudCommands(program: Command): void {
  // ── hq sync push ────────────────────────────────────────────────────────

  program
    .command('push')
    .description('Upload changed local files to cloud via API proxy')
    .action(async () => {
      try {
        requireAuth();
        const hqRoot = findHqRoot();

        console.log(chalk.blue('Computing local manifest...'));
        const manifest = computeLocalManifest(hqRoot);
        console.log(chalk.dim(`  ${manifest.length} local files scanned`));

        console.log(chalk.blue('Checking for changes...'));
        const result = await pushChanges(hqRoot);

        if (result.uploaded === 0 && result.errors.length === 0) {
          console.log(chalk.green('Already up to date. No files to push.'));
        } else {
          console.log(chalk.green(`Pushed ${result.uploaded} file${result.uploaded !== 1 ? 's' : ''} to cloud.`));
        }

        if (result.errors.length > 0) {
          console.log(chalk.yellow(`  ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}:`));
          for (const err of result.errors.slice(0, 5)) {
            console.log(chalk.red(`    - ${err}`));
          }
          if (result.errors.length > 5) {
            console.log(chalk.dim(`    ... and ${result.errors.length - 5} more`));
          }
        }

        // Update sync state
        const state = readSyncState(hqRoot);
        state.lastSync = new Date().toISOString();
        state.fileCount = manifest.length;
        state.errors = result.errors;
        writeSyncState(hqRoot, state);
      } catch (error) {
        console.error(chalk.red('Push failed:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // ── hq sync pull ────────────────────────────────────────────────────────

  program
    .command('pull')
    .description('Download changed cloud files to local via API proxy')
    .action(async () => {
      try {
        requireAuth();
        const hqRoot = findHqRoot();

        console.log(chalk.blue('Computing local manifest...'));
        const manifest = computeLocalManifest(hqRoot);
        console.log(chalk.dim(`  ${manifest.length} local files scanned`));

        console.log(chalk.blue('Checking for changes...'));
        const result = await pullChanges(hqRoot);

        if (result.downloaded === 0 && result.errors.length === 0) {
          console.log(chalk.green('Already up to date. No files to pull.'));
        } else {
          console.log(chalk.green(`Pulled ${result.downloaded} file${result.downloaded !== 1 ? 's' : ''} from cloud.`));
        }

        if (result.errors.length > 0) {
          console.log(chalk.yellow(`  ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}:`));
          for (const err of result.errors.slice(0, 5)) {
            console.log(chalk.red(`    - ${err}`));
          }
          if (result.errors.length > 5) {
            console.log(chalk.dim(`    ... and ${result.errors.length - 5} more`));
          }
        }

        // Update sync state
        const state = readSyncState(hqRoot);
        state.lastSync = new Date().toISOString();
        state.fileCount = manifest.length;
        state.errors = result.errors;
        writeSyncState(hqRoot, state);
      } catch (error) {
        console.error(chalk.red('Pull failed:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // ── hq sync start ──────────────────────────────────────────────────────

  program
    .command('start')
    .description('Start background auto-sync watcher (polls every 30s)')
    .option('-i, --interval <seconds>', 'Polling interval in seconds', '30')
    .action(async (opts: { interval: string }) => {
      try {
        requireAuth();
        const hqRoot = findHqRoot();
        const intervalSec = parseInt(opts.interval, 10);

        if (isNaN(intervalSec) || intervalSec < 5) {
          throw new Error('Interval must be at least 5 seconds.');
        }

        // Check if already running
        const existingState = readSyncState(hqRoot);
        if (existingState.running && existingState.pid && isProcessRunning(existingState.pid)) {
          console.log(chalk.yellow(`Sync watcher already running (PID ${existingState.pid}).`));
          console.log('Use "hq sync stop" to stop it first.');
          return;
        }

        // Fork a background worker process
        // The worker script path is relative to the compiled output
        const thisFile = fileURLToPath(import.meta.url);
        const workerScript = path.join(path.dirname(thisFile), '..', 'sync-worker.js');

        const child = fork(workerScript, [hqRoot, String(intervalSec * 1000)], {
          detached: true,
          stdio: 'ignore',
        });

        if (!child.pid) {
          throw new Error('Failed to start background sync process.');
        }

        // Allow the parent to exit without waiting for the child
        child.unref();

        // Record state
        const state: CloudSyncState = {
          running: true,
          pid: child.pid,
          lastSync: existingState.lastSync,
          fileCount: existingState.fileCount,
          errors: [],
        };
        writeSyncState(hqRoot, state);

        console.log(chalk.green(`Sync watcher started (PID ${child.pid}, interval: ${intervalSec}s).`));
        console.log('Use "hq sync status" to check, "hq sync stop" to halt.');
      } catch (error) {
        console.error(chalk.red('Start failed:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // ── hq sync stop ───────────────────────────────────────────────────────

  program
    .command('stop')
    .description('Stop the background sync watcher')
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const state = readSyncState(hqRoot);

        if (!state.running || !state.pid) {
          console.log(chalk.yellow('No sync watcher is running.'));
          return;
        }

        if (isProcessRunning(state.pid)) {
          try {
            process.kill(state.pid, 'SIGTERM');
            console.log(chalk.green(`Sync watcher stopped (PID ${state.pid}).`));
          } catch {
            console.log(chalk.yellow(`Could not stop process ${state.pid} — it may have already exited.`));
          }
        } else {
          console.log(chalk.dim(`Sync watcher process ${state.pid} is no longer running. Cleaning up state.`));
        }

        // Update state
        state.running = false;
        state.pid = undefined;
        writeSyncState(hqRoot, state);
      } catch (error) {
        console.error(chalk.red('Stop failed:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // ── hq sync status ─────────────────────────────────────────────────────

  program
    .command('status')
    .description('Show sync state, last sync time, and file counts')
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const state = readSyncState(hqRoot);

        // Check if the recorded PID is actually alive
        const actuallyRunning = state.running && state.pid
          ? isProcessRunning(state.pid)
          : false;

        if (state.running && !actuallyRunning) {
          // Stale state — clean it up
          state.running = false;
          state.pid = undefined;
          writeSyncState(hqRoot, state);
        }

        console.log(chalk.bold('HQ Cloud Sync Status'));
        console.log();
        console.log(`  Watcher:    ${actuallyRunning ? chalk.green('running') + ` (PID ${state.pid})` : chalk.dim('stopped')}`);
        console.log(`  Last sync:  ${state.lastSync ? state.lastSync : chalk.dim('never')}`);
        console.log(`  Files:      ${state.fileCount != null ? `${state.fileCount} tracked` : chalk.dim('unknown')}`);
        console.log(`  HQ root:    ${hqRoot}`);

        if (state.errors.length > 0) {
          console.log(`  Errors:     ${chalk.yellow(String(state.errors.length))}`);
          for (const err of state.errors.slice(0, 5)) {
            console.log(chalk.red(`    - ${err}`));
          }
        }

        // Try to fetch quota info (non-fatal if it fails)
        try {
          requireAuth();
          const quota = await getQuota();
          console.log();
          console.log(chalk.bold('  Storage Quota'));
          const usedMB = (quota.used / (1024 * 1024)).toFixed(1);
          const limitMB = (quota.limit / (1024 * 1024)).toFixed(1);
          const pctColor = quota.percentage > 90 ? chalk.red : quota.percentage > 70 ? chalk.yellow : chalk.green;
          console.log(`    Used:     ${usedMB} MB / ${limitMB} MB (${pctColor(quota.percentage + '%')})`);
        } catch {
          // Quota info is optional — skip silently
        }
      } catch (error) {
        console.error(chalk.red('Status check failed:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
