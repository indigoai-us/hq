/**
 * hq auth commands — login, logout, status
 *
 * Login flow:
 * 1. CLI generates a unique device code
 * 2. CLI starts a temporary localhost HTTP server to receive the callback
 * 3. CLI opens the user's browser to the hq-cloud API auth page with the device code + callback port
 * 4. User signs in with Clerk in the browser
 * 5. After sign-in, the API redirects to the localhost callback with the token
 * 6. CLI captures the token, stores it, and shuts down the server
 */

import { Command } from 'commander';
import * as http from 'http';
import * as crypto from 'crypto';
import chalk from 'chalk';
import * as readline from 'readline';
import {
  readCredentials,
  writeCredentials,
  clearCredentials,
  isExpired,
} from '../utils/credentials.js';
import { getApiUrl, apiRequest } from '../utils/api-client.js';
import { findHqRoot } from '../utils/manifest.js';
import {
  pushChanges,
  computeLocalManifest,
  type PushResult,
  type FailedFile,
  type SkippedFile,
} from '../utils/sync.js';

/** Response from GET /api/auth/setup-status */
export interface SetupStatusResponse {
  setupComplete: boolean;
  s3Prefix: string | null;
  fileCount: number;
}

/** Port range for the localhost callback server */
const MIN_PORT = 19750;
const MAX_PORT = 19850;

/** Timeout for waiting for the browser callback (ms) */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Open a URL in the user's default browser.
 * Works on macOS, Linux, and Windows.
 */
async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    // Linux — try xdg-open, then sensible-browser
    command = `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || echo "OPEN_FAILED"`;
  }

  try {
    await execAsync(command);
  } catch {
    // Browser open failed silently — user will be shown the URL to open manually
  }
}

/**
 * Find an available port in the callback port range.
 */
function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const port = MIN_PORT + Math.floor(Math.random() * (MAX_PORT - MIN_PORT));
    const server = http.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // Try another port
      const fallback = MIN_PORT + Math.floor(Math.random() * (MAX_PORT - MIN_PORT));
      const server2 = http.createServer();
      server2.listen(fallback, '127.0.0.1', () => {
        server2.close(() => resolve(fallback));
      });
      server2.on('error', () => {
        reject(new Error('Could not find an available port for auth callback'));
      });
    });
  });
}

/**
 * HTML page shown to the user after successful login.
 */
function successHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><title>HQ CLI — Logged In</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8f9fa;">
  <div style="text-align: center; max-width: 400px;">
    <h1 style="color: #16a34a;">Logged In</h1>
    <p style="color: #4b5563;">You have been authenticated. You can close this tab and return to the terminal.</p>
  </div>
</body>
</html>`;
}

/**
 * HTML page shown on error.
 */
function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>HQ CLI — Auth Error</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8f9fa;">
  <div style="text-align: center; max-width: 400px;">
    <h1 style="color: #dc2626;">Authentication Error</h1>
    <p style="color: #4b5563;">${message}</p>
    <p style="color: #6b7280;">Please return to the terminal and try again.</p>
  </div>
</body>
</html>`;
}

/**
 * Start a temporary localhost server and wait for the auth callback.
 * Returns the received token and user info.
 */
function waitForCallback(port: number): Promise<{ token: string; userId: string; email?: string; expiresAt?: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const userId = url.searchParams.get('user_id');
        const email = url.searchParams.get('email') ?? undefined;
        const expiresAt = url.searchParams.get('expires_at') ?? undefined;
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(errorHtml(error));
          server.close();
          reject(new Error(error));
          return;
        }

        if (!token || !userId) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(errorHtml('Missing token or user ID in callback'));
          server.close();
          reject(new Error('Invalid callback: missing token or user_id'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(successHtml());

        // Close the server after sending the response
        server.close();
        resolve({ token, userId, email, expiresAt });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(port, '127.0.0.1', () => {
      // Server is ready
    });

    // Timeout
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out. Please try again.'));
    }, LOGIN_TIMEOUT_MS);

    server.on('close', () => {
      clearTimeout(timeout);
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Check setup status from the API after login.
 * Returns the setup status, or null if the check failed (network error, etc.).
 * This function never throws — errors are caught and logged as warnings.
 */
export async function checkSetupStatus(): Promise<SetupStatusResponse | null> {
  try {
    const resp = await apiRequest<SetupStatusResponse>('GET', '/api/auth/setup-status');
    if (resp.ok && resp.data) {
      return resp.data;
    }
    console.log(chalk.yellow('Warning: Could not check setup status — API returned ' + (resp.error ?? `HTTP ${resp.status}`)));
    return null;
  } catch {
    console.log(chalk.yellow('Warning: Could not reach HQ Cloud to check setup status. Login succeeded.'));
    return null;
  }
}

/**
 * Prompt the user with a yes/no question on stdin.
 * Returns true for 'y'/'yes'/empty (default yes), false for 'n'/'no'.
 *
 * Exported for testing. In non-interactive environments (e.g., piped stdin),
 * auto-resolves to the default answer (true = retry).
 */
export function promptRetry(question: string): Promise<boolean> {
  // Non-interactive: auto-accept retry
  if (!process.stdin.isTTY) {
    return Promise.resolve(true);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '' || trimmed === 'y' || trimmed === 'yes') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

/**
 * Write an in-place progress line to stdout (TTY only).
 * Non-TTY environments get no output (progress is shown in summary).
 */
function writeProgressLine(current: number, total: number): void {
  if (process.stdout.isTTY) {
    process.stdout.write(`\rUploading files... (${current}/${total})`);
  }
}

/**
 * Clear the in-place progress line.
 */
function clearProgressLine(): void {
  if (process.stdout.isTTY) {
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }
}

/**
 * Print the sync summary after push completes.
 * Shows uploaded count, skipped count, and failure info.
 */
export function printSyncSummary(result: PushResult, verbose: boolean): void {
  const { uploaded, skipped, failed, total } = result;

  // Main summary line
  if (uploaded === 0 && skipped.length === 0 && failed.length === 0) {
    console.log(chalk.green('No files to upload — cloud is up to date.'));
    return;
  }

  // Build summary: "Synced 1113 files. 19 skipped (see details with --verbose)."
  let summary = chalk.green(`Synced ${uploaded} file${uploaded !== 1 ? 's' : ''}.`);
  if (skipped.length > 0) {
    summary += chalk.dim(` ${skipped.length} skipped (see details with --verbose).`);
  }
  console.log(summary);

  // Verbose: show skipped files
  if (verbose && skipped.length > 0) {
    console.log(chalk.dim('  Skipped files:'));
    for (const s of skipped) {
      console.log(chalk.dim(`    - ${s.path}: ${s.reason}`));
    }
  }

  // Failures
  if (failed.length > 0) {
    const successRate = total > 0 ? uploaded / (total - skipped.length) : 0;
    if (successRate < 0.5) {
      console.log(chalk.yellow(`  ${failed.length} file${failed.length !== 1 ? 's' : ''} failed to upload.`));
    } else {
      console.log(chalk.yellow(`  ${failed.length} file${failed.length !== 1 ? 's' : ''} had errors (partial sync).`));
    }
    if (verbose) {
      console.log(chalk.dim('  Failed files:'));
      for (const f of failed) {
        console.log(chalk.red(`    - ${f.path}: ${f.error}`));
      }
    } else if (failed.length > 0) {
      // Show first 3 errors even without verbose
      for (const f of failed.slice(0, 3)) {
        console.log(chalk.red(`    - ${f.path}: ${f.error}`));
      }
      if (failed.length > 3) {
        console.log(chalk.dim(`    ... and ${failed.length - 3} more (use --verbose to see all)`));
      }
    }
  }
}

/**
 * Determine if a retry prompt should be shown, and what kind.
 * Returns 'total-failure' | 'partial-failure' | 'none'.
 */
export function classifySyncResult(result: PushResult): 'total-failure' | 'partial-failure' | 'none' {
  const { uploaded, skipped, failed, total } = result;
  const attemptedFiles = total - skipped.length;

  // No attempted files (all skipped or nothing to upload) — not a failure
  if (attemptedFiles === 0) return 'none';

  // Total failure: 0 files successfully uploaded out of attempted
  if (uploaded === 0 && failed.length > 0) return 'total-failure';

  // Partial failure: <50% of attempted files succeeded
  const successRate = uploaded / attemptedFiles;
  if (failed.length > 0 && successRate < 0.5) return 'partial-failure';

  // Success (possibly with some failures, but >50% succeeded)
  return 'none';
}

/**
 * Perform the initial sync (push local HQ files to cloud).
 * This is called automatically after login when setupComplete is false.
 *
 * Features:
 * - Progress counter: "Uploading files... (342/1132)"
 * - Summary: "Synced 1113 files. 19 skipped (see details with --verbose)."
 * - Total failure retry: "Retry initial sync? (Y/n)"
 * - Partial failure retry: "Some files failed. Retry failed files? (Y/n)"
 * - Verbose mode: shows individual file errors
 *
 * @param verbose - If true, show individual file skip/error details
 * @param _promptFn - Optional override for retry prompt (for testing)
 */
export async function performPostLoginSync(
  verbose: boolean = false,
  _promptFn?: (question: string) => Promise<boolean>,
): Promise<void> {
  const askRetry = _promptFn ?? promptRetry;

  try {
    const hqRoot = findHqRoot();
    console.log(chalk.blue('Computing local manifest...'));
    const manifest = computeLocalManifest(hqRoot);
    console.log(chalk.dim(`  ${manifest.length} local files scanned`));

    console.log(chalk.blue('Uploading files...'));
    let result = await pushChanges(hqRoot, (current, total) => {
      writeProgressLine(current, total);
    });
    clearProgressLine();

    // Print summary
    printSyncSummary(result, verbose);

    // Classify result and handle retry
    const classification = classifySyncResult(result);

    if (classification === 'total-failure') {
      console.log(chalk.red('All file uploads failed.'));
      const retry = await askRetry('Retry initial sync? (Y/n)');
      if (retry) {
        console.log(chalk.blue('Retrying sync...'));
        result = await pushChanges(hqRoot, (current, total) => {
          writeProgressLine(current, total);
        });
        clearProgressLine();
        printSyncSummary(result, verbose);
      } else {
        console.log(chalk.dim('Skipped. You can retry later with "hq sync push".'));
      }
    } else if (classification === 'partial-failure') {
      const retry = await askRetry('Some files failed. Retry failed files? (Y/n)');
      if (retry) {
        console.log(chalk.blue('Retrying failed files...'));
        // Re-push will re-diff and only upload what's still needed
        result = await pushChanges(hqRoot, (current, total) => {
          writeProgressLine(current, total);
        });
        clearProgressLine();
        printSyncSummary(result, verbose);
      } else {
        console.log(chalk.dim('Skipped. You can retry later with "hq sync push".'));
      }
    }
  } catch (err) {
    console.log(chalk.yellow('Warning: Initial sync encountered an error — you can retry with "hq sync push".'));
    console.log(chalk.dim(err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Handle the post-login setup status check and optional auto-sync.
 * Called after successful authentication.
 * If skipSync is true, the setup status check and auto-sync are skipped entirely.
 *
 * @param skipSync - If true, skip setup check and sync entirely
 * @param verbose - If true, show detailed file-level info during sync
 * @param _promptFn - Optional override for retry prompt (for testing)
 */
export async function handlePostLoginSetup(
  skipSync: boolean,
  verbose: boolean = false,
  _promptFn?: (question: string) => Promise<boolean>,
): Promise<void> {
  if (skipSync) {
    return;
  }

  console.log();
  console.log(chalk.dim('Checking HQ Cloud setup status...'));

  const status = await checkSetupStatus();

  if (!status) {
    // Network error or API failure — checkSetupStatus already printed a warning
    return;
  }

  if (status.setupComplete) {
    console.log(chalk.green(`HQ Cloud is set up and synced (${status.fileCount} files).`));
  } else {
    console.log(chalk.yellow('Initial sync needed. Starting upload of your HQ files...'));
    await performPostLoginSync(verbose, _promptFn);
  }
}

/**
 * Register the "hq auth" command group with login, logout, and status subcommands.
 */
export function registerAuthCommand(program: Command): void {
  const authCmd = program
    .command('auth')
    .description('Authenticate with HQ Cloud');

  // --- hq auth login ---
  authCmd
    .command('login')
    .description('Log in to HQ Cloud via browser')
    .option('--no-sync', 'Skip automatic setup status check and initial sync after login')
    .option('--verbose', 'Show detailed file-level info during initial sync')
    .action(async (opts: { sync: boolean; verbose?: boolean }) => {
      try {
        // Check if already logged in
        const existing = readCredentials();
        if (existing && !isExpired(existing)) {
          const label = existing.email ?? existing.userId;
          console.log(chalk.yellow(`Already logged in as ${label}.`));
          console.log('Run "hq auth logout" first to switch accounts.');
          return;
        }

        // Generate a device code for the login session
        const deviceCode = crypto.randomBytes(16).toString('hex');

        // Find an available port for the callback
        const port = await findAvailablePort();
        const callbackUrl = `http://127.0.0.1:${port}/callback`;

        // Build the login URL — go directly to the web app's CLI callback page
        const webAppUrl = 'https://app.hq.getindigo.ai';
        const loginUrl = `${webAppUrl}/cli-callback?device_code=${deviceCode}&callback_url=${encodeURIComponent(callbackUrl)}`;

        console.log(chalk.blue('Opening browser for authentication...'));
        console.log();
        console.log(`If the browser does not open, visit this URL:`);
        console.log(chalk.underline(loginUrl));
        console.log();
        console.log(chalk.dim('Waiting for authentication (timeout: 5 minutes)...'));

        // Open browser
        await openBrowser(loginUrl);

        // Wait for callback
        const result = await waitForCallback(port);

        // Store credentials
        writeCredentials({
          token: result.token,
          userId: result.userId,
          email: result.email,
          storedAt: new Date().toISOString(),
          expiresAt: result.expiresAt,
        });

        const label = result.email ?? result.userId;
        console.log();
        console.log(chalk.green(`Logged in as ${label}`));
        console.log(chalk.dim(`Credentials saved.`));

        // Post-login: check setup status and auto-sync if needed
        // Commander uses --no-sync to set opts.sync = false
        const skipSync = !opts.sync;
        const verbose = opts.verbose ?? false;
        await handlePostLoginSetup(skipSync, verbose);
      } catch (error) {
        console.error(chalk.red('Login failed:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // --- hq auth logout ---
  authCmd
    .command('logout')
    .description('Log out and clear stored credentials')
    .action(() => {
      const removed = clearCredentials();
      if (removed) {
        console.log(chalk.green('Logged out. Credentials cleared.'));
      } else {
        console.log(chalk.yellow('Not logged in.'));
      }
    });

  // --- hq auth status ---
  authCmd
    .command('status')
    .description('Show current authentication status')
    .action(async () => {
      const creds = readCredentials();

      if (!creds) {
        console.log(chalk.yellow('Not logged in.'));
        console.log('Run "hq auth login" to authenticate.');
        return;
      }

      if (isExpired(creds)) {
        console.log(chalk.red('Session expired.'));
        console.log('Run "hq auth login" to re-authenticate.');
        return;
      }

      const label = creds.email ?? creds.userId;
      console.log(chalk.green(`Logged in as ${label}`));
      console.log(`  User ID:    ${creds.userId}`);
      console.log(`  Stored at:  ${creds.storedAt}`);
      if (creds.expiresAt) {
        console.log(`  Expires at: ${creds.expiresAt}`);
      }
      console.log(`  API URL:    ${getApiUrl()}`);

      // Optionally verify with the API
      try {
        const resp = await apiRequest<{ userId: string; sessionId: string }>('GET', '/api/auth/me');
        if (resp.ok && resp.data) {
          console.log(chalk.dim(`  Verified:   API confirms session is valid`));
        } else {
          console.log(chalk.yellow(`  Warning:    API returned ${resp.status} — token may be invalid`));
        }
      } catch {
        console.log(chalk.dim(`  Note:       Could not reach API to verify token`));
      }
    });
}
