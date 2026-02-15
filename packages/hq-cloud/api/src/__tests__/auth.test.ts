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

interface MeResponse {
  userId: string;
  sessionId: string;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

describe('Authentication', () => {
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

  describe('Bearer Token Validation', () => {
    it('should accept valid Bearer token and return user info', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as MeResponse;
      expect(data.userId).toBe('test-user-id');
      expect(data.sessionId).toBe('test-session-id');
    });

    it('should reject request without authorization header', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`);

      expect(response.status).toBe(401);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Unauthorized');
    });

    it('should allow health endpoints without auth', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);

      const readyResponse = await fetch(`${baseUrl}/api/health/ready`);
      expect(readyResponse.status).toBe(200);
    });
  });
});
