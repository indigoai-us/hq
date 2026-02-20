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
  removeClaudeToken,
} from '../data/user-settings.js';
import { config } from '../config.js';
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
      return reply.send({ ok: true, onboarded: true });
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

    // Derive S3 prefix from userId (same convention as provisionS3Prefix in user-settings.ts).
    // The clerkUserId already starts with 'user_' — no double-prefix needed.
    const s3Prefix = `${userId}/hq/`;

    // Check if already set up — update if so, create if not
    const existing = await getUserSettings(userId);
    if (existing) {
      await updateUserSettings(userId, { hqDir, s3Prefix });
    } else {
      await createUserSettings(userId, { hqDir, s3Prefix });
    }

    fastify.log.info({ userId, hqDir, s3Prefix }, 'Setup complete — S3 prefix assigned');

    return reply.status(201).send({
      ok: true,
      onboarded: true,
      hqDir,
      s3Prefix,
    });
  });

  // GET /api/settings/setup/sync — DEPRECATED
  // Server-side filesystem walk + upload has been removed (doesn't work in ECS Fargate).
  // Clients should use the push model: scan local files and POST to /api/files/upload.
  fastify.get('/settings/setup/sync', async (_request, reply) => {
    return reply.status(410).send({
      error: 'Gone',
      message:
        'Server-side sync has been removed. ' +
        'Use the client-push model: scan local files and upload via POST /api/files/upload.',
    });
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
