import type { FastifyInstance, FastifyPluginCallback } from 'fastify';

/**
 * Auth routes — just GET /me for the authenticated user.
 */
export const authRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  /**
   * Get current authenticated user info
   * GET /auth/me
   */
  fastify.get('/me', (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    return reply.send({
      userId: request.user.userId,
      sessionId: request.user.sessionId,
    });
  });

  done();
};
