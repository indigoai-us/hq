/**
 * Initial HQ file upload for first-time cloud setup.
 *
 * After Clerk auth and Claude token setup, this command uploads the user's
 * local HQ files to the cloud so the first session has access to the workspace.
 *
 * Respects the same ignore rules as sync (shouldIgnore from utils/sync.ts):
 *   - .git/, node_modules/, .claude/, dist/, cdk.out/, etc.
 *   - .log files, .env files, .DS_Store, Thumbs.db
 *
 * Exports `runInitialUpload` so it can be called programmatically from the
 * create-hq installer (US-004) or other commands.
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { apiRequest } from '../utils/api-client.js';
import {
  walkDir,
  uploadFile,
  computeLocalManifest,
  readSyncState,
  writeSyncState,
} from '../utils/sync.js';

/** Response shape from GET /api/files/list */
export interface RemoteFileList {
  files: string[];
}

/** Result returned by runInitialUpload */
export interface InitialUploadResult {
  /** Total local files discovered (after ignore filtering) */
  totalFiles: number;
  /** Number of files successfully uploaded */
  uploaded: number;
  /** Number of files that failed to upload */
  failed: number;
  /** Error messages for failed uploads */
  errors: string[];
  /** Whether the user chose to skip (remote had files and user declined) */
  skipped: boolean;
}

/**
 * Prompt the user with a yes/no question on stdin.
 * Returns true for 'y'/'yes', false for 'n'/'no'.
 * Defaults to defaultAnswer if user just presses Enter.
 */
export function promptYesNo(
  question: string,
  defaultAnswer: boolean = true,
): Promise<boolean> {
  const hint = defaultAnswer ? '[Y/n]' : '[y/N]';
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} ${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') {
        resolve(defaultAnswer);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}

/**
 * Prompt the user to choose between merge and replace.
 * Returns 'merge' or 'replace'.
 */
export function promptMergeOrReplace(): Promise<'merge' | 'replace'> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Choose [m]erge or [r]eplace: ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === 'r' || trimmed === 'replace') {
        resolve('replace');
      } else {
        resolve('merge');
      }
    });
  });
}

/**
 * Delete all remote files (used when user chooses 'replace').
 */
async function deleteRemoteFiles(): Promise<void> {
  const resp = await apiRequest('DELETE', '/api/files/all');
  if (!resp.ok) {
    throw new Error(`Failed to clear remote files: ${resp.error ?? `HTTP ${resp.status}`}`);
  }
}

/**
 * Write a progress line that overwrites the previous line.
 * Falls back to newline output if stdout is not a TTY (e.g., in tests or pipes).
 */
export function writeProgress(current: number, total: number): void {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const line = `Uploading: ${current}/${total} files (${pct}%)`;

  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}`);
  }
}

/**
 * Run the initial HQ file upload.
 *
 * This is the core function that:
 * 1. Lists remote files via GET /api/files/list
 * 2. If remote has files, asks user to merge or replace
 * 3. Walks local files (respecting ignore rules)
 * 4. Uploads all files with progress indicator
 * 5. Updates sync state
 *
 * @param hqRoot - Absolute path to the HQ root directory
 * @param options - Optional overrides (for testing / programmatic use)
 * @returns Upload result with counts and any errors
 */
export async function runInitialUpload(
  hqRoot: string,
  options?: {
    /** Override the merge/replace prompt (for non-interactive use) */
    onConflict?: 'merge' | 'replace' | 'skip';
    /** Suppress console output */
    quiet?: boolean;
  },
): Promise<InitialUploadResult> {
  const quiet = options?.quiet ?? false;

  const log = (msg: string) => {
    if (!quiet) console.log(msg);
  };

  // 1. Check remote state
  log(chalk.blue('Checking cloud storage...'));

  let remoteFiles: string[] = [];
  try {
    const resp = await apiRequest<RemoteFileList>('GET', '/api/files/list');
    if (resp.ok && resp.data) {
      remoteFiles = resp.data.files ?? [];
    }
  } catch {
    // If the endpoint doesn't exist yet or fails, treat as empty
  }

  // 2. Handle existing remote files
  if (remoteFiles.length > 0) {
    log('');
    log(chalk.yellow(`Cloud storage already has ${remoteFiles.length} file${remoteFiles.length !== 1 ? 's' : ''}.`));

    let action: 'merge' | 'replace' | 'skip';

    if (options?.onConflict) {
      action = options.onConflict;
    } else {
      log('  merge  — Upload local files, keeping existing remote files');
      log('  replace — Delete all remote files first, then upload');
      log('');
      action = await promptMergeOrReplace();
    }

    if (action === 'skip') {
      log(chalk.dim('Skipping upload.'));
      return { totalFiles: 0, uploaded: 0, failed: 0, errors: [], skipped: true };
    }

    if (action === 'replace') {
      log(chalk.dim('Clearing remote files...'));
      await deleteRemoteFiles();
      log(chalk.dim('Remote files cleared.'));
    } else {
      log(chalk.dim('Merging: existing remote files will be preserved.'));
    }
  }

  // 3. Walk local files
  log(chalk.blue('Scanning local HQ files...'));
  const localFiles = walkDir(hqRoot);

  if (localFiles.length === 0) {
    log(chalk.yellow('No files found to upload.'));
    return { totalFiles: 0, uploaded: 0, failed: 0, errors: [], skipped: false };
  }

  log(chalk.dim(`  Found ${localFiles.length} file${localFiles.length !== 1 ? 's' : ''} to upload`));
  log('');

  // 4. Upload with progress
  const errors: string[] = [];
  let uploaded = 0;

  for (let i = 0; i < localFiles.length; i++) {
    const filePath = localFiles[i];

    if (!quiet) {
      writeProgress(i + 1, localFiles.length);
    }

    try {
      await uploadFile(filePath, hqRoot);
      uploaded++;
    } catch (err) {
      errors.push(
        `${filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Clear the progress line
  if (!quiet && process.stdout.isTTY) {
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }

  // 5. Report results
  if (errors.length === 0) {
    log(chalk.green(`Uploaded ${uploaded}/${localFiles.length} files successfully.`));
  } else {
    log(chalk.green(`Uploaded ${uploaded}/${localFiles.length} files.`));
    log(chalk.yellow(`  ${errors.length} error${errors.length !== 1 ? 's' : ''}:`));
    for (const err of errors.slice(0, 5)) {
      log(chalk.red(`    - ${err}`));
    }
    if (errors.length > 5) {
      log(chalk.dim(`    ... and ${errors.length - 5} more`));
    }
  }

  // 6. Update sync state
  const manifest = computeLocalManifest(hqRoot);
  const state = readSyncState(hqRoot);
  state.lastSync = new Date().toISOString();
  state.fileCount = manifest.length;
  state.errors = errors;
  writeSyncState(hqRoot, state);

  if (errors.length === 0) {
    log('');
    log(chalk.green('Sync status: in sync'));
  }

  return {
    totalFiles: localFiles.length,
    uploaded,
    failed: errors.length,
    errors,
    skipped: false,
  };
}
