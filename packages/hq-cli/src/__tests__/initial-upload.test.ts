/**
 * Tests for initial-upload command (commands/initial-upload.ts)
 *
 * Covers:
 * - runInitialUpload core logic with mocked API
 * - Empty HQ directory handling
 * - Progress tracking
 * - Merge vs replace conflict handling
 * - Error collection during upload
 * - Sync state update after upload
 * - Command registration in cloud-setup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock the api-client before importing modules that use it
vi.mock('../utils/api-client.js', () => ({
  apiRequest: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.local'),
}));

// Mock credentials for cloud-setup registration tests
vi.mock('../utils/credentials.js', () => ({
  readCredentials: vi.fn(() => ({
    token: 'test-token',
    userId: 'user_test',
    email: 'test@example.com',
    storedAt: new Date().toISOString(),
  })),
  isExpired: vi.fn(() => false),
}));

import { apiRequest } from '../utils/api-client.js';
import {
  runInitialUpload,
  writeProgress,
  type InitialUploadResult,
} from '../commands/initial-upload.js';
import { readSyncState } from '../utils/sync.js';
import { Command } from 'commander';
import { registerCloudSetupCommand } from '../commands/cloud-setup.js';

const mockApiRequest = vi.mocked(apiRequest);

// ── Test helpers ─────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-upload-test-'));
  vi.clearAllMocks();
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors on Windows
  }
});

/** Create a file in tmpDir with given relative path and content. */
function createFile(relativePath: string, content: string): string {
  const absPath = path.join(tmpDir, relativePath);
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(absPath, content);
  return absPath;
}

/**
 * Set up mocks for a typical upload flow:
 * 1. GET /api/files/list -> empty
 * 2. POST /api/files/upload -> success (for each file)
 */
function mockEmptyRemoteAndSuccessfulUploads(fileCount: number): void {
  // 1. list returns empty
  mockApiRequest.mockResolvedValueOnce({
    ok: true,
    status: 200,
    data: { files: [] },
  });

  // 2. each upload succeeds
  for (let i = 0; i < fileCount; i++) {
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });
  }
}

// ── runInitialUpload ─────────────────────────────────────────────────────────

describe('runInitialUpload', () => {
  it('uploads all local files when remote is empty', async () => {
    createFile('README.md', '# HQ');
    createFile('workers/dev/worker.yaml', 'name: dev');
    createFile('knowledge/index.md', '# Knowledge');

    // list returns empty, 3 uploads succeed
    mockEmptyRemoteAndSuccessfulUploads(3);

    const result = await runInitialUpload(tmpDir, { quiet: true });

    expect(result.totalFiles).toBe(3);
    expect(result.uploaded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(false);
  });

  it('returns zero counts for empty HQ directory', async () => {
    // list returns empty
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { files: [] },
    });

    const result = await runInitialUpload(tmpDir, { quiet: true });

    expect(result.totalFiles).toBe(0);
    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(false);
  });

  it('respects ignore rules — skips .git, node_modules, .claude', async () => {
    createFile('.git/config', 'gitconfig');
    createFile('node_modules/dep/index.js', 'code');
    createFile('.claude/config.json', '{}');
    createFile('src/index.ts', 'code'); // only this should be uploaded

    // list returns empty, 1 upload for src/index.ts
    mockEmptyRemoteAndSuccessfulUploads(1);

    const result = await runInitialUpload(tmpDir, { quiet: true });

    expect(result.totalFiles).toBe(1);
    expect(result.uploaded).toBe(1);
  });

  it('respects ignore rules — skips .env and .log files', async () => {
    createFile('.env', 'SECRET=abc');
    createFile('.env.local', 'LOCAL=abc');
    createFile('debug.log', 'log data');
    createFile('agents.md', 'agent config'); // only this should be uploaded

    mockEmptyRemoteAndSuccessfulUploads(1);

    const result = await runInitialUpload(tmpDir, { quiet: true });

    expect(result.totalFiles).toBe(1);
    expect(result.uploaded).toBe(1);
  });

  it('collects upload errors without stopping', async () => {
    createFile('good.txt', 'good');
    createFile('bad.txt', 'bad');

    // list returns empty
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { files: [] },
    });

    // First upload succeeds
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    // Second upload fails
    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 413,
      error: 'File too large',
    });

    const result = await runInitialUpload(tmpDir, { quiet: true });

    expect(result.totalFiles).toBe(2);
    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Upload failed');
  });

  it('skips upload when onConflict is "skip" and remote has files', async () => {
    createFile('local.txt', 'local content');

    // list returns files
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { files: ['existing.txt'] },
    });

    const result = await runInitialUpload(tmpDir, {
      quiet: true,
      onConflict: 'skip',
    });

    expect(result.skipped).toBe(true);
    expect(result.uploaded).toBe(0);
    // No upload calls should have been made
    expect(mockApiRequest).toHaveBeenCalledTimes(1); // only the list call
  });

  it('merges when onConflict is "merge" and remote has files', async () => {
    createFile('local.txt', 'local content');

    // list returns existing files
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { files: ['existing.txt'] },
    });

    // upload succeeds
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await runInitialUpload(tmpDir, {
      quiet: true,
      onConflict: 'merge',
    });

    expect(result.skipped).toBe(false);
    expect(result.uploaded).toBe(1);
    // Should have: 1 list + 1 upload = 2 calls (no delete)
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
  });

  it('deletes remote files when onConflict is "replace"', async () => {
    createFile('local.txt', 'local content');

    // list returns existing files
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { files: ['existing.txt', 'old.txt'] },
    });

    // DELETE /api/files/all succeeds
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    // upload succeeds
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await runInitialUpload(tmpDir, {
      quiet: true,
      onConflict: 'replace',
    });

    expect(result.skipped).toBe(false);
    expect(result.uploaded).toBe(1);

    // Verify DELETE was called
    expect(mockApiRequest).toHaveBeenCalledWith('DELETE', '/api/files/all');
  });

  it('proceeds when remote list API fails (treats as empty)', async () => {
    createFile('file.txt', 'content');

    // list fails (e.g., endpoint not deployed yet)
    mockApiRequest.mockRejectedValueOnce(new Error('Network error'));

    // upload succeeds
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await runInitialUpload(tmpDir, { quiet: true });

    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(false);
  });

  it('updates sync state after successful upload', async () => {
    createFile('file.txt', 'content');

    mockEmptyRemoteAndSuccessfulUploads(1);

    await runInitialUpload(tmpDir, { quiet: true });

    const state = readSyncState(tmpDir);
    expect(state.lastSync).toBeTruthy();
    expect(state.fileCount).toBe(1);
    expect(state.errors).toEqual([]);
  });

  it('updates sync state with errors after partial upload', async () => {
    createFile('ok.txt', 'ok');
    createFile('fail.txt', 'fail');

    // list returns empty
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { files: [] },
    });

    // First upload succeeds
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    // Second upload fails
    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'Server error',
    });

    const result = await runInitialUpload(tmpDir, { quiet: true });

    const state = readSyncState(tmpDir);
    expect(state.lastSync).toBeTruthy();
    expect(state.errors.length).toBe(1);
  });

  it('does not call upload when no local files exist', async () => {
    // list returns empty
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { files: [] },
    });

    const result = await runInitialUpload(tmpDir, { quiet: true });

    expect(result.totalFiles).toBe(0);
    // Only the list call
    expect(mockApiRequest).toHaveBeenCalledTimes(1);
  });

  it('does not prompt when onConflict is specified and remote is empty', async () => {
    createFile('file.txt', 'content');

    mockEmptyRemoteAndSuccessfulUploads(1);

    // Even with onConflict set, should work fine when remote is empty
    const result = await runInitialUpload(tmpDir, {
      quiet: true,
      onConflict: 'merge',
    });

    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(false);
  });
});

// ── writeProgress ────────────────────────────────────────────────────────────

describe('writeProgress', () => {
  it('does not throw for valid inputs', () => {
    // writeProgress writes to stdout; just ensure no errors
    expect(() => writeProgress(0, 100)).not.toThrow();
    expect(() => writeProgress(50, 100)).not.toThrow();
    expect(() => writeProgress(100, 100)).not.toThrow();
  });

  it('handles zero total without error', () => {
    expect(() => writeProgress(0, 0)).not.toThrow();
  });
});

// ── Command registration ─────────────────────────────────────────────────────

describe('cloud upload command registration', () => {
  it('registers "upload" subcommand under "cloud"', () => {
    const program = new Command();
    registerCloudSetupCommand(program);

    const cloudCmd = program.commands.find((c) => c.name() === 'cloud');
    expect(cloudCmd).toBeDefined();

    const uploadCmd = cloudCmd!.commands.find((c) => c.name() === 'upload');
    expect(uploadCmd).toBeDefined();
    expect(uploadCmd!.description()).toContain('Upload');
  });

  it('"upload" subcommand accepts --hq-root option', () => {
    const program = new Command();
    registerCloudSetupCommand(program);

    const cloudCmd = program.commands.find((c) => c.name() === 'cloud');
    const uploadCmd = cloudCmd!.commands.find((c) => c.name() === 'upload');
    expect(uploadCmd).toBeDefined();

    // Check that the option is registered
    const options = uploadCmd!.options.map((o) => o.long);
    expect(options).toContain('--hq-root');
  });

  it('"upload" subcommand accepts --on-conflict option', () => {
    const program = new Command();
    registerCloudSetupCommand(program);

    const cloudCmd = program.commands.find((c) => c.name() === 'cloud');
    const uploadCmd = cloudCmd!.commands.find((c) => c.name() === 'upload');

    const options = uploadCmd!.options.map((o) => o.long);
    expect(options).toContain('--on-conflict');
  });

  it('cloud command group still has setup-token and status alongside upload', () => {
    const program = new Command();
    registerCloudSetupCommand(program);

    const cloudCmd = program.commands.find((c) => c.name() === 'cloud');
    const subcommandNames = cloudCmd!.commands.map((c) => c.name());
    expect(subcommandNames).toContain('setup-token');
    expect(subcommandNames).toContain('status');
    expect(subcommandNames).toContain('upload');
  });
});
