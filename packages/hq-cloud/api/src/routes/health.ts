import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import {
  runHealthChecks,
  isReady,
  isLive,
  type HealthCheckResponse,
  type ReadinessResponse,
  type LivenessResponse,
} from '../observability/index.js';

export const healthRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  /**
   * GET /health
   * Returns comprehensive health status including component checks
   */
  fastify.get<{ Reply: HealthCheckResponse }>('/health', async (_request, reply) => {
    const health = await runHealthChecks();

    // Set appropriate status code based on health
    if (health.status === 'unhealthy') {
      return reply.status(503).send(health);
    }

    return reply.send(health);
  });

  /**
   * GET /health/ready
   * Kubernetes readiness probe - can the service handle traffic?
   */
  fastify.get<{ Reply: ReadinessResponse }>('/health/ready', async (_request, reply) => {
    const { ready, checks } = await isReady();

    if (!ready) {
      return reply.status(503).send({ ready: false, checks });
    }

    return reply.send({ ready: true, checks });
  });

  /**
   * GET /health/live
   * Kubernetes liveness probe - is the process running?
   */
  fastify.get<{ Reply: LivenessResponse }>('/health/live', async (_request, _reply) => {
    const live = isLive();
    return { live };
  });

  done();
};
