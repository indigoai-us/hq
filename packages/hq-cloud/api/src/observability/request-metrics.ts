/**
 * Request metrics middleware
 * Automatically tracks request counts, durations, and errors
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMetrics, ApiMetrics } from './metrics.js';
import { getAlertProvider, AlertNames } from './alerts.js';

/**
 * Error rate tracking for alerting
 */
interface ErrorRateTracker {
  windowMs: number;
  threshold: number;
  errors: number[];
  requests: number[];
}

const errorRateTracker: ErrorRateTracker = {
  windowMs: 60000, // 1 minute window
  threshold: 0.1, // 10% error rate
  errors: [],
  requests: [],
};

/**
 * Register request metrics hooks
 */
export function registerRequestMetrics(fastify: FastifyInstance): void {
  const metrics = getMetrics();

  // Track request start
  fastify.addHook('onRequest', (request: FastifyRequest, _reply, done) => {
    // Store start time for duration calculation
    (request as FastifyRequest & { metricsStartTime?: number }).metricsStartTime = Date.now();

    // Increment request count
    metrics.increment(ApiMetrics.REQUEST_COUNT, 1, {
      method: request.method,
      path: normalizePath(request.url),
    });

    done();
  });

  // Track request completion
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as FastifyRequest & { metricsStartTime?: number }).metricsStartTime;
    if (startTime) {
      const duration = Date.now() - startTime;

      // Record request duration
      metrics.timing(ApiMetrics.REQUEST_DURATION, duration, {
        method: request.method,
        path: normalizePath(request.url),
        statusCode: String(reply.statusCode),
      });

      // Track for error rate alerting
      trackForErrorRate(reply.statusCode);
    }

    // Track errors
    if (reply.statusCode >= 400) {
      metrics.increment(ApiMetrics.ERROR_COUNT, 1, {
        method: request.method,
        path: normalizePath(request.url),
        statusCode: String(reply.statusCode),
        errorType: getErrorType(reply.statusCode),
      });
    }
  });

  // Track unhandled errors
  fastify.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply, error: Error) => {
    metrics.increment(ApiMetrics.ERROR_COUNT, 1, {
      method: request.method,
      path: normalizePath(request.url),
      errorType: 'unhandled',
      errorName: error.name,
    });

    // Alert on unhandled errors
    void checkAndAlert(error);
  });
}

/**
 * Normalize path for metrics (remove dynamic segments)
 */
function normalizePath(url: string): string {
  // Remove query string
  const path = url.split('?')[0] ?? url;

  // Replace common dynamic segments with placeholders
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Get error type category
 */
function getErrorType(statusCode: number): string {
  if (statusCode >= 500) return 'server_error';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode === 401 || statusCode === 403) return 'auth_error';
  if (statusCode === 404) return 'not_found';
  if (statusCode >= 400) return 'client_error';
  return 'unknown';
}

/**
 * Track request for error rate calculation
 */
function trackForErrorRate(statusCode: number): void {
  const now = Date.now();
  const cutoff = now - errorRateTracker.windowMs;

  // Clean old entries
  errorRateTracker.requests = errorRateTracker.requests.filter((t) => t > cutoff);
  errorRateTracker.errors = errorRateTracker.errors.filter((t) => t > cutoff);

  // Add current request
  errorRateTracker.requests.push(now);
  if (statusCode >= 500) {
    errorRateTracker.errors.push(now);
  }

  // Check if error rate exceeds threshold
  if (errorRateTracker.requests.length >= 10) {
    const errorRate = errorRateTracker.errors.length / errorRateTracker.requests.length;
    if (errorRate >= errorRateTracker.threshold) {
      void sendHighErrorRateAlert(errorRate);
    }
  }
}

/**
 * Send high error rate alert
 */
async function sendHighErrorRateAlert(errorRate: number): Promise<void> {
  const alertProvider = getAlertProvider();
  await alertProvider.send({
    name: AlertNames.HIGH_ERROR_RATE,
    severity: 'warning',
    message: `High error rate detected: ${(errorRate * 100).toFixed(1)}%`,
    context: {
      errorRate,
      windowMs: errorRateTracker.windowMs,
      requestCount: errorRateTracker.requests.length,
      errorCount: errorRateTracker.errors.length,
    },
  });
}

/**
 * Check and alert on unhandled errors
 */
async function checkAndAlert(error: Error): Promise<void> {
  const alertProvider = getAlertProvider();
  await alertProvider.send({
    name: 'unhandled_error',
    severity: 'error',
    message: error.message,
    context: {
      errorName: error.name,
      stack: error.stack,
    },
  });
}
