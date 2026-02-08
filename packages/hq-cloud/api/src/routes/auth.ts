import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { getApiKeyStore } from '../auth/index.js';

/**
 * Request body for generating an API key
 */
interface GenerateKeyBody {
  name: string;
  rateLimit?: number;
}

/**
 * Request body for registering a device
 */
interface RegisterDeviceBody {
  deviceId: string;
  name: string;
  metadata?: Record<string, unknown>;
}

/**
 * Auth routes for API key management and device registration.
 * Note: The /auth/keys/generate endpoint should be protected in production
 * (e.g., admin-only access, or use a bootstrap token).
 */
export const authRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  const store = getApiKeyStore();

  /**
   * Generate a new API key.
   * POST /auth/keys/generate
   *
   * In production, this should be protected by admin authentication.
   * For now, it's open for bootstrapping purposes.
   */
  fastify.post<{ Body: GenerateKeyBody }>(
    '/keys/generate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            rateLimit: { type: 'number', minimum: 1, maximum: 10000, default: 60 },
          },
        },
      },
    },
    (request, reply) => {
      const { name, rateLimit } = request.body;

      const result = store.generate(name, rateLimit);

      fastify.log.info({ name, prefix: result.prefix }, 'API key generated');

      return reply.status(201).send({
        message: 'API key generated successfully. Store this key securely - it cannot be retrieved again.',
        key: result.key,
        prefix: result.prefix,
        name: result.record.name,
        rateLimit: result.record.rateLimit,
        createdAt: result.record.createdAt,
      });
    }
  );

  /**
   * List all API keys (without revealing the actual keys)
   * GET /auth/keys
   *
   * Requires valid API key authentication.
   */
  fastify.get('/keys', (request, reply) => {
    if (!request.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const keys = store.listKeys();

    return reply.send({
      count: keys.length,
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        active: k.active,
        rateLimit: k.rateLimit,
        deviceCount: k.deviceIds.length,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
    });
  });

  /**
   * Revoke an API key
   * POST /auth/keys/:keyId/revoke
   *
   * Requires valid API key authentication.
   */
  fastify.post<{ Params: { keyId: string } }>('/keys/:keyId/revoke', (request, reply) => {
    if (!request.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Note: keyId is the truncated hash, need to find full hash
    // This is a simplified implementation - in production you'd have better key management
    const keys = store.listKeys();
    const target = keys.find((k) => k.id === request.params.keyId);

    if (!target) {
      return reply.status(404).send({ error: 'Not Found', message: 'API key not found' });
    }

    // In production, you'd want to verify the caller has permission to revoke this key
    fastify.log.warn({ keyId: request.params.keyId }, 'API key revocation not fully implemented');

    return reply.send({ message: 'Key revocation requires full key hash (security limitation)' });
  });

  /**
   * Register a device with the current API key
   * POST /auth/devices
   *
   * Requires valid API key authentication.
   */
  fastify.post<{ Body: RegisterDeviceBody }>(
    '/devices',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deviceId', 'name'],
          properties: {
            deviceId: { type: 'string', minLength: 1, maxLength: 255, pattern: '^[a-zA-Z0-9_-]+$' },
            name: { type: 'string', minLength: 1, maxLength: 255 },
            metadata: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    (request, reply) => {
      if (!request.apiKey) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { deviceId, name, metadata } = request.body;

      const device = store.registerDevice(request.apiKey.keyHash, deviceId, name, metadata);

      if (!device) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Failed to register device',
        });
      }

      fastify.log.info({ deviceId, name }, 'Device registered');

      return reply.status(201).send({
        message: 'Device registered successfully',
        device: {
          deviceId: device.deviceId,
          name: device.name,
          registeredAt: device.registeredAt,
          metadata: device.metadata,
        },
      });
    }
  );

  /**
   * List devices registered with the current API key
   * GET /auth/devices
   *
   * Requires valid API key authentication.
   */
  fastify.get('/devices', (request, reply) => {
    if (!request.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const devices = store.listDevicesForKey(request.apiKey.keyHash);

    return reply.send({
      count: devices.length,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        registeredAt: d.registeredAt,
        lastSeenAt: d.lastSeenAt,
        metadata: d.metadata,
      })),
    });
  });

  /**
   * Get a specific device
   * GET /auth/devices/:deviceId
   *
   * Requires valid API key authentication.
   */
  fastify.get<{ Params: { deviceId: string } }>('/devices/:deviceId', (request, reply) => {
    if (!request.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const device = store.getDevice(request.params.deviceId);

    if (!device) {
      return reply.status(404).send({ error: 'Not Found', message: 'Device not found' });
    }

    // Verify device belongs to this API key
    if (device.keyHash !== request.apiKey.keyHash) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Device not registered with this API key' });
    }

    return reply.send({
      deviceId: device.deviceId,
      name: device.name,
      registeredAt: device.registeredAt,
      lastSeenAt: device.lastSeenAt,
      metadata: device.metadata,
    });
  });

  /**
   * Unregister a device
   * DELETE /auth/devices/:deviceId
   *
   * Requires valid API key authentication.
   */
  fastify.delete<{ Params: { deviceId: string } }>('/devices/:deviceId', (request, reply) => {
    if (!request.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const device = store.getDevice(request.params.deviceId);

    if (!device) {
      return reply.status(404).send({ error: 'Not Found', message: 'Device not found' });
    }

    // Verify device belongs to this API key
    if (device.keyHash !== request.apiKey.keyHash) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Device not registered with this API key' });
    }

    const deleted = store.unregisterDevice(request.params.deviceId);

    if (!deleted) {
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to unregister device' });
    }

    fastify.log.info({ deviceId: request.params.deviceId }, 'Device unregistered');

    return reply.status(204).send();
  });

  /**
   * Get current API key info (self)
   * GET /auth/me
   *
   * Requires valid API key authentication.
   */
  fastify.get('/me', (request, reply) => {
    if (!request.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const record = request.apiKey.record;
    const devices = store.listDevicesForKey(request.apiKey.keyHash);

    return reply.send({
      name: record.name,
      active: record.active,
      rateLimit: record.rateLimit,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      deviceCount: devices.length,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        lastSeenAt: d.lastSeenAt,
      })),
    });
  });

  done();
};
