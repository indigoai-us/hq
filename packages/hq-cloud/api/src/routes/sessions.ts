/**
 * Session Routes
 *
 * CRUD for Claude Code sessions. Each session is a Claude Code process
 * running in an ECS Fargate container with the user's HQ files.
 */

import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import {
  createSession,
  getSession,
  listUserSessions,
  updateSessionStatus,
  canCreateSession,
} from '../data/sessions.js';
import {
  getSessionMessages,
  getLatestMessages,
} from '../data/session-messages.js';
import { hasClaudeToken } from '../data/user-settings.js';
import { config } from '../config.js';
import { launchSession, stopSession, isEcsConfigured } from '../sessions/orchestrator.js';
import { getRelay, getOrCreateRelay, broadcastStartupPhase } from '../ws/session-relay.js';

interface CreateSessionBody {
  prompt?: string;
  workerContext?: string;
}

export const sessionRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {

  // POST /api/sessions — create a new Claude Code session
  fastify.post<{ Body: CreateSessionBody }>('/sessions', async (request, reply) => {
    if (!config.mongodbUri) {
      return reply.status(503).send({ error: 'Sessions require MongoDB' });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Rate limit check
    const allowed = await canCreateSession(userId);
    if (!allowed) {
      return reply.status(429).send({
        error: 'Too Many Sessions',
        message: 'Maximum 5 concurrent active sessions. Stop an existing session first.',
      });
    }

    // Claude token check — user must have stored a token before creating sessions
    const userHasToken = await hasClaudeToken(userId);
    if (!userHasToken) {
      return reply.status(400).send({
        error: 'Claude Token Required',
        code: 'CLAUDE_TOKEN_REQUIRED',
        message: 'You must store a Claude OAuth token in Settings before creating sessions. Run `claude setup-token` and paste the result.',
      });
    }

    const { prompt, workerContext } = request.body ?? {};
    const sessionId = crypto.randomUUID();
    const accessToken = crypto.randomUUID();

    const session = await createSession({
      sessionId,
      userId,
      accessToken,
      initialPrompt: prompt,
      workerContext,
    });

    fastify.log.info({ sessionId, userId, workerContext }, 'Session created');

    // Launch ECS task if configured
    if (isEcsConfigured()) {
      try {
        const { taskArn } = await launchSession({
          sessionId,
          userId,
          accessToken,
          prompt,
          workerContext,
          logger: fastify.log,
        });
        session.ecsTaskArn = taskArn;
      } catch (err) {
        fastify.log.error({ sessionId, error: (err as Error).message }, 'Failed to launch session container');
        // Session is created but in 'errored' state — return it so UI can show the error
        const errored = await getSession(sessionId);
        return reply.status(201).send(errored ?? session);
      }
    } else {
      // Still create a relay so browsers can subscribe and see startup phases
      const relay = getOrCreateRelay(sessionId, userId, {
        initialPrompt: prompt,
        workerContext,
      });
      // Skip 'launching' phase — nothing to launch without ECS
      broadcastStartupPhase(relay, 'connecting');
      fastify.log.info({ sessionId }, 'ECS not configured — awaiting manual container connection');
    }

    return reply.status(201).send(session);
  });

  // GET /api/sessions — list user's sessions
  fastify.get('/sessions', async (request, reply) => {
    if (!config.mongodbUri) {
      return reply.send([]);
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const sessions = await listUserSessions(userId);

    // Attach latest message preview to each session
    const sessionsWithPreview = await Promise.all(
      sessions.map(async (s) => {
        const latest = await getLatestMessages(s.sessionId, 1);
        return {
          ...s,
          lastMessage: latest[0] ?? null,
        };
      })
    );

    return reply.send(sessionsWithPreview);
  });

  // GET /api/sessions/:id — get session details
  fastify.get<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    if (!config.mongodbUri) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const session = await getSession(request.params.id);
    if (!session || session.userId !== userId) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return reply.send(session);
  });

  // GET /api/sessions/:id/messages — get message history
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string; before?: string };
  }>('/sessions/:id/messages', async (request, reply) => {
    if (!config.mongodbUri) {
      return reply.send([]);
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Verify session belongs to user
    const session = await getSession(request.params.id);
    if (!session || session.userId !== userId) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;
    const before = request.query.before ? parseInt(request.query.before, 10) : undefined;

    const messages = await getSessionMessages(request.params.id, { limit, before });
    return reply.send(messages);
  });

  // DELETE /api/sessions/:id — stop a session
  fastify.delete<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    if (!config.mongodbUri) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const session = await getSession(request.params.id);
    if (!session || session.userId !== userId) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    if (session.status === 'stopped' || session.status === 'errored') {
      return reply.send({ ok: true, status: session.status, message: 'Session already stopped' });
    }

    // Mark as stopping
    await updateSessionStatus(session.sessionId, 'stopping');

    // Close WebSocket relay to container (Claude Code only accepts 'user'/'control' messages;
    // sending 'interrupt' crashes the process). Closing the socket causes a clean exit.
    const relay = getRelay(session.sessionId);
    if (relay?.claudeSocket) {
      relay.claudeSocket.close(1000, 'Session stopped by user');
      fastify.log.info({ sessionId: session.sessionId }, 'Container WebSocket closed for stop');
    }

    // Stop ECS task if it's running
    if (session.ecsTaskArn && isEcsConfigured()) {
      await stopSession({
        sessionId: session.sessionId,
        ecsTaskArn: session.ecsTaskArn,
        logger: fastify.log,
      });
    }

    const updated = await updateSessionStatus(session.sessionId, 'stopped');

    fastify.log.info({ sessionId: session.sessionId }, 'Session stopped');

    return reply.send({ ok: true, status: updated?.status ?? 'stopped' });
  });

  done();
};
