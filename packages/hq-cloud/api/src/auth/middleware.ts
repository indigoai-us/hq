import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyClerkToken } from './clerk.js';
import { isCliToken, verifyCliToken } from './cli-token.js';
import { config } from '../config.js';
import type { AuthUser } from './types.js';

/** Header name for Authorization Bearer token */
const AUTH_HEADER = 'authorization';

/**
 * Extended request with auth context
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(request: FastifyRequest): string | null {
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
 * Options for the auth middleware
 */
export interface AuthPluginOptions {
  /** Paths to exclude from authentication */
  excludePaths?: string[];
  /** Path prefixes to exclude from authentication */
  excludePrefixes?: string[];
}

/**
 * Register authentication middleware as Fastify hooks.
 * Accepts both Clerk JWTs and HQ CLI tokens (hqcli_xxx).
 * Extracts Bearer token, verifies, and attaches request.user.
 */
export function registerAuthMiddleware(
  fastify: FastifyInstance,
  options: AuthPluginOptions = {}
): void {
  const excludePaths = new Set(options.excludePaths ?? []);
  const excludePrefixes = options.excludePrefixes ?? [];

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip all auth checks when SKIP_AUTH=true (for integration tests)
    if (config.skipAuth) {
      request.user = { userId: 'test-user', sessionId: 'test-session' };
      return;
    }

    const urlPath = request.url.split('?')[0] ?? '';

    // Check if path should skip auth
    if (excludePaths.has(urlPath)) {
      return;
    }

    for (const prefix of excludePrefixes) {
      if (urlPath.startsWith(prefix)) {
        return;
      }
    }

    // Extract Bearer token
    const token = extractBearerToken(request);
    if (!token) {
      fastify.log.warn(
        { path: urlPath, headers: Object.keys(request.headers) },
        'Auth: no Bearer token found in request headers'
      );
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Bearer token is required. Provide via Authorization: Bearer <token> header.',
      });
    }

    // Route to the correct verifier based on token prefix
    try {
      if (isCliToken(token)) {
        // HQ CLI token (hqcli_xxx) — verified locally with HMAC
        request.user = verifyCliToken(token);
      } else {
        // Clerk JWT — verified via Clerk SDK
        request.user = await verifyClerkToken(token);
      }
    } catch (err) {
      fastify.log.warn({ err, path: urlPath }, 'Token verification failed');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }
  });
}
