import express from 'express';
import { config } from './config.js';
import { getQueueDepth } from './db.js';
import { runtime } from './container-runtime.js';
import type { HealthStatus } from './types.js';

const startedAt = Date.now();

export function createHealthApp(): express.Application {
  const app = express();

  app.get('/health', (_req, res) => {
    let queueDepth = 0;
    try {
      queueDepth = getQueueDepth();
    } catch {
      // DB may not be init'd yet — return 0
    }

    const status: HealthStatus = {
      status: 'ok',
      uptime: Date.now() - startedAt,
      queueDepth,
      activeContainers: runtime.count,
      timestamp: Date.now(),
    };

    res.json(status);
  });

  app.get('/status', (_req, res) => {
    res.json({
      version: '0.1.0',
      env: config.NODE_ENV,
      channels: {
        telegram: config.TELEGRAM_ENABLED,
        slack: config.SLACK_ENABLED,
      },
      containers: {
        active: runtime.count,
        max: config.MAX_CONCURRENT_CONTAINERS,
        image: config.AGENT_IMAGE,
      },
    });
  });

  return app;
}

export function startHealthServer(port: number = config.PORT): Promise<import('http').Server> {
  return new Promise((resolve) => {
    const app = createHealthApp();
    const server = app.listen(port, () => {
      console.log(`[health] HTTP server listening on :${port}`);
      resolve(server);
    });
  });
}
