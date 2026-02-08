/**
 * Request tracing with correlation IDs
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { RequestContext } from './types.js';

/** Header name for correlation ID */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Header name for request ID */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Extend Fastify request with tracing context
 */
declare module 'fastify' {
  interface FastifyRequest {
    traceContext?: RequestContext;
  }
}

/**
 * Register request tracing hooks
 * Adds correlation ID and request ID to all requests
 */
export function registerTracing(fastify: FastifyInstance): void {
  // Add tracing context on request start
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Get or generate correlation ID (allows distributed tracing across services)
    const correlationId =
      (request.headers[CORRELATION_ID_HEADER] as string | undefined) ?? randomUUID();

    // Always generate a new request ID for this specific request
    const requestId = randomUUID();

    // Create trace context
    const traceContext: RequestContext = {
      correlationId,
      requestId,
      startTime: Date.now(),
      method: request.method,
      path: request.url.split('?')[0] ?? request.url,
      userAgent: request.headers['user-agent'],
      clientIp: request.ip,
    };

    // Attach to request
    request.traceContext = traceContext;

    // Add to response headers
    void reply.header(CORRELATION_ID_HEADER, correlationId);
    void reply.header(REQUEST_ID_HEADER, requestId);
  });

  // Log request completion with timing
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.traceContext) {
      return;
    }

    const duration = Date.now() - request.traceContext.startTime;

    // Log structured request completion
    request.log.info(
      {
        correlationId: request.traceContext.correlationId,
        requestId: request.traceContext.requestId,
        method: request.traceContext.method,
        path: request.traceContext.path,
        statusCode: reply.statusCode,
        duration,
        userAgent: request.traceContext.userAgent,
        clientIp: request.traceContext.clientIp,
      },
      'request completed'
    );
  });
}

/**
 * Get correlation ID from request
 */
export function getCorrelationId(request: FastifyRequest): string | undefined {
  return request.traceContext?.correlationId;
}

/**
 * Get request ID from request
 */
export function getRequestId(request: FastifyRequest): string | undefined {
  return request.traceContext?.requestId;
}

/**
 * Get full trace context from request
 */
export function getTraceContext(request: FastifyRequest): RequestContext | undefined {
  return request.traceContext;
}

/**
 * Create child logger with trace context
 */
export function createChildLogger(
  request: FastifyRequest,
  bindings?: Record<string, unknown>
): ReturnType<FastifyRequest['log']['child']> {
  const context = request.traceContext;
  return request.log.child({
    correlationId: context?.correlationId,
    requestId: context?.requestId,
    ...bindings,
  });
}
