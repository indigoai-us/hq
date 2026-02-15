/**
 * Tests for sync utilities (utils/sync.ts)
 *
 * Covers:
 * - File hashing (hashFile, hashBuffer)
 * - Ignore patterns (shouldIgnore)
 * - Directory walking (walkDir)
 * - Local manifest computation (computeLocalManifest)
 * - Sync state persistence (readSyncState, writeSyncState)
 * - API operations (syncDiff, uploadFile, downloadFile) — mocked
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  hashFile,
  hashBuffer,
  shouldIgnore,
  walkDir,
  computeLocalManifest,
  readSyncState,
  writeSyncState,
  getSyncStatePath,
  type CloudSyncState,
  type ManifestEntry,
} from '../utils/sync.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-sync-test-'));
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

// ── hashFile ─────────────────────────────────────────────────────────────────

describe('hashFile', () => {
  it('returns SHA-256 hex digest of file contents', () => {
    const content = 'Hello, HQ Cloud!';
    const filePath = createFile('test.txt', content);
    const expected = crypto.createHash('sha256').update(content).digest('hex');
    expect(hashFile(filePath)).toBe(expected);
  });

  it('returns different hashes for different content', () => {
    const file1 = createFile('a.txt', 'content A');
    const file2 = createFile('b.txt', 'content B');
    expect(hashFile(file1)).not.toBe(hashFile(file2));
  });

  it('returns same hash for identical content in different files', () => {
    const file1 = createFile('copy1.txt', 'identical');
    const file2 = createFile('copy2.txt', 'identical');
    expect(hashFile(file1)).toBe(hashFile(file2));
  });

  it('handles empty files', () => {
    const filePath = createFile('empty.txt', '');
    const expected = crypto.createHash('sha256').update('').digest('hex');
    expect(hashFile(filePath)).toBe(expected);
  });

  it('handles binary content', () => {
    const absPath = path.join(tmpDir, 'binary.bin');
    const buffer = Buffer.from([0x00, 0xff, 0x42, 0x13, 0x37]);
    fs.writeFileSync(absPath, buffer);
    const expected = crypto.createHash('sha256').update(buffer).digest('hex');
    expect(hashFile(absPath)).toBe(expected);
  });
});

// ── hashBuffer ───────────────────────────────────────────────────────────────

describe('hashBuffer', () => {
  it('returns SHA-256 hex digest of a buffer', () => {
    const buf = Buffer.from('test data');
    const expected = crypto.createHash('sha256').update(buf).digest('hex');
    expect(hashBuffer(buf)).toBe(expected);
  });

  it('returns same hash as hashFile for same content', () => {
    const content = 'matching content';
    const filePath = createFile('match.txt', content);
    expect(hashBuffer(Buffer.from(content))).toBe(hashFile(filePath));
  });
});

// ── shouldIgnore ─────────────────────────────────────────────────────────────

describe('shouldIgnore', () => {
  it('ignores .git directory paths', () => {
    expect(shouldIgnore('.git/config')).toBe(true);
    expect(shouldIgnore('sub/.git/HEAD')).toBe(true);
  });

  it('ignores node_modules', () => {
    expect(shouldIgnore('node_modules/package/index.js')).toBe(true);
    expect(shouldIgnore('packages/cli/node_modules/dep/lib.js')).toBe(true);
  });

  it('ignores .claude directory', () => {
    expect(shouldIgnore('.claude/config.json')).toBe(true);
  });

  it('ignores dist directory', () => {
    expect(shouldIgnore('dist/index.js')).toBe(true);
    expect(shouldIgnore('packages/lib/dist/types.d.ts')).toBe(true);
  });

  it('ignores .log files', () => {
    expect(shouldIgnore('debug.log')).toBe(true);
    expect(shouldIgnore('logs/app.log')).toBe(true);
  });

  it('ignores .DS_Store', () => {
    expect(shouldIgnore('.DS_Store')).toBe(true);
    expect(shouldIgnore('sub/.DS_Store')).toBe(true);
  });

  it('ignores .env files', () => {
    expect(shouldIgnore('.env')).toBe(true);
    expect(shouldIgnore('.env.local')).toBe(true);
  });

  it('does not ignore normal files', () => {
    expect(shouldIgnore('src/index.ts')).toBe(false);
    expect(shouldIgnore('README.md')).toBe(false);
    expect(shouldIgnore('workers/dev/worker.yaml')).toBe(false);
    expect(shouldIgnore('package.json')).toBe(false);
  });

  it('handles forward and back slashes', () => {
    expect(shouldIgnore('node_modules\\dep\\index.js')).toBe(true);
    expect(shouldIgnore('.git\\config')).toBe(true);
  });

  it('ignores cdk.out directory', () => {
    expect(shouldIgnore('cdk.out/manifest.json')).toBe(true);
  });

  it('ignores __pycache__ directory', () => {
    expect(shouldIgnore('__pycache__/module.cpython-311.pyc')).toBe(true);
  });
});

// ── walkDir ──────────────────────────────────────────────────────────────────

describe('walkDir', () => {
  it('returns empty array for empty directory', () => {
    expect(walkDir(tmpDir)).toEqual([]);
  });

  it('finds files in the root directory', () => {
    createFile('a.txt', 'a');
    createFile('b.txt', 'b');
    const files = walkDir(tmpDir);
    expect(files.sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('finds files in subdirectories with forward-slash paths', () => {
    createFile('src/index.ts', 'code');
    createFile('src/utils/helper.ts', 'helper');
    const files = walkDir(tmpDir);
    expect(files.sort()).toEqual(['src/index.ts', 'src/utils/helper.ts']);
  });

  it('skips .git directories', () => {
    createFile('.git/config', 'gitconfig');
    createFile('src/main.ts', 'code');
    const files = walkDir(tmpDir);
    expect(files).toEqual(['src/main.ts']);
  });

  it('skips node_modules', () => {
    createFile('node_modules/dep/index.js', 'code');
    createFile('package.json', '{}');
    const files = walkDir(tmpDir);
    expect(files).toEqual(['package.json']);
  });

  it('skips .log files', () => {
    createFile('app.log', 'log data');
    createFile('src/app.ts', 'code');
    const files = walkDir(tmpDir);
    expect(files).toEqual(['src/app.ts']);
  });

  it('skips .DS_Store', () => {
    createFile('.DS_Store', '');
    createFile('readme.md', 'hi');
    const files = walkDir(tmpDir);
    expect(files).toEqual(['readme.md']);
  });

  it('handles deeply nested structures', () => {
    createFile('a/b/c/d/e/file.txt', 'deep');
    const files = walkDir(tmpDir);
    expect(files).toEqual(['a/b/c/d/e/file.txt']);
  });

  it('returns empty for non-existent directory', () => {
    const files = walkDir(path.join(tmpDir, 'does-not-exist'));
    expect(files).toEqual([]);
  });
});

// ── computeLocalManifest ─────────────────────────────────────────────────────

describe('computeLocalManifest', () => {
  it('returns empty manifest for empty directory', () => {
    expect(computeLocalManifest(tmpDir)).toEqual([]);
  });

  it('computes manifest with correct hash, size, and path', () => {
    const content = 'manifest test content';
    createFile('test.txt', content);
    const manifest = computeLocalManifest(tmpDir);

    expect(manifest).toHaveLength(1);
    const entry = manifest[0];
    expect(entry.path).toBe('test.txt');
    expect(entry.hash).toBe(
      crypto.createHash('sha256').update(content).digest('hex')
    );
    expect(entry.size).toBe(Buffer.byteLength(content));
    expect(entry.lastModified).toBeTruthy();
    // Verify it's a valid ISO date
    expect(new Date(entry.lastModified).toISOString()).toBe(entry.lastModified);
  });

  it('computes manifest for multiple files', () => {
    createFile('a.txt', 'aaa');
    createFile('src/b.ts', 'bbb');
    createFile('deep/nested/c.md', 'ccc');

    const manifest = computeLocalManifest(tmpDir);
    expect(manifest).toHaveLength(3);

    const paths = manifest.map((e) => e.path).sort();
    expect(paths).toEqual(['a.txt', 'deep/nested/c.md', 'src/b.ts']);
  });

  it('excludes ignored files from manifest', () => {
    createFile('.git/HEAD', 'ref: refs/heads/main');
    createFile('node_modules/dep/lib.js', 'code');
    createFile('debug.log', 'logs');
    createFile('src/index.ts', 'real code');

    const manifest = computeLocalManifest(tmpDir);
    expect(manifest).toHaveLength(1);
    expect(manifest[0].path).toBe('src/index.ts');
  });

  it('includes correct file sizes', () => {
    createFile('small.txt', 'hi');
    createFile('bigger.txt', 'a'.repeat(1000));

    const manifest = computeLocalManifest(tmpDir);
    const small = manifest.find((e) => e.path === 'small.txt');
    const bigger = manifest.find((e) => e.path === 'bigger.txt');

    expect(small!.size).toBe(2);
    expect(bigger!.size).toBe(1000);
  });
});

// ── Sync state persistence ───────────────────────────────────────────────────

describe('readSyncState', () => {
  it('returns default state when no file exists', () => {
    const state = readSyncState(tmpDir);
    expect(state).toEqual({ running: false, errors: [] });
  });

  it('reads persisted state from disk', () => {
    const saved: CloudSyncState = {
      running: true,
      pid: 12345,
      lastSync: '2026-02-13T10:00:00.000Z',
      fileCount: 42,
      errors: [],
    };
    fs.writeFileSync(
      getSyncStatePath(tmpDir),
      JSON.stringify(saved)
    );

    const state = readSyncState(tmpDir);
    expect(state.running).toBe(true);
    expect(state.pid).toBe(12345);
    expect(state.lastSync).toBe('2026-02-13T10:00:00.000Z');
    expect(state.fileCount).toBe(42);
    expect(state.errors).toEqual([]);
  });

  it('returns default state when file is corrupted', () => {
    fs.writeFileSync(getSyncStatePath(tmpDir), 'not valid json');
    const state = readSyncState(tmpDir);
    expect(state).toEqual({ running: false, errors: [] });
  });
});

describe('writeSyncState', () => {
  it('writes state to disk and can be read back', () => {
    const state: CloudSyncState = {
      running: false,
      lastSync: '2026-02-13T12:00:00.000Z',
      fileCount: 100,
      errors: ['some error'],
    };
    writeSyncState(tmpDir, state);

    const raw = fs.readFileSync(getSyncStatePath(tmpDir), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.running).toBe(false);
    expect(parsed.lastSync).toBe('2026-02-13T12:00:00.000Z');
    expect(parsed.fileCount).toBe(100);
    expect(parsed.errors).toEqual(['some error']);
  });

  it('overwrites existing state', () => {
    writeSyncState(tmpDir, { running: true, pid: 111, errors: [] });
    writeSyncState(tmpDir, { running: false, errors: ['updated'] });

    const state = readSyncState(tmpDir);
    expect(state.running).toBe(false);
    expect(state.pid).toBeUndefined();
    expect(state.errors).toEqual(['updated']);
  });
});

describe('getSyncStatePath', () => {
  it('returns path ending with .hq-cloud-sync.json', () => {
    const p = getSyncStatePath(tmpDir);
    expect(p).toContain('.hq-cloud-sync.json');
    expect(p.startsWith(tmpDir)).toBe(true);
  });
});

// ── API operation tests (mocked) ─────────────────────────────────────────────

// We mock the api-client module to test the sync operations without a real server
vi.mock('../utils/api-client.js', () => ({
  apiRequest: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.local'),
}));

import { apiRequest } from '../utils/api-client.js';
import { syncDiff, uploadFile, downloadFile, pushChanges, pullChanges } from '../utils/sync.js';

const mockApiRequest = vi.mocked(apiRequest);

describe('syncDiff (mocked API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends local manifest to POST /api/files/sync and returns diff', async () => {
    createFile('src/index.ts', 'code');

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { toUpload: ['src/index.ts'], toDownload: [] },
    });

    const diff = await syncDiff(tmpDir);
    expect(diff.toUpload).toEqual(['src/index.ts']);
    expect(diff.toDownload).toEqual([]);

    // Verify API was called correctly
    expect(mockApiRequest).toHaveBeenCalledWith(
      'POST',
      '/api/files/sync',
      expect.objectContaining({
        manifest: expect.arrayContaining([
          expect.objectContaining({ path: 'src/index.ts' }),
        ]),
      })
    );
  });

  it('throws on API error', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'Internal server error',
    });

    await expect(syncDiff(tmpDir)).rejects.toThrow('Sync diff failed');
  });
});

describe('uploadFile (mocked API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends file content as base64 to POST /api/files/upload', async () => {
    const content = 'file content to upload';
    createFile('upload.txt', content);

    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    await uploadFile('upload.txt', tmpDir);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'POST',
      '/api/files/upload',
      expect.objectContaining({
        path: 'upload.txt',
        content: Buffer.from(content).toString('base64'),
        size: Buffer.byteLength(content),
      })
    );
  });

  it('throws on upload failure', async () => {
    createFile('fail.txt', 'content');

    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 413,
      error: 'File too large',
    });

    await expect(uploadFile('fail.txt', tmpDir)).rejects.toThrow('Upload failed');
  });
});

describe('downloadFile (mocked API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads and writes file content from API', async () => {
    const content = 'downloaded content';
    const base64 = Buffer.from(content).toString('base64');

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { content: base64, size: Buffer.byteLength(content) },
    });

    await downloadFile('new-file.txt', tmpDir);

    const written = fs.readFileSync(path.join(tmpDir, 'new-file.txt'), 'utf-8');
    expect(written).toBe(content);
  });

  it('creates subdirectories as needed', async () => {
    const content = 'nested';
    const base64 = Buffer.from(content).toString('base64');

    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { content: base64, size: content.length },
    });

    await downloadFile('deep/nested/dir/file.txt', tmpDir);

    const absPath = path.join(tmpDir, 'deep', 'nested', 'dir', 'file.txt');
    expect(fs.existsSync(absPath)).toBe(true);
    expect(fs.readFileSync(absPath, 'utf-8')).toBe(content);
  });

  it('throws on download failure', async () => {
    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'Not found',
    });

    await expect(downloadFile('missing.txt', tmpDir)).rejects.toThrow('Download failed');
  });
});

describe('pushChanges (mocked API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads files identified by syncDiff', async () => {
    createFile('a.txt', 'aaa');
    createFile('b.txt', 'bbb');

    // First call: syncDiff
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { toUpload: ['a.txt'], toDownload: [] },
    });
    // Second call: uploadFile for a.txt
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await pushChanges(tmpDir);
    expect(result.uploaded).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('collects errors without stopping when file is missing locally', async () => {
    createFile('ok.txt', 'ok');
    // Note: missing.txt does NOT exist on disk, so uploadFile will throw
    // at fs.readFileSync before reaching apiRequest — no mock needed for it.

    // syncDiff returns two files to upload
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { toUpload: ['ok.txt', 'missing.txt'], toDownload: [] },
    });
    // Upload for ok.txt succeeds
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });
    // No mock for missing.txt — it throws before calling apiRequest

    const result = await pushChanges(tmpDir);
    // ok.txt succeeded
    expect(result.uploaded).toBe(1);
    // missing.txt failed (fs.readFileSync throws)
    expect(result.errors.length).toBe(1);
  });

  it('collects errors when API rejects upload', async () => {
    createFile('ok.txt', 'ok');
    createFile('rejected.txt', 'too big');

    // syncDiff returns two files to upload
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { toUpload: ['ok.txt', 'rejected.txt'], toDownload: [] },
    });
    // First upload succeeds
    mockApiRequest.mockResolvedValueOnce({ ok: true, status: 200 });
    // Second upload fails via API error
    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 413,
      error: 'File too large',
    });

    const result = await pushChanges(tmpDir);
    expect(result.uploaded).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Upload failed');
  });
});

describe('pullChanges (mocked API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads files identified by syncDiff', async () => {
    // syncDiff
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { toUpload: [], toDownload: ['remote.txt'] },
    });
    // downloadFile
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { content: Buffer.from('remote content').toString('base64'), size: 14 },
    });

    const result = await pullChanges(tmpDir);
    expect(result.downloaded).toBe(1);
    expect(result.errors).toEqual([]);

    // Verify file was written
    const content = fs.readFileSync(path.join(tmpDir, 'remote.txt'), 'utf-8');
    expect(content).toBe('remote content');
  });

  it('collects errors without stopping', async () => {
    // syncDiff returns two files to download
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { toUpload: [], toDownload: ['ok.txt', 'fail.txt'] },
    });
    // First download succeeds
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { content: Buffer.from('ok').toString('base64'), size: 2 },
    });
    // Second download fails
    mockApiRequest.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'Download error',
    });

    const result = await pullChanges(tmpDir);
    expect(result.downloaded).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Download failed');
  });
});
