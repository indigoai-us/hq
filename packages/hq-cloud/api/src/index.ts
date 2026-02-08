import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { workerRoutes } from './routes/workers.js';
import { questionRoutes } from './routes/questions.js';
import { chatRoutes } from './routes/chat.js';
import { pushRoutes } from './routes/push.js';
import { shareRoutes } from './routes/shares.js';
import { syncRoutes } from './routes/sync.js';
import { websocketPlugin } from './ws/index.js';
import { registerAuthMiddleware } from './auth/index.js';
import { config } from './config.js';
import {
  registerTracing,
  registerRequestMetrics,
  registerHealthCheck,
  BuiltInChecks,
  getMetrics,
} from './observability/index.js';
import type { FastifyInstance } from 'fastify';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Structured JSON logging in production
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
    // Generate request IDs
    genReqId: () => crypto.randomUUID(),
  });

  // Register tracing (correlation IDs, request timing)
  registerTracing(app);

  // Register request metrics
  registerRequestMetrics(app);

  // Register built-in health checks
  registerHealthCheck('memory', BuiltInChecks.memory);
  registerHealthCheck('eventLoop', BuiltInChecks.eventLoop);

  // Security middleware
  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  // Register auth middleware (excludes health and WS routes)
  registerAuthMiddleware(app, {
    excludePaths: ['/api/health', '/api/health/ready', '/api/health/live'],
    excludePrefixes: ['/ws', '/api/auth/keys/generate'],
  });

  // Register routes
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(workerRoutes, { prefix: '/api' });
  await app.register(questionRoutes, { prefix: '/api' });
  await app.register(chatRoutes, { prefix: '/api' });
  await app.register(pushRoutes, { prefix: '/api' });
  await app.register(shareRoutes, { prefix: '/api' });
  await app.register(syncRoutes, { prefix: '/api' });

  // Register WebSocket plugin
  await app.register(websocketPlugin, {
    heartbeatInterval: config.wsHeartbeatInterval,
    pingTimeout: config.wsPingTimeout,
  });

  return app;
}

async function start(): Promise<void> {
  const app = await buildApp();
  const metrics = getMetrics();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      {
        port: config.port,
        host: config.host,
        env: config.nodeEnv,
      },
      `Server running at http://${config.host}:${config.port}`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received shutdown signal');

    // Flush metrics before shutdown
    try {
      await metrics.flush();
    } catch (err) {
      app.log.error({ err }, 'Error flushing metrics');
    }

    try {
      await app.close();
      app.log.info('Server closed');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch(console.error);

export { buildApp };
