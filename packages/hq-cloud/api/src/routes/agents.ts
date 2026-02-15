/**
 * Agent Routes
 *
 * Agents are running worker instances. These routes serve the frontend's
 * services/agents.ts endpoints.
 *
 * Note: The old chat/question endpoints have been removed (SM-008).
 * Agent messages and permissions are now handled via the session system
 * (session-relay.ts, data/session-messages.ts, routes/sessions.ts).
 */

import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { getAllAgents, getAgent } from '../data/agent-store.js';

interface AgentParams {
  id: string;
}

export const agentRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  // GET /api/agents - List all running agents
  fastify.get('/agents', (_request, reply) => {
    const agents = getAllAgents();
    return reply.send(agents);
  });

  // GET /api/agents/:id - Get a specific agent
  fastify.get<{ Params: AgentParams }>('/agents/:id', (request, reply) => {
    const agent = getAgent(request.params.id);
    if (!agent) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Agent '${request.params.id}' not found`,
      });
    }
    return reply.send(agent);
  });

  done();
};
