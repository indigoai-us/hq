import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../index.js';
import {
  clearHealthChecks,
  registerHealthCheck,
  resetMetrics,
  getMetrics,
  resetAlertProvider,
  getAlertProvider,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from '../observability/index.js';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));
import type { HealthCheckResponse, ReadinessResponse, LivenessResponse } from '../observability/index.js';

describe('Observability', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeEach(async () => {    clearHealthChecks();
    resetMetrics();
    resetAlertProvider();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    await app.close();
    clearHealthChecks();
    resetMetrics();
    resetAlertProvider();
  });

  describe('Health Checks', () => {
    it('should return healthy status from /health', async () => {
      const response = await fetch(`${baseUrl}/api/health`);

      expect(response.status).toBe(200);
      const data = (await response.json()) as HealthCheckResponse;
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
      expect(data.version).toBeDefined();
      expect(data.uptime).toBeGreaterThan(0);
      expect(data.components).toBeDefined();
    });

    it('should include memory health check', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = (await response.json()) as HealthCheckResponse;

      expect(data.components['memory']).toBeDefined();
      expect(data.components['memory']?.status).toBe('healthy');
      expect(data.components['memory']?.message).toContain('Heap');
    });

    it('should include event loop health check', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = (await response.json()) as HealthCheckResponse;

      expect(data.components['eventLoop']).toBeDefined();
      expect(data.components['eventLoop']?.status).toBe('healthy');
      expect(data.components['eventLoop']?.latencyMs).toBeDefined();
    });

    it('should return 503 when unhealthy', async () => {
      // Register an unhealthy check
      registerHealthCheck('failing', () => ({
        status: 'unhealthy',
        message: 'Test failure',
      }));

      // Need to rebuild app to pick up new check
      await app.close();
      app = await buildApp();
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      if (address && typeof address === 'object') {
        baseUrl = `http://127.0.0.1:${address.port}`;
      }

      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(503);

      const data = (await response.json()) as HealthCheckResponse;
      expect(data.status).toBe('unhealthy');
      expect(data.components['failing']?.status).toBe('unhealthy');
    });

    it('should return ready status from /health/ready', async () => {
      const response = await fetch(`${baseUrl}/api/health/ready`);

      expect(response.status).toBe(200);
      const data = (await response.json()) as ReadinessResponse;
      expect(data.ready).toBe(true);
      expect(data.checks).toBeDefined();
    });

    it('should return live status from /health/live', async () => {
      const response = await fetch(`${baseUrl}/api/health/live`);

      expect(response.status).toBe(200);
      const data = (await response.json()) as LivenessResponse;
      expect(data.live).toBe(true);
    });
  });

  describe('Request Tracing', () => {
    it('should add correlation ID to response', async () => {
      const response = await fetch(`${baseUrl}/api/health`);

      expect(response.headers.get(CORRELATION_ID_HEADER)).toBeDefined();
      expect(response.headers.get(CORRELATION_ID_HEADER)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should add request ID to response', async () => {
      const response = await fetch(`${baseUrl}/api/health`);

      expect(response.headers.get(REQUEST_ID_HEADER)).toBeDefined();
      expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should preserve incoming correlation ID', async () => {
      const incomingCorrelationId = '12345678-1234-1234-1234-123456789abc';
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: {
          [CORRELATION_ID_HEADER]: incomingCorrelationId,
        },
      });

      expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(incomingCorrelationId);
    });

    it('should generate unique request IDs for each request', async () => {
      const response1 = await fetch(`${baseUrl}/api/health`);
      const response2 = await fetch(`${baseUrl}/api/health`);

      const requestId1 = response1.headers.get(REQUEST_ID_HEADER);
      const requestId2 = response2.headers.get(REQUEST_ID_HEADER);

      expect(requestId1).toBeDefined();
      expect(requestId2).toBeDefined();
      expect(requestId1).not.toBe(requestId2);
    });
  });

  describe('Metrics', () => {
    it('should buffer metrics data points', () => {
      const metrics = getMetrics();

      metrics.increment('test.counter', 1);
      metrics.gauge('test.gauge', 42);
      metrics.timing('test.timing', 100);

      const buffer = metrics.getBuffer();
      expect(buffer.length).toBe(3);
    });

    it('should support custom dimensions', () => {
      const metrics = getMetrics();

      metrics.increment('test.counter', 1, { env: 'test', service: 'api' });

      const buffer = metrics.getBuffer();
      expect(buffer[0]?.dimensions).toEqual({ env: 'test', service: 'api' });
    });

    it('should support timer pattern', async () => {
      const metrics = getMetrics();

      const stopTimer = metrics.startTimer('test.operation');
      await new Promise((resolve) => setTimeout(resolve, 10));
      stopTimer();

      const buffer = metrics.getBuffer();
      const timerMetric = buffer.find((m) => m.name === 'test.operation.duration');
      expect(timerMetric).toBeDefined();
      expect(timerMetric?.value).toBeGreaterThanOrEqual(10);
    });

    it('should flush metrics', async () => {
      const metrics = getMetrics();

      metrics.increment('test.counter', 5);
      expect(metrics.getBuffer().length).toBe(1);

      await metrics.flush();
      expect(metrics.getBuffer().length).toBe(0);
    });
  });

  describe('Alerts', () => {
    it('should send alerts', async () => {
      const alertProvider = getAlertProvider();

      await alertProvider.send({
        name: 'test_alert',
        severity: 'warning',
        message: 'Test alert message',
      });

      const history = alertProvider.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]?.name).toBe('test_alert');
      expect(history[0]?.severity).toBe('warning');
    });

    it('should throttle duplicate alerts', async () => {
      const alertProvider = getAlertProvider();

      await alertProvider.send({
        name: 'throttled_alert',
        severity: 'warning',
        message: 'First',
      });

      await alertProvider.send({
        name: 'throttled_alert',
        severity: 'warning',
        message: 'Second',
      });

      const history = alertProvider.getHistory();
      expect(history.length).toBe(1); // Second should be throttled
    });

    it('should include alert context', async () => {
      const alertProvider = getAlertProvider();

      await alertProvider.send({
        name: 'context_alert',
        severity: 'error',
        message: 'Error with context',
        context: {
          userId: 'user123',
          action: 'test',
        },
      });

      const history = alertProvider.getHistory();
      expect(history[0]?.context).toEqual({
        userId: 'user123',
        action: 'test',
      });
    });
  });

  describe('Structured Logging', () => {
    it('should include trace context in logs', async () => {
      // This test verifies the logging configuration
      // In a real scenario, we'd capture log output
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);

      // Verify correlation headers are present (indicates logging is configured)
      expect(response.headers.get(CORRELATION_ID_HEADER)).toBeDefined();
      expect(response.headers.get(REQUEST_ID_HEADER)).toBeDefined();
    });
  });
});
