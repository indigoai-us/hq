/**
 * Credential storage for HQ CLI authentication.
 * Stores Clerk auth tokens in ~/.hq/credentials.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** Stored credential shape */
export interface HqCredentials {
  /** Clerk session token (JWT) */
  token: string;
  /** Clerk user ID */
  userId: string;
  /** User's email (for display) */
  email?: string;
  /** When the token was stored (ISO string) */
  storedAt: string;
  /** When the token expires (ISO string, if known) */
  expiresAt?: string;
}

/**
 * Override for the config directory base path.
 * Set via HQ_CONFIG_HOME env var or _setConfigHome (for testing).
 * When null, defaults to os.homedir().
 */
let configHomeOverride: string | null = null;

/**
 * Set the base directory for config files. Intended for testing only.
 */
export function _setConfigHome(dir: string | null): void {
  configHomeOverride = dir;
}

/**
 * Get the ~/.hq config directory path.
 * Respects HQ_CONFIG_HOME env var, _setConfigHome override, or defaults to ~/.hq.
 */
function getConfigDir(): string {
  const base = configHomeOverride
    ?? process.env['HQ_CONFIG_HOME']
    ?? os.homedir();
  return path.join(base, '.hq');
}

/**
 * Get the credentials file path.
 */
function getCredentialsFilePath(): string {
  return path.join(getConfigDir(), 'credentials.json');
}

/**
 * Ensure the config directory exists with restricted permissions.
 */
function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read stored credentials. Returns null if not logged in or file is missing/corrupt.
 */
export function readCredentials(): HqCredentials | null {
  try {
    const credPath = getCredentialsFilePath();
    if (!fs.existsSync(credPath)) {
      return null;
    }
    const raw = fs.readFileSync(credPath, 'utf-8');
    const creds = JSON.parse(raw) as HqCredentials;
    if (!creds.token || !creds.userId) {
      return null;
    }
    return creds;
  } catch {
    return null;
  }
}

/**
 * Write credentials to disk. Creates ~/.hq if needed.
 * File permissions are set to owner-only (0o600).
 */
export function writeCredentials(creds: HqCredentials): void {
  ensureConfigDir();
  const content = JSON.stringify(creds, null, 2);
  fs.writeFileSync(getCredentialsFilePath(), content, { mode: 0o600 });
}

/**
 * Clear stored credentials (logout).
 * Returns true if credentials were removed, false if none existed.
 */
export function clearCredentials(): boolean {
  const credPath = getCredentialsFilePath();
  if (!fs.existsSync(credPath)) {
    return false;
  }
  fs.unlinkSync(credPath);
  return true;
}

/**
 * Get the credentials file path (for display/debugging).
 */
export function getCredentialsPath(): string {
  return getCredentialsFilePath();
}

/**
 * Check if credentials are expired (if expiresAt is set).
 */
export function isExpired(creds: HqCredentials): boolean {
  if (!creds.expiresAt) {
    return false;
  }
  return new Date(creds.expiresAt) <= new Date();
}
