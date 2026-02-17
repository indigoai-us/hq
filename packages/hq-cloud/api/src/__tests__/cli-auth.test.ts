import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'user_clerk123',
    sessionId: 'sess_clerk456',
  }),
}));

// Mock config to include TOKEN_ENCRYPTION_KEY
vi.mock('../config.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../config.js')>();
  return {
    config: {
      ...original.config,
      tokenEncryptionKey: 'test-encryption-key-32-chars-long!!',
    },
  };
});

// Import after mocks are set up
const { buildApp } = await import('../index.js');

interface CliTokenResponse {
  token: string;
  userId: string;
  expiresIn: string;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

interface VerifyResponse {
  valid: boolean;
  userId: string;
  sessionId: string;
}

describe('CLI Authentication', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
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

  describe('GET /api/auth/cli-login', () => {
    it('should redirect to web app with callback_url', async () => {
      const callbackUrl = encodeURIComponent('http://127.0.0.1:19750/callback');
      const response = await fetch(
        `${baseUrl}/api/auth/cli-login?callback_url=${callbackUrl}`,
        { redirect: 'manual' }
      );

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();
      expect(location).toContain('/cli-callback');
      expect(location).toContain('callback_url=');
    });

    it('should reject request without callback_url', async () => {
      const response = await fetch(`${baseUrl}/api/auth/cli-login`);

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('callback_url');
    });

    it('should reject non-localhost callback_url', async () => {
      const callbackUrl = encodeURIComponent('https://evil.com/callback');
      const response = await fetch(
        `${baseUrl}/api/auth/cli-login?callback_url=${callbackUrl}`
      );

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('localhost');
    });

    it('should not require authentication (excluded from auth middleware)', async () => {
      const callbackUrl = encodeURIComponent('http://127.0.0.1:19750/callback');
      const response = await fetch(
        `${baseUrl}/api/auth/cli-login?callback_url=${callbackUrl}`,
        { redirect: 'manual' }
      );

      // Should redirect, not 401
      expect(response.status).toBe(302);
    });

    it('should forward device_code to redirect URL', async () => {
      const callbackUrl = encodeURIComponent('http://127.0.0.1:19750/callback');
      const deviceCode = 'abc123';
      const response = await fetch(
        `${baseUrl}/api/auth/cli-login?callback_url=${callbackUrl}&device_code=${deviceCode}`,
        { redirect: 'manual' }
      );

      const location = response.headers.get('location');
      expect(location).toContain('device_code=abc123');
    });
  });

  describe('POST /api/auth/cli-token', () => {
    it('should issue a CLI token for authenticated user', async () => {
      const response = await fetch(`${baseUrl}/api/auth/cli-token`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-clerk-jwt',
        },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as CliTokenResponse;
      expect(data.token).toMatch(/^hqcli_/);
      expect(data.userId).toBe('user_clerk123');
      expect(data.expiresIn).toBe('30d');
    });

    it('should reject unauthenticated request', async () => {
      const response = await fetch(`${baseUrl}/api/auth/cli-token`, {
        method: 'POST',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('CLI token round-trip', () => {
    it('should accept a CLI token for authenticated API requests', async () => {
      // Step 1: Get a CLI token
      const tokenResponse = await fetch(`${baseUrl}/api/auth/cli-token`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-clerk-jwt',
        },
      });

      expect(tokenResponse.status).toBe(200);
      const { token } = (await tokenResponse.json()) as CliTokenResponse;
      expect(token).toBeTruthy();

      // Step 2: Use CLI token to access /auth/me
      const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(meResponse.status).toBe(200);
      const meData = (await meResponse.json()) as { userId: string; sessionId: string };
      expect(meData.userId).toBe('user_clerk123');
      expect(meData.sessionId).toBe('sess_clerk456');
    });

    it('should accept a CLI token for /auth/cli-verify', async () => {
      // Step 1: Get a CLI token
      const tokenResponse = await fetch(`${baseUrl}/api/auth/cli-token`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-clerk-jwt',
        },
      });

      expect(tokenResponse.status).toBe(200);
      const { token } = (await tokenResponse.json()) as CliTokenResponse;

      // Step 2: Verify CLI token
      const verifyResponse = await fetch(`${baseUrl}/api/auth/cli-verify`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(verifyResponse.status).toBe(200);
      const data = (await verifyResponse.json()) as VerifyResponse;
      expect(data.valid).toBe(true);
      expect(data.userId).toBe('user_clerk123');
    });

    it('should reject a tampered CLI token', async () => {
      // Step 1: Get a valid CLI token
      const tokenResponse = await fetch(`${baseUrl}/api/auth/cli-token`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-clerk-jwt',
        },
      });

      expect(tokenResponse.status).toBe(200);
      const { token } = (await tokenResponse.json()) as CliTokenResponse;
      expect(token).toBeTruthy();

      // Step 2: Tamper with the token (modify a character in the signature)
      const tampered = token.slice(0, -2) + 'XX';

      const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${tampered}`,
        },
      });

      expect(meResponse.status).toBe(401);
    });
  });
});
