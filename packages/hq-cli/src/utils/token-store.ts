/**
 * Auth token store — manages ~/.hq/auth.json with secure file permissions (US-004)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AuthToken {
  clerk_session_token: string;
  user_id: string;
  email: string;
  expires_at: string;
}

const HQ_DIR = path.join(os.homedir(), '.hq');
const AUTH_FILE = path.join(HQ_DIR, 'auth.json');

function ensureHqDir(): void {
  if (!fs.existsSync(HQ_DIR)) {
    fs.mkdirSync(HQ_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Save auth token to ~/.hq/auth.json with 0600 permissions.
 * Token content is never logged or written to stdout.
 */
export async function saveToken(token: AuthToken): Promise<void> {
  ensureHqDir();
  const content = JSON.stringify(token, null, 2);
  fs.writeFileSync(AUTH_FILE, content, { mode: 0o600 });
}

/**
 * Load auth token from ~/.hq/auth.json.
 * Returns null if file is missing, unreadable, or contains invalid JSON.
 */
export async function loadToken(): Promise<AuthToken | null> {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      return null;
    }
    const content = fs.readFileSync(AUTH_FILE, 'utf-8');
    const parsed = JSON.parse(content);

    // Validate required fields
    if (
      typeof parsed.clerk_session_token !== 'string' ||
      typeof parsed.user_id !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.expires_at !== 'string'
    ) {
      return null;
    }

    return parsed as AuthToken;
  } catch {
    return null;
  }
}

/**
 * Delete the auth token file.
 */
export async function clearToken(): Promise<void> {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
    }
  } catch {
    // Ignore errors — file may already be gone
  }
}

/**
 * Check if a token is expired or within 5 minutes of expiry.
 */
export function isTokenExpired(token: AuthToken): boolean {
  const expiresAt = new Date(token.expires_at).getTime();
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= expiresAt - bufferMs;
}
