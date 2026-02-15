import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../index.js';
import { resetWorkerStore, getWorkerStore } from '../workers/index.js';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));

interface AgentResponse {
  id: string;
  name: string;
  type: string;
  status: string;
  progress: { completed: number; total: number };
  lastActivity: string;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

describe('Agent Routes', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    resetWorkerStore();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    await app.close();
    resetWorkerStore();
  });

  describe('GET /api/agents', () => {
    it('should return empty array when no agents running', async () => {
      const response = await fetch(`${baseUrl}/api/agents`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as AgentResponse[];
      expect(data).toEqual([]);
    });

    it('should return agents from worker store', async () => {
      const store = getWorkerStore();
      store.create({
        id: 'agent-1',
        name: 'Backend Dev',
        status: 'running',
        metadata: { type: 'code' },
      });
      store.create({
        id: 'agent-2',
        name: 'Content Writer',
        status: 'pending',
        metadata: { type: 'content' },
      });

      const response = await fetch(`${baseUrl}/api/agents`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as AgentResponse[];
      expect(data).toHaveLength(2);
      expect(data[0]!.id).toBe('agent-1');
      expect(data[0]!.name).toBe('Backend Dev');
      expect(data[0]!.type).toBe('code');
      expect(data[0]!.status).toBe('running');
      expect(data[1]!.status).toBe('idle'); // 'pending' maps to 'idle'
    });
  });

  describe('GET /api/agents/:id', () => {
    it('should return a specific agent', async () => {
      const store = getWorkerStore();
      store.create({
        id: 'agent-x',
        name: 'Test Agent',
        status: 'running',
        progress: { current: 3, total: 5 },
        metadata: { type: 'code' },
      });

      const response = await fetch(`${baseUrl}/api/agents/agent-x`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as AgentResponse;
      expect(data.id).toBe('agent-x');
      expect(data.progress.completed).toBe(3);
      expect(data.progress.total).toBe(5);
    });

    it('should return 404 for non-existent agent', async () => {
      const response = await fetch(`${baseUrl}/api/agents/nope`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(404);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
    });
  });
});
