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
import {
  readCredentials,
  writeCredentials,
  clearCredentials,
  getCredentialsPath,
  isExpired,
} from '../utils/credentials.js';
import { getApiUrl, apiRequest } from '../utils/api-client.js';

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
    .action(async () => {
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
        console.log(chalk.dim(`Credentials saved to ${getCredentialsPath()}`));
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
      console.log(`  Creds file: ${getCredentialsPath()}`);

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
