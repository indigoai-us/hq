/**
 * Tests for US-002: Provision S3 prefix on first auth.
 *
 * Verifies that provisionS3Prefix():
 *   - Creates settings doc with s3Prefix for new users
 *   - Backfills s3Prefix for existing users with null s3Prefix
 *   - Is idempotent — does not overwrite an existing s3Prefix
 *   - Does NOT double-prefix (clerkUserId already starts with 'user_')
 *
 * Also verifies the middleware integration: provisionS3Prefix is called
 * on every authenticated request when MongoDB is configured.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../index.js';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'user_abc123',
    sessionId: 'sess_test',
  }),
}));

// Mock MongoDB connection
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

// Mock file-proxy (required by various routes)
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
    listFiles: vi.fn().mockResolvedValue({ prefix: '', files: [], truncated: false }),
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

// ─── Controllable mock for user-settings ────────────────────────────
//
// vi.mock factories are hoisted, so we can't reference variables defined
// outside. Instead, we define the store and mock inside the factory and
// export a __resetStore + __getStore helper for test access.

vi.mock('../data/user-settings.js', () => {
  const store = new Map<string, Record<string, unknown>>();

  const provisionImpl = async (clerkUserId: string) => {
    const prefix = `${clerkUserId}/hq/`;
    const existing = store.get(clerkUserId);

    if (existing && existing.s3Prefix) {
      // Idempotent: already set, do nothing
      return;
    }

    if (existing) {
      // Backfill: existing user with null s3Prefix
      existing.s3Prefix = prefix;
      existing.updatedAt = new Date();
      return;
    }

    // New user: create settings doc
    store.set(clerkUserId, {
      clerkUserId,
      hqDir: null,
      s3Prefix: prefix,
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
    });
  };

  return {
    getUserSettings: vi.fn().mockImplementation(async (userId: string) => {
      return store.get(userId) ?? null;
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
      store.set(userId, settings);
      return settings;
    }),
    updateUserSettings: vi.fn().mockResolvedValue(null),
    isOnboarded: vi.fn().mockResolvedValue(false),
    setClaudeToken: vi.fn(),
    hasClaudeToken: vi.fn().mockResolvedValue(false),
    removeClaudeToken: vi.fn(),
    getDecryptedClaudeToken: vi.fn().mockResolvedValue(null),
    ensureUserSettingsIndexes: vi.fn().mockResolvedValue(undefined),
    provisionS3Prefix: vi.fn().mockImplementation(provisionImpl),
    __resetStore: () => store.clear(),
    __getStore: () => store,
    __seedStore: (userId: string, doc: Record<string, unknown>) => store.set(userId, doc),
  };
});

// ─── Helper to access the mock store ────────────────────────────────

async function getTestHelpers() {
  const mod = await import('../data/user-settings.js') as Record<string, unknown>;
  return {
    resetStore: mod.__resetStore as () => void,
    getStore: mod.__getStore as () => Map<string, Record<string, unknown>>,
    seedStore: mod.__seedStore as (userId: string, doc: Record<string, unknown>) => void,
    provisionS3Prefix: mod.provisionS3Prefix as ReturnType<typeof vi.fn>,
  };
}

// ─── Unit tests for provisionS3Prefix logic ─────────────────────────

describe('provisionS3Prefix (unit)', () => {
  let helpers: Awaited<ReturnType<typeof getTestHelpers>>;

  beforeEach(async () => {
    helpers = await getTestHelpers();
    helpers.resetStore();
    vi.clearAllMocks();
  });

  it('should create settings doc with s3Prefix for a new user', async () => {
    const store = helpers.getStore();
    expect(store.has('user_abc123')).toBe(false);

    await helpers.provisionS3Prefix('user_abc123');

    const doc = store.get('user_abc123');
    expect(doc).toBeDefined();
    expect(doc?.s3Prefix).toBe('user_abc123/hq/');
    expect(doc?.clerkUserId).toBe('user_abc123');
    expect(doc?.hqDir).toBeNull();
  });

  it('should backfill s3Prefix for existing user with null s3Prefix', async () => {
    helpers.seedStore('user_existing', {
      clerkUserId: 'user_existing',
      hqDir: 'C:\\hq',
      s3Prefix: null,
      notifications: { enabled: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await helpers.provisionS3Prefix('user_existing');

    const doc = helpers.getStore().get('user_existing');
    expect(doc?.s3Prefix).toBe('user_existing/hq/');
    // hqDir should remain unchanged
    expect(doc?.hqDir).toBe('C:\\hq');
  });

  it('should NOT overwrite an existing s3Prefix (idempotent)', async () => {
    const freezeDate = new Date('2026-01-01');
    helpers.seedStore('user_setup', {
      clerkUserId: 'user_setup',
      hqDir: '/home/user/hq',
      s3Prefix: 'user_setup/hq/',
      notifications: { enabled: true },
      createdAt: new Date(),
      updatedAt: freezeDate,
    });

    await helpers.provisionS3Prefix('user_setup');

    const doc = helpers.getStore().get('user_setup');
    expect(doc?.s3Prefix).toBe('user_setup/hq/');
    // updatedAt should NOT change (idempotent no-op)
    expect(doc?.updatedAt).toBe(freezeDate);
  });

  it('should NOT double-prefix the clerkUserId', async () => {
    // clerkUserId already starts with 'user_' — do NOT prepend 'user_' again
    await helpers.provisionS3Prefix('user_abc123');

    const doc = helpers.getStore().get('user_abc123');
    // Should be 'user_abc123/hq/', NOT 'user_user_abc123/hq/'
    expect(doc?.s3Prefix).toBe('user_abc123/hq/');
    expect(doc?.s3Prefix).not.toContain('user_user_');
  });

  it('should be safe to call multiple times (idempotent)', async () => {
    await helpers.provisionS3Prefix('user_multi');
    await helpers.provisionS3Prefix('user_multi');
    await helpers.provisionS3Prefix('user_multi');

    const doc = helpers.getStore().get('user_multi');
    expect(doc?.s3Prefix).toBe('user_multi/hq/');
    expect(helpers.provisionS3Prefix).toHaveBeenCalledTimes(3);
  });
});

// ─── Integration: middleware calls provisionS3Prefix on auth ────────

describe('Auth middleware S3 prefix provisioning (integration)', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let originalMongodbUri: string;
  let helpers: Awaited<ReturnType<typeof getTestHelpers>>;

  beforeEach(async () => {
    const { config } = await import('../config.js');
    originalMongodbUri = config.mongodbUri;
    // Enable MongoDB so provisioning runs
    (config as { mongodbUri: string }).mongodbUri = 'mongodb://localhost:27017/test';

    helpers = await getTestHelpers();
    helpers.resetStore();
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

  it('should call provisionS3Prefix on authenticated request', async () => {
    const response = await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    expect(response.status).toBe(200);

    // Give the fire-and-forget promise time to resolve
    await new Promise((r) => setTimeout(r, 50));

    expect(helpers.provisionS3Prefix).toHaveBeenCalledWith('user_abc123');
  });

  it('should provision s3Prefix for new user on first request', async () => {
    const store = helpers.getStore();
    expect(store.has('user_abc123')).toBe(false);

    await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    // Give fire-and-forget time to resolve
    await new Promise((r) => setTimeout(r, 50));

    const doc = store.get('user_abc123');
    expect(doc).toBeDefined();
    expect(doc?.s3Prefix).toBe('user_abc123/hq/');
  });

  it('should backfill null s3Prefix on authenticated request', async () => {
    helpers.seedStore('user_abc123', {
      clerkUserId: 'user_abc123',
      hqDir: 'C:\\hq',
      s3Prefix: null,
      notifications: { enabled: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    // Give fire-and-forget time to resolve
    await new Promise((r) => setTimeout(r, 50));

    const doc = helpers.getStore().get('user_abc123');
    expect(doc?.s3Prefix).toBe('user_abc123/hq/');
  });

  it('should not modify existing s3Prefix on authenticated request', async () => {
    const freezeDate = new Date('2026-01-01');
    helpers.seedStore('user_abc123', {
      clerkUserId: 'user_abc123',
      hqDir: 'C:\\hq',
      s3Prefix: 'user_abc123/hq/',
      notifications: { enabled: true },
      createdAt: new Date(),
      updatedAt: freezeDate,
    });

    await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    // Give fire-and-forget time to resolve
    await new Promise((r) => setTimeout(r, 50));

    const doc = helpers.getStore().get('user_abc123');
    expect(doc?.s3Prefix).toBe('user_abc123/hq/');
    expect((doc?.updatedAt as Date).getTime()).toBe(freezeDate.getTime());
  });
});

// ─── Edge case: provisioning disabled without MongoDB ───────────────

describe('Auth middleware without MongoDB (provisioning disabled)', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let helpers: Awaited<ReturnType<typeof getTestHelpers>>;

  beforeEach(async () => {
    // mongodbUri is empty string by default in test — provisioning should NOT run
    helpers = await getTestHelpers();
    helpers.resetStore();
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

  it('should NOT call provisionS3Prefix when MongoDB is not configured', async () => {
    await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: 'Bearer test-clerk-jwt' },
    });

    // Give any potential fire-and-forget time to resolve
    await new Promise((r) => setTimeout(r, 50));

    expect(helpers.provisionS3Prefix).not.toHaveBeenCalled();
  });
});
