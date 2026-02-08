import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../index.js';
import { resetApiKeyStore, getApiKeyStore } from '../auth/index.js';
import { resetRateLimiter } from '../auth/rate-limiter.js';
import type { FastifyInstance } from 'fastify';

interface ApiKeyResponse {
  key: string;
  prefix: string;
  name: string;
  rateLimit: number;
  createdAt: string;
  message: string;
}

interface MeResponse {
  name: string;
  active: boolean;
  rateLimit: number;
  createdAt: string;
  lastUsedAt: string | null;
  deviceCount: number;
  devices: Array<{ deviceId: string; name: string; lastSeenAt: string | null }>;
}

interface ErrorResponse {
  error: string;
  message?: string;
  retryAfter?: number;
}

interface DeviceResponse {
  message: string;
  device: {
    deviceId: string;
    name: string;
    registeredAt: string;
    metadata?: Record<string, unknown>;
  };
}

interface DeviceListResponse {
  count: number;
  devices: Array<{
    deviceId: string;
    name: string;
    registeredAt: string;
    lastSeenAt: string | null;
    metadata?: Record<string, unknown>;
  }>;
}

interface SingleDeviceResponse {
  deviceId: string;
  name: string;
  registeredAt: string;
  lastSeenAt: string | null;
  metadata?: Record<string, unknown>;
}

describe('Authentication', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    resetApiKeyStore();
    resetRateLimiter();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    await app.close();
    resetApiKeyStore();
    resetRateLimiter();
  });

  describe('API Key Generation', () => {
    it('should generate a new API key', async () => {
      const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Key' }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as ApiKeyResponse;
      expect(data.key).toMatch(/^hq_/);
      expect(data.name).toBe('Test Key');
      expect(data.rateLimit).toBe(60);
    });

    it('should generate a key with custom rate limit', async () => {
      const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'High Rate Key', rateLimit: 1000 }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as ApiKeyResponse;
      expect(data.rateLimit).toBe(1000);
    });

    it('should reject key generation without name', async () => {
      const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('API Key Validation', () => {
    let validKey: string;

    beforeEach(async () => {
      const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Key' }),
      });
      const data = (await response.json()) as ApiKeyResponse;
      validKey = data.key;
    });

    it('should accept valid API key via x-api-key header', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'x-api-key': validKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as MeResponse;
      expect(data.name).toBe('Test Key');
    });

    it('should accept valid API key via Authorization Bearer', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${validKey}` },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as MeResponse;
      expect(data.name).toBe('Test Key');
    });

    it('should reject request without API key', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`);

      expect(response.status).toBe(401);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject invalid API key', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'x-api-key': 'hq_invalid_key' },
      });

      expect(response.status).toBe(401);
    });

    it('should allow health endpoints without auth', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);

      const readyResponse = await fetch(`${baseUrl}/api/health/ready`);
      expect(readyResponse.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    let validKey: string;

    beforeEach(async () => {
      const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Rate Limited Key', rateLimit: 5 }),
      });
      const data = (await response.json()) as ApiKeyResponse;
      validKey = data.key;
    });

    it('should include rate limit headers', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'x-api-key': validKey },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should decrement remaining count', async () => {
      const response1 = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'x-api-key': validKey },
      });
      const remaining1 = parseInt(response1.headers.get('X-RateLimit-Remaining') ?? '0');

      const response2 = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'x-api-key': validKey },
      });
      const remaining2 = parseInt(response2.headers.get('X-RateLimit-Remaining') ?? '0');

      expect(remaining2).toBe(remaining1 - 1);
    });

    it('should block requests when rate limit exceeded', async () => {
      // Make 5 requests to exhaust the limit
      for (let i = 0; i < 5; i++) {
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { 'x-api-key': validKey },
        });
      }

      // 6th request should be rate limited
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'x-api-key': validKey },
      });

      expect(response.status).toBe(429);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Too Many Requests');
      expect(data.retryAfter).toBeDefined();
    });
  });

  describe('Device Registration', () => {
    let validKey: string;

    beforeEach(async () => {
      const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Device Key' }),
      });
      const data = (await response.json()) as ApiKeyResponse;
      validKey = data.key;
    });

    it('should register a device', async () => {
      const response = await fetch(`${baseUrl}/api/auth/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': validKey,
        },
        body: JSON.stringify({
          deviceId: 'test-device-1',
          name: 'Test Device',
          metadata: { os: 'windows' },
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as DeviceResponse;
      expect(data.device.deviceId).toBe('test-device-1');
      expect(data.device.name).toBe('Test Device');
      expect(data.device.metadata?.os).toBe('windows');
    });

    it('should list devices for API key', async () => {
      // Register two devices
      await fetch(`${baseUrl}/api/auth/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': validKey,
        },
        body: JSON.stringify({ deviceId: 'device-1', name: 'Device 1' }),
      });

      await fetch(`${baseUrl}/api/auth/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': validKey,
        },
        body: JSON.stringify({ deviceId: 'device-2', name: 'Device 2' }),
      });

      // List devices
      const response = await fetch(`${baseUrl}/api/auth/devices`, {
        headers: { 'x-api-key': validKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as DeviceListResponse;
      expect(data.count).toBe(2);
      expect(data.devices.map((d) => d.deviceId).sort()).toEqual(['device-1', 'device-2']);
    });

    it('should get a specific device', async () => {
      await fetch(`${baseUrl}/api/auth/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': validKey,
        },
        body: JSON.stringify({ deviceId: 'my-device', name: 'My Device' }),
      });

      const response = await fetch(`${baseUrl}/api/auth/devices/my-device`, {
        headers: { 'x-api-key': validKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as SingleDeviceResponse;
      expect(data.deviceId).toBe('my-device');
      expect(data.name).toBe('My Device');
    });

    it('should unregister a device', async () => {
      await fetch(`${baseUrl}/api/auth/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': validKey,
        },
        body: JSON.stringify({ deviceId: 'delete-me', name: 'Delete Me' }),
      });

      const deleteResponse = await fetch(`${baseUrl}/api/auth/devices/delete-me`, {
        method: 'DELETE',
        headers: { 'x-api-key': validKey },
      });

      expect(deleteResponse.status).toBe(204);

      // Verify device is gone
      const getResponse = await fetch(`${baseUrl}/api/auth/devices/delete-me`, {
        headers: { 'x-api-key': validKey },
      });

      expect(getResponse.status).toBe(404);
    });

    it('should reject invalid deviceId format', async () => {
      const response = await fetch(`${baseUrl}/api/auth/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': validKey,
        },
        body: JSON.stringify({ deviceId: 'invalid device!@#', name: 'Bad Device' }),
      });

      expect(response.status).toBe(400);
    });

    it('should not allow access to device from different API key', async () => {
      // Register device with first key
      await fetch(`${baseUrl}/api/auth/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': validKey,
        },
        body: JSON.stringify({ deviceId: 'private-device', name: 'Private Device' }),
      });

      // Create second key
      const keyResponse = await fetch(`${baseUrl}/api/auth/keys/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Other Key' }),
      });
      const otherKeyData = (await keyResponse.json()) as ApiKeyResponse;

      // Try to access device with second key
      const response = await fetch(`${baseUrl}/api/auth/devices/private-device`, {
        headers: { 'x-api-key': otherKeyData.key },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Key Store', () => {
    it('should hash keys securely', () => {
      const store = getApiKeyStore();
      const result1 = store.generate('Key 1');
      const result2 = store.generate('Key 2');

      // Raw keys should be different
      expect(result1.key).not.toBe(result2.key);

      // Keys should start with prefix
      expect(result1.key).toMatch(/^hq_/);
      expect(result2.key).toMatch(/^hq_/);
    });

    it('should validate and track key usage', () => {
      const store = getApiKeyStore();
      const result = store.generate('Test Key');

      // Validate key
      const validation = store.validate(result.key);
      expect(validation.valid).toBe(true);
      expect(validation.record?.name).toBe('Test Key');
      expect(validation.record?.lastUsedAt).not.toBeNull();
    });
  });
});
