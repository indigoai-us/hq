import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../index.js';
import { resetWorkerStore, getWorkerStore, resetSpawnQueue, getSpawnQueue } from '../workers/index.js';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));

interface WorkerResponse {
  id: string;
  name: string;
  status: string;
  containerId: string | null;
  registeredAt: string;
  lastHeartbeat: string | null;
  metadata?: Record<string, unknown>;
}

interface WorkerListResponse {
  count: number;
  workers: WorkerResponse[];
}

interface ErrorResponse {
  error: string;
  message?: string;
}

interface SpawnRequestResponse {
  trackingId: string;
  workerId: string;
  skill: string;
  parameters: Record<string, unknown>;
  status: string;
  queuedAt: string;
  metadata?: Record<string, unknown>;
}

describe('Worker Registry', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {
    resetWorkerStore();
    resetSpawnQueue();
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
    resetSpawnQueue();
  });

  describe('Create Worker', () => {
    it('should create a new worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          id: 'worker-1',
          name: 'Test Worker',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as WorkerResponse;
      expect(data.id).toBe('worker-1');
      expect(data.name).toBe('Test Worker');
      expect(data.status).toBe('pending');
      expect(data.containerId).toBeNull();
      expect(data.registeredAt).toBeDefined();
      expect(data.lastHeartbeat).toBeNull();
    });

    it('should create a worker with all fields', async () => {
      const response = await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          id: 'worker-full',
          name: 'Full Worker',
          status: 'running',
          containerId: 'container-abc123',
          metadata: { type: 'code', priority: 'high' },
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as WorkerResponse;
      expect(data.id).toBe('worker-full');
      expect(data.name).toBe('Full Worker');
      expect(data.status).toBe('running');
      expect(data.containerId).toBe('container-abc123');
      expect(data.metadata?.type).toBe('code');
      expect(data.metadata?.priority).toBe('high');
    });

    it('should reject duplicate worker ID', async () => {
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'worker-dup', name: 'First' }),
      });

      const response = await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'worker-dup', name: 'Second' }),
      });

      expect(response.status).toBe(409);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Conflict');
    });

    it('should reject invalid worker ID format', async () => {
      const response = await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'invalid id!@#', name: 'Bad Worker' }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
    });

    it('should reject missing required fields', async () => {
      const response1 = await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ name: 'No ID' }),
      });
      expect(response1.status).toBe(400);

      const response2 = await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'no-name' }),
      });
      expect(response2.status).toBe(400);
    });

    it('should reject invalid status', async () => {
      const response = await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'worker-bad-status', name: 'Bad Status', status: 'invalid' }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('Invalid status');
    });
  });

  describe('Get Worker', () => {
    beforeEach(async () => {
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'worker-get', name: 'Get Worker' }),
      });
    });

    it('should get an existing worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/worker-get`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as WorkerResponse;
      expect(data.id).toBe('worker-get');
      expect(data.name).toBe('Get Worker');
    });

    it('should return 404 for non-existent worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/non-existent`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(404);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
    });
  });

  describe('List Workers', () => {
    beforeEach(async () => {
      const workers = [
        { id: 'worker-1', name: 'Worker 1', status: 'pending' },
        { id: 'worker-2', name: 'Worker 2', status: 'running' },
        { id: 'worker-3', name: 'Worker 3', status: 'running' },
        { id: 'worker-4', name: 'Worker 4', status: 'completed' },
      ];

      for (const worker of workers) {
        await fetch(`${baseUrl}/api/workers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-clerk-jwt',
          },
          body: JSON.stringify(worker),
        });
      }
    });

    it('should list all workers from HQ registry', async () => {
      // GET /api/workers without ?status now returns WorkerDefinition[] from registry
      const response = await fetch(`${baseUrl}/api/workers`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as unknown[];
      // Should return definitions from registry.yaml (array, not { count, workers })
      expect(Array.isArray(data)).toBe(true);
    });

    it('should list runtime workers by status', async () => {
      // GET /api/workers?status=pending returns runtime instances in old format
      const response = await fetch(`${baseUrl}/api/workers?status=pending`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as WorkerListResponse;
      expect(data.count).toBe(1);
      expect(data.workers).toHaveLength(1);
    });

    it('should filter workers by status', async () => {
      const response = await fetch(`${baseUrl}/api/workers?status=running`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as WorkerListResponse;
      expect(data.count).toBe(2);
      expect(data.workers.every((w) => w.status === 'running')).toBe(true);
    });

    it('should reject invalid status filter', async () => {
      const response = await fetch(`${baseUrl}/api/workers?status=invalid`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Update Worker', () => {
    beforeEach(async () => {
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'worker-update', name: 'Update Worker' }),
      });
    });

    it('should update worker name', async () => {
      const response = await fetch(`${baseUrl}/api/workers/worker-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as WorkerResponse;
      expect(data.name).toBe('Updated Name');
    });

    it('should update worker status', async () => {
      const response = await fetch(`${baseUrl}/api/workers/worker-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ status: 'running' }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as WorkerResponse;
      expect(data.status).toBe('running');
    });

    it('should update worker containerId', async () => {
      const response = await fetch(`${baseUrl}/api/workers/worker-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ containerId: 'container-xyz' }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as WorkerResponse;
      expect(data.containerId).toBe('container-xyz');
    });

    it('should merge metadata', async () => {
      await fetch(`${baseUrl}/api/workers/worker-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ metadata: { key1: 'value1' } }),
      });

      const response = await fetch(`${baseUrl}/api/workers/worker-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ metadata: { key2: 'value2' } }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as WorkerResponse;
      expect(data.metadata?.key1).toBe('value1');
      expect(data.metadata?.key2).toBe('value2');
    });

    it('should return 404 for non-existent worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/non-existent`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ name: 'New Name' }),
      });

      expect(response.status).toBe(404);
    });

    it('should reject invalid status update', async () => {
      const response = await fetch(`${baseUrl}/api/workers/worker-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ status: 'invalid_status' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Delete Worker', () => {
    beforeEach(async () => {
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'worker-delete', name: 'Delete Worker' }),
      });
    });

    it('should delete an existing worker', async () => {
      const deleteResponse = await fetch(`${baseUrl}/api/workers/worker-delete`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(deleteResponse.status).toBe(204);

      // Verify worker is gone
      const getResponse = await fetch(`${baseUrl}/api/workers/worker-delete`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/non-existent`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Heartbeat', () => {
    beforeEach(async () => {
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({ id: 'worker-heartbeat', name: 'Heartbeat Worker' }),
      });
    });

    it('should update worker heartbeat', async () => {
      const response = await fetch(`${baseUrl}/api/workers/worker-heartbeat/heartbeat`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as WorkerResponse;
      expect(data.lastHeartbeat).not.toBeNull();
    });

    it('should return 404 for non-existent worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/non-existent/heartbeat`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Worker Store', () => {
    it('should create and retrieve workers', () => {
      const store = getWorkerStore();
      const worker = store.create({ id: 'test-worker', name: 'Test' });

      expect(worker.id).toBe('test-worker');
      expect(worker.name).toBe('Test');
      expect(worker.status).toBe('pending');

      const retrieved = store.get('test-worker');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-worker');
    });

    it('should throw on duplicate IDs', () => {
      const store = getWorkerStore();
      store.create({ id: 'dup-worker', name: 'First' });

      expect(() => store.create({ id: 'dup-worker', name: 'Second' })).toThrow();
    });

    it('should filter by status', () => {
      const store = getWorkerStore();
      store.create({ id: 'w1', name: 'W1', status: 'running' });
      store.create({ id: 'w2', name: 'W2', status: 'pending' });
      store.create({ id: 'w3', name: 'W3', status: 'running' });

      const running = store.getByStatus('running');
      expect(running).toHaveLength(2);
      expect(running.every((w) => w.status === 'running')).toBe(true);
    });

    it('should update heartbeat', () => {
      const store = getWorkerStore();
      const worker = store.create({ id: 'hb-worker', name: 'HB' });
      expect(worker.lastHeartbeat).toBeNull();

      const updated = store.updateHeartbeat('hb-worker');
      expect(updated?.lastHeartbeat).not.toBeNull();
    });
  });

  describe('Spawn Worker', () => {
    it('should create a spawn request with required fields', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          workerId: 'backend-dev',
          skill: 'implement-feature',
        }),
      });

      expect(response.status).toBe(202);
      const data = (await response.json()) as { agentId: string; agentName: string; status: string; trackingId: string };
      expect(data.trackingId).toBeDefined();
      expect(data.trackingId).toMatch(/^spawn-[a-z0-9]+-[a-z0-9]+$/);
      expect(data.agentId).toBeDefined();
      expect(data.agentName).toBeDefined();
      expect(data.status).toBe('pending');
    });

    it('should create a spawn request with all fields', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          workerId: 'frontend-dev',
          skill: 'build-component',
          parameters: { component: 'Button', props: ['onClick', 'variant'] },
          metadata: { priority: 'high', project: 'ui-lib' },
        }),
      });

      expect(response.status).toBe(202);
      const data = (await response.json()) as { agentId: string; agentName: string; status: string; trackingId: string };
      expect(data.agentId).toBeDefined();
      expect(data.agentName).toBeDefined();
      expect(data.status).toBe('pending');
      expect(data.trackingId).toBeDefined();
    });

    it('should reject missing workerId', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          skill: 'implement-feature',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('workerId');
    });

    it('should reject missing skill', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          workerId: 'backend-dev',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('skill');
    });

    it('should reject invalid workerId format', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          workerId: 'invalid worker!@#',
          skill: 'test',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
    });

    it('should reject invalid skill format', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          workerId: 'backend-dev',
          skill: 'invalid skill!',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
    });

    it('should reject invalid parameters type', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          workerId: 'backend-dev',
          skill: 'test',
          parameters: 'not-an-object',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('parameters');
    });

    it('should queue spawn request for orchestrator', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          workerId: 'backend-dev',
          skill: 'implement-feature',
          parameters: { task: 'API-007' },
        }),
      });

      expect(response.status).toBe(202);
      const data = (await response.json()) as { trackingId: string };

      // Verify it was added to the queue
      const queue = getSpawnQueue();
      const queued = queue.get(data.trackingId);
      expect(queued).toBeDefined();
      expect(queued?.workerId).toBe('backend-dev');
      expect(queued?.skill).toBe('implement-feature');
      expect(queued?.parameters).toEqual({ task: 'API-007' });
      expect(queued?.status).toBe('pending');
    });

    it('should get spawn request status by tracking ID', async () => {
      // Create a spawn request
      const createResponse = await fetch(`${baseUrl}/api/workers/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-clerk-jwt',
        },
        body: JSON.stringify({
          workerId: 'backend-dev',
          skill: 'test-skill',
        }),
      });

      const createData = (await createResponse.json()) as SpawnRequestResponse;

      // Get the status
      const getResponse = await fetch(`${baseUrl}/api/workers/spawn/${createData.trackingId}`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(getResponse.status).toBe(200);
      const getData = (await getResponse.json()) as SpawnRequestResponse;
      expect(getData.trackingId).toBe(createData.trackingId);
      expect(getData.workerId).toBe('backend-dev');
      expect(getData.skill).toBe('test-skill');
      expect(getData.status).toBe('pending');
    });

    it('should return 404 for non-existent tracking ID', async () => {
      const response = await fetch(`${baseUrl}/api/workers/spawn/spawn-nonexistent-id123`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(404);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
    });
  });

  describe('Spawn Queue', () => {
    it('should enqueue and dequeue spawn requests', () => {
      const queue = getSpawnQueue();

      const request1 = queue.enqueue({
        workerId: 'worker-1',
        skill: 'skill-1',
        parameters: { key: 'value' },
      });

      const request2 = queue.enqueue({
        workerId: 'worker-2',
        skill: 'skill-2',
      });

      expect(queue.length).toBe(2);
      expect(request1.status).toBe('pending');
      expect(request2.status).toBe('pending');

      // Dequeue first request
      const dequeued = queue.dequeue();
      expect(dequeued?.trackingId).toBe(request1.trackingId);
      expect(dequeued?.status).toBe('processing');
      expect(queue.length).toBe(1);
    });

    it('should complete spawn requests', () => {
      const queue = getSpawnQueue();

      const request = queue.enqueue({
        workerId: 'worker-1',
        skill: 'skill-1',
      });

      queue.dequeue();
      const completed = queue.complete(request.trackingId);

      expect(completed?.status).toBe('completed');
      expect(completed?.completedAt).not.toBeNull();
    });

    it('should fail spawn requests', () => {
      const queue = getSpawnQueue();

      const request = queue.enqueue({
        workerId: 'worker-1',
        skill: 'skill-1',
      });

      queue.dequeue();
      const failed = queue.fail(request.trackingId, 'Worker not available');

      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Worker not available');
      expect(failed?.completedAt).not.toBeNull();
    });

    it('should get pending requests', () => {
      const queue = getSpawnQueue();

      queue.enqueue({ workerId: 'w1', skill: 's1' });
      queue.enqueue({ workerId: 'w2', skill: 's2' });
      queue.enqueue({ workerId: 'w3', skill: 's3' });

      const pending = queue.getPending();
      expect(pending).toHaveLength(3);
      expect(pending.every((r) => r.status === 'pending')).toBe(true);
    });
  });
});
