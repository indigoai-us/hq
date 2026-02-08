import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { getChatStore } from '../chat/index.js';
import { getWorkerStore } from '../workers/index.js';
import { broadcastChatMessage } from '../ws/index.js';
import type { ChatMessage, MessageRole, CreateChatMessageInput } from '../chat/index.js';

interface WorkerParams {
  id: string;
}

interface MessageParams {
  id: string;
  msgId: string;
}

interface CreateMessageBody {
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface ChatQuerystring {
  limit?: string;
  before?: string;
  after?: string;
}

interface MessageResponse {
  id: string;
  workerId: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ChatListResponse {
  messages: MessageResponse[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}

function messageToResponse(message: ChatMessage): MessageResponse {
  return {
    id: message.id,
    workerId: message.workerId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    metadata: message.metadata,
  };
}

function isValidRole(role: unknown): role is MessageRole {
  return role === 'worker' || role === 'user' || role === 'system';
}

function isValidContent(content: unknown): content is string {
  return typeof content === 'string' && content.length >= 1 && content.length <= 32768;
}

function parseLimit(limitStr: string | undefined): number | undefined {
  if (limitStr === undefined) {
    return undefined;
  }
  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit < 1) {
    return undefined;
  }
  return limit;
}

export const chatRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  const chatStore = getChatStore();
  const workerStore = getWorkerStore();

  // Get chat history for a worker
  // GET /api/workers/:id/chat
  fastify.get<{ Params: WorkerParams; Querystring: ChatQuerystring }>(
    '/workers/:id/chat',
    (request, reply) => {
      const { id: workerId } = request.params;
      const { limit, before, after } = request.query;

      // Check if worker exists
      if (!workerStore.exists(workerId)) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Worker '${workerId}' not found`,
        });
      }

      // Validate pagination params - can't use both before and after
      if (before && after) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Cannot use both "before" and "after" pagination cursors',
        });
      }

      const paginatedResult = chatStore.getByWorker(workerId, {
        limit: parseLimit(limit),
        before,
        after,
      });

      const response: ChatListResponse = {
        messages: paginatedResult.messages.map(messageToResponse),
        total: paginatedResult.total,
        hasMore: paginatedResult.hasMore,
        nextCursor: paginatedResult.nextCursor,
        prevCursor: paginatedResult.prevCursor,
      };

      return reply.send(response);
    }
  );

  // Create a new chat message
  // POST /api/workers/:id/chat
  fastify.post<{ Params: WorkerParams; Body: CreateMessageBody }>(
    '/workers/:id/chat',
    (request, reply) => {
      const { id: workerId } = request.params;
      const { role, content, metadata } = request.body;

      // Check if worker exists
      if (!workerStore.exists(workerId)) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Worker '${workerId}' not found`,
        });
      }

      // Validate role
      if (!isValidRole(role)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Role is required and must be one of: worker, user, system',
        });
      }

      // Validate content
      if (!isValidContent(content)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Content is required and must be 1-32768 characters',
        });
      }

      const input: CreateChatMessageInput = {
        workerId,
        role,
        content,
        metadata,
      };

      const message = chatStore.create(input);

      // Broadcast the new message to subscribed WebSocket clients
      broadcastChatMessage(message);

      return reply.status(201).send(messageToResponse(message));
    }
  );

  // Get a specific chat message
  // GET /api/workers/:id/chat/:msgId
  fastify.get<{ Params: MessageParams }>('/workers/:id/chat/:msgId', (request, reply) => {
    const { id: workerId, msgId } = request.params;

    // Check if worker exists
    if (!workerStore.exists(workerId)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${workerId}' not found`,
      });
    }

    const message = chatStore.get(msgId);
    if (!message) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Message '${msgId}' not found`,
      });
    }

    // Verify message belongs to this worker
    if (message.workerId !== workerId) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Message '${msgId}' not found for worker '${workerId}'`,
      });
    }

    return reply.send(messageToResponse(message));
  });

  // Delete a specific chat message
  // DELETE /api/workers/:id/chat/:msgId
  fastify.delete<{ Params: MessageParams }>('/workers/:id/chat/:msgId', (request, reply) => {
    const { id: workerId, msgId } = request.params;

    // Check if worker exists
    if (!workerStore.exists(workerId)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${workerId}' not found`,
      });
    }

    const message = chatStore.get(msgId);
    if (!message) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Message '${msgId}' not found`,
      });
    }

    // Verify message belongs to this worker
    if (message.workerId !== workerId) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Message '${msgId}' not found for worker '${workerId}'`,
      });
    }

    chatStore.delete(msgId);

    return reply.status(204).send();
  });

  done();
};
