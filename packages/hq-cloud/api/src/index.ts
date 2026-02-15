import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { workerRoutes } from './routes/workers.js';
import { shareRoutes } from './routes/shares.js';
import { syncRoutes } from './routes/sync.js';
import { agentRoutes } from './routes/agents.js';
import { navigatorRoutes } from './routes/navigator.js';
import { settingsRoutes } from './routes/settings.js';
import { sessionRoutes } from './routes/sessions.js';
import { fileRoutes } from './routes/files.js';
import { websocketPlugin } from './ws/index.js';
import { registerAuthMiddleware } from './auth/index.js';
import { config } from './config.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { ensureUserSettingsIndexes } from './data/user-settings.js';
import { ensureSessionIndexes } from './data/sessions.js';
import { ensureSessionMessageIndexes } from './data/session-messages.js';
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
      serializers: {
        req(request) {
          const url = request.url?.replace(/token=[^&]+/, 'token=***') ?? request.url;
          return {
            method: request.method,
            url,
            hostname: request.hostname,
            remoteAddress: request.ip,
          };
        },
      },
    },
    // Disable default request/response logging — too noisy for WebSocket upgrade requests
    disableRequestLogging: true,
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
  // WS handles its own JWT verification on connect
  registerAuthMiddleware(app, {
    excludePaths: ['/api/health', '/api/health/ready', '/api/health/live'],
    excludePrefixes: ['/ws'],
  });

  // Register routes
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(workerRoutes, { prefix: '/api' });
  await app.register(shareRoutes, { prefix: '/api' });
  await app.register(syncRoutes, { prefix: '/api' });
  await app.register(agentRoutes, { prefix: '/api' });
  await app.register(navigatorRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(sessionRoutes, { prefix: '/api' });
  await app.register(fileRoutes, { prefix: '/api' });

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

  // Connect to MongoDB if URI is configured
  if (config.mongodbUri) {
    try {
      await connectMongo();
      await ensureUserSettingsIndexes();
      await ensureSessionIndexes();
      await ensureSessionMessageIndexes();
      app.log.info('Connected to MongoDB');
    } catch (err) {
      app.log.error({ err }, 'Failed to connect to MongoDB');
      process.exit(1);
    }
  } else {
    app.log.warn('MONGODB_URI not set — user settings will not persist');
  }

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
      await disconnectMongo();
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
