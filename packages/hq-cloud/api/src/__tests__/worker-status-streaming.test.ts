import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket, type RawData } from 'ws';
import { buildApp } from '../index.js';
import { resetWorkerStore } from '../workers/index.js';
import { resetConnectionRegistry } from '../ws/index.js';
import { resetApiKeyStore } from '../auth/index.js';
import { resetRateLimiter } from '../auth/rate-limiter.js';
import type { FastifyInstance } from 'fastify';

interface ApiKeyResponse {
  key: string;
  prefix: string;
  name: string;
  rateLimit: number;
  createdAt: string;
  message: string;
}

interface WorkerStatusPayload {
  workerId: string;
  changeType: 'create' | 'update' | 'delete';
  status: string;
  currentTask: string | null;
  progress: { current: number; total: number; description?: string } | null;
  lastActivity: string;
  name: string;
  timestamp: number;
}

interface WebSocketMessageData {
  type: string;
  payload?: unknown;
}

function parseWsData(data: RawData): WebSocketMessageData {
  const str = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  return JSON.parse(str) as WebSocketMessageData;
}

describe('Worker Status Streaming', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let wsUrl: string;
  let apiKey: string;

  beforeEach(async () => {
    resetWorkerStore();
    resetConnectionRegistry();
    resetApiKeyStore();
    resetRateLimiter();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
      wsUrl = `ws://127.0.0.1:${address.port}`;
    }

    // Generate an API key
    const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Key' }),
    });
    const data = (await response.json()) as ApiKeyResponse;
    apiKey = data.key;
  });

  afterEach(async () => {
    await app.close();
    resetWorkerStore();
    resetConnectionRegistry();
    resetApiKeyStore();
    resetRateLimiter();
  });

  describe('Subscribe/Unsubscribe', () => {
    it('should allow subscribing to all workers', async () => {
      const ws = new WebSocket(`${wsUrl}/ws?deviceId=test-device-1`);
      const messages: WebSocketMessageData[] = [];

      const done = await new Promise<boolean>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);
          messages.push(msg);

          if (msg.type === 'connected') {
            // Subscribe to all workers (empty workerIds)
            ws.send(JSON.stringify({ type: 'subscribe', payload: { workerIds: [] } }));
          }

          if (msg.type === 'subscribed') {
            resolve(true);
          }
        });

        ws.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
      });

      expect(done).toBe(true);
      const subscribedMsg = messages.find((m) => m.type === 'subscribed');
      expect(subscribedMsg).toBeDefined();
      const payload = subscribedMsg?.payload as { workerIds: string[]; all: boolean };
      expect(payload.all).toBe(true);
      expect(payload.workerIds).toEqual([]);

      ws.close();
    });

    it('should allow subscribing to specific workers', async () => {
      const ws = new WebSocket(`${wsUrl}/ws?deviceId=test-device-2`);
      const messages: WebSocketMessageData[] = [];

      const done = await new Promise<boolean>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);
          messages.push(msg);

          if (msg.type === 'connected') {
            ws.send(JSON.stringify({ type: 'subscribe', payload: { workerIds: ['worker-1', 'worker-2'] } }));
          }

          if (msg.type === 'subscribed') {
            resolve(true);
          }
        });

        ws.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
      });

      expect(done).toBe(true);
      const subscribedMsg = messages.find((m) => m.type === 'subscribed');
      expect(subscribedMsg).toBeDefined();
      const payload = subscribedMsg?.payload as { workerIds: string[]; all: boolean };
      expect(payload.all).toBe(false);
      expect(payload.workerIds).toContain('worker-1');
      expect(payload.workerIds).toContain('worker-2');

      ws.close();
    });

    it('should allow unsubscribing from workers', async () => {
      const ws = new WebSocket(`${wsUrl}/ws?deviceId=test-device-3`);
      let subscribedCount = 0;
      let finalPayload: { workerIds: string[]; all: boolean } | null = null;

      const done = await new Promise<boolean>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);

          if (msg.type === 'connected') {
            // Subscribe first
            ws.send(JSON.stringify({ type: 'subscribe', payload: { workerIds: ['worker-1', 'worker-2'] } }));
          }

          if (msg.type === 'subscribed') {
            subscribedCount++;
            if (subscribedCount === 1) {
              // Unsubscribe from one worker
              ws.send(JSON.stringify({ type: 'unsubscribe', payload: { workerIds: ['worker-1'] } }));
            } else {
              finalPayload = msg.payload as { workerIds: string[]; all: boolean };
              resolve(true);
            }
          }
        });

        ws.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
      });

      expect(done).toBe(true);
      expect(finalPayload).not.toBeNull();
      expect(finalPayload!.workerIds).not.toContain('worker-1');
      expect(finalPayload!.workerIds).toContain('worker-2');

      ws.close();
    });
  });

  describe('Status Broadcasting', () => {
    it('should broadcast worker creation to subscribers', async () => {
      const ws = new WebSocket(`${wsUrl}/ws?deviceId=test-device-4`);
      let workerStatusMsg: WebSocketMessageData | null = null;

      const done = await new Promise<boolean>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);

          if (msg.type === 'connected') {
            // Subscribe to all workers
            ws.send(JSON.stringify({ type: 'subscribe', payload: { workerIds: [] } }));
          }

          if (msg.type === 'subscribed') {
            // Now create a worker via API - this should trigger a broadcast
            void fetch(`${baseUrl}/api/workers`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
              },
              body: JSON.stringify({
                id: 'new-worker',
                name: 'New Worker',
                status: 'pending',
              }),
            });
          }

          if (msg.type === 'worker_status') {
            workerStatusMsg = msg;
            resolve(true);
          }
        });

        ws.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
      });

      expect(done).toBe(true);
      expect(workerStatusMsg).not.toBeNull();
      expect(workerStatusMsg!.type).toBe('worker_status');
      const payload = workerStatusMsg!.payload as WorkerStatusPayload;
      expect(payload.workerId).toBe('new-worker');
      expect(payload.changeType).toBe('create');
      expect(payload.status).toBe('pending');
      expect(payload.name).toBe('New Worker');

      ws.close();
    });

    it('should broadcast worker updates to subscribers', async () => {
      // Create a worker first
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          id: 'update-worker',
          name: 'Update Worker',
        }),
      });

      const ws = new WebSocket(`${wsUrl}/ws?deviceId=test-device-5`);
      let workerStatusMsg: WebSocketMessageData | null = null;

      const done = await new Promise<boolean>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);

          if (msg.type === 'connected') {
            // Subscribe to all workers
            ws.send(JSON.stringify({ type: 'subscribe', payload: { workerIds: [] } }));
          }

          if (msg.type === 'subscribed') {
            // Update the worker
            void fetch(`${baseUrl}/api/workers/update-worker`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
              },
              body: JSON.stringify({
                status: 'running',
                currentTask: 'Processing data',
                progress: { current: 2, total: 5, description: 'Step 2 of 5' },
              }),
            });
          }

          if (msg.type === 'worker_status') {
            workerStatusMsg = msg;
            resolve(true);
          }
        });

        ws.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
      });

      expect(done).toBe(true);
      expect(workerStatusMsg).not.toBeNull();
      const payload = workerStatusMsg!.payload as WorkerStatusPayload;
      expect(payload.workerId).toBe('update-worker');
      expect(payload.changeType).toBe('update');
      expect(payload.status).toBe('running');
      expect(payload.currentTask).toBe('Processing data');
      expect(payload.progress?.current).toBe(2);
      expect(payload.progress?.total).toBe(5);

      ws.close();
    });

    it('should only broadcast to clients subscribed to specific worker', async () => {
      // Create two workers
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ id: 'worker-a', name: 'Worker A' }),
      });

      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ id: 'worker-b', name: 'Worker B' }),
      });

      const ws = new WebSocket(`${wsUrl}/ws?deviceId=test-device-6`);
      let workerStatusMsg: WebSocketMessageData | null = null;

      const done = await new Promise<boolean>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);

          if (msg.type === 'connected') {
            // Subscribe only to worker-a
            ws.send(JSON.stringify({ type: 'subscribe', payload: { workerIds: ['worker-a'] } }));
          }

          if (msg.type === 'subscribed') {
            // Update worker-a - should receive notification
            void fetch(`${baseUrl}/api/workers/worker-a`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
              },
              body: JSON.stringify({ status: 'running' }),
            });
          }

          if (msg.type === 'worker_status') {
            workerStatusMsg = msg;
            resolve(true);
          }
        });

        ws.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
      });

      expect(done).toBe(true);
      expect(workerStatusMsg).not.toBeNull();
      const payload = workerStatusMsg!.payload as WorkerStatusPayload;
      expect(payload.workerId).toBe('worker-a');

      ws.close();
    });

    it('should broadcast worker deletion to subscribers', async () => {
      // Create a worker
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ id: 'delete-worker', name: 'Delete Worker' }),
      });

      const ws = new WebSocket(`${wsUrl}/ws?deviceId=test-device-7`);
      let workerStatusMsg: WebSocketMessageData | null = null;

      const done = await new Promise<boolean>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);

          if (msg.type === 'connected') {
            // Subscribe to all workers
            ws.send(JSON.stringify({ type: 'subscribe', payload: { workerIds: [] } }));
          }

          if (msg.type === 'subscribed') {
            // Delete the worker
            void fetch(`${baseUrl}/api/workers/delete-worker`, {
              method: 'DELETE',
              headers: { 'x-api-key': apiKey },
            });
          }

          if (msg.type === 'worker_status') {
            workerStatusMsg = msg;
            resolve(true);
          }
        });

        ws.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
      });

      expect(done).toBe(true);
      expect(workerStatusMsg).not.toBeNull();
      const payload = workerStatusMsg!.payload as WorkerStatusPayload;
      expect(payload.workerId).toBe('delete-worker');
      expect(payload.changeType).toBe('delete');

      ws.close();
    });
  });

  describe('Worker Response Format', () => {
    it('should include currentTask, progress, and lastActivity in GET /api/workers', async () => {
      // Create a worker with task and progress
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          id: 'task-worker',
          name: 'Task Worker',
          status: 'running',
          currentTask: 'Executing skill: implement-endpoint',
          progress: { current: 4, total: 6, description: 'Running tests' },
        }),
      });

      const response = await fetch(`${baseUrl}/api/workers`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        count: number;
        workers: Array<{
          id: string;
          currentTask: string | null;
          progress: { current: number; total: number; description?: string } | null;
          lastActivity: string;
        }>;
      };

      expect(data.count).toBe(1);
      const worker = data.workers[0]!;
      expect(worker.currentTask).toBe('Executing skill: implement-endpoint');
      expect(worker.progress?.current).toBe(4);
      expect(worker.progress?.total).toBe(6);
      expect(worker.progress?.description).toBe('Running tests');
      expect(worker.lastActivity).toBeDefined();
    });

    it('should include currentTask, progress, and lastActivity in GET /api/workers/:id', async () => {
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          id: 'single-worker',
          name: 'Single Worker',
          currentTask: 'Processing batch',
          progress: { current: 1, total: 3 },
        }),
      });

      const response = await fetch(`${baseUrl}/api/workers/single-worker`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      const worker = (await response.json()) as {
        currentTask: string | null;
        progress: { current: number; total: number } | null;
        lastActivity: string;
      };

      expect(worker.currentTask).toBe('Processing batch');
      expect(worker.progress?.current).toBe(1);
      expect(worker.progress?.total).toBe(3);
      expect(worker.lastActivity).toBeDefined();
    });
  });
});
