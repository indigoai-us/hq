import { config } from './config.js';
import { initDb, closeDb, getPendingMessages, updateMessageStatus, getQueueDepth, resetOrphanedMessages } from './db.js';
import { GroupQueue } from './group-queue.js';
import { runContainer } from './container-runner.js';
import { writeRequest, waitForResponse, ensureIpcDir, DEFAULT_IPC_DIR } from './ipc.js';
import { createHealthApp } from './health.js';
import { runtime } from './container-runtime.js';
import { list as listChannels, loadChannels } from './channels/registry.js';
import { registerWebhookRoutes } from './channels/webhook-server.js';
import { syncHq, registerSyncRoutes } from './sync.js';
import { routeReply } from './router.js';
import { hydrateIfNeeded } from './storage/hydrate.js';
import { backupSession, registerBackupRoutes, startBackupInterval } from './storage/backup.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { Server } from 'http';

const POLL_INTERVAL_MS = 2000;
// Use DATA_DIR for IPC so it's on the EC2 host filesystem (not container /tmp).
// Docker-in-Docker: bind mounts must reference paths visible to the outer Docker daemon.
const IPC_DIR = path.join(config.DATA_DIR, 'ipc');

let pollTimer: NodeJS.Timeout | null = null;
let httpServer: Server | null = null;
let isShuttingDown = false;

const queue = new GroupQueue(config.MAX_CONCURRENT_CONTAINERS);

async function processMessage(messageId: number): Promise<void> {
  const { getMessageById } = await import('./db.js');
  const msg = await getMessageById(messageId);
  if (!msg) {
    console.warn(`[host] Message ${messageId} not found — skipping`);
    return;
  }

  const sessionId = crypto.randomUUID();
  // Container-internal paths (for file I/O within this host process)
  const groupDir = path.resolve(config.DATA_DIR, 'groups', msg.group_id);
  const globalDir = path.resolve(config.DATA_DIR, 'global');
  const sessionDir = path.resolve(config.DATA_DIR, 'sessions', sessionId);

  // EC2-host paths (for Docker bind-mount sources in Docker-in-Docker setup)
  const hostGroupDir = path.resolve(config.HOST_DATA_DIR, 'groups', msg.group_id);
  const hostGlobalDir = path.resolve(config.HOST_DATA_DIR, 'global');
  const hostSessionDir = path.resolve(config.HOST_DATA_DIR, 'sessions', sessionId);
  const hostIpcDir = path.resolve(config.HOST_DATA_DIR, 'ipc');

  // Ensure host directories exist before Docker bind-mount; Docker requires source dirs to exist.
  fs.mkdirSync(groupDir, { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const allowedBases = [
    path.resolve(config.DATA_DIR),
    path.resolve(config.HOST_DATA_DIR),
    IPC_DIR,
  ];

  // Write IPC request
  writeRequest(
    {
      messageId: msg.id,
      groupId: msg.group_id,
      chatId: msg.chat_id,
      sessionId,
      content: msg.content,
      senderName: msg.sender_name,
      channel: msg.channel,
      timestamp: Date.now(),
    },
    IPC_DIR
  );

  const containerName = `hq-${msg.group_id.slice(0, 20)}-${msg.id}`;

  await updateMessageStatus(msg.id, 'processing', { container_id: containerName });

  try {
    const containerResult = await runContainer(
      {
        image: config.AGENT_IMAGE,
        groupId: msg.group_id,
        sessionId,
        messageId: msg.id,
        mounts: [
          { src: hostGroupDir, dst: '/workspace/group', readOnly: false },
          { src: hostGlobalDir, dst: '/workspace/global', readOnly: true },
          { src: hostSessionDir, dst: '/workspace/session', readOnly: false },
          { src: hostIpcDir, dst: '/ipc', readOnly: false },
        ],
        env: {
          ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
          MESSAGE_ID: String(msg.id),
          IPC_DIR: '/ipc',
        },
        timeoutMs: config.CONTAINER_TIMEOUT_MS,
      },
      allowedBases
    );

    if (containerResult.timedOut) {
      await updateMessageStatus(msg.id, 'failed', { error: 'Container timed out' });
      return;
    }

    // Try to read IPC response (container should have written it)
    const response = await waitForResponse(msg.id, 5000, 200, IPC_DIR);

    if (response?.success) {
      // Route reply BEFORE marking done — if delivery fails, message stays
      // actionable and won't be silently lost.
      await routeReply(response, msg);
      await updateMessageStatus(msg.id, 'done');
      void backupSession(sessionId, sessionDir).catch((err) => {
        console.error('[host] Session backup error (non-fatal):', err);
      });
      console.log(`[host] Message ${msg.id} processed. Reply: ${response.reply?.slice(0, 80)}`);
    } else if (response) {
      // Container wrote a response but marked it as failed
      const errMsg = response.error ?? containerResult.stderr.slice(0, 200) ?? 'Unknown error';
      await updateMessageStatus(msg.id, 'failed', { error: errMsg });
      console.warn(`[host] Message ${msg.id} failed: ${errMsg}`);
    } else if (containerResult.exitCode === 0) {
      // Container exited cleanly but no IPC response file — treat as done
      // (agent-runner stub doesn't write IPC yet; graceful degradation until US-006)
      await updateMessageStatus(msg.id, 'done');
      void backupSession(sessionId, sessionDir).catch((err) => {
        console.error('[host] Session backup error (non-fatal):', err);
      });
      console.log(`[host] Message ${msg.id} done (no IPC response, exit 0)`);
    } else {
      const errMsg = containerResult.stderr.slice(0, 200) || `Container exited with code ${containerResult.exitCode}`;
      await updateMessageStatus(msg.id, 'failed', { error: errMsg });
      console.warn(`[host] Message ${msg.id} failed: ${errMsg}`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await updateMessageStatus(msg.id, 'failed', { error: errMsg });
    console.error(`[host] Error processing message ${msg.id}:`, err);
  }
}

async function pollMessages(): Promise<void> {
  if (isShuttingDown) return;

  try {
    const messages = await getPendingMessages(undefined, config.MAX_CONCURRENT_CONTAINERS * 2);

    for (const msg of messages) {
      // Mark as processing immediately to avoid double-dispatch on next poll
      await updateMessageStatus(msg.id, 'processing');

      queue.enqueue({
        groupId: msg.group_id,
        messageId: msg.id,
        run: () => processMessage(msg.id),
      });
    }
  } catch (err) {
    if (!isShuttingDown) {
      console.error('[host] Poll error:', err);
    }
  }
}

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('[hq-cloud] Shutting down...');

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Drain the queue (wait for running containers to finish)
  console.log(`[hq-cloud] Draining queue (${queue.depth} remaining)...`);
  await queue.drain();

  // Shut down channels
  for (const channel of listChannels()) {
    try {
      await channel.shutdown();
    } catch (err) {
      console.error(`[hq-cloud] Error shutting down channel "${channel.name}":`, err);
    }
  }

  // Close HTTP server
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => resolve());
    });
  }

  closeDb();
  console.log('[hq-cloud] Shutdown complete.');
}

async function main() {
  console.log('[hq-cloud] Starting...', {
    port: config.PORT,
    env: config.NODE_ENV,
    dataDir: config.DATA_DIR,
    maxContainers: config.MAX_CONCURRENT_CONTAINERS,
    image: config.AGENT_IMAGE,
  });

  // Initialise subsystems
  ensureIpcDir(IPC_DIR);
  initDb();

  // Hydrate from S3 if local data/ is empty (fresh ECS task launch)
  await hydrateIfNeeded();

  // Recover messages orphaned by prior crash (stuck in 'processing')
  const recovered = resetOrphanedMessages();
  if (recovered > 0) {
    console.log(`[hq-cloud] Recovered ${recovered} orphaned message(s) from prior crash`);
  }

  // Build health + webhook app, start HTTP server
  const app = createHealthApp();
  registerWebhookRoutes(app);
  registerSyncRoutes(app);
  registerBackupRoutes(app);
  httpServer = await new Promise<Server>((resolve) => {
    const s = app.listen(config.PORT, () => {
      console.log(`[health] HTTP server listening on :${config.PORT}`);
      resolve(s);
    });
  });

  // Kick off HQ skill sync (non-blocking)
  void syncHq();

  // Start periodic S3 backup interval
  startBackupInterval();

  // Load and init channel modules
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const channelsDir = path.join(__dirname, 'channels');
  await loadChannels(channelsDir);

  const channels = listChannels();
  for (const channel of channels) {
    try {
      await channel.init();
    } catch (err) {
      console.error(`[hq-cloud] Failed to init channel "${channel.name}":`, err);
    }
  }

  console.log('[hq-cloud] Engine ready. Channels:', {
    telegram: config.TELEGRAM_ENABLED,
    slack: config.SLACK_ENABLED,
    loaded: channels.map((c) => c.name),
  });

  // Start polling loop
  pollTimer = setInterval(() => {
    void pollMessages();
  }, POLL_INTERVAL_MS);

  // Run immediately on start
  void pollMessages();

  // Graceful shutdown handlers
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  console.log(`[hq-cloud] Polling every ${POLL_INTERVAL_MS}ms. Queue depth: ${getQueueDepth()}`);
}

main().catch((err) => {
  console.error('[hq-cloud] Fatal error:', err);
  process.exit(1);
});

// Export for testing
export { queue, runtime };
