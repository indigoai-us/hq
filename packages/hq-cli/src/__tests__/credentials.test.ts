/**
 * Tests for credential storage (utils/credentials.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  readCredentials,
  writeCredentials,
  clearCredentials,
  getCredentialsPath,
  isExpired,
  _setConfigHome,
} from '../utils/credentials.js';
import type { HqCredentials } from '../utils/credentials.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-cli-test-'));
  _setConfigHome(tmpDir);
});

afterEach(() => {
  _setConfigHome(null);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('getCredentialsPath', () => {
  it('returns a path under .hq/ in the config home', () => {
    const p = getCredentialsPath();
    expect(p).toContain('.hq');
    expect(p).toContain('credentials.json');
    expect(p.startsWith(tmpDir)).toBe(true);
  });
});

describe('readCredentials', () => {
  it('returns null when no credentials file exists', () => {
    const creds = readCredentials();
    expect(creds).toBeNull();
  });

  it('returns null when credentials file is empty', () => {
    const hqDir = path.join(tmpDir, '.hq');
    fs.mkdirSync(hqDir, { recursive: true });
    fs.writeFileSync(path.join(hqDir, 'credentials.json'), '');
    const creds = readCredentials();
    expect(creds).toBeNull();
  });

  it('returns null when credentials file contains invalid JSON', () => {
    const hqDir = path.join(tmpDir, '.hq');
    fs.mkdirSync(hqDir, { recursive: true });
    fs.writeFileSync(path.join(hqDir, 'credentials.json'), 'not json');
    const creds = readCredentials();
    expect(creds).toBeNull();
  });

  it('returns null when credentials are missing required fields', () => {
    const hqDir = path.join(tmpDir, '.hq');
    fs.mkdirSync(hqDir, { recursive: true });
    fs.writeFileSync(
      path.join(hqDir, 'credentials.json'),
      JSON.stringify({ token: 'abc' }) // missing userId
    );
    const creds = readCredentials();
    expect(creds).toBeNull();
  });

  it('returns valid credentials when file is well-formed', () => {
    const hqDir = path.join(tmpDir, '.hq');
    fs.mkdirSync(hqDir, { recursive: true });
    const stored: HqCredentials = {
      token: 'test-jwt-token',
      userId: 'user_123',
      email: 'test@example.com',
      storedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(hqDir, 'credentials.json'),
      JSON.stringify(stored)
    );
    const creds = readCredentials();
    expect(creds).not.toBeNull();
    expect(creds!.token).toBe('test-jwt-token');
    expect(creds!.userId).toBe('user_123');
    expect(creds!.email).toBe('test@example.com');
  });
});

describe('writeCredentials', () => {
  it('creates .hq directory and writes credentials file', () => {
    const creds: HqCredentials = {
      token: 'test-token',
      userId: 'user_456',
      email: 'user@test.com',
      storedAt: new Date().toISOString(),
    };
    writeCredentials(creds);

    const hqDir = path.join(tmpDir, '.hq');
    expect(fs.existsSync(hqDir)).toBe(true);
    expect(fs.existsSync(path.join(hqDir, 'credentials.json'))).toBe(true);

    const raw = fs.readFileSync(path.join(hqDir, 'credentials.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.token).toBe('test-token');
    expect(parsed.userId).toBe('user_456');
  });

  it('overwrites existing credentials', () => {
    const creds1: HqCredentials = {
      token: 'token-1',
      userId: 'user_1',
      storedAt: new Date().toISOString(),
    };
    writeCredentials(creds1);

    const creds2: HqCredentials = {
      token: 'token-2',
      userId: 'user_2',
      storedAt: new Date().toISOString(),
    };
    writeCredentials(creds2);

    const read = readCredentials();
    expect(read!.token).toBe('token-2');
    expect(read!.userId).toBe('user_2');
  });
});

describe('clearCredentials', () => {
  it('returns false when no credentials exist', () => {
    const result = clearCredentials();
    expect(result).toBe(false);
  });

  it('removes credentials file and returns true', () => {
    writeCredentials({
      token: 'test',
      userId: 'user',
      storedAt: new Date().toISOString(),
    });
    expect(readCredentials()).not.toBeNull();

    const result = clearCredentials();
    expect(result).toBe(true);
    expect(readCredentials()).toBeNull();
  });
});

describe('isExpired', () => {
  it('returns false when no expiresAt is set', () => {
    const creds: HqCredentials = {
      token: 'test',
      userId: 'user',
      storedAt: new Date().toISOString(),
    };
    expect(isExpired(creds)).toBe(false);
  });

  it('returns true when expiresAt is in the past', () => {
    const creds: HqCredentials = {
      token: 'test',
      userId: 'user',
      storedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    expect(isExpired(creds)).toBe(true);
  });

  it('returns false when expiresAt is in the future', () => {
    const creds: HqCredentials = {
      token: 'test',
      userId: 'user',
      storedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    expect(isExpired(creds)).toBe(false);
  });
});

describe('roundtrip', () => {
  it('write then read returns identical data', () => {
    const original: HqCredentials = {
      token: 'jwt-abc-123',
      userId: 'user_roundtrip',
      email: 'roundtrip@test.com',
      storedAt: '2026-01-15T10:00:00.000Z',
      expiresAt: '2026-01-15T11:00:00.000Z',
    };
    writeCredentials(original);
    const read = readCredentials();
    expect(read).toEqual(original);
  });
});
