/**
 * Tests for post-login setup status check (commands/auth.ts)
 *
 * Covers:
 * - checkSetupStatus: API call, success responses, error handling
 * - handlePostLoginSetup: auto-sync flow, skip sync, network error graceful handling
 * - performPostLoginSync: push flow after setup detection
 * - US-005: Progress counter, summary, retry on failure, skipped files, --verbose flag
 * - classifySyncResult: failure classification logic
 * - printSyncSummary: output formatting
 */

import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';

// Mock api-client before importing auth module
vi.mock('../utils/api-client.js', () => ({
  apiRequest: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.local'),
}));

// Mock sync utilities
vi.mock('../utils/sync.js', () => ({
  pushChanges: vi.fn(),
  computeLocalManifest: vi.fn(() => []),
}));

// Mock manifest utilities
vi.mock('../utils/manifest.js', () => ({
  findHqRoot: vi.fn(() => '/mock/hq'),
}));

import { apiRequest } from '../utils/api-client.js';
import { pushChanges, computeLocalManifest } from '../utils/sync.js';
import { findHqRoot } from '../utils/manifest.js';
import {
  checkSetupStatus,
  handlePostLoginSetup,
  performPostLoginSync,
  promptHqRoot,
  classifySyncResult,
  printSyncSummary,
  type SetupStatusResponse,
  type PromptInputFn,
} from '../commands/auth.js';
import type { PushResult } from '../utils/sync.js';

const mockApiRequest = vi.mocked(apiRequest);
const mockPushChanges = vi.mocked(pushChanges);
const mockComputeLocalManifest = vi.mocked(computeLocalManifest);
const mockFindHqRoot = vi.mocked(findHqRoot);

// Capture console.log output for assertion
let consoleOutput: string[];
const originalLog = console.log;

beforeEach(() => {
  vi.clearAllMocks();
  consoleOutput = [];
  console.log = (...args: unknown[]) => {
    // Strip ANSI codes for easier assertion
    const text = args
      .map((a) => String(a))
      .join(' ')
      .replace(/\x1b\[[0-9;]*m/g, '');
    consoleOutput.push(text);
  };
  mockFindHqRoot.mockReturnValue('/mock/hq');
  mockComputeLocalManifest.mockReturnValue([]);
});

// Restore console.log after all tests
afterAll(() => {
  console.log = originalLog;
});

// ── Helper: create a standard PushResult ─────────────────────────────────────

function makePushResult(overrides: Partial<PushResult> = {}): PushResult {
  return {
    total: 0,
    uploaded: 0,
    skipped: [],
    failed: [],
    errors: [],
    ...overrides,
  };
}

// ── checkSetupStatus ──────────────────────────────────────────────────────────

describe('checkSetupStatus', () => {
  it('returns setup status when API call succeeds and setup is complete', async () => {
    const response: SetupStatusResponse = {
      setupComplete: true,
      s3Prefix: 'user_abc123/hq/',
      fileCount: 42,
      hqRoot: '/home/user/hq',
    };

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: response,
    });

    const result = await checkSetupStatus();
    expect(result).toEqual(response);
    expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/auth/setup-status');
  });

  it('returns setup status when API call succeeds and setup is incomplete', async () => {
    const response: SetupStatusResponse = {
      setupComplete: false,
      s3Prefix: 'user_abc123/hq/',
      fileCount: 0,
      hqRoot: null,
    };

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: response,
    });

    const result = await checkSetupStatus();
    expect(result).toEqual(response);
    expect(result!.setupComplete).toBe(false);
  });

  it('returns null and prints warning when API returns error response', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'Internal server error',
    });

    const result = await checkSetupStatus();
    expect(result).toBeNull();
    expect(consoleOutput.some((line) => line.includes('Warning'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('Internal server error'))).toBe(true);
  });

  it('returns null and prints warning when network error occurs', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await checkSetupStatus();
    expect(result).toBeNull();
    expect(consoleOutput.some((line) => line.includes('Warning'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('Could not reach HQ Cloud'))).toBe(true);
  });

  it('returns null when API returns ok but no data', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: undefined,
    });

    const result = await checkSetupStatus();
    expect(result).toBeNull();
  });
});

// ── handlePostLoginSetup ──────────────────────────────────────────────────────

describe('handlePostLoginSetup', () => {
  it('skips everything when skipSync is true', async () => {
    await handlePostLoginSetup(true);

    // Should not call the API at all
    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(consoleOutput).toEqual([]);
  });

  it('prints synced message when setupComplete is true', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { setupComplete: true, s3Prefix: 'user_abc/hq/', fileCount: 150, hqRoot: '/mock/hq' },
    });

    await handlePostLoginSetup(false);

    expect(consoleOutput.some((line) => line.includes('HQ Cloud is set up and synced (150 files)'))).toBe(true);
    // Should NOT call pushChanges
    expect(mockPushChanges).not.toHaveBeenCalled();
  });

  it('triggers auto-sync when setupComplete is false and hqRoot is already set', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { setupComplete: false, s3Prefix: 'user_abc/hq/', fileCount: 0, hqRoot: '/mock/hq' },
    });

    mockComputeLocalManifest.mockReturnValue([
      { path: 'a.txt', hash: 'abc', size: 3, lastModified: '2026-01-01T00:00:00.000Z' },
      { path: 'b.txt', hash: 'def', size: 3, lastModified: '2026-01-01T00:00:00.000Z' },
    ]);

    mockPushChanges.mockResolvedValueOnce(makePushResult({ total: 2, uploaded: 2 }));

    await handlePostLoginSetup(false);

    expect(consoleOutput.some((line) => line.includes('Initial sync needed. Starting upload of your HQ files...'))).toBe(true);
    // pushChanges is now called with hqRoot + progress callback
    expect(mockPushChanges).toHaveBeenCalledWith('/mock/hq', expect.any(Function));
  });

  it('passes verbose flag through to performPostLoginSync', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { setupComplete: false, s3Prefix: 'user_abc/hq/', fileCount: 0, hqRoot: '/mock/hq' },
    });

    mockComputeLocalManifest.mockReturnValue([]);
    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 2,
      uploaded: 2,
      skipped: [{ path: 'a.gitkeep', reason: 'empty placeholder file' }],
    }));

    // verbose=true should show skipped file details
    await handlePostLoginSetup(false, true);

    // With verbose, should show the skipped file path and reason
    expect(consoleOutput.some((line) => line.includes('a.gitkeep'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('empty placeholder'))).toBe(true);
  });

  it('handles network error gracefully — login still succeeds', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await handlePostLoginSetup(false);

    // Should print a warning, not throw
    expect(consoleOutput.some((line) => line.includes('Warning'))).toBe(true);
    // Should NOT attempt sync
    expect(mockPushChanges).not.toHaveBeenCalled();
  });

  it('handles API error response gracefully', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    });

    await handlePostLoginSetup(false);

    expect(consoleOutput.some((line) => line.includes('Warning'))).toBe(true);
    expect(mockPushChanges).not.toHaveBeenCalled();
  });
});

// ── performPostLoginSync ──────────────────────────────────────────────────────

describe('performPostLoginSync', () => {
  it('computes manifest and pushes changes with progress callback', async () => {
    mockComputeLocalManifest.mockReturnValue([
      { path: 'file1.txt', hash: 'aaa', size: 10, lastModified: '2026-01-01T00:00:00.000Z' },
    ]);
    mockPushChanges.mockResolvedValueOnce(makePushResult({ total: 1, uploaded: 1 }));

    await performPostLoginSync('/mock/hq');

    expect(mockComputeLocalManifest).toHaveBeenCalledWith('/mock/hq');
    // pushChanges now receives a progress callback as second arg
    expect(mockPushChanges).toHaveBeenCalledWith('/mock/hq', expect.any(Function));
    expect(consoleOutput.some((line) => line.includes('Synced 1 file'))).toBe(true);
  });

  it('reports when no files need uploading', async () => {
    mockComputeLocalManifest.mockReturnValue([]);
    mockPushChanges.mockResolvedValueOnce(makePushResult());

    await performPostLoginSync('/mock/hq');

    expect(consoleOutput.some((line) => line.includes('No files to upload'))).toBe(true);
  });

  it('shows summary with skipped files hint', async () => {
    mockComputeLocalManifest.mockReturnValue([
      { path: 'a.txt', hash: 'a', size: 1, lastModified: '2026-01-01T00:00:00.000Z' },
    ]);
    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 1132,
      uploaded: 1113,
      skipped: Array.from({ length: 19 }, (_, i) => ({
        path: `skip${i}.gitkeep`,
        reason: 'empty placeholder file',
      })),
    }));

    await performPostLoginSync('/mock/hq');

    // Should show "Synced 1113 files. 19 skipped (see details with --verbose)."
    expect(consoleOutput.some((line) => line.includes('Synced 1113 files'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('19 skipped'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('--verbose'))).toBe(true);
  });

  it('shows skipped file details with verbose=true', async () => {
    mockComputeLocalManifest.mockReturnValue([]);
    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 3,
      uploaded: 2,
      skipped: [
        { path: 'dir/.gitkeep', reason: 'empty placeholder file' },
      ],
    }));

    await performPostLoginSync('/mock/hq', true);

    // With verbose, should list individual skipped files
    expect(consoleOutput.some((line) => line.includes('dir/.gitkeep'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('empty placeholder'))).toBe(true);
  });

  it('shows plural "files" for multiple uploads', async () => {
    mockComputeLocalManifest.mockReturnValue([
      { path: 'a.txt', hash: 'a', size: 1, lastModified: '2026-01-01T00:00:00.000Z' },
      { path: 'b.txt', hash: 'b', size: 1, lastModified: '2026-01-01T00:00:00.000Z' },
      { path: 'c.txt', hash: 'c', size: 1, lastModified: '2026-01-01T00:00:00.000Z' },
    ]);
    mockPushChanges.mockResolvedValueOnce(makePushResult({ total: 3, uploaded: 3 }));

    await performPostLoginSync('/mock/hq');

    expect(consoleOutput.some((line) => line.includes('Synced 3 files'))).toBe(true);
  });

  it('handles pushChanges throwing an error gracefully', async () => {
    mockComputeLocalManifest.mockReturnValue([]);
    mockPushChanges.mockRejectedValueOnce(new Error('Sync diff failed: HTTP 500'));

    await performPostLoginSync('/mock/hq');

    // Should print a warning, not throw
    expect(consoleOutput.some((line) => line.includes('Warning: Initial sync encountered an error'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('hq sync push'))).toBe(true);
  });

  // ── US-005: Total failure → retry prompt ─────────────────────────────────

  it('prompts retry on total failure (0 uploaded) and retries when accepted', async () => {
    mockComputeLocalManifest.mockReturnValue([
      { path: 'a.txt', hash: 'a', size: 1, lastModified: '2026-01-01T00:00:00.000Z' },
    ]);

    // First push: total failure
    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 5,
      uploaded: 0,
      failed: [
        { path: 'a.txt', error: 'Network error' },
        { path: 'b.txt', error: 'Network error' },
        { path: 'c.txt', error: 'Network error' },
        { path: 'd.txt', error: 'Network error' },
        { path: 'e.txt', error: 'Network error' },
      ],
      errors: ['Network error', 'Network error', 'Network error', 'Network error', 'Network error'],
    }));

    // Retry push: success
    mockPushChanges.mockResolvedValueOnce(makePushResult({ total: 5, uploaded: 5 }));

    // Mock retry prompt to accept
    const mockPrompt = vi.fn().mockResolvedValue(true);

    await performPostLoginSync('/mock/hq', false, mockPrompt);

    // Should have been prompted
    expect(mockPrompt).toHaveBeenCalledWith('Retry initial sync? (Y/n)');
    // Should show total failure message
    expect(consoleOutput.some((line) => line.includes('All file uploads failed'))).toBe(true);
    // Should show retry message
    expect(consoleOutput.some((line) => line.includes('Retrying sync'))).toBe(true);
    // pushChanges should be called twice (initial + retry)
    expect(mockPushChanges).toHaveBeenCalledTimes(2);
  });

  it('skips retry on total failure when user declines', async () => {
    mockComputeLocalManifest.mockReturnValue([]);

    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 3,
      uploaded: 0,
      failed: [
        { path: 'a.txt', error: 'Error' },
        { path: 'b.txt', error: 'Error' },
        { path: 'c.txt', error: 'Error' },
      ],
      errors: ['Error', 'Error', 'Error'],
    }));

    // Mock retry prompt to decline
    const mockPrompt = vi.fn().mockResolvedValue(false);

    await performPostLoginSync('/mock/hq', false, mockPrompt);

    expect(mockPrompt).toHaveBeenCalled();
    expect(consoleOutput.some((line) => line.includes('hq sync push'))).toBe(true);
    // pushChanges should only be called once (no retry)
    expect(mockPushChanges).toHaveBeenCalledTimes(1);
  });

  // ── US-005: Partial failure (<50% success) → retry prompt ────────────────

  it('prompts retry on partial failure (<50% success) and retries when accepted', async () => {
    mockComputeLocalManifest.mockReturnValue([]);

    // First push: partial failure — 2/10 succeeded (20% < 50%)
    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 10,
      uploaded: 2,
      failed: Array.from({ length: 8 }, (_, i) => ({
        path: `fail${i}.txt`,
        error: 'Timeout',
      })),
      errors: Array.from({ length: 8 }, () => 'Timeout'),
    }));

    // Retry: success
    mockPushChanges.mockResolvedValueOnce(makePushResult({ total: 8, uploaded: 8 }));

    const mockPrompt = vi.fn().mockResolvedValue(true);

    await performPostLoginSync('/mock/hq', false, mockPrompt);

    expect(mockPrompt).toHaveBeenCalledWith('Some files failed. Retry failed files? (Y/n)');
    expect(consoleOutput.some((line) => line.includes('Retrying failed files'))).toBe(true);
    expect(mockPushChanges).toHaveBeenCalledTimes(2);
  });

  it('does NOT prompt retry when >50% succeeded (partial success)', async () => {
    mockComputeLocalManifest.mockReturnValue([]);

    // 8/10 succeeded (80% > 50%) — no retry prompt
    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 10,
      uploaded: 8,
      failed: [
        { path: 'f1.txt', error: 'Error' },
        { path: 'f2.txt', error: 'Error' },
      ],
      errors: ['Error', 'Error'],
    }));

    const mockPrompt = vi.fn();

    await performPostLoginSync('/mock/hq', false, mockPrompt);

    // Should NOT prompt — >50% success is considered success with warnings
    expect(mockPrompt).not.toHaveBeenCalled();
    expect(mockPushChanges).toHaveBeenCalledTimes(1);
  });

  // ── US-005: Skipped files do not count as failures ───────────────────────

  it('skipped files do not count as failures and do not trigger retry', async () => {
    mockComputeLocalManifest.mockReturnValue([]);

    // 5 total: 3 uploaded, 2 skipped, 0 failed — success!
    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 5,
      uploaded: 3,
      skipped: [
        { path: '.gitkeep', reason: 'empty placeholder file' },
        { path: 'big.bin', reason: 'oversized (15.0 MB, limit 10 MB)' },
      ],
    }));

    const mockPrompt = vi.fn();

    await performPostLoginSync('/mock/hq', false, mockPrompt);

    // No retry prompt
    expect(mockPrompt).not.toHaveBeenCalled();
    // Summary should show synced + skipped
    expect(consoleOutput.some((line) => line.includes('Synced 3 files'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('2 skipped'))).toBe(true);
  });

  // ── US-005: --verbose shows individual file errors ───────────────────────

  it('--verbose shows individual failed file details', async () => {
    mockComputeLocalManifest.mockReturnValue([]);

    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 5,
      uploaded: 4,
      failed: [
        { path: 'big-image.jpeg', error: 'Request body is too large' },
      ],
      errors: ['Request body is too large'],
    }));

    await performPostLoginSync('/mock/hq', true); // verbose=true

    // Should show the individual failed file with its error
    expect(consoleOutput.some((line) => line.includes('big-image.jpeg'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('Request body is too large'))).toBe(true);
  });

  it('without --verbose, shows first 3 errors with overflow count', async () => {
    mockComputeLocalManifest.mockReturnValue([]);

    mockPushChanges.mockResolvedValueOnce(makePushResult({
      total: 10,
      uploaded: 5,
      failed: Array.from({ length: 5 }, (_, i) => ({
        path: `fail${i}.txt`,
        error: `Error ${i}`,
      })),
      errors: Array.from({ length: 5 }, (_, i) => `Error ${i}`),
    }));

    await performPostLoginSync('/mock/hq', false); // verbose=false

    // Should show first 3 errors
    expect(consoleOutput.some((line) => line.includes('fail0.txt'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('fail1.txt'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('fail2.txt'))).toBe(true);
    // Should show overflow hint
    expect(consoleOutput.some((line) => line.includes('and 2 more'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('--verbose'))).toBe(true);
  });
});

// ── promptHqRoot ──────────────────────────────────────────────────────────────

describe('promptHqRoot', () => {
  it('prompts user and returns path when valid', async () => {
    const mockInput = vi.fn().mockResolvedValue('/valid/hq');
    const mockValidate = vi.fn().mockReturnValue(true);

    // Mock the apiRequest for saving hqRoot
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await promptHqRoot(mockInput, mockValidate);

    expect(result).not.toBeNull();
    expect(mockInput).toHaveBeenCalledTimes(1);
    expect(mockInput).toHaveBeenCalledWith(expect.stringContaining('Where is your HQ system located?'));
    // Should have saved to API
    expect(mockApiRequest).toHaveBeenCalledWith('PUT', '/api/settings', { hqRoot: expect.any(String) });
  });

  it('uses detected default when user presses Enter (empty input)', async () => {
    // findHqRoot mock already returns '/mock/hq'
    const mockInput = vi.fn().mockResolvedValue(''); // empty = accept default
    const mockValidate = vi.fn().mockReturnValue(true);

    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await promptHqRoot(mockInput, mockValidate);

    expect(result).not.toBeNull();
    // Should have used findHqRoot's return value
    expect(mockValidate).toHaveBeenCalled();
  });

  it('shows default path hint in prompt', async () => {
    const mockInput = vi.fn().mockResolvedValue('');
    const mockValidate = vi.fn().mockReturnValue(true);
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    await promptHqRoot(mockInput, mockValidate);

    // Prompt should contain the detected default path
    expect(mockInput).toHaveBeenCalledWith(expect.stringContaining('/mock/hq'));
  });

  it('re-prompts on invalid path (up to 3 attempts)', async () => {
    const mockInput = vi.fn()
      .mockResolvedValueOnce('/bad/path1')
      .mockResolvedValueOnce('/bad/path2')
      .mockResolvedValueOnce('/bad/path3');
    const mockValidate = vi.fn().mockReturnValue(false);

    const result = await promptHqRoot(mockInput, mockValidate);

    expect(result).toBeNull();
    expect(mockInput).toHaveBeenCalledTimes(3);
    // Should show error messages for invalid paths
    expect(consoleOutput.some((line) => line.includes('does not appear to be an HQ directory'))).toBe(true);
    // Should show final failure message
    expect(consoleOutput.some((line) => line.includes('Could not find a valid HQ directory after 3 attempts'))).toBe(true);
  });

  it('succeeds on second attempt after first invalid path', async () => {
    const mockInput = vi.fn()
      .mockResolvedValueOnce('/bad/path')
      .mockResolvedValueOnce('/good/path');
    const mockValidate = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await promptHqRoot(mockInput, mockValidate);

    expect(result).not.toBeNull();
    expect(mockInput).toHaveBeenCalledTimes(2);
    // Should show remaining attempts warning
    expect(consoleOutput.some((line) => line.includes('2 attempts remaining'))).toBe(true);
  });

  it('saves hqRoot to API via PUT /api/settings', async () => {
    const mockInput = vi.fn().mockResolvedValue('/my/hq');
    const mockValidate = vi.fn().mockReturnValue(true);

    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    await promptHqRoot(mockInput, mockValidate);

    expect(mockApiRequest).toHaveBeenCalledWith('PUT', '/api/settings', { hqRoot: expect.stringContaining('hq') });
  });

  it('continues even if saving to API fails', async () => {
    const mockInput = vi.fn().mockResolvedValue('/valid/hq');
    const mockValidate = vi.fn().mockReturnValue(true);

    mockApiRequest.mockRejectedValueOnce(new Error('Network error'));

    const result = await promptHqRoot(mockInput, mockValidate);

    // Should still return the path even if API save failed
    expect(result).not.toBeNull();
    expect(consoleOutput.some((line) => line.includes('Could not save HQ root to cloud settings'))).toBe(true);
  });
});

// ── handlePostLoginSetup: hqRoot prompt flow ──────────────────────────────────

describe('handlePostLoginSetup — hqRoot prompt', () => {
  it('prompts for hqRoot when status.hqRoot is null', async () => {
    // Setup status returns hqRoot: null
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { setupComplete: false, s3Prefix: 'user_abc/hq/', fileCount: 0, hqRoot: null },
    });

    // Mock the prompt input to return a path
    const mockInput: PromptInputFn = vi.fn().mockResolvedValue('/prompted/hq');
    const mockValidate = vi.fn().mockReturnValue(true);

    // Mock the PUT /api/settings call for saving hqRoot
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    // Mock sync
    mockComputeLocalManifest.mockReturnValue([]);
    mockPushChanges.mockResolvedValueOnce(makePushResult({ total: 1, uploaded: 1 }));

    await handlePostLoginSetup(false, false, undefined, mockInput, mockValidate);

    // Should have prompted for hqRoot
    expect(mockInput).toHaveBeenCalled();
    // Should have proceeded to sync
    expect(mockPushChanges).toHaveBeenCalled();
  });

  it('does NOT prompt when status.hqRoot is already set', async () => {
    // Setup status returns hqRoot already set
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { setupComplete: false, s3Prefix: 'user_abc/hq/', fileCount: 0, hqRoot: '/existing/hq' },
    });

    mockComputeLocalManifest.mockReturnValue([]);
    mockPushChanges.mockResolvedValueOnce(makePushResult({ total: 1, uploaded: 1 }));

    const mockInput: PromptInputFn = vi.fn();

    await handlePostLoginSetup(false, false, undefined, mockInput);

    // Should NOT have prompted — hqRoot was already set
    expect(mockInput).not.toHaveBeenCalled();
    // Should proceed directly to sync with the existing hqRoot
    expect(mockPushChanges).toHaveBeenCalledWith('/existing/hq', expect.any(Function));
  });

  it('skips sync when user fails to provide valid hqRoot after 3 attempts', async () => {
    // Setup status returns hqRoot: null
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { setupComplete: false, s3Prefix: 'user_abc/hq/', fileCount: 0, hqRoot: null },
    });

    // All attempts fail validation
    const mockInput: PromptInputFn = vi.fn()
      .mockResolvedValueOnce('/bad1')
      .mockResolvedValueOnce('/bad2')
      .mockResolvedValueOnce('/bad3');
    const mockValidate = vi.fn().mockReturnValue(false);

    await handlePostLoginSetup(false, false, undefined, mockInput, mockValidate);

    // Should have prompted 3 times
    expect(mockInput).toHaveBeenCalledTimes(3);
    // Should NOT have synced
    expect(mockPushChanges).not.toHaveBeenCalled();
    // Should show skip message
    expect(consoleOutput.some((line) => line.includes('Setup skipped'))).toBe(true);
  });
});

// ── classifySyncResult ────────────────────────────────────────────────────────

describe('classifySyncResult', () => {
  it('returns "none" when no files attempted', () => {
    expect(classifySyncResult(makePushResult())).toBe('none');
  });

  it('returns "none" when all files skipped', () => {
    expect(classifySyncResult(makePushResult({
      total: 5,
      uploaded: 0,
      skipped: Array.from({ length: 5 }, (_, i) => ({
        path: `s${i}`,
        reason: 'skipped',
      })),
    }))).toBe('none');
  });

  it('returns "total-failure" when 0 uploaded and failures exist', () => {
    expect(classifySyncResult(makePushResult({
      total: 10,
      uploaded: 0,
      failed: [{ path: 'a', error: 'err' }],
      errors: ['err'],
    }))).toBe('total-failure');
  });

  it('returns "partial-failure" when <50% of attempted files succeed', () => {
    // 2 out of 10 attempted succeeded (20%)
    expect(classifySyncResult(makePushResult({
      total: 10,
      uploaded: 2,
      failed: Array.from({ length: 8 }, (_, i) => ({
        path: `f${i}`,
        error: 'err',
      })),
      errors: Array.from({ length: 8 }, () => 'err'),
    }))).toBe('partial-failure');
  });

  it('returns "none" when >50% of attempted files succeed', () => {
    // 8 out of 10 attempted succeeded (80%)
    expect(classifySyncResult(makePushResult({
      total: 10,
      uploaded: 8,
      failed: [{ path: 'a', error: 'err' }, { path: 'b', error: 'err' }],
      errors: ['err', 'err'],
    }))).toBe('none');
  });

  it('correctly excludes skipped from attempted count', () => {
    // total=10, skipped=5, attempted=5, uploaded=1, failed=4
    // 1/5 = 20% < 50% → partial-failure
    expect(classifySyncResult(makePushResult({
      total: 10,
      uploaded: 1,
      skipped: Array.from({ length: 5 }, (_, i) => ({
        path: `s${i}`,
        reason: 'skipped',
      })),
      failed: Array.from({ length: 4 }, (_, i) => ({
        path: `f${i}`,
        error: 'err',
      })),
      errors: Array.from({ length: 4 }, () => 'err'),
    }))).toBe('partial-failure');
  });

  it('returns "none" when exactly 50% succeed (not less than)', () => {
    // 5 out of 10 attempted succeeded (50% — boundary)
    expect(classifySyncResult(makePushResult({
      total: 10,
      uploaded: 5,
      failed: Array.from({ length: 5 }, (_, i) => ({
        path: `f${i}`,
        error: 'err',
      })),
      errors: Array.from({ length: 5 }, () => 'err'),
    }))).toBe('none');
  });
});

// ── printSyncSummary ──────────────────────────────────────────────────────────

describe('printSyncSummary', () => {
  it('shows "No files to upload" when everything is zero', () => {
    printSyncSummary(makePushResult(), false);

    expect(consoleOutput.some((line) => line.includes('No files to upload'))).toBe(true);
  });

  it('shows synced count without skipped info when no skips', () => {
    printSyncSummary(makePushResult({ total: 10, uploaded: 10 }), false);

    expect(consoleOutput.some((line) => line.includes('Synced 10 files'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('skipped'))).toBe(false);
  });

  it('shows synced count with skipped info', () => {
    printSyncSummary(makePushResult({
      total: 12,
      uploaded: 10,
      skipped: [
        { path: '.gitkeep', reason: 'empty' },
        { path: 'big.bin', reason: 'oversized' },
      ],
    }), false);

    expect(consoleOutput.some((line) => line.includes('Synced 10 files'))).toBe(true);
    expect(consoleOutput.some((line) => line.includes('2 skipped'))).toBe(true);
  });

  it('shows singular "file" for 1 uploaded', () => {
    printSyncSummary(makePushResult({ total: 1, uploaded: 1 }), false);

    expect(consoleOutput.some((line) => line.includes('Synced 1 file.'))).toBe(true);
    // Should NOT say "files"
    expect(consoleOutput.some((line) => line.includes('Synced 1 files'))).toBe(false);
  });
});
