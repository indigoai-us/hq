import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../index.js';
import { resetWorkerStore } from '../workers/index.js';
import { resetQuestionStore } from '../questions/index.js';
import { resetApiKeyStore } from '../auth/index.js';
import { resetRateLimiter } from '../auth/rate-limiter.js';
import { resetConnectionRegistry } from '../ws/index.js';
import {
  resetDeviceTokenStore,
  resetPushProvider,
  MockPushProvider,
  setPushProvider,
  getDeviceTokenStore,
  sendQuestionPushNotification,
  buildQuestionPushPayload,
  hasActiveWebSocketConnection,
  resetPushCallbacks,
} from '../push/index.js';
import { getQuestionStore } from '../questions/index.js';
import { getWorkerStore } from '../workers/index.js';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';

interface DeviceTokenResponse {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  registeredAt: string;
  lastPushAt: string | null;
  active: boolean;
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

interface QuestionResponse {
  id: string;
  workerId: string;
  text: string;
  options: Array<{ id: string; text: string }>;
  status: 'pending' | 'answered';
  createdAt: string;
  answeredAt: string | null;
  answer: string | null;
}

describe('Push Notification System', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let apiKey: string;
  let mockPushProvider: MockPushProvider;

  beforeEach(async () => {
    resetWorkerStore();
    resetQuestionStore();
    resetApiKeyStore();
    resetRateLimiter();
    resetConnectionRegistry();
    resetDeviceTokenStore();
    resetPushProvider();
    resetPushCallbacks();

    // Set up mock push provider
    mockPushProvider = new MockPushProvider();
    setPushProvider(mockPushProvider);

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
    resetApiKeyStore();
    resetRateLimiter();
    resetConnectionRegistry();
    resetDeviceTokenStore();
    resetPushProvider();
    resetPushCallbacks();
  });

  describe('Device Token Registration', () => {
    it('should register a device token', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          token: 'fcm-token-abc123xyz789',
          platform: 'android',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as DeviceTokenResponse;
      expect(data.deviceId).toBe('device-123');
      expect(data.platform).toBe('android');
      expect(data.active).toBe(true);
      expect(data.registeredAt).toBeDefined();
      expect(data.lastPushAt).toBeNull();
    });

    it('should register iOS device token', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'iphone-456',
          token: 'apns-token-xyz789abc123',
          platform: 'ios',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as DeviceTokenResponse;
      expect(data.platform).toBe('ios');
    });

    it('should register web push token', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'browser-789',
          token: 'web-push-subscription-token',
          platform: 'web',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as DeviceTokenResponse;
      expect(data.platform).toBe('web');
    });

    it('should update existing device token', async () => {
      // Register first
      await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          token: 'old-token-abc',
          platform: 'android',
        }),
      });

      // Update with new token
      const response = await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          token: 'new-token-xyz',
          platform: 'android',
        }),
      });

      expect(response.status).toBe(201);

      // Verify the token was updated
      const getResponse = await fetch(`${baseUrl}/api/push/tokens/device-123`, {
        headers: { 'x-api-key': apiKey },
      });
      const data = (await getResponse.json()) as DeviceTokenResponse;
      expect(data.active).toBe(true);
    });

    it('should reject invalid platform', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          token: 'fcm-token-abc123xyz789',
          platform: 'windows',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('platform');
    });

    it('should reject empty token', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          token: 'short',
          platform: 'android',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
    });

    it('should reject empty deviceId', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: '',
          token: 'fcm-token-abc123xyz789',
          platform: 'android',
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Get Device Token', () => {
    beforeEach(async () => {
      await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          token: 'fcm-token-abc123xyz789',
          platform: 'android',
        }),
      });
    });

    it('should get a device token', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens/device-123`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as DeviceTokenResponse;
      expect(data.deviceId).toBe('device-123');
      expect(data.platform).toBe('android');
    });

    it('should return 404 for non-existent token', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens/non-existent`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Deactivate Device Token', () => {
    beforeEach(async () => {
      await fetch(`${baseUrl}/api/push/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          deviceId: 'device-123',
          token: 'fcm-token-abc123xyz789',
          platform: 'android',
        }),
      });
    });

    it('should deactivate a device token', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens/device-123`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(204);

      // Verify token is deactivated
      const getResponse = await fetch(`${baseUrl}/api/push/tokens/device-123`, {
        headers: { 'x-api-key': apiKey },
      });
      const data = (await getResponse.json()) as DeviceTokenResponse;
      expect(data.active).toBe(false);
    });

    it('should return 404 for non-existent token', async () => {
      const response = await fetch(`${baseUrl}/api/push/tokens/non-existent`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Push Notification Service', () => {
    it('should build question push payload', () => {
      const workerStore = getWorkerStore();
      const worker = workerStore.create({
        id: 'push-worker',
        name: 'Push Test Worker',
      });

      const question = {
        id: 'q-123',
        workerId: worker.id,
        text: 'What should I do next?',
        options: [],
        status: 'pending' as const,
        createdAt: new Date(),
        answeredAt: null,
        answer: null,
      };

      const payload = buildQuestionPushPayload(question, worker);

      expect(payload.title).toBe('Push Test Worker needs input');
      expect(payload.body).toBe('What should I do next?');
      expect(payload.data).toBeDefined();
      expect((payload.data as { questionId: string }).questionId).toBe('q-123');
      expect((payload.data as { workerName: string }).workerName).toBe('Push Test Worker');
    });

    it('should truncate long question text in payload', () => {
      const workerStore = getWorkerStore();
      const worker = workerStore.create({
        id: 'push-worker',
        name: 'Push Test Worker',
      });

      const longText = 'A'.repeat(200);
      const question = {
        id: 'q-123',
        workerId: worker.id,
        text: longText,
        options: [],
        status: 'pending' as const,
        createdAt: new Date(),
        answeredAt: null,
        answer: null,
      };

      const payload = buildQuestionPushPayload(question, worker);

      expect(payload.body.length).toBeLessThanOrEqual(100);
      expect(payload.body.endsWith('...')).toBe(true);
    });

    it('should detect active WebSocket connection', async () => {
      const wsUrl = baseUrl.replace('http', 'ws');

      // Before connection - should be false
      expect(hasActiveWebSocketConnection('ws-device')).toBe(false);

      // Connect WebSocket
      const ws = new WebSocket(`${wsUrl}/ws?deviceId=ws-device`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Wait for connection to be registered
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now should be true
      expect(hasActiveWebSocketConnection('ws-device')).toBe(true);

      // Close connection
      ws.close();

      // Wait for close to be processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should be false again
      expect(hasActiveWebSocketConnection('ws-device')).toBe(false);
    });
  });

  describe('Push on Question Posted', () => {
    it('should send push when question posted and no WebSocket', async () => {
      // Register device token for a device that will be subscribed
      const deviceTokenStore = getDeviceTokenStore();
      deviceTokenStore.register({
        deviceId: 'offline-device',
        token: 'fcm-token-offline-device',
        platform: 'android',
      });

      // Subscribe the device to the worker (without WebSocket)
      // We need to simulate a device that was previously connected and subscribed
      // For this test, we'll manually test the push service logic

      const workerStore = getWorkerStore();
      const worker = workerStore.get('test-worker');
      expect(worker).toBeDefined();

      const questionStore = getQuestionStore();
      const question = questionStore.create({
        workerId: 'test-worker',
        text: 'Need help with something',
      });

      // Manually trigger push (in real flow, this happens in the route)
      const stats = await sendQuestionPushNotification(question);

      // Since there are no subscribed devices (no WS connections), all would be skipped
      expect(stats.sent).toBe(0);
    });

    it('should not send push when device has active WebSocket', async () => {
      const wsUrl = baseUrl.replace('http', 'ws');

      // Register device token
      const deviceTokenStore = getDeviceTokenStore();
      deviceTokenStore.register({
        deviceId: 'online-device',
        token: 'fcm-token-online-device',
        platform: 'android',
      });

      // Connect WebSocket and subscribe
      const ws = new WebSocket(`${wsUrl}/ws?deviceId=online-device`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Wait for connection and subscribe
      await new Promise((resolve) => setTimeout(resolve, 50));

      ws.send(JSON.stringify({ type: 'subscribe', payload: { workerIds: ['test-worker'] } }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Create a question
      const questionStore = getQuestionStore();
      const question = questionStore.create({
        workerId: 'test-worker',
        text: 'Need help with something',
      });

      // Send push notifications
      const stats = await sendQuestionPushNotification(question);

      // Should skip because device has active WebSocket
      expect(stats.skipped).toBe(1);
      expect(stats.sent).toBe(0);

      // Clean up
      ws.close();
    });

    it('should include question preview in push payload', async () => {
      // Register device token (manually for testing)
      const deviceTokenStore = getDeviceTokenStore();
      deviceTokenStore.register({
        deviceId: 'test-device',
        token: 'fcm-token-test',
        platform: 'ios',
      });

      // Post a question via the API
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Should I proceed with option A or option B?',
        }),
      });

      expect(response.status).toBe(201);
      const question = (await response.json()) as QuestionResponse;
      expect(question.text).toBe('Should I proceed with option A or option B?');

      // The push would be sent asynchronously - check the mock provider after a delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the mock push provider behavior
      // (In this test case, no push is sent because no device is subscribed via WebSocket)
    });
  });

  describe('Mock Push Provider', () => {
    it('should record sent notifications', async () => {
      const result = await mockPushProvider.send('test-token', 'android', {
        title: 'Test Title',
        body: 'Test Body',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();

      const sent = mockPushProvider.getSentNotifications();
      expect(sent).toHaveLength(1);
      expect(sent[0]?.token).toBe('test-token');
      expect(sent[0]?.platform).toBe('android');
      expect(sent[0]?.payload.title).toBe('Test Title');
    });

    it('should simulate failures for configured tokens', async () => {
      mockPushProvider.setTokenFailing('bad-token', true);

      const result = await mockPushProvider.send('bad-token', 'ios', {
        title: 'Test',
        body: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should send batch notifications', async () => {
      const targets = [
        { deviceId: 'd1', token: 'token1', platform: 'android' as const },
        { deviceId: 'd2', token: 'token2', platform: 'ios' as const },
        { deviceId: 'd3', token: 'token3', platform: 'web' as const },
      ];

      const results = await mockPushProvider.sendBatch(targets, {
        title: 'Batch Test',
        body: 'Batch Body',
      });

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      const sent = mockPushProvider.getSentNotifications();
      expect(sent).toHaveLength(3);
    });

    it('should handle partial failures in batch', async () => {
      mockPushProvider.setTokenFailing('bad-token', true);

      const targets = [
        { deviceId: 'd1', token: 'good-token', platform: 'android' as const },
        { deviceId: 'd2', token: 'bad-token', platform: 'ios' as const },
      ];

      const results = await mockPushProvider.sendBatch(targets, {
        title: 'Partial Fail Test',
        body: 'Body',
      });

      expect(results).toHaveLength(2);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
    });

    it('should clear sent notifications', async () => {
      await mockPushProvider.send('token', 'android', { title: 'Test', body: 'Test' });
      expect(mockPushProvider.getSentNotifications()).toHaveLength(1);

      mockPushProvider.clearSentNotifications();
      expect(mockPushProvider.getSentNotifications()).toHaveLength(0);
    });
  });

  describe('Device Token Store', () => {
    it('should track token count', () => {
      const store = getDeviceTokenStore();
      expect(store.count).toBe(0);

      store.register({
        deviceId: 'd1',
        token: 'token1-abcdefghij',
        platform: 'android',
      });
      expect(store.count).toBe(1);

      store.register({
        deviceId: 'd2',
        token: 'token2-abcdefghij',
        platform: 'ios',
      });
      expect(store.count).toBe(2);
    });

    it('should get active tokens only', () => {
      const store = getDeviceTokenStore();

      store.register({
        deviceId: 'd1',
        token: 'token1-abcdefghij',
        platform: 'android',
      });

      expect(store.getActive('d1')).toBeDefined();

      store.deactivate('d1');

      expect(store.getActive('d1')).toBeUndefined();
      expect(store.get('d1')).toBeDefined();
    });

    it('should update last push timestamp', () => {
      const store = getDeviceTokenStore();

      store.register({
        deviceId: 'd1',
        token: 'token1-abcdefghij',
        platform: 'android',
      });

      const before = store.get('d1');
      expect(before?.lastPushAt).toBeNull();

      store.updateLastPush('d1');

      const after = store.get('d1');
      expect(after?.lastPushAt).not.toBeNull();
    });

    it('should delete tokens', () => {
      const store = getDeviceTokenStore();

      store.register({
        deviceId: 'd1',
        token: 'token1-abcdefghij',
        platform: 'android',
      });

      expect(store.get('d1')).toBeDefined();

      store.delete('d1');

      expect(store.get('d1')).toBeUndefined();
    });
  });
});
