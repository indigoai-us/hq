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

// Mock MongoDB — no real DB needed
vi.mock('../db/mongo.js', () => ({
  connectMongo: vi.fn().mockResolvedValue({}),
  disconnectMongo: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue({}),
  resetMongo: vi.fn(),
}));

// Mock sessions and session-messages (required by buildApp)
vi.mock('../data/sessions.js', () => ({
  ensureSessionIndexes: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../data/session-messages.js', () => ({
  ensureSessionMessageIndexes: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock user-settings with controllable store ──────────────────────

const settingsStore = new Map<string, Record<string, unknown>>();

vi.mock('../data/user-settings.js', () => ({
  getUserSettings: vi.fn().mockImplementation(async (userId: string) => {
    return settingsStore.get(userId) ?? null;
  }),
  createUserSettings: vi.fn().mockImplementation(async (userId: string, input: { hqDir: string; s3Prefix?: string }) => {
    const settings = {
      clerkUserId: userId,
      hqDir: input.hqDir,
      s3Prefix: input.s3Prefix ?? null,
      notifications: {
        enabled: true,
        questionsEnabled: true,
        permissionsEnabled: true,
        statusUpdatesEnabled: true,
      },
      claudeTokenEncrypted: null,
      claudeTokenSetAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    settingsStore.set(userId, settings);
    return settings;
  }),
  updateUserSettings: vi.fn().mockResolvedValue(null),
  isOnboarded: vi.fn().mockResolvedValue(false),
  setClaudeToken: vi.fn(),
  hasClaudeToken: vi.fn().mockResolvedValue(false),
  removeClaudeToken: vi.fn(),
  getDecryptedClaudeToken: vi.fn().mockResolvedValue(null),
  ensureUserSettingsIndexes: vi.fn().mockResolvedValue(undefined),
  provisionS3Prefix: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock file-proxy with controllable listFiles ─────────────────────

const mockListFiles = vi.fn();

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
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    listFiles: (...args: unknown[]) => mockListFiles(...args),
    syncDiff: vi.fn(),
    getStorageQuota: vi.fn(),
    getStorageUsage: vi.fn(),
    getUserPrefix: vi.fn().mockImplementation((userId: string) => `${userId}/hq/`),
    getUserFileKey: vi.fn(),
    validatePath: vi.fn().mockReturnValue({ valid: true }),
    resetS3Client: vi.fn(),
    FileProxyError,
  };
});

// ─── Types ───────────────────────────────────────────────────────────

interface SetupStatusResponse {
  setupComplete: boolean;
  s3Prefix: string | null;
  fileCount: number;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

// ─── Tests (no MongoDB) ─────────────────────────────────────────────

describe('GET /api/auth/setup-status (no MongoDB)', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    settingsStore.clear();
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

  it('should return setupComplete=false when MongoDB is not configured', async () => {
    const response = await fetch(`${baseUrl}/api/auth/setup-status`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as SetupStatusResponse;
    expect(data.setupComplete).toBe(false);
    expect(data.s3Prefix).toBeNull();
    expect(data.fileCount).toBe(0);
  });

  it('should return 401 for unauthenticated requests', async () => {
    const response = await fetch(`${baseUrl}/api/auth/setup-status`);

    expect(response.status).toBe(401);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe('Unauthorized');
  });
});

// ─── Tests (with MongoDB mocked) ────────────────────────────────────

describe('GET /api/auth/setup-status (with MongoDB)', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let originalMongodbUri: string;

  beforeEach(async () => {
    const { config } = await import('../config.js');
    originalMongodbUri = config.mongodbUri;
    (config as { mongodbUri: string }).mongodbUri = 'mongodb://localhost:27017/test';

    settingsStore.clear();
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
    const { config } = await import('../config.js');
    (config as { mongodbUri: string }).mongodbUri = originalMongodbUri;
  });

  it('should return setupComplete=false when user has no settings', async () => {
    // No settings in store — getUserSettings returns null

    const response = await fetch(`${baseUrl}/api/auth/setup-status`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as SetupStatusResponse;
    expect(data.setupComplete).toBe(false);
    expect(data.s3Prefix).toBeNull();
    expect(data.fileCount).toBe(0);
  });

  it('should return setupComplete=false when s3Prefix is null', async () => {
    // User exists but s3Prefix was never set
    settingsStore.set('test-user-id', {
      clerkUserId: 'test-user-id',
      hqDir: 'C:\\hq',
      s3Prefix: null,
      notifications: { enabled: true },
    });

    const response = await fetch(`${baseUrl}/api/auth/setup-status`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as SetupStatusResponse;
    expect(data.setupComplete).toBe(false);
    expect(data.s3Prefix).toBeNull();
    expect(data.fileCount).toBe(0);
  });

  it('should return setupComplete=false when s3Prefix is set but no files exist', async () => {
    settingsStore.set('test-user-id', {
      clerkUserId: 'test-user-id',
      hqDir: 'C:\\hq',
      s3Prefix: 'test-user-id/hq/',
      notifications: { enabled: true },
    });

    // S3 returns empty file list
    mockListFiles.mockResolvedValue({
      prefix: '',
      files: [],
      truncated: false,
    });

    const response = await fetch(`${baseUrl}/api/auth/setup-status`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as SetupStatusResponse;
    expect(data.setupComplete).toBe(false);
    expect(data.s3Prefix).toBe('test-user-id/hq/');
    expect(data.fileCount).toBe(0);
  });

  it('should return setupComplete=true when s3Prefix is set AND files exist', async () => {
    settingsStore.set('test-user-id', {
      clerkUserId: 'test-user-id',
      hqDir: 'C:\\hq',
      s3Prefix: 'test-user-id/hq/',
      notifications: { enabled: true },
    });

    // S3 returns at least one file
    mockListFiles.mockResolvedValue({
      prefix: '',
      files: [
        { path: 'INDEX.md', size: 512, lastModified: '2026-02-19T10:00:00.000Z', etag: 'abc123' },
      ],
      truncated: false,
    });

    const response = await fetch(`${baseUrl}/api/auth/setup-status`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as SetupStatusResponse;
    expect(data.setupComplete).toBe(true);
    expect(data.s3Prefix).toBe('test-user-id/hq/');
    expect(data.fileCount).toBe(1);
  });

  it('should return setupComplete=false when S3 list fails', async () => {
    settingsStore.set('test-user-id', {
      clerkUserId: 'test-user-id',
      hqDir: 'C:\\hq',
      s3Prefix: 'test-user-id/hq/',
      notifications: { enabled: true },
    });

    // S3 throws an error (e.g., credentials issue)
    mockListFiles.mockRejectedValue(new Error('S3 access denied'));

    const response = await fetch(`${baseUrl}/api/auth/setup-status`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as SetupStatusResponse;
    expect(data.setupComplete).toBe(false);
    expect(data.s3Prefix).toBe('test-user-id/hq/');
    expect(data.fileCount).toBe(0);
  });

  it('should return 401 for unauthenticated requests', async () => {
    const response = await fetch(`${baseUrl}/api/auth/setup-status`);

    expect(response.status).toBe(401);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe('Unauthorized');
  });

  it('should call listFiles with maxKeys=1 for efficiency', async () => {
    settingsStore.set('test-user-id', {
      clerkUserId: 'test-user-id',
      hqDir: 'C:\\hq',
      s3Prefix: 'test-user-id/hq/',
      notifications: { enabled: true },
    });

    mockListFiles.mockResolvedValue({
      prefix: '',
      files: [
        { path: 'INDEX.md', size: 512, lastModified: '2026-02-19T10:00:00.000Z', etag: 'abc123' },
      ],
      truncated: true,
    });

    await fetch(`${baseUrl}/api/auth/setup-status`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(mockListFiles).toHaveBeenCalledWith({
      userId: 'test-user-id',
      maxKeys: 1,
    });
  });

  it('should handle truncated results (many files) correctly', async () => {
    settingsStore.set('test-user-id', {
      clerkUserId: 'test-user-id',
      hqDir: 'C:\\hq',
      s3Prefix: 'test-user-id/hq/',
      notifications: { enabled: true },
    });

    // Truncated means there are more files than maxKeys
    mockListFiles.mockResolvedValue({
      prefix: '',
      files: [
        { path: 'INDEX.md', size: 512, lastModified: '2026-02-19T10:00:00.000Z', etag: 'abc123' },
      ],
      truncated: true,
    });

    const response = await fetch(`${baseUrl}/api/auth/setup-status`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as SetupStatusResponse;
    expect(data.setupComplete).toBe(true);
    expect(data.fileCount).toBe(1);
  });
});
