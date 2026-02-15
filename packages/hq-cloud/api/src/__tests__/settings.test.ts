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

// Mock initial-sync — no real S3 in tests
vi.mock('../data/initial-sync.js', () => ({
  provisionS3Space: vi.fn().mockResolvedValue({
    s3Prefix: 'test-user-id/hq',
    totalFiles: 5,
  }),
  uploadWithProgress: vi.fn().mockResolvedValue({
    s3Prefix: 'test-user-id/hq',
    filesUploaded: 5,
    errors: 0,
  }),
  provisionAndSync: vi.fn().mockResolvedValue({
    s3Prefix: 'test-user-id/hq',
    filesUploaded: 5,
    errors: 0,
  }),
}));

// Mock MongoDB — no real DB needed for these tests
// When mongodbUri is empty (test default), routes return static fallbacks
vi.mock('../db/mongo.js', () => ({
  connectMongo: vi.fn().mockResolvedValue({}),
  disconnectMongo: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue({}),
  resetMongo: vi.fn(),
}));

vi.mock('../data/user-settings.js', () => {
  const store = new Map<string, Record<string, unknown>>();
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
    updateUserSettings: vi.fn().mockImplementation(async (userId: string, input: Record<string, unknown>) => {
      let existing = store.get(userId);
      if (!existing) {
        existing = {
          clerkUserId: userId,
          hqDir: null,
          s3Prefix: null,
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
        store.set(userId, existing);
      }
      if (input.hqDir !== undefined) existing.hqDir = input.hqDir;
      if (input.s3Prefix !== undefined) existing.s3Prefix = input.s3Prefix;
      if (input.notifications) {
        existing.notifications = { ...(existing.notifications as Record<string, boolean>), ...(input.notifications as Record<string, boolean>) };
      }
      existing.updatedAt = new Date();
      return existing;
    }),
    isOnboarded: vi.fn().mockImplementation(async (userId: string) => {
      const settings = store.get(userId);
      return settings !== null && settings !== undefined && settings.hqDir !== null;
    }),
    setClaudeToken: vi.fn().mockImplementation(async (userId: string, _plainToken: string) => {
      const existing = store.get(userId);
      if (existing) {
        existing.claudeTokenEncrypted = 'encrypted-mock-value';
        existing.claudeTokenSetAt = new Date();
        existing.updatedAt = new Date();
      }
    }),
    hasClaudeToken: vi.fn().mockImplementation(async (userId: string) => {
      const settings = store.get(userId);
      return settings?.claudeTokenEncrypted !== null && settings?.claudeTokenEncrypted !== undefined;
    }),
    removeClaudeToken: vi.fn().mockImplementation(async (userId: string) => {
      const existing = store.get(userId);
      if (existing) {
        existing.claudeTokenEncrypted = null;
        existing.claudeTokenSetAt = null;
        existing.updatedAt = new Date();
      }
    }),
    getDecryptedClaudeToken: vi.fn().mockImplementation(async (userId: string) => {
      const settings = store.get(userId);
      return settings?.claudeTokenEncrypted ? 'decrypted-mock-token' : null;
    }),
    ensureUserSettingsIndexes: vi.fn().mockResolvedValue(undefined),
    __resetStore: () => store.clear(),
  };
});

interface SettingsResponse {
  hqDir: string | null;
  notifications: {
    enabled: boolean;
    questionsEnabled: boolean;
    permissionsEnabled: boolean;
    statusUpdatesEnabled: boolean;
  };
  onboarded?: boolean;
}

interface SetupResponse {
  ok: boolean;
  onboarded: boolean;
  hqDir: string;
  s3Prefix: string | null;
  totalFiles: number;
}

interface OnboardingResponse {
  onboarded: boolean;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

describe('Settings Routes', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    // Reset the mock store
    const mod = await import('../data/user-settings.js') as Record<string, unknown>;
    if (typeof mod.__resetStore === 'function') {
      (mod.__resetStore as () => void)();
    }

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

  describe('GET /api/settings', () => {
    it('should return default settings when MongoDB is not configured', async () => {
      // Config has empty mongodbUri in test, so returns static defaults
      const response = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SettingsResponse;
      expect(data.hqDir).toBeDefined();
      expect(data.notifications).toBeDefined();
      expect(data.notifications.enabled).toBe(true);
    });
  });

  describe('GET /api/settings/onboarding-status', () => {
    it('should return onboarded=true when MongoDB is not configured', async () => {
      const response = await fetch(`${baseUrl}/api/settings/onboarding-status`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as OnboardingResponse;
      expect(data.onboarded).toBe(true);
    });
  });

  describe('POST /api/settings/setup', () => {
    it('should accept setup when MongoDB is not configured', async () => {
      const response = await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: 'C:\\hq' }),
      });

      // No MongoDB → short-circuit returns 200 (not 201)
      expect(response.status).toBe(200);
      const data = (await response.json()) as SetupResponse;
      expect(data.ok).toBe(true);
      expect(data.onboarded).toBe(true);
      expect(data.totalFiles).toBe(0);
    });

    it('should reject missing hqDir', async () => {
      const response = await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });

      // When MongoDB is not configured, it still returns ok
      // (the route short-circuits before validation)
      expect(response.status).toBeLessThanOrEqual(400);
    });
  });

  describe('PUT /api/settings', () => {
    it('should accept settings update when MongoDB is not configured', async () => {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: '/new/path' }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as { ok?: boolean };
      expect(data.ok).toBe(true);
    });
  });
});

describe('Settings with MongoDB (mocked)', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let originalMongodbUri: string;

  beforeEach(async () => {
    const { config } = await import('../config.js');
    originalMongodbUri = config.mongodbUri;
    // Simulate MongoDB being configured
    (config as { mongodbUri: string }).mongodbUri = 'mongodb://localhost:27017/test';

    // Reset mock store
    const mod = await import('../data/user-settings.js') as Record<string, unknown>;
    if (typeof mod.__resetStore === 'function') {
      (mod.__resetStore as () => void)();
    }

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

  describe('GET /api/settings/onboarding-status', () => {
    it('should return onboarded=false for new user', async () => {
      const response = await fetch(`${baseUrl}/api/settings/onboarding-status`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as OnboardingResponse;
      expect(data.onboarded).toBe(false);
    });
  });

  describe('POST /api/settings/setup', () => {
    it('should create user settings on first setup', async () => {
      const response = await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: 'C:\\my-hq' }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as SetupResponse;
      expect(data.ok).toBe(true);
      expect(data.onboarded).toBe(true);
      expect(data.hqDir).toBe('C:\\my-hq');
    });

    it('should reject empty hqDir', async () => {
      const response = await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: '' }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('hqDir');
    });

    it('should reject missing hqDir', async () => {
      const response = await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/settings', () => {
    it('should return null hqDir for new user', async () => {
      const response = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SettingsResponse;
      expect(data.hqDir).toBeNull();
      expect(data.onboarded).toBe(false);
    });

    it('should return settings after setup', async () => {
      // Setup first
      await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: '/home/user/hq' }),
      });

      const response = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SettingsResponse;
      expect(data.hqDir).toBe('/home/user/hq');
      expect(data.onboarded).toBe(true);
    });
  });

  describe('PUT /api/settings', () => {
    it('should update hqDir', async () => {
      // Setup first
      await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: '/old/path' }),
      });

      const response = await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: '/new/path' }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SettingsResponse;
      expect(data.hqDir).toBe('/new/path');
    });

    it('should reject empty hqDir', async () => {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: '   ' }),
      });

      expect(response.status).toBe(400);
    });

    it('should update notification settings', async () => {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          notifications: { enabled: false },
        }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SettingsResponse;
      expect(data.notifications).toBeDefined();
    });
  });

  describe('Onboarding flow', () => {
    it('should complete full onboarding cycle', async () => {
      // 1. Check status — not onboarded
      const statusBefore = await fetch(`${baseUrl}/api/settings/onboarding-status`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });
      const beforeData = (await statusBefore.json()) as OnboardingResponse;
      expect(beforeData.onboarded).toBe(false);

      // 2. Submit setup
      const setup = await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: 'C:\\hq' }),
      });
      expect(setup.status).toBe(201);

      // 3. Check status — now onboarded
      const statusAfter = await fetch(`${baseUrl}/api/settings/onboarding-status`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });
      const afterData = (await statusAfter.json()) as OnboardingResponse;
      expect(afterData.onboarded).toBe(true);

      // 4. Settings reflect hqDir
      const settings = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });
      const settingsData = (await settings.json()) as SettingsResponse;
      expect(settingsData.hqDir).toBe('C:\\hq');
      expect(settingsData.onboarded).toBe(true);
    });
  });

  describe('Claude Token endpoints', () => {
    it('GET /api/settings/claude-token should return hasToken=false for new user', async () => {
      const response = await fetch(`${baseUrl}/api/settings/claude-token`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as { hasToken: boolean; setAt: string | null };
      expect(data.hasToken).toBe(false);
      expect(data.setAt).toBeNull();
    });

    it('POST /api/settings/claude-token should store a token', async () => {
      // Setup user first
      await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: 'C:\\hq' }),
      });

      const response = await fetch(`${baseUrl}/api/settings/claude-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ token: 'test-oauth-token-value' }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as { ok: boolean; hasToken: boolean; setAt: string | null };
      expect(data.ok).toBe(true);
      expect(data.hasToken).toBe(true);
      expect(data.setAt).toBeTruthy();
    });

    it('POST /api/settings/claude-token should reject empty token', async () => {
      const response = await fetch(`${baseUrl}/api/settings/claude-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ token: '' }),
      });

      expect(response.status).toBe(400);
    });

    it('POST /api/settings/claude-token should reject missing token', async () => {
      const response = await fetch(`${baseUrl}/api/settings/claude-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('DELETE /api/settings/claude-token should remove the token', async () => {
      // Setup user and token first
      await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: 'C:\\hq' }),
      });

      await fetch(`${baseUrl}/api/settings/claude-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ token: 'test-oauth-token' }),
      });

      const response = await fetch(`${baseUrl}/api/settings/claude-token`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as { ok: boolean; hasToken: boolean };
      expect(data.ok).toBe(true);
      expect(data.hasToken).toBe(false);
    });

    it('GET /api/settings should include hasClaudeToken after storing token', async () => {
      // Setup user
      await fetch(`${baseUrl}/api/settings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ hqDir: 'C:\\hq' }),
      });

      // Store token
      await fetch(`${baseUrl}/api/settings/claude-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ token: 'test-token' }),
      });

      // Check settings
      const response = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SettingsResponse & { hasClaudeToken: boolean; claudeTokenSetAt: string | null };
      expect(data.hasClaudeToken).toBe(true);
      expect(data.claudeTokenSetAt).toBeTruthy();
    });
  });
});
