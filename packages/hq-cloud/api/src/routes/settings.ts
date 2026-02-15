/**
 * Settings Routes
 *
 * Per-user settings: HQ directory, notifications, onboarding status.
 */

import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import {
  getUserSettings,
  createUserSettings,
  updateUserSettings,
  isOnboarded,
  setClaudeToken,
  hasClaudeToken,
  removeClaudeToken,
} from '../data/user-settings.js';
import { config } from '../config.js';
import { provisionS3Space, uploadWithProgress } from '../data/initial-sync.js';
import type { UpdateUserSettingsInput } from '../data/user-settings.js';

interface SetupBody {
  hqDir: string;
}

interface UpdateSettingsBody {
  hqDir?: string;
  notifications?: {
    enabled?: boolean;
    questionsEnabled?: boolean;
    permissionsEnabled?: boolean;
    statusUpdatesEnabled?: boolean;
  };
}

function mongoRequired(_fastify: FastifyInstance): boolean {
  if (!config.mongodbUri) {
    return false;
  }
  return true;
}

export const settingsRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  // GET /api/settings — current user's settings
  fastify.get('/settings', async (request, reply) => {
    if (!mongoRequired(fastify)) {
      return reply.send({
        hqDir: config.hqDir,
        notifications: {
          enabled: true,
          questionsEnabled: true,
          permissionsEnabled: true,
          statusUpdatesEnabled: true,
        },
      });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const settings = await getUserSettings(userId);
    if (!settings) {
      return reply.send({
        hqDir: null,
        s3Prefix: null,
        notifications: {
          enabled: true,
          questionsEnabled: true,
          permissionsEnabled: true,
          statusUpdatesEnabled: true,
        },
        onboarded: false,
      });
    }

    return reply.send({
      hqDir: settings.hqDir,
      s3Prefix: settings.s3Prefix,
      notifications: settings.notifications,
      onboarded: settings.hqDir !== null,
      hasClaudeToken: settings.claudeTokenEncrypted !== null,
      claudeTokenSetAt: settings.claudeTokenSetAt?.toISOString() ?? null,
    });
  });

  // PUT /api/settings — update settings
  fastify.put<{ Body: UpdateSettingsBody }>('/settings', async (request, reply) => {
    if (!mongoRequired(fastify)) {
      return reply.send({ ok: true });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { hqDir, notifications } = request.body ?? {};

    if (hqDir !== undefined && typeof hqDir !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'hqDir must be a string',
      });
    }

    if (hqDir !== undefined && hqDir.trim().length === 0) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'hqDir cannot be empty',
      });
    }

    const input: UpdateUserSettingsInput = {};
    if (hqDir !== undefined) input.hqDir = hqDir;
    if (notifications !== undefined) input.notifications = notifications;

    const updated = await updateUserSettings(userId, input);
    return reply.send({
      hqDir: updated?.hqDir ?? null,
      notifications: updated?.notifications,
      onboarded: updated?.hqDir !== null,
    });
  });

  // GET /api/settings/onboarding-status — check if user has completed setup
  fastify.get('/settings/onboarding-status', async (request, reply) => {
    if (!mongoRequired(fastify)) {
      return reply.send({ onboarded: true });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const onboarded = await isOnboarded(userId);
    return reply.send({ onboarded });
  });

  // POST /api/settings/setup — initial onboarding: validate, provision S3, save settings (fast)
  fastify.post<{ Body: SetupBody }>('/settings/setup', async (request, reply) => {
    if (!mongoRequired(fastify)) {
      return reply.send({ ok: true, onboarded: true, totalFiles: 0 });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { hqDir } = request.body ?? {};

    if (!hqDir || typeof hqDir !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'hqDir is required',
      });
    }

    if (hqDir.trim().length === 0) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'hqDir cannot be empty',
      });
    }

    // Provision S3 space and count files (fast — no upload yet)
    let s3Prefix: string | undefined;
    let totalFiles = 0;
    try {
      const result = await provisionS3Space({
        userId,
        hqDir,
        bucketName: config.s3BucketName,
        region: config.s3Region,
        logger: fastify.log,
      });
      s3Prefix = result.s3Prefix;
      totalFiles = result.totalFiles;
    } catch (err) {
      fastify.log.error({ err }, 'S3 provisioning failed — saving hqDir without s3Prefix');
    }

    // Check if already set up — update if so, create if not
    const existing = await getUserSettings(userId);
    if (existing) {
      await updateUserSettings(userId, { hqDir, s3Prefix });
    } else {
      await createUserSettings(userId, { hqDir, s3Prefix });
    }

    return reply.status(201).send({
      ok: true,
      onboarded: true,
      hqDir,
      s3Prefix: s3Prefix ?? null,
      totalFiles,
    });
  });

  // GET /api/settings/setup/sync — SSE stream: upload files with progress
  fastify.get('/settings/setup/sync', async (request, reply) => {
    // CORS headers for SSE (reply.raw bypasses Fastify's CORS plugin)
    const origin = request.headers.origin || '*';
    const sseHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    };

    if (!mongoRequired(fastify)) {
      reply.raw.writeHead(200, sseHeaders);
      reply.raw.write(`data: ${JSON.stringify({ done: true, uploaded: 0, total: 0, errors: 0 })}\n\n`);
      reply.raw.end();
      return reply;
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const settings = await getUserSettings(userId);
    if (!settings?.hqDir || !settings?.s3Prefix) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Run POST /api/settings/setup first',
      });
    }

    // Set up SSE headers
    reply.raw.writeHead(200, sseHeaders);

    // Track the last file that completed for display
    let lastCompletedFile = '';

    try {
      const result = await uploadWithProgress({
        userId,
        hqDir: settings.hqDir,
        bucketName: config.s3BucketName,
        region: config.s3Region,
        logger: fastify.log,
        onProgress: (progress) => {
          // Find the most recently completed file
          const justCompleted = progress.files.find(
            (f) => (f.status === 'completed' || f.status === 'skipped') && f.relativePath !== lastCompletedFile
          );
          if (justCompleted) {
            lastCompletedFile = justCompleted.relativePath;
          }

          const event = {
            uploaded: progress.completedFiles + progress.skippedFiles,
            total: progress.totalFiles,
            failed: progress.failedFiles,
            file: lastCompletedFile,
          };

          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      });

      reply.raw.write(`data: ${JSON.stringify({
        done: true,
        uploaded: result.filesUploaded,
        total: result.filesUploaded + result.errors,
        errors: result.errors,
      })}\n\n`);
    } catch (err) {
      fastify.log.error({ err }, 'Sync SSE upload failed');
      reply.raw.write(`data: ${JSON.stringify({ error: 'Upload failed' })}\n\n`);
    }

    reply.raw.end();
    return reply;
  });

  // GET /api/settings/claude-token — check if user has a token stored
  fastify.get('/settings/claude-token', async (request, reply) => {
    if (!mongoRequired(fastify)) {
      return reply.send({ hasToken: false, setAt: null });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const settings = await getUserSettings(userId);
    return reply.send({
      hasToken: settings?.claudeTokenEncrypted !== null && settings?.claudeTokenEncrypted !== undefined,
      setAt: settings?.claudeTokenSetAt?.toISOString() ?? null,
    });
  });

  // POST /api/settings/claude-token — store a Claude OAuth token
  fastify.post<{ Body: { token: string } }>('/settings/claude-token', async (request, reply) => {
    if (!mongoRequired(fastify)) {
      return reply.status(503).send({ error: 'Token storage requires MongoDB' });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { token } = request.body ?? {};
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'token is required and must be a non-empty string',
      });
    }

    // Ensure user settings exist (create if needed)
    const existing = await getUserSettings(userId);
    if (!existing) {
      await createUserSettings(userId, { hqDir: '' });
    }

    await setClaudeToken(userId, token.trim());

    const updated = await getUserSettings(userId);
    return reply.send({
      ok: true,
      hasToken: true,
      setAt: updated?.claudeTokenSetAt?.toISOString() ?? null,
    });
  });

  // DELETE /api/settings/claude-token — remove the stored token
  fastify.delete('/settings/claude-token', async (request, reply) => {
    if (!mongoRequired(fastify)) {
      return reply.send({ ok: true, hasToken: false });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    await removeClaudeToken(userId);
    return reply.send({ ok: true, hasToken: false });
  });

  done();
};
