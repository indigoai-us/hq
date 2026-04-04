// Webhook server — registers HTTP routes onto the shared express app.
// Only active when SLACK_ENABLED=true and NOT using socket mode.
// For the current implementation (Socket Mode), this module is a no-op stub
// but provides the interface for future HTTP mode migration.

import express from 'express';
import { config } from '../config.js';

/**
 * Register webhook routes onto an existing express app.
 * Call this after createHealthApp() and before server.listen().
 *
 * Currently: registers /webhook/telegram for grammy webhook mode (production).
 * Socket Mode Slack does not need an HTTP route.
 */
export function registerWebhookRoutes(app: express.Application): void {
  if (config.TELEGRAM_ENABLED && config.NODE_ENV === 'production') {
    // Lazily import the telegram channel to avoid circular init issues
    // The actual webhook registration happens via the telegramChannel.webhookHandler()
    // Attach middleware: express.raw is needed for grammy webhook signature verification
    app.use('/webhook/telegram', express.json());

    app.use('/webhook/telegram', async (req, res, next) => {
      try {
        const { telegramChannel } = await import('./telegram.js');
        const handler = telegramChannel.webhookHandler();
        handler(req, res, next);
      } catch (err) {
        console.error('[webhook] Telegram handler error:', err);
        next(err);
      }
    });

    console.log('[webhook] Registered /webhook/telegram');
  }

  // Slack uses Socket Mode — no HTTP route needed.
  // If switching to HTTP mode in future:
  // 1. Create @slack/bolt App with HTTPReceiver
  // 2. Register app.receiver.router at /webhook/slack
}
