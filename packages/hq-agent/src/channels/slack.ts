// Slack channel via @slack/bolt (Socket Mode for development + simple cloud deploy).
// Registers itself in the channel registry at module load time.

import { App } from '@slack/bolt';
import { config } from '../config.js';
import { insertMessage, upsertChat } from '../db.js';
import { register } from './registry.js';
import type { Channel, ChannelMessage, ChannelReply } from './types.js';

type MessageHandler = (msg: ChannelMessage) => Promise<void>;

class SlackChannel implements Channel {
  readonly name = 'slack';
  private app: App | null = null;
  private _messageHandler: MessageHandler | null = null;

  onMessage(handler: MessageHandler): void {
    this._messageHandler = handler;
  }

  async init(): Promise<void> {
    if (!config.SLACK_ENABLED) {
      console.log('[slack] Disabled — skipping init');
      return;
    }

    if (!config.SLACK_BOT_TOKEN || !config.SLACK_APP_TOKEN) {
      console.warn('[slack] SLACK_BOT_TOKEN or SLACK_APP_TOKEN not set — skipping init');
      return;
    }

    // Socket Mode: no public webhook URL needed, works for dev + cloud
    this.app = new App({
      token: config.SLACK_BOT_TOKEN,
      signingSecret: config.SLACK_SIGNING_SECRET || 'placeholder',
      socketMode: true,
      appToken: config.SLACK_APP_TOKEN,
    });

    // Handle app_mention events (e.g. @bot in a channel)
    this.app.event('app_mention', async ({ event, say }) => {
      await this._handleSlackEvent({
        channelId: event.channel,
        userId: event.user ?? 'unknown',
        text: event.text,
        threadTs: event.thread_ts,
        eventTs: event.ts,
        say,
      });
    });

    // Handle DMs and direct messages to the app
    this.app.event('message', async ({ event, say }) => {
      // Only handle direct messages (channel_type = 'im') or explicit bot DMs
      // event type 'message' fires for all messages; filter to DMs only
      const msgEvent = event as { channel_type?: string; channel: string; user?: string; text?: string; thread_ts?: string; ts: string; bot_id?: string };
      if (msgEvent.channel_type !== 'im') return;
      // Ignore messages from bots (including self)
      if (msgEvent.bot_id) return;

      await this._handleSlackEvent({
        channelId: msgEvent.channel,
        userId: msgEvent.user ?? 'unknown',
        text: msgEvent.text ?? '',
        threadTs: msgEvent.thread_ts,
        eventTs: msgEvent.ts,
        say,
      });
    });

    await this.app.start();
    console.log('[slack] Socket Mode connected');
  }

  private async _handleSlackEvent(opts: {
    channelId: string;
    userId: string;
    text: string;
    threadTs?: string;
    eventTs: string;
    say: (payload: { text: string; thread_ts?: string }) => Promise<unknown>;
  }): Promise<void> {
    const { channelId, userId, text, threadTs, eventTs } = opts;
    const timestamp = Date.now();

    // For channel messages (app_mention), scope the chat to the thread so each
    // Slack thread gets its own isolated agent conversation.
    // chatId format: "{channelId}:{threadTs_or_eventTs}"
    //   - app_mention in existing thread: channelId + existing threadTs
    //   - app_mention starting new thread: channelId + eventTs (this message starts the thread)
    //   - DM (channel_type=im): just channelId (no colon, DM channel is already 1:1)
    const isDirectMessage = !text || !channelId.startsWith('C'); // DM channels start with D
    const threadKey = isDirectMessage ? null : (threadTs ?? eventTs);
    const chatId = threadKey ? `${channelId}:${threadKey}` : channelId;
    const groupId = `slack-${chatId}`;

    // Upsert chat record
    await upsertChat({
      id: chatId,
      channel: 'slack',
      group_id: groupId,
      title: null,
      created_at: timestamp,
      last_message_at: timestamp,
    });

    // Insert message into SQLite
    const messageId = await insertMessage({
      group_id: groupId,
      chat_id: chatId,
      channel: 'slack',
      sender_id: userId,
      sender_name: userId,
      content: text,
      status: 'pending',
    });

    const channelMsg: ChannelMessage = {
      messageId,
      groupId,
      chatId,
      channel: 'slack',
      senderId: userId,
      senderName: userId,
      content: text,
      timestamp,
    };

    if (this._messageHandler) {
      await this._messageHandler(channelMsg);
    }
  }

  async sendMessage(reply: ChannelReply): Promise<void> {
    if (!this.app) {
      console.warn('[slack] Cannot send message — app not initialized');
      return;
    }

    // chatId may be "{channelId}:{threadTs}" for threaded channel messages.
    // Parse it back out so we post to the right Slack channel + thread.
    let slackChannelId = reply.chatId;
    let threadTs = reply.threadTs;
    if (reply.chatId.includes(':')) {
      const colonIdx = reply.chatId.indexOf(':');
      slackChannelId = reply.chatId.slice(0, colonIdx);
      threadTs = threadTs ?? reply.chatId.slice(colonIdx + 1);
    }

    const payload: { channel: string; text: string; thread_ts?: string } = {
      channel: slackChannelId,
      text: reply.content,
    };

    if (threadTs) {
      payload.thread_ts = threadTs;
    }

    await this.app.client.chat.postMessage(payload);
  }

  async shutdown(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.app = null;
      console.log('[slack] App stopped');
    }
  }
}

// Self-register at module load
const slackChannel = new SlackChannel();
register(slackChannel);

export { slackChannel };
