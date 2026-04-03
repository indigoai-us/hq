/**
 * s3.test.ts — Unit tests for the S3 storage module.
 *
 * Covers:
 *   - s3.ts: put, get, list
 *   - backup.ts: backupSession, disabled when S3_BUCKET empty, errors don't throw
 *   - hydrate.ts: skips when S3_BUCKET empty, downloads on empty data/, non-fatal on error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoist mock factories ───────────────────────────────────────────────────────
// vi.hoisted runs before vi.mock — lets us reference mock fns inside vi.mock.

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  return { mockSend };
});

// ── Mock @aws-sdk/client-s3 ───────────────────────────────────────────────────

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send = mockSend;
  }
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class ListObjectsV2Command {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class HeadObjectCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    HeadObjectCommand,
  };
});

// ── Mock config ───────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
  config: {
    S3_BUCKET: 'test-bucket',
    S3_PREFIX: 'hq-cloud',
    S3_ENDPOINT: '',
    AWS_REGION: 'us-east-1',
    BACKUP_INTERVAL_MS: 1800000,
    DATA_DIR: '/tmp/hq-test-data',
    TEAM_ID: 'default',
  },
}));

// ── Mock fs (sync existsSync used by hydrate) ─────────────────────────────────

const { mockExistsSync } = vi.hoisted(() => {
  const mockExistsSync = vi.fn<(p: string) => boolean>().mockReturnValue(false);
  return { mockExistsSync };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
    },
    existsSync: mockExistsSync,
  };
});

// ── Mock fs/promises ──────────────────────────────────────────────────────────

const { mockReaddir, mockReadFile, mockWriteFile, mockMkdir } = vi.hoisted(() => {
  const mockReaddir = vi.fn<() => Promise<string[]>>().mockResolvedValue([]);
  const mockReadFile = vi.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from(''));
  const mockWriteFile = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const mockMkdir = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return { mockReaddir, mockReadFile, mockWriteFile, mockMkdir };
});

vi.mock('fs/promises', () => ({
  default: {
    readdir: mockReaddir,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
  readdir: mockReaddir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { put, get, list, resetS3Client } from './s3.js';
import { backupSession, backupDatabase, getBackupStatus } from './backup.js';
import { hydrateIfNeeded } from './hydrate.js';
import { config } from '../config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a readable async iterable that yields the given buffers. */
function makeStream(chunks: Buffer[]): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < chunks.length) {
            return { value: chunks[i++], done: false };
          }
          return { value: undefined as unknown as Uint8Array, done: true };
        },
      };
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// s3.ts
// ═════════════════════════════════════════════════════════════════════════════

describe('s3.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetS3Client();
  });

  describe('put()', () => {
    it('calls PutObjectCommand with correct bucket, key, and body', async () => {
      mockSend.mockResolvedValueOnce({});

      const body = Buffer.from('hello world');
      await put('hq-cloud/sessions/abc/session.jsonl', body);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const [cmd] = mockSend.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(cmd.input.Bucket).toBe('test-bucket');
      expect(cmd.input.Key).toBe('hq-cloud/sessions/abc/session.jsonl');
      expect(cmd.input.Body).toEqual(body);
    });

    it('uses provided contentType', async () => {
      mockSend.mockResolvedValueOnce({});
      await put('hq-cloud/db/snapshot.db', Buffer.from('db'), 'application/octet-stream');

      const [cmd] = mockSend.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(cmd.input.ContentType).toBe('application/octet-stream');
    });

    it('converts string body to Buffer', async () => {
      mockSend.mockResolvedValueOnce({});
      await put('test/key', 'hello');

      const [cmd] = mockSend.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(Buffer.isBuffer(cmd.input.Body)).toBe(true);
    });
  });

  describe('get()', () => {
    it('returns a Buffer from the response stream', async () => {
      const expected = Buffer.from('file content');
      mockSend.mockResolvedValueOnce({ Body: makeStream([expected]) });

      const result = await get('hq-cloud/sessions/abc/session.jsonl');
      expect(result).toEqual(expected);
    });

    it('concatenates multiple stream chunks', async () => {
      const chunk1 = Buffer.from('hello ');
      const chunk2 = Buffer.from('world');
      mockSend.mockResolvedValueOnce({ Body: makeStream([chunk1, chunk2]) });

      const result = await get('some/key');
      expect(result.toString()).toBe('hello world');
    });

    it('throws when Body is missing', async () => {
      mockSend.mockResolvedValueOnce({ Body: undefined });
      await expect(get('missing/key')).rejects.toThrow('empty body');
    });
  });

  describe('list()', () => {
    it('returns an array of S3Objects for listed contents', async () => {
      const now = new Date();
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'hq-cloud/sessions/abc/session.jsonl', Size: 512, LastModified: now },
          { Key: 'hq-cloud/sessions/xyz/session.jsonl', Size: 1024, LastModified: now },
        ],
        IsTruncated: false,
      });

      const results = await list('hq-cloud/sessions/');
      expect(results).toHaveLength(2);
      expect(results[0].key).toBe('hq-cloud/sessions/abc/session.jsonl');
      expect(results[0].size).toBe(512);
      expect(results[1].key).toBe('hq-cloud/sessions/xyz/session.jsonl');
    });

    it('handles pagination via continuation token', async () => {
      const now = new Date();
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'hq-cloud/db/snap1.db', Size: 100, LastModified: now }],
          IsTruncated: true,
          NextContinuationToken: 'token123',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'hq-cloud/db/snap2.db', Size: 200, LastModified: now }],
          IsTruncated: false,
        });

      const results = await list('hq-cloud/db/');
      expect(results).toHaveLength(2);
      expect(results[0].key).toBe('hq-cloud/db/snap1.db');
      expect(results[1].key).toBe('hq-cloud/db/snap2.db');
    });

    it('returns empty array when Contents is empty', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
      const results = await list('hq-cloud/nonexistent/');
      expect(results).toEqual([]);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// backup.ts
// ═════════════════════════════════════════════════════════════════════════════

describe('backup.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetS3Client();
  });

  describe('backupSession()', () => {
    it('uploads each JSONL file from the session dir', async () => {
      mockReaddir.mockResolvedValueOnce(['turn-1.jsonl', 'turn-2.jsonl', 'notes.txt'] as unknown as string[]);
      mockReadFile.mockResolvedValue(Buffer.from('{"msg": "test"}'));
      mockSend.mockResolvedValue({});

      await backupSession('session-abc', '/tmp/sessions/session-abc');

      // Should have called put for each jsonl file (2 files → 2 send calls)
      const putCalls = mockSend.mock.calls.filter((c) => {
        const cmd = c[0] as { input: Record<string, unknown> };
        return cmd.input.Key !== undefined;
      });
      expect(putCalls.length).toBe(2);
      const keys = putCalls.map((c) => (c[0] as { input: Record<string, unknown> }).input.Key as string);
      expect(keys.some((k) => k.includes('turn-1.jsonl'))).toBe(true);
      expect(keys.some((k) => k.includes('turn-2.jsonl'))).toBe(true);
      // notes.txt should NOT be uploaded
      expect(keys.some((k) => k.includes('notes.txt'))).toBe(false);
    });

    it('skips upload when S3_BUCKET is empty', async () => {
      const original = config.S3_BUCKET;
      (config as Record<string, unknown>).S3_BUCKET = '';

      await backupSession('session-xyz', '/tmp/sessions/session-xyz');

      expect(mockSend).not.toHaveBeenCalled();

      (config as Record<string, unknown>).S3_BUCKET = original;
    });

    it('resolves without throwing when S3 upload fails', async () => {
      mockReaddir.mockResolvedValueOnce(['session.jsonl'] as unknown as string[]);
      mockReadFile.mockResolvedValueOnce(Buffer.from('data'));
      mockSend.mockRejectedValueOnce(new Error('S3 connection refused'));

      await expect(backupSession('session-fail', '/tmp/sessions/session-fail')).resolves.toBeUndefined();
    });

    it('resolves without throwing when readdir fails', async () => {
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(backupSession('session-gone', '/tmp/sessions/session-gone')).resolves.toBeUndefined();
    });

    it('records error in backup status after failure', async () => {
      mockReaddir.mockResolvedValueOnce(['session.jsonl'] as unknown as string[]);
      mockReadFile.mockResolvedValueOnce(Buffer.from('data'));
      mockSend.mockRejectedValueOnce(new Error('network timeout'));

      await backupSession('session-err', '/tmp/sessions/session-err');

      const status = getBackupStatus();
      expect(status.error).toContain('network timeout');
    });
  });

  describe('backupDatabase()', () => {
    it('uploads the DB file with a timestamped key under db/', async () => {
      mockReadFile.mockResolvedValueOnce(Buffer.from('sqlite'));
      mockSend.mockResolvedValueOnce({});

      await backupDatabase('/tmp/messages.db');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const [cmd] = mockSend.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect((cmd.input.Key as string).startsWith('hq-cloud/teams/default/db/messages-')).toBe(true);
      expect((cmd.input.Key as string).endsWith('.db')).toBe(true);
    });

    it('skips when S3_BUCKET is empty', async () => {
      const original = config.S3_BUCKET;
      (config as Record<string, unknown>).S3_BUCKET = '';

      await backupDatabase('/tmp/messages.db');
      expect(mockSend).not.toHaveBeenCalled();

      (config as Record<string, unknown>).S3_BUCKET = original;
    });

    it('resolves without throwing on S3 error', async () => {
      mockReadFile.mockResolvedValueOnce(Buffer.from('sqlite'));
      mockSend.mockRejectedValueOnce(new Error('S3 throttled'));

      await expect(backupDatabase('/tmp/messages.db')).resolves.toBeUndefined();
    });
  });

  describe('getBackupStatus()', () => {
    it('returns enabled:true when S3_BUCKET is set', () => {
      const status = getBackupStatus();
      // config.S3_BUCKET is 'test-bucket' in mock
      expect(status.enabled).toBe(true);
    });

    it('returns the s3Prefix from config', () => {
      const status = getBackupStatus();
      expect(status.s3Prefix).toBe('hq-cloud');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// hydrate.ts
// ═════════════════════════════════════════════════════════════════════════════

describe('hydrate.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetS3Client();
    // Default: data/ is empty (no sessions dir, no db)
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips hydration when S3_BUCKET is empty', async () => {
    const original = config.S3_BUCKET;
    (config as Record<string, unknown>).S3_BUCKET = '';

    await hydrateIfNeeded();

    expect(mockSend).not.toHaveBeenCalled();

    (config as Record<string, unknown>).S3_BUCKET = original;
  });

  it('skips hydration when local data/ already has sessions dir', async () => {
    mockExistsSync.mockReturnValue(true); // sessions dir exists

    await hydrateIfNeeded();

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('downloads the latest DB snapshot when data/ is empty', async () => {
    const now = new Date();
    mockExistsSync.mockReturnValue(false);

    // Promise.all runs db/sessions/groups concurrently so we can't rely on
    // sequential mockSend ordering. Use mockResolvedValue (applies to all calls)
    // and distinguish list vs get by the command type.
    mockSend.mockImplementation((cmd: { input: Record<string, unknown> }) => {
      const key = cmd.input.Key as string | undefined;
      if (key !== undefined) {
        // GetObjectCommand (has Key, no Prefix)
        return Promise.resolve({ Body: makeStream([Buffer.from('sqlite-data')]) });
      }
      const prefix = cmd.input.Prefix as string | undefined;
      if (prefix?.includes('/db/')) {
        return Promise.resolve({
          Contents: [{ Key: 'hq-cloud/teams/default/db/messages-2026-01-01.db', Size: 1000, LastModified: now }],
          IsTruncated: false,
        });
      }
      // sessions/ and groups/ are empty
      return Promise.resolve({ Contents: [], IsTruncated: false });
    });

    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    await hydrateIfNeeded();

    // writeFile should have been called at least once (for the DB snapshot)
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('downloads session files when data/ is empty', async () => {
    const now = new Date();
    mockExistsSync.mockReturnValue(false);

    mockSend.mockImplementation((cmd: { input: Record<string, unknown> }) => {
      const key = cmd.input.Key as string | undefined;
      if (key !== undefined) {
        // GetObjectCommand — return session file body
        return Promise.resolve({ Body: makeStream([Buffer.from('{"line":1}')]) });
      }
      const prefix = cmd.input.Prefix as string | undefined;
      if (prefix?.includes('/sessions/')) {
        return Promise.resolve({
          Contents: [{ Key: 'hq-cloud/teams/default/sessions/sess-1/turn-1.jsonl', Size: 100, LastModified: now }],
          IsTruncated: false,
        });
      }
      return Promise.resolve({ Contents: [], IsTruncated: false });
    });

    await hydrateIfNeeded();

    // writeFile called once for the session file
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('resolves without throwing when S3 list fails', async () => {
    mockExistsSync.mockReturnValue(false);
    mockSend.mockRejectedValue(new Error('S3 unavailable'));

    await expect(hydrateIfNeeded()).resolves.toBeUndefined();
  });

  it('resolves without throwing when DB download fails', async () => {
    const now = new Date();
    mockExistsSync.mockReturnValue(false);

    mockSend.mockImplementation((cmd: { input: Record<string, unknown> }) => {
      const key = cmd.input.Key as string | undefined;
      if (key !== undefined) {
        // GetObjectCommand — simulate failure
        return Promise.reject(new Error('GetObject failed'));
      }
      const prefix = cmd.input.Prefix as string | undefined;
      if (prefix?.includes('/db/')) {
        return Promise.resolve({
          Contents: [{ Key: 'hq-cloud/teams/default/db/snap.db', Size: 500, LastModified: now }],
          IsTruncated: false,
        });
      }
      return Promise.resolve({ Contents: [], IsTruncated: false });
    });

    await expect(hydrateIfNeeded()).resolves.toBeUndefined();
  });
});
