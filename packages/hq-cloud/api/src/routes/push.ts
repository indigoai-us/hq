import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { getDeviceTokenStore } from '../push/index.js';
import type { DeviceToken, PushPlatform, RegisterDeviceTokenInput } from '../push/index.js';

interface RegisterTokenBody {
  deviceId: string;
  token: string;
  platform: PushPlatform;
  metadata?: Record<string, unknown>;
}

interface DeviceTokenParams {
  deviceId: string;
}

interface DeviceTokenResponse {
  deviceId: string;
  platform: PushPlatform;
  registeredAt: string;
  lastPushAt: string | null;
  active: boolean;
}

function tokenToResponse(token: DeviceToken): DeviceTokenResponse {
  return {
    deviceId: token.deviceId,
    platform: token.platform,
    registeredAt: token.registeredAt.toISOString(),
    lastPushAt: token.lastPushAt?.toISOString() ?? null,
    active: token.active,
  };
}

const VALID_PLATFORMS: PushPlatform[] = ['ios', 'android', 'web'];

function isValidPlatform(platform: unknown): platform is PushPlatform {
  return typeof platform === 'string' && VALID_PLATFORMS.includes(platform as PushPlatform);
}

function isValidToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 10 && token.length <= 4096;
}

function isValidDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === 'string' && deviceId.length >= 1 && deviceId.length <= 256;
}

export const pushRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  const deviceTokenStore = getDeviceTokenStore();

  // Register or update a device token
  // POST /api/push/tokens
  fastify.post<{ Body: RegisterTokenBody }>('/push/tokens', (request, reply) => {
    const { deviceId, token, platform, metadata } = request.body;

    // Validate device ID
    if (!isValidDeviceId(deviceId)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'deviceId is required and must be 1-256 characters',
      });
    }

    // Validate token
    if (!isValidToken(token)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'token is required and must be 10-4096 characters',
      });
    }

    // Validate platform
    if (!isValidPlatform(platform)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `platform must be one of: ${VALID_PLATFORMS.join(', ')}`,
      });
    }

    const input: RegisterDeviceTokenInput = {
      deviceId,
      token,
      platform,
      metadata,
    };

    const deviceToken = deviceTokenStore.register(input);
    fastify.log.info({ deviceId, platform }, 'Device token registered');

    return reply.status(201).send(tokenToResponse(deviceToken));
  });

  // Get a device token
  // GET /api/push/tokens/:deviceId
  fastify.get<{ Params: DeviceTokenParams }>('/push/tokens/:deviceId', (request, reply) => {
    const { deviceId } = request.params;

    const token = deviceTokenStore.get(deviceId);
    if (!token) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Device token for '${deviceId}' not found`,
      });
    }

    return reply.send(tokenToResponse(token));
  });

  // Deactivate a device token
  // DELETE /api/push/tokens/:deviceId
  fastify.delete<{ Params: DeviceTokenParams }>('/push/tokens/:deviceId', (request, reply) => {
    const { deviceId } = request.params;

    const token = deviceTokenStore.get(deviceId);
    if (!token) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Device token for '${deviceId}' not found`,
      });
    }

    deviceTokenStore.deactivate(deviceId);
    fastify.log.info({ deviceId }, 'Device token deactivated');

    return reply.status(204).send();
  });

  done();
};
