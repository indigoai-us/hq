import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../index.js';
import { resetShareService } from '../routes/shares.js';
import { resetApiKeyStore } from '../auth/index.js';
import { resetRateLimiter } from '../auth/rate-limiter.js';
import type { FastifyInstance } from 'fastify';

interface ShareResponse {
  id: string;
  ownerId: string;
  recipientId: string;
  paths: string[];
  permissions: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  label: string | null;
}

interface ShareListResponse {
  count: number;
  shares: ShareResponse[];
}

interface ErrorResponse {
  error: string;
  message?: string;
  validationErrors?: string[];
}

interface AccessCheckResponse {
  hasAccess: boolean;
  shareId: string | null;
}

interface AccessiblePathsResponse {
  userId: string;
  count: number;
  sharedResources: Array<{
    ownerId: string;
    paths: string[];
    shareId: string;
    label: string | null;
  }>;
}

interface PolicyResponse {
  shareId: string;
  bucketName: string;
  policyStatements: Array<{
    sid: string;
    actions: string[];
    resources: string[];
  }>;
}

interface ApiKeyResponse {
  key: string;
  prefix: string;
  name: string;
  rateLimit: number;
  createdAt: string;
  message: string;
}

describe('Share Routes', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let apiKey: string;

  beforeEach(async () => {
    resetShareService();
    resetApiKeyStore();
    resetRateLimiter();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    // Generate an API key for authenticated requests
    const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Key' }),
    });
    const data = (await response.json()) as ApiKeyResponse;
    apiKey = data.key;
  });

  afterEach(async () => {
    await app.close();
    resetShareService();
    resetApiKeyStore();
    resetRateLimiter();
  });

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  });

  /** Auth headers without Content-Type (for requests with no body) */
  const authHeadersNoBody = (): Record<string, string> => ({
    'x-api-key': apiKey,
  });

  // ─── POST /api/shares ─────────────────────────────────────────────

  describe('POST /api/shares', () => {
    it('should create a share', async () => {
      const response = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/public/'],
          permissions: ['read'],
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as ShareResponse;
      expect(data.id).toMatch(/^share-/);
      expect(data.ownerId).toBe('user-alice');
      expect(data.recipientId).toBe('user-bob');
      expect(data.paths).toEqual(['knowledge/public/']);
      expect(data.permissions).toEqual(['read']);
      expect(data.status).toBe('active');
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });

    it('should create a share with label and expiration', async () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const response = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
          label: 'Shared Knowledge',
          expiresAt: future,
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as ShareResponse;
      expect(data.label).toBe('Shared Knowledge');
      expect(data.expiresAt).toBe(future);
    });

    it('should reject missing ownerId', async () => {
      const response = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          recipientId: 'user-bob',
          paths: ['knowledge/'],
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
    });

    it('should reject missing recipientId', async () => {
      const response = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          paths: ['knowledge/'],
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject empty paths', async () => {
      const response = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: [],
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject sharing with yourself', async () => {
      const response = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-alice',
          paths: ['knowledge/'],
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('yourself');
    });

    it('should reject invalid permissions', async () => {
      const response = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
          permissions: ['write'],
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  // ─── GET /api/shares ──────────────────────────────────────────────

  describe('GET /api/shares', () => {
    beforeEach(async () => {
      // Create some shares
      await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
        }),
      });
      await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-carol',
          paths: ['projects/'],
        }),
      });
    });

    it('should list all shares', async () => {
      const response = await fetch(`${baseUrl}/api/shares`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareListResponse;
      expect(data.count).toBe(2);
      expect(data.shares.length).toBe(2);
    });

    it('should filter by ownerId', async () => {
      const response = await fetch(`${baseUrl}/api/shares?ownerId=user-alice`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareListResponse;
      expect(data.count).toBe(2);
    });

    it('should filter by recipientId', async () => {
      const response = await fetch(`${baseUrl}/api/shares?recipientId=user-bob`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareListResponse;
      expect(data.count).toBe(1);
      expect(data.shares[0]!.recipientId).toBe('user-bob');
    });

    it('should filter by status', async () => {
      const response = await fetch(`${baseUrl}/api/shares?status=active`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareListResponse;
      expect(data.shares.every((s) => s.status === 'active')).toBe(true);
    });

    it('should reject invalid status', async () => {
      const response = await fetch(`${baseUrl}/api/shares?status=invalid`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(400);
    });
  });

  // ─── GET /api/shares/:id ──────────────────────────────────────────

  describe('GET /api/shares/:id', () => {
    it('should get a specific share', async () => {
      const createResponse = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
        }),
      });
      const created = (await createResponse.json()) as ShareResponse;

      const response = await fetch(`${baseUrl}/api/shares/${created.id}`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareResponse;
      expect(data.id).toBe(created.id);
    });

    it('should return 404 for non-existent share', async () => {
      const response = await fetch(`${baseUrl}/api/shares/share-nonexistent`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(404);
    });
  });

  // ─── PATCH /api/shares/:id ────────────────────────────────────────

  describe('PATCH /api/shares/:id', () => {
    let shareId: string;

    beforeEach(async () => {
      const createResponse = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/', 'projects/'],
        }),
      });
      const created = (await createResponse.json()) as ShareResponse;
      shareId = created.id;
    });

    it('should add paths', async () => {
      const response = await fetch(`${baseUrl}/api/shares/${shareId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ addPaths: ['workers/'] }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareResponse;
      expect(data.paths).toContain('workers/');
      expect(data.paths.length).toBe(3);
    });

    it('should remove paths', async () => {
      const response = await fetch(`${baseUrl}/api/shares/${shareId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ removePaths: ['knowledge/'] }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareResponse;
      expect(data.paths).not.toContain('knowledge/');
    });

    it('should update label', async () => {
      const response = await fetch(`${baseUrl}/api/shares/${shareId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ label: 'Updated Label' }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareResponse;
      expect(data.label).toBe('Updated Label');
    });

    it('should return 404 for non-existent share', async () => {
      const response = await fetch(`${baseUrl}/api/shares/share-nonexistent`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ label: 'Test' }),
      });

      expect(response.status).toBe(404);
    });
  });

  // ─── POST /api/shares/:id/revoke ─────────────────────────────────

  describe('POST /api/shares/:id/revoke', () => {
    it('should revoke a share', async () => {
      const createResponse = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
        }),
      });
      const created = (await createResponse.json()) as ShareResponse;

      const response = await fetch(`${baseUrl}/api/shares/${created.id}/revoke`, {
        method: 'POST',
        headers: authHeadersNoBody(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ShareResponse;
      expect(data.status).toBe('revoked');
    });

    it('should return 404 for non-existent share', async () => {
      const response = await fetch(`${baseUrl}/api/shares/share-nonexistent/revoke`, {
        method: 'POST',
        headers: authHeadersNoBody(),
      });

      expect(response.status).toBe(404);
    });
  });

  // ─── DELETE /api/shares/:id ───────────────────────────────────────

  describe('DELETE /api/shares/:id', () => {
    it('should delete a share', async () => {
      const createResponse = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
        }),
      });
      const created = (await createResponse.json()) as ShareResponse;

      const response = await fetch(`${baseUrl}/api/shares/${created.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      expect(response.status).toBe(204);

      // Verify it's gone
      const getResponse = await fetch(`${baseUrl}/api/shares/${created.id}`, {
        headers: authHeaders(),
      });
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent share', async () => {
      const response = await fetch(`${baseUrl}/api/shares/share-nonexistent`, {
        method: 'DELETE',
        headers: authHeaders(),
      });

      expect(response.status).toBe(404);
    });
  });

  // ─── GET /api/shares/access/check ────────────────────────────────

  describe('GET /api/shares/access/check', () => {
    beforeEach(async () => {
      await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/public/'],
        }),
      });
    });

    it('should confirm access for shared path', async () => {
      const response = await fetch(
        `${baseUrl}/api/shares/access/check?recipientId=user-bob&ownerId=user-alice&path=knowledge/public/doc.md`,
        { headers: authHeaders() }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as AccessCheckResponse;
      expect(data.hasAccess).toBe(true);
      expect(data.shareId).toBeTruthy();
    });

    it('should deny access for non-shared path', async () => {
      const response = await fetch(
        `${baseUrl}/api/shares/access/check?recipientId=user-bob&ownerId=user-alice&path=knowledge/private/`,
        { headers: authHeaders() }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as AccessCheckResponse;
      expect(data.hasAccess).toBe(false);
      expect(data.shareId).toBeNull();
    });

    it('should reject missing parameters', async () => {
      const response = await fetch(
        `${baseUrl}/api/shares/access/check?recipientId=user-bob`,
        { headers: authHeaders() }
      );

      expect(response.status).toBe(400);
    });
  });

  // ─── GET /api/shares/accessible/:userId ───────────────────────────

  describe('GET /api/shares/accessible/:userId', () => {
    it('should return accessible paths for a user', async () => {
      await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
          label: 'Alice Knowledge',
        }),
      });
      await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-carol',
          recipientId: 'user-bob',
          paths: ['projects/'],
        }),
      });

      const response = await fetch(`${baseUrl}/api/shares/accessible/user-bob`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as AccessiblePathsResponse;
      expect(data.userId).toBe('user-bob');
      expect(data.count).toBe(2);
      expect(data.sharedResources.length).toBe(2);
    });

    it('should return empty for user with no shares', async () => {
      const response = await fetch(`${baseUrl}/api/shares/accessible/user-nobody`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as AccessiblePathsResponse;
      expect(data.count).toBe(0);
    });
  });

  // ─── GET /api/shares/:id/policy ───────────────────────────────────

  describe('GET /api/shares/:id/policy', () => {
    it('should return S3 policy for active share', async () => {
      const createResponse = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/public/'],
        }),
      });
      const created = (await createResponse.json()) as ShareResponse;

      const response = await fetch(`${baseUrl}/api/shares/${created.id}/policy`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as PolicyResponse;
      expect(data.shareId).toBe(created.id);
      expect(data.bucketName).toBeDefined();
      expect(data.policyStatements.length).toBeGreaterThan(0);
      expect(data.policyStatements[0]!.actions).toContain('s3:GetObject');
    });

    it('should return 404 for revoked share', async () => {
      const createResponse = await fetch(`${baseUrl}/api/shares`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ownerId: 'user-alice',
          recipientId: 'user-bob',
          paths: ['knowledge/'],
        }),
      });
      const created = (await createResponse.json()) as ShareResponse;

      // Revoke it
      await fetch(`${baseUrl}/api/shares/${created.id}/revoke`, {
        method: 'POST',
        headers: authHeadersNoBody(),
      });

      const response = await fetch(`${baseUrl}/api/shares/${created.id}/policy`, {
        headers: authHeadersNoBody(),
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent share', async () => {
      const response = await fetch(`${baseUrl}/api/shares/share-nonexistent/policy`, {
        headers: authHeaders(),
      });

      expect(response.status).toBe(404);
    });
  });
});
