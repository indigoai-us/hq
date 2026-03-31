/**
 * Auth utilities — OAuth PKCE flow for Clerk (US-004)
 *
 * Token values are NEVER written to stdout or logs.
 */

import * as crypto from 'crypto';
import * as http from 'http';
import { exec } from 'child_process';
import { saveToken, loadToken, isTokenExpired } from './token-store.js';
import { getRegistryUrl } from './registry-client.js';
import type { AuthToken } from './token-store.js';

/**
 * Generate a cryptographically random PKCE code verifier (43-128 chars, URL-safe).
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Derive the PKCE code challenge from the verifier (S256).
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Open a URL in the default browser (macOS / Linux).
 */
function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, (err) => {
    if (err) {
      // Non-fatal — user can manually open the URL
      console.error(
        `Could not open browser automatically. Please visit:\n  ${url}`
      );
    }
  });
}

/**
 * Start the OAuth PKCE auth flow:
 * 1. Generate PKCE code_verifier + code_challenge
 * 2. Start local HTTP server on a random port for the callback
 * 3. Open browser to Clerk auth URL
 * 4. Wait for callback with auth code
 * 5. Exchange code for token via registry /auth/token endpoint
 * 6. Return AuthToken
 */
export async function startAuthFlow(
  registryUrl: string
): Promise<AuthToken> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return new Promise<AuthToken>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://localhost`);

        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>'
          );
          server.close();
          reject(new Error(`Auth failed: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body><h2>Missing auth code</h2><p>You can close this window.</p></body></html>'
          );
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        // Exchange code for token
        const tokenResponse = await fetch(`${registryUrl}/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: codeVerifier,
            redirect_uri: `http://localhost:${(server.address() as { port: number }).port}/callback`,
          }),
        });

        if (!tokenResponse.ok) {
          const body = await tokenResponse.text();
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body><h2>Token exchange failed</h2><p>You can close this window.</p></body></html>'
          );
          server.close();
          reject(
            new Error(`Token exchange failed (${tokenResponse.status}): ${body}`)
          );
          return;
        }

        const tokenData = (await tokenResponse.json()) as AuthToken;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h2>Authenticated!</h2><p>You can close this window and return to the terminal.</p></body></html>'
        );
        server.close();
        resolve(tokenData);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    // Listen on random port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const redirectUri = `http://localhost:${addr.port}/callback`;
      const authUrl = `${registryUrl}/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

      console.log('Opening browser for authentication...');
      openBrowser(authUrl);
      console.log(`\nIf the browser doesn't open, visit:\n  ${authUrl}\n`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 2 minutes'));
    }, 120_000);
  });
}

/**
 * Get a valid auth token:
 * 1. Load from store
 * 2. If expired or within 5 min buffer: try refresh
 * 3. If refresh fails: throw with message to re-login
 * 4. Return valid token
 *
 * Token values are NEVER written to stdout.
 */
export async function getAuthToken(): Promise<AuthToken> {
  const token = await loadToken();

  if (!token) {
    throw new Error("Not logged in. Run 'hq login' to authenticate.");
  }

  if (!isTokenExpired(token)) {
    return token;
  }

  // Attempt refresh
  try {
    const registryUrl = getRegistryUrl();
    const refreshResponse = await fetch(`${registryUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clerk_session_token: token.clerk_session_token,
      }),
    });

    if (refreshResponse.ok) {
      const refreshedToken = (await refreshResponse.json()) as AuthToken;
      await saveToken(refreshedToken);
      return refreshedToken;
    }
  } catch {
    // Refresh failed — fall through to error
  }

  throw new Error(
    "Session expired. Run 'hq login' to re-authenticate."
  );
}
