import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../index.js';
import { resetWorkerStore } from '../workers/index.js';
import { resetQuestionStore } from '../questions/index.js';
import { resetChatStore, onChatMessage } from '../chat/index.js';
import { resetApiKeyStore } from '../auth/index.js';
import { resetRateLimiter } from '../auth/rate-limiter.js';
import { resetConnectionRegistry } from '../ws/index.js';
import type { FastifyInstance } from 'fastify';

interface MessageResponse {
  id: string;
  workerId: string;
  role: 'worker' | 'user' | 'system';
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

interface ErrorResponse {
  error: string;
  message?: string;
}

interface ApiKeyResponse {
  key: string;
  prefix: string;
  name: string;
  rateLimit: number;
  createdAt: string;
  message: string;
}

describe('Chat History', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let apiKey: string;

  beforeEach(async () => {
    resetWorkerStore();
    resetQuestionStore();
    resetChatStore();
    resetApiKeyStore();
    resetRateLimiter();
    resetConnectionRegistry();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    // Generate an API key for authenticated requests
    const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Key' }),
    });
    const data = (await response.json()) as ApiKeyResponse;
    apiKey = data.key;

    // Create a test worker
    await fetch(`${baseUrl}/api/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        id: 'test-worker',
        name: 'Test Worker',
        status: 'running',
      }),
    });
  });

  afterEach(async () => {
    await app.close();
    resetWorkerStore();
    resetQuestionStore();
    resetChatStore();
    resetApiKeyStore();
    resetRateLimiter();
    resetConnectionRegistry();
  });

  describe('Create Chat Message', () => {
    it('should create a chat message from worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'worker',
          content: 'Starting task execution...',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as MessageResponse;
      expect(data.id).toBeDefined();
      expect(data.workerId).toBe('test-worker');
      expect(data.role).toBe('worker');
      expect(data.content).toBe('Starting task execution...');
      expect(data.timestamp).toBeDefined();
    });

    it('should create a chat message from user', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'user',
          content: 'Please continue with the next step.',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as MessageResponse;
      expect(data.role).toBe('user');
      expect(data.content).toBe('Please continue with the next step.');
    });

    it('should create a system message', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'system',
          content: 'Worker status changed to running.',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as MessageResponse;
      expect(data.role).toBe('system');
    });

    it('should include metadata in message', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'worker',
          content: 'Progress update',
          metadata: { step: 2, total: 5 },
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as MessageResponse;
      expect(data.metadata).toEqual({ step: 2, total: 5 });
    });

    it('should reject message for non-existent worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/non-existent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'worker',
          content: 'Test message',
        }),
      });

      expect(response.status).toBe(404);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
    });

    it('should reject invalid role', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'invalid',
          content: 'Test message',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('Role is required');
    });

    it('should reject empty content', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'worker',
          content: '',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('Content is required');
    });

    it('should trigger message callback', async () => {
      let callbackContent: string | null = null;
      let callbackMessageId: string | null = null;

      const unsubscribe = onChatMessage((msg) => {
        callbackMessageId = msg.id;
        callbackContent = msg.content;
      });

      await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'worker',
          content: 'Test callback message',
        }),
      });

      unsubscribe();

      expect(callbackMessageId).toBeDefined();
      expect(callbackContent).toBe('Test callback message');
    });
  });

  describe('Get Chat History', () => {
    beforeEach(async () => {
      // Create multiple messages
      for (let i = 1; i <= 5; i++) {
        await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            role: i % 2 === 1 ? 'worker' : 'user',
            content: `Message ${i}`,
          }),
        });
        // Small delay to ensure ordered timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });

    it('should return chat history for a worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ChatListResponse;
      expect(data.total).toBe(5);
      expect(data.messages).toHaveLength(5);
      // Messages should be in reverse chronological order (newest first)
      expect(data.messages[0]?.content).toBe('Message 5');
      expect(data.messages[4]?.content).toBe('Message 1');
    });

    it('should return empty array for worker with no messages', async () => {
      // Create another worker
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          id: 'empty-worker',
          name: 'Empty Worker',
        }),
      });

      const response = await fetch(`${baseUrl}/api/workers/empty-worker/chat`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ChatListResponse;
      expect(data.total).toBe(0);
      expect(data.messages).toHaveLength(0);
      expect(data.hasMore).toBe(false);
    });

    it('should return 404 for non-existent worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/non-existent/chat`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create 10 messages
      for (let i = 1; i <= 10; i++) {
        await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            role: 'worker',
            content: `Message ${i}`,
          }),
        });
        // Small delay to ensure ordered timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });

    it('should limit results with limit parameter', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat?limit=3`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as ChatListResponse;
      expect(data.messages).toHaveLength(3);
      expect(data.total).toBe(10);
      expect(data.hasMore).toBe(true);
      expect(data.nextCursor).toBeDefined();
    });

    it('should paginate with before cursor', async () => {
      // Get first page
      const firstResponse = await fetch(`${baseUrl}/api/workers/test-worker/chat?limit=3`, {
        headers: { 'x-api-key': apiKey },
      });
      const firstPage = (await firstResponse.json()) as ChatListResponse;
      expect(firstPage.nextCursor).toBeDefined();

      // Get second page using cursor
      const secondResponse = await fetch(
        `${baseUrl}/api/workers/test-worker/chat?limit=3&before=${firstPage.nextCursor}`,
        {
          headers: { 'x-api-key': apiKey },
        }
      );
      const secondPage = (await secondResponse.json()) as ChatListResponse;
      expect(secondPage.messages).toHaveLength(3);

      // Verify no overlap
      const firstPageIds = firstPage.messages.map((m) => m.id);
      const secondPageIds = secondPage.messages.map((m) => m.id);
      for (const id of secondPageIds) {
        expect(firstPageIds).not.toContain(id);
      }
    });

    it('should reject using both before and after cursors', async () => {
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/chat?before=msg1&after=msg2`,
        {
          headers: { 'x-api-key': apiKey },
        }
      );

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('Cannot use both');
    });

    it('should handle invalid limit gracefully', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat?limit=invalid`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      // Should use default limit
      const data = (await response.json()) as ChatListResponse;
      expect(data.messages.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Get Specific Message', () => {
    let messageId: string;

    beforeEach(async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'worker',
          content: 'Test message',
        }),
      });
      const data = (await response.json()) as MessageResponse;
      messageId = data.id;
    });

    it('should get a specific message', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat/${messageId}`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as MessageResponse;
      expect(data.id).toBe(messageId);
      expect(data.content).toBe('Test message');
    });

    it('should return 404 for non-existent message', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat/non-existent`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 for message belonging to different worker', async () => {
      // Create another worker
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          id: 'other-worker',
          name: 'Other Worker',
        }),
      });

      // Try to get message through wrong worker
      const response = await fetch(`${baseUrl}/api/workers/other-worker/chat/${messageId}`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Delete Message', () => {
    let messageId: string;

    beforeEach(async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          role: 'worker',
          content: 'Test message',
        }),
      });
      const data = (await response.json()) as MessageResponse;
      messageId = data.id;
    });

    it('should delete a message', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat/${messageId}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(204);

      // Verify message is gone
      const getResponse = await fetch(`${baseUrl}/api/workers/test-worker/chat/${messageId}`, {
        headers: { 'x-api-key': apiKey },
      });
      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when deleting non-existent message', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/chat/non-existent`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 when deleting message from wrong worker', async () => {
      // Create another worker
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          id: 'other-worker',
          name: 'Other Worker',
        }),
      });

      const response = await fetch(`${baseUrl}/api/workers/other-worker/chat/${messageId}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(404);
    });
  });
});
