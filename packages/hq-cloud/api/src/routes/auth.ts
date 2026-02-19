import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { createClerkClient } from '@clerk/backend';
import { createCliToken } from '../auth/cli-token.js';
import { config } from '../config.js';

/**
 * Web app origin for CLI login redirect.
 * Falls back to the first CORS origin if configured, otherwise localhost.
 */
function getWebAppOrigin(): string {
  if (process.env['WEB_APP_URL']) {
    return process.env['WEB_APP_URL'];
  }
  // Derive from CORS_ORIGIN if it's a single URL
  const cors = config.corsOrigin;
  if (typeof cors === 'string' && cors.startsWith('http')) {
    return cors;
  }
  if (Array.isArray(cors) && cors.length > 0 && cors[0]!.startsWith('http')) {
    return cors[0]!;
  }
  return 'https://app.hq.getindigo.ai';
}

/**
 * Auth routes — user info, CLI login flow.
 */
export const authRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  /**
   * Get current authenticated user info including Clerk profile.
   * GET /auth/me
   *
   * Returns userId, sessionId, and profile info (fullName, email, avatarUrl)
   * looked up from Clerk. Profile fields may be null if lookup fails.
   */
  fastify.get('/me', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { userId, sessionId } = request.user;

    // Try to look up full profile from Clerk
    let fullName: string | null = null;
    let email: string | null = null;
    let avatarUrl: string | null = null;

    if (config.clerkSecretKey && !config.skipAuth) {
      try {
        const clerk = createClerkClient({ secretKey: config.clerkSecretKey });
        const clerkUser = await clerk.users.getUser(userId);
        fullName = [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean)
          .join(' ') || null;
        email = clerkUser.emailAddresses?.[0]?.emailAddress ?? null;
        avatarUrl = clerkUser.imageUrl ?? null;
      } catch {
        // Clerk lookup failed — return basic info without profile
      }
    }

    return reply.send({
      userId,
      sessionId,
      fullName,
      email,
      avatarUrl,
    });
  });

  /**
   * CLI login — redirect to web app sign-in with callback URL.
   * GET /auth/cli-login?callback_url=http://127.0.0.1:PORT/callback&device_code=XXX
   *
   * This is an unauthenticated endpoint (excluded from auth middleware).
   * The flow is:
   * 1. CLI opens browser here
   * 2. API redirects to web app /cli-callback with callback info
   * 3. Web app authenticates via Clerk
   * 4. Web app calls POST /auth/cli-token to get a long-lived CLI token
   * 5. Web app redirects to CLI callback_url with the token
   */
  fastify.get('/cli-login', (request, reply) => {
    const { callback_url } = request.query as {
      callback_url?: string;
    };

    if (!callback_url) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'callback_url query parameter is required',
      });
    }

    // Validate callback_url is a localhost URL (security: prevent open redirect)
    try {
      const parsed = new URL(callback_url);
      if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'callback_url must be a localhost URL',
        });
      }
    } catch {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'callback_url is not a valid URL',
      });
    }

    const webAppOrigin = getWebAppOrigin();
    const params = new URLSearchParams({ callback_url });
    const redirectUrl = `${webAppOrigin}/cli-callback?${params.toString()}`;
    return reply.redirect(redirectUrl);
  });

  /**
   * Exchange a Clerk session token for a long-lived CLI token.
   * POST /auth/cli-token
   *
   * Requires valid Clerk JWT (authenticated).
   * Returns a CLI token valid for 30 days.
   */
  fastify.post('/cli-token', (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { userId, sessionId } = request.user;
    const token = createCliToken(userId, sessionId);

    return reply.send({
      token,
      userId,
      expiresIn: '30d',
    });
  });

  /**
   * Verify a CLI token is still valid.
   * GET /auth/cli-verify
   *
   * Accepts CLI tokens (hqcli_xxx) via Bearer auth.
   * Returns user info if valid.
   */
  fastify.get('/cli-verify', (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    return reply.send({
      valid: true,
      userId: request.user.userId,
      sessionId: request.user.sessionId,
    });
  });

  done();
};
