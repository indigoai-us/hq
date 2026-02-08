import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getApiKeyStore } from './key-store.js';
import { getRateLimiter } from './rate-limiter.js';
import type { ApiKeyRecord } from './types.js';

/** Header name for API key */
const API_KEY_HEADER = 'x-api-key';
/** Header name for Authorization Bearer token */
const AUTH_HEADER = 'authorization';

/**
 * Extended request with auth context
 */
declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: {
      keyHash: string;
      record: ApiKeyRecord;
    };
  }
}

/**
 * Extract API key from request headers.
 * Supports both x-api-key header and Authorization: Bearer token.
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Check x-api-key header first
  const apiKeyHeader = request.headers[API_KEY_HEADER];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
    return apiKeyHeader;
  }

  // Check Authorization header
  const authHeader = request.headers[AUTH_HEADER];
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Register API key authentication hook.
 * This hook validates the API key and enforces rate limiting.
 *
 * Routes that should skip auth can be defined in the excludePaths option.
 */
export interface AuthPluginOptions {
  /** Paths to exclude from authentication (e.g., ['/api/health', '/ws']) */
  excludePaths?: string[];
  /** Path prefixes to exclude from authentication */
  excludePrefixes?: string[];
}

/**
 * Register authentication middleware as Fastify hooks
 */
export function registerAuthMiddleware(
  fastify: FastifyInstance,
  options: AuthPluginOptions = {}
): void {
  const excludePaths = new Set(options.excludePaths ?? []);
  const excludePrefixes = options.excludePrefixes ?? [];

  // Add auth hook
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const urlPath = request.url.split('?')[0] ?? '';

    // Check if path should skip auth
    if (excludePaths.has(urlPath)) {
      return;
    }

    // Check prefixes
    for (const prefix of excludePrefixes) {
      if (urlPath.startsWith(prefix)) {
        return;
      }
    }

    // Extract API key
    const rawKey = extractApiKey(request);
    if (!rawKey) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'API key is required. Provide via x-api-key header or Authorization: Bearer token.',
      });
    }

    // Validate key
    const store = getApiKeyStore();
    const validation = store.validate(rawKey);

    if (!validation.valid || !validation.keyHash || !validation.record) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: validation.error ?? 'Invalid API key',
      });
    }

    // Check rate limit
    const limiter = getRateLimiter();
    const rateStatus = limiter.check(validation.keyHash, validation.record.rateLimit);

    // Add rate limit headers
    void reply.header('X-RateLimit-Limit', rateStatus.limit);
    void reply.header('X-RateLimit-Remaining', rateStatus.remaining);
    void reply.header('X-RateLimit-Reset', rateStatus.resetIn);

    if (!rateStatus.allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: rateStatus.resetIn,
      });
    }

    // Attach auth context to request
    request.apiKey = {
      keyHash: validation.keyHash,
      record: validation.record,
    };
  });
}

/**
 * Require a specific device to be registered with the current API key.
 * Use this as a route-level preHandler.
 */
export async function requireDevice(
  request: FastifyRequest<{ Querystring: { deviceId?: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.apiKey) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'API key authentication required',
    });
  }

  const deviceId = request.query.deviceId;
  if (!deviceId) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'deviceId query parameter is required',
    });
  }

  const store = getApiKeyStore();
  if (!store.validateDeviceForKey(deviceId, request.apiKey.keyHash)) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Device is not registered with this API key',
    });
  }

  // Update last seen
  store.updateDeviceLastSeen(deviceId);
}
