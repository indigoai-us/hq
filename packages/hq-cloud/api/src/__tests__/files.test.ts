import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../index.js';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));

// Mock MongoDB — routes don't directly use mongo but buildApp tries to connect
vi.mock('../db/mongo.js', () => ({
  connectMongo: vi.fn().mockResolvedValue({}),
  disconnectMongo: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue({}),
  resetMongo: vi.fn(),
}));

// Mock user-settings (required by settings routes loaded in buildApp)
vi.mock('../data/user-settings.js', () => ({
  getUserSettings: vi.fn().mockResolvedValue(null),
  createUserSettings: vi.fn().mockResolvedValue({}),
  updateUserSettings: vi.fn().mockResolvedValue({}),
  isOnboarded: vi.fn().mockResolvedValue(false),
  setClaudeToken: vi.fn(),
  hasClaudeToken: vi.fn().mockResolvedValue(false),
  removeClaudeToken: vi.fn(),
  getDecryptedClaudeToken: vi.fn().mockResolvedValue(null),
  ensureUserSettingsIndexes: vi.fn().mockResolvedValue(undefined),
}));

// Mock initial-sync (required by settings routes)
vi.mock('../data/initial-sync.js', () => ({
  provisionS3Space: vi.fn().mockResolvedValue({ s3Prefix: 'test/hq', totalFiles: 0 }),
  uploadWithProgress: vi.fn().mockResolvedValue({ s3Prefix: 'test/hq', filesUploaded: 0, errors: 0 }),
  provisionAndSync: vi.fn().mockResolvedValue({ s3Prefix: 'test/hq', filesUploaded: 0, errors: 0 }),
}));

// Mock sessions and session-messages (required by buildApp)
vi.mock('../data/sessions.js', () => ({
  ensureSessionIndexes: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../data/session-messages.js', () => ({
  ensureSessionMessageIndexes: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock file-proxy module ─────────────────────────────────────────

const mockUploadFile = vi.fn();
const mockDownloadFile = vi.fn();
const mockListFiles = vi.fn();
const mockSyncDiff = vi.fn();
const mockGetStorageQuota = vi.fn();

vi.mock('../data/file-proxy.js', () => {
  class FileProxyError extends Error {
    public readonly statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'FileProxyError';
      this.statusCode = statusCode;
    }
  }

  return {
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
    listFiles: (...args: unknown[]) => mockListFiles(...args),
    syncDiff: (...args: unknown[]) => mockSyncDiff(...args),
    getStorageQuota: (...args: unknown[]) => mockGetStorageQuota(...args),
    FileProxyError,
  };
});

// ─── Test Helpers ───────────────────────────────────────────────────

interface ErrorResponse {
  error: string;
  message?: string;
}

interface UploadResponse {
  ok: boolean;
  key: string;
  size: number;
  path: string;
}

interface ListResponse {
  prefix: string;
  files: Array<{
    path: string;
    size: number;
    lastModified: string;
    etag: string;
  }>;
  truncated: boolean;
  nextContinuationToken?: string;
}

interface SyncResponse {
  needsUpload: string[];
  needsDownload: string[];
  inSync: string[];
  remoteOnly: string[];
  summary: {
    upload: number;
    download: number;
    inSync: number;
    remoteOnly: number;
  };
}

interface QuotaResponse {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('File Proxy Routes', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /api/files/upload ─────────────────────────────────────

  describe('POST /api/files/upload', () => {
    it('should upload a file successfully', async () => {
      mockUploadFile.mockResolvedValue({
        key: 'user_test-user-id/hq/knowledge/test.md',
        size: 13,
      });

      const content = Buffer.from('Hello, World!').toString('base64');

      const response = await fetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          path: 'knowledge/test.md',
          content,
          contentType: 'text/markdown',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as UploadResponse;
      expect(data.ok).toBe(true);
      expect(data.path).toBe('knowledge/test.md');
      expect(data.size).toBe(13);

      expect(mockUploadFile).toHaveBeenCalledWith({
        userId: 'test-user-id',
        relativePath: 'knowledge/test.md',
        body: expect.any(Buffer),
        contentType: 'text/markdown',
      });
    });

    it('should reject missing path', async () => {
      const content = Buffer.from('test').toString('base64');

      const response = await fetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ content }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('path');
    });

    it('should reject missing content', async () => {
      const response = await fetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ path: 'test.md' }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('content');
    });

    it('should reject empty content', async () => {
      const response = await fetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ path: 'test.md', content: '' }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 413 when quota is exceeded', async () => {
      // Import the FileProxyError from the mock
      const { FileProxyError } = await import('../data/file-proxy.js');
      mockUploadFile.mockRejectedValue(
        new FileProxyError(413, 'Storage quota exceeded')
      );

      const content = Buffer.from('data').toString('base64');

      const response = await fetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ path: 'big-file.bin', content }),
      });

      expect(response.status).toBe(413);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Quota Exceeded');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${baseUrl}/api/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'test.md', content: 'dGVzdA==' }),
      });

      expect(response.status).toBe(401);
    });
  });

  // ─── GET /api/files/download ────────────────────────────────────

  describe('GET /api/files/download', () => {
    it('should download a file successfully', async () => {
      const fileContent = 'Hello, World!';
      const { Readable } = await import('node:stream');
      const readable = Readable.from([fileContent]);

      mockDownloadFile.mockResolvedValue({
        body: readable,
        contentType: 'text/markdown',
        contentLength: fileContent.length,
        lastModified: new Date('2026-01-15T10:00:00Z'),
      });

      const response = await fetch(
        `${baseUrl}/api/files/download?path=knowledge/test.md`,
        { headers: { Authorization: 'Bearer test-clerk-jwt' } }
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/markdown');

      const body = await response.text();
      expect(body).toBe('Hello, World!');

      expect(mockDownloadFile).toHaveBeenCalledWith({
        userId: 'test-user-id',
        relativePath: 'knowledge/test.md',
      });
    });

    it('should return 404 for nonexistent file', async () => {
      const { FileProxyError } = await import('../data/file-proxy.js');
      mockDownloadFile.mockRejectedValue(
        new FileProxyError(404, 'File not found: nonexistent.md')
      );

      const response = await fetch(
        `${baseUrl}/api/files/download?path=nonexistent.md`,
        { headers: { Authorization: 'Bearer test-clerk-jwt' } }
      );

      expect(response.status).toBe(404);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
    });

    it('should reject missing path parameter', async () => {
      const response = await fetch(`${baseUrl}/api/files/download`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('path');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${baseUrl}/api/files/download?path=test.md`);
      expect(response.status).toBe(401);
    });
  });

  // ─── GET /api/files/list ────────────────────────────────────────

  describe('GET /api/files/list', () => {
    it('should list files at root prefix', async () => {
      mockListFiles.mockResolvedValue({
        prefix: '',
        files: [
          { path: 'knowledge/test.md', size: 100, lastModified: '2026-01-15T10:00:00.000Z', etag: 'abc123' },
          { path: 'projects/prd.json', size: 500, lastModified: '2026-01-14T09:00:00.000Z', etag: 'def456' },
        ],
        truncated: false,
      });

      const response = await fetch(`${baseUrl}/api/files/list`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ListResponse;
      expect(data.files).toHaveLength(2);
      expect(data.truncated).toBe(false);
      expect(data.files[0]?.path).toBe('knowledge/test.md');
    });

    it('should list files with prefix filter', async () => {
      mockListFiles.mockResolvedValue({
        prefix: 'knowledge',
        files: [
          { path: 'knowledge/test.md', size: 100, lastModified: '2026-01-15T10:00:00.000Z', etag: 'abc123' },
        ],
        truncated: false,
      });

      const response = await fetch(`${baseUrl}/api/files/list?prefix=knowledge`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ListResponse;
      expect(data.files).toHaveLength(1);

      expect(mockListFiles).toHaveBeenCalledWith({
        userId: 'test-user-id',
        prefix: 'knowledge',
        maxKeys: undefined,
        continuationToken: undefined,
      });
    });

    it('should support pagination via continuationToken', async () => {
      mockListFiles.mockResolvedValue({
        prefix: '',
        files: [{ path: 'page2.md', size: 50, lastModified: '2026-01-15T10:00:00.000Z', etag: 'xyz' }],
        truncated: false,
      });

      const response = await fetch(
        `${baseUrl}/api/files/list?maxKeys=10&continuationToken=sometoken`,
        { headers: { Authorization: 'Bearer test-clerk-jwt' } }
      );

      expect(response.status).toBe(200);
      expect(mockListFiles).toHaveBeenCalledWith({
        userId: 'test-user-id',
        prefix: undefined,
        maxKeys: 10,
        continuationToken: 'sometoken',
      });
    });

    it('should require authentication', async () => {
      const response = await fetch(`${baseUrl}/api/files/list`);
      expect(response.status).toBe(401);
    });
  });

  // ─── POST /api/files/sync ──────────────────────────────────────

  describe('POST /api/files/sync', () => {
    it('should return sync diff for a manifest', async () => {
      mockSyncDiff.mockResolvedValue({
        needsUpload: ['new-file.md'],
        needsDownload: ['remote-only.md'],
        inSync: ['unchanged.md'],
        remoteOnly: ['remote-only.md'],
      });

      const manifest = [
        { path: 'new-file.md', hash: 'abc123', size: 100 },
        { path: 'unchanged.md', hash: 'def456', size: 200 },
      ];

      const response = await fetch(`${baseUrl}/api/files/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ manifest }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SyncResponse;
      expect(data.needsUpload).toEqual(['new-file.md']);
      expect(data.needsDownload).toEqual(['remote-only.md']);
      expect(data.inSync).toEqual(['unchanged.md']);
      expect(data.summary.upload).toBe(1);
      expect(data.summary.download).toBe(1);
      expect(data.summary.inSync).toBe(1);
    });

    it('should handle empty manifest (fresh sync)', async () => {
      mockSyncDiff.mockResolvedValue({
        needsUpload: [],
        needsDownload: ['existing1.md', 'existing2.md'],
        inSync: [],
        remoteOnly: ['existing1.md', 'existing2.md'],
      });

      const response = await fetch(`${baseUrl}/api/files/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ manifest: [] }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SyncResponse;
      expect(data.needsDownload).toHaveLength(2);
      expect(data.summary.download).toBe(2);
    });

    it('should reject missing manifest', async () => {
      const response = await fetch(`${baseUrl}/api/files/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('manifest');
    });

    it('should reject non-array manifest', async () => {
      const response = await fetch(`${baseUrl}/api/files/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ manifest: 'not-an-array' }),
      });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${baseUrl}/api/files/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: [] }),
      });

      expect(response.status).toBe(401);
    });
  });

  // ─── GET /api/files/quota ──────────────────────────────────────

  describe('GET /api/files/quota', () => {
    it('should return quota information', async () => {
      mockGetStorageQuota.mockResolvedValue({
        usedBytes: 1024 * 1024 * 50, // 50 MB
        limitBytes: 1024 * 1024 * 500, // 500 MB
        remainingBytes: 1024 * 1024 * 450, // 450 MB
      });

      const response = await fetch(`${baseUrl}/api/files/quota`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as QuotaResponse;
      expect(data.usedBytes).toBe(1024 * 1024 * 50);
      expect(data.limitBytes).toBe(1024 * 1024 * 500);
      expect(data.remainingBytes).toBe(1024 * 1024 * 450);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${baseUrl}/api/files/quota`);
      expect(response.status).toBe(401);
    });
  });
});

// ─── Unit tests for file-proxy service functions ────────────────────

describe('File Proxy Service - validatePath', () => {
  // Import the real validatePath (not mocked)
  // We need to use dynamic import to get around vi.mock
  it('should reject paths with directory traversal', async () => {
    // We test validation indirectly through the routes, but also
    // test the validatePath function directly
    const { validatePath } = await vi.importActual<typeof import('../data/file-proxy.js')>('../data/file-proxy.js');

    expect(validatePath('../etc/passwd').valid).toBe(false);
    expect(validatePath('foo/../../bar').valid).toBe(false);
    expect(validatePath('..').valid).toBe(false);
  });

  it('should reject absolute paths', async () => {
    const { validatePath } = await vi.importActual<typeof import('../data/file-proxy.js')>('../data/file-proxy.js');

    expect(validatePath('/etc/passwd').valid).toBe(false);
  });

  it('should accept valid relative paths', async () => {
    const { validatePath } = await vi.importActual<typeof import('../data/file-proxy.js')>('../data/file-proxy.js');

    expect(validatePath('knowledge/test.md').valid).toBe(true);
    expect(validatePath('projects/prd.json').valid).toBe(true);
    expect(validatePath('workers/dev-team/backend-dev/worker.yaml').valid).toBe(true);
  });

  it('should reject empty paths', async () => {
    const { validatePath } = await vi.importActual<typeof import('../data/file-proxy.js')>('../data/file-proxy.js');

    expect(validatePath('').valid).toBe(false);
    // @ts-expect-error testing invalid input
    expect(validatePath(null).valid).toBe(false);
    // @ts-expect-error testing invalid input
    expect(validatePath(undefined).valid).toBe(false);
  });
});

describe('File Proxy Service - getUserPrefix', () => {
  it('should build correct user prefix', async () => {
    const { getUserPrefix } = await vi.importActual<typeof import('../data/file-proxy.js')>('../data/file-proxy.js');

    expect(getUserPrefix('user123')).toBe('user123/hq/');
    expect(getUserPrefix('user_clerk123')).toBe('user_clerk123/hq/');
    expect(getUserPrefix('clerk-abc')).toBe('user_clerk-abc/hq/');
  });
});

describe('File Proxy Service - getUserFileKey', () => {
  it('should build correct S3 key', async () => {
    const { getUserFileKey } = await vi.importActual<typeof import('../data/file-proxy.js')>('../data/file-proxy.js');

    expect(getUserFileKey('user123', 'knowledge/test.md')).toBe('user123/hq/knowledge/test.md');
  });

  it('should normalize Windows-style paths', async () => {
    const { getUserFileKey } = await vi.importActual<typeof import('../data/file-proxy.js')>('../data/file-proxy.js');

    expect(getUserFileKey('user123', 'knowledge\\test.md')).toBe('user123/hq/knowledge/test.md');
  });

  it('should strip leading slashes', async () => {
    const { getUserFileKey } = await vi.importActual<typeof import('../data/file-proxy.js')>('../data/file-proxy.js');

    expect(getUserFileKey('user123', '/knowledge/test.md')).toBe('user123/hq/knowledge/test.md');
  });
});
