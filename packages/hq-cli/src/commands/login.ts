/**
 * hq login — authenticate with HQ registry via Clerk OAuth (US-014)
 *
 * Flow:
 *   1. Start a local HTTP server on an available port (try 3847, increment if busy)
 *   2. Open browser to {registryBaseUrl}/api/auth/cli/start?port={port}&redirect_uri=http://localhost:{port}/callback
 *   3. Wait for GET /callback?token=...&refreshToken=...&expiresAt=... (5 min timeout)
 *   4. Store auth to ~/.hq/auth.json
 *   5. Print success (with username if available in token response)
 */

import * as http from 'node:http';
import { exec } from 'node:child_process';
import { URL } from 'node:url';

import chalk from 'chalk';
import { Command } from 'commander';

import { saveAuth } from '../utils/auth.js';
import type { AuthStore } from '../utils/auth.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_REGISTRY_URL = 'https://admin.getindigo.ai';
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const BASE_PORT = 3847;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRegistryBaseUrl(): string {
  return (process.env['HQ_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL).replace(/\/$/, '');
}

/** Open a URL in the system default browser, cross-platform. */
function openBrowser(url: string): void {
  let cmd: string;
  if (process.platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (process.platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      // Non-fatal — user can paste the URL manually
    }
  });
}

/**
 * Try to listen on `port`. Resolves with the server if successful,
 * rejects with EADDRINUSE error if the port is already taken.
 */
function tryListen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeAllListeners('error');
      resolve(port);
    });
  });
}

/** Find an available port starting from `start`, incrementing until one is free. */
async function findAvailablePort(start: number, maxAttempts = 20): Promise<{ server: http.Server; port: number }> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = start + i;
    const server = http.createServer();
    try {
      await tryListen(server, port);
      return { server, port };
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'EADDRINUSE') {
        server.close();
        continue;
      }
      server.close();
      throw err;
    }
  }
  throw new Error(`Could not find an available port in range ${start}–${start + maxAttempts - 1}`);
}

// ─── Login flow ───────────────────────────────────────────────────────────────

async function runLogin(): Promise<void> {
  const registryBaseUrl = getRegistryBaseUrl();

  console.log(chalk.bold('\nLogging in to HQ Registry…'));

  // 1. Find available port + pre-create HTTP server
  const { server, port } = await findAvailablePort(BASE_PORT);

  const redirectUri = `http://localhost:${port}/callback`;
  const loginUrl = `${registryBaseUrl}/api/auth/cli/start?port=${port}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  // 2. Open browser
  console.log(chalk.dim(`Opening browser for authentication…`));
  console.log(chalk.dim(`  If the browser did not open, visit:\n  ${chalk.cyan(loginUrl)}`));
  openBrowser(loginUrl);

  // 3. Wait for callback
  const auth = await waitForCallback(server, port);

  // 4. Persist
  await saveAuth(auth);

  // 5. Done
  console.log(chalk.green('\n✓ Logged in successfully'));
  console.log(chalk.dim(`  Auth token stored at ~/.hq/auth.json`));
}

/**
 * Start the callback HTTP server and wait for the OAuth redirect.
 * Resolves with AuthStore on success, rejects on timeout.
 */
function waitForCallback(server: http.Server, port: number): Promise<AuthStore> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 5 minutes. Please try again.'));
    }, CALLBACK_TIMEOUT_MS);

    server.on('request', (req, res) => {
      try {
        const rawUrl = req.url ?? '/';
        const parsedUrl = new URL(rawUrl, `http://localhost:${port}`);

        if (parsedUrl.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const token = parsedUrl.searchParams.get('token');
        const refreshToken = parsedUrl.searchParams.get('refreshToken') ?? undefined;
        const expiresAt = parsedUrl.searchParams.get('expiresAt') ?? undefined;
        const username = parsedUrl.searchParams.get('username') ?? undefined;

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Login failed — no token received. Please close this tab and try again.</h2></body></html>');
          clearTimeout(timeout);
          server.close();
          reject(new Error('No token received in callback'));
          return;
        }

        // Send success page
        const displayName = username ? `as ${chalk.bold(username)}` : '';
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body style="font-family:sans-serif;padding:2em;max-width:400px;margin:auto">' +
          '<h2 style="color:#16a34a">&#10003; Logged in successfully</h2>' +
          '<p>You can close this tab and return to your terminal.</p>' +
          '</body></html>'
        );

        clearTimeout(timeout);
        server.close();

        const authStore: AuthStore = { token, refreshToken, expiresAt };
        if (username) {
          console.log(chalk.dim(`  Authenticated ${displayName}`));
        }
        resolve(authStore);
      } catch (err: unknown) {
        res.writeHead(500);
        res.end('Internal error');
        clearTimeout(timeout);
        server.close();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with the HQ registry via Clerk OAuth')
    .action(async () => {
      try {
        await runLogin();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\nLogin failed: ${msg}`));
        process.exit(1);
      }
    });
}
