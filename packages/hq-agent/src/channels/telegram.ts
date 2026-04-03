// Telegram channel via grammy.
// Registers itself in the channel registry at module load time.

import { Bot, webhookCallback } from 'grammy';
import { config } from '../config.js';
import { insertMessage, upsertChat } from '../db.js';
import { register } from './registry.js';
import type { Channel, ChannelMessage, ChannelReply } from './types.js';

type MessageHandler = (msg: ChannelMessage) => Promise<void>;

class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private bot: Bot | null = null;
  private _messageHandler: MessageHandler | null = null;

  onMessage(handler: MessageHandler): void {
    this._messageHandler = handler;
  }

  async init(): Promise<void> {
    if (!config.TELEGRAM_ENABLED) {
      console.log('[telegram] Disabled — skipping init');
      return;
    }

    if (!config.TELEGRAM_BOT_TOKEN) {
      console.warn('[telegram] TELEGRAM_BOT_TOKEN not set — skipping init');
      return;
    }

    this.bot = new Bot(config.TELEGRAM_BOT_TOKEN);

    this.bot.on('message:text', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const groupId = `telegram-${chatId}`;
      const senderId = String(ctx.from?.id ?? 'unknown');
      const senderName =
        [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') ||
        ctx.from?.username ||
        'Unknown';
      const content = ctx.message.text;
      const timestamp = Date.now();

      // Upsert chat record
      await upsertChat({
        id: chatId,
        channel: 'telegram',
        group_id: groupId,
        title: ctx.chat.type === 'private' ? senderName : (ctx.chat.title ?? null),
        created_at: timestamp,
        last_message_at: timestamp,
      });

      // Insert message into SQLite
      const messageId = await insertMessage({
        group_id: groupId,
        chat_id: chatId,
        channel: 'telegram',
        sender_id: senderId,
        sender_name: senderName,
        content,
        status: 'pending',
      });

      const channelMsg: ChannelMessage = {
        messageId,
        groupId,
        chatId,
        channel: 'telegram',
        senderId,
        senderName,
        content,
        timestamp,
      };

      if (this._messageHandler) {
        await this._messageHandler(channelMsg);
      }
    });

    if (config.NODE_ENV === 'production') {
      // Webhook mode — caller must register the express route via webhookHandler()
      console.log('[telegram] Running in webhook mode');
    } else {
      // Development: long-polling
      console.log('[telegram] Starting in polling mode');
      void this.bot.start({
        onStart: (info) => console.log(`[telegram] Bot started as @${info.username}`),
      });
    }
  }

  /**
   * Returns an express-compatible handler for webhook mode.
   * Mount at /webhook/telegram in the HTTP server.
   */
  webhookHandler(): (req: unknown, res: unknown, next: unknown) => void {
    if (!this.bot) {
      throw new Error('[telegram] Bot not initialized. Call init() first.');
    }
    return webhookCallback(this.bot, 'express') as (req: unknown, res: unknown, next: unknown) => void;
  }

  async sendMessage(reply: ChannelReply): Promise<void> {
    if (!this.bot) {
      console.warn('[telegram] Cannot send message — bot not initialized');
      return;
    }
    await this.bot.api.sendMessage(reply.chatId, reply.content);
  }

  async shutdown(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
      console.log('[telegram] Bot stopped');
    }
  }
}

// Self-register at module load
const telegramChannel = new TelegramChannel();
register(telegramChannel);

export { telegramChannel };
