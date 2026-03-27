/**
 * Auth store utility — manages ~/.hq/auth.json for Clerk JWT (US-014)
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthStore {
  token: string;
  refreshToken?: string;
  expiresAt?: string; // ISO8601
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const AUTH_FILE = path.join(homedir(), '.hq', 'auth.json');

/** Buffer in milliseconds — refresh 60 seconds before actual expiry */
const EXPIRY_BUFFER_MS = 60_000;

// ─── Auth file operations ─────────────────────────────────────────────────────

/**
 * Read auth from ~/.hq/auth.json.
 * Returns null if the file is missing, unreadable, or malformed.
 */
export async function loadAuth(): Promise<AuthStore | null> {
  try {
    const raw = await readFile(AUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'token' in parsed &&
      typeof (parsed as Record<string, unknown>)['token'] === 'string'
    ) {
      return parsed as AuthStore;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write auth to ~/.hq/auth.json (creates ~/.hq/ if needed).
 */
export async function saveAuth(auth: AuthStore): Promise<void> {
  await mkdir(path.dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(auth, null, 2) + '\n', 'utf8');
}

/**
 * Delete ~/.hq/auth.json. No-op if the file does not exist.
 */
export async function clearAuth(): Promise<void> {
  try {
    await unlink(AUTH_FILE);
  } catch (err: unknown) {
    // ENOENT is fine — file already gone
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

// ─── Token expiry ─────────────────────────────────────────────────────────────

/**
 * Returns true if the token is expired (or will expire within 60 seconds).
 * If expiresAt is missing, the token is considered non-expired.
 */
export function isTokenExpired(auth: AuthStore): boolean {
  if (!auth.expiresAt) return false;
  const expiresMs = new Date(auth.expiresAt).getTime();
  return Date.now() + EXPIRY_BUFFER_MS >= expiresMs;
}

// ─── Token refresh ────────────────────────────────────────────────────────────

interface RefreshResponse {
  token: string;
  refreshToken?: string;
  expiresAt?: string;
}

/**
 * Attempt to refresh the auth token via POST {registryBaseUrl}/api/auth/refresh.
 * Returns a new AuthStore on success, or null on failure.
 */
export async function refreshAuthToken(
  auth: AuthStore,
  registryBaseUrl: string
): Promise<AuthStore | null> {
  if (!auth.refreshToken) return null;

  const url = `${registryBaseUrl.replace(/\/$/, '')}/api/auth/refresh`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) return null;

    const data = (await response.json()) as RefreshResponse;
    if (!data.token) return null;

    return {
      token: data.token,
      refreshToken: data.refreshToken ?? auth.refreshToken,
      expiresAt: data.expiresAt,
    };
  } catch {
    return null;
  }
}
