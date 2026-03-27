/**
 * Tests for hq login — auth store utility + command registration (US-014)
 * Uses Node.js built-in test runner (node:test).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * We cannot easily override the AUTH_FILE constant after module load, so we
 * reproduce the core auth-store logic inline for the round-trip tests.
 * The real auth.ts is imported for isTokenExpired which is pure.
 */
import {
  loadAuth,
  saveAuth,
  clearAuth,
  isTokenExpired,
  AUTH_FILE,
} from '../utils/auth.js';
import { registerLoginCommand } from './login.js';

// ─── Auth store round-trip ────────────────────────────────────────────────────

describe('auth store (loadAuth / saveAuth / clearAuth)', () => {
  // These tests write to the real AUTH_FILE path. They are integration-style but
  // use node:test isolation (serial, single process).

  // Save & restore the file so other tests / the user's session aren't disrupted.
  let originalContent: string | null = null;
  const authDir = path.dirname(AUTH_FILE);

  before(async () => {
    try {
      originalContent = await readFile(AUTH_FILE, 'utf8');
    } catch {
      originalContent = null;
    }
    // Clear any existing auth before tests
    await clearAuth();
  });

  after(async () => {
    // Restore original content
    if (originalContent !== null) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(authDir, { recursive: true });
      await writeFile(AUTH_FILE, originalContent, 'utf8');
    } else {
      await clearAuth();
    }
  });

  test('loadAuth returns null when file does not exist', async () => {
    const result = await loadAuth();
    assert.equal(result, null);
  });

  test('saveAuth + loadAuth round-trip', async () => {
    const auth = {
      token: 'test-jwt-token',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    await saveAuth(auth);
    const loaded = await loadAuth();
    assert.deepEqual(loaded, auth);
  });

  test('saveAuth persists without refreshToken or expiresAt', async () => {
    const auth = { token: 'minimal-token' };
    await saveAuth(auth);
    const loaded = await loadAuth();
    assert.ok(loaded !== null);
    assert.equal(loaded.token, 'minimal-token');
    assert.equal(loaded.refreshToken, undefined);
    assert.equal(loaded.expiresAt, undefined);
  });

  test('clearAuth removes the file', async () => {
    await saveAuth({ token: 'to-be-deleted' });
    await clearAuth();
    const result = await loadAuth();
    assert.equal(result, null);
  });

  test('clearAuth is idempotent when file already absent', async () => {
    // File should already be absent from previous test
    await assert.doesNotReject(async () => {
      await clearAuth();
      await clearAuth();
    });
  });
});

// ─── isTokenExpired ───────────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  test('returns false when expiresAt is missing', () => {
    assert.equal(isTokenExpired({ token: 'tok' }), false);
  });

  test('returns true for a token that expired in the past', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    assert.equal(isTokenExpired({ token: 'tok', expiresAt: past }), true);
  });

  test('returns true for a token expiring within the 60s buffer', () => {
    const soonExpires = new Date(Date.now() + 30_000).toISOString(); // 30 seconds
    assert.equal(isTokenExpired({ token: 'tok', expiresAt: soonExpires }), true);
  });

  test('returns false for a token with plenty of time remaining', () => {
    const future = new Date(Date.now() + 3600_000).toISOString(); // 1 hour
    assert.equal(isTokenExpired({ token: 'tok', expiresAt: future }), false);
  });

  test('returns false for a token expiring in exactly 61 seconds', () => {
    const justOutsideBuffer = new Date(Date.now() + 61_000).toISOString();
    assert.equal(isTokenExpired({ token: 'tok', expiresAt: justOutsideBuffer }), false);
  });
});

// ─── Command registration ─────────────────────────────────────────────────────

describe('registerLoginCommand', () => {
  test('registers a "login" command on the program', () => {
    const program = new Command();
    program.exitOverride(); // prevent process.exit in tests
    registerLoginCommand(program);

    const commands = program.commands.map(c => c.name());
    assert.ok(commands.includes('login'), `Expected "login" in commands, got: ${commands.join(', ')}`);
  });

  test('"login" command has the expected description', () => {
    const program = new Command();
    program.exitOverride();
    registerLoginCommand(program);

    const loginCmd = program.commands.find(c => c.name() === 'login');
    assert.ok(loginCmd, 'login command not found');
    assert.ok(
      loginCmd.description().toLowerCase().includes('auth'),
      `Expected description to mention auth, got: "${loginCmd.description()}"`
    );
  });
});
