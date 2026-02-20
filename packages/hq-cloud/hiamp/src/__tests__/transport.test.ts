import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackTransport } from '../slack-transport.js';
import { ChannelResolver } from '../channel-resolver.js';
import { RateLimiter } from '../rate-limiter.js';
import type { HiampConfig } from '../config-loader.js';
import type { Transport, TransportSendResult, TransportResolveResult } from '../transport.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal HiampConfig for testing */
function makeConfig(overrides?: Partial<HiampConfig>): HiampConfig {
  return {
    transport: 'slack' as const,
    identity: {
      owner: 'stefan',
      instanceId: 'stefan-hq-primary',
    },
    peers: [
      {
        owner: 'alex',
        slackBotId: 'U0ALEX1234',
        trustLevel: 'channel-scoped',
        workers: [
          { id: 'backend-dev', description: 'API endpoints' },
          { id: 'qa-tester', description: 'Testing' },
        ],
      },
      {
        owner: 'maria',
        slackBotId: 'U0MARIA5678',
        trustLevel: 'token-verified',
        workers: [{ id: 'designer' }],
      },
    ],
    slack: {
      botToken: 'xoxb-test-token',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated',
      channels: {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
      },
      eventMode: 'socket',
    },
    workerPermissions: {
      default: 'deny',
      workers: [
        {
          id: 'architect',
          send: true,
          receive: true,
          allowedIntents: ['handoff', 'request', 'inform', 'query', 'response', 'acknowledge', 'error', 'share'],
          allowedPeers: ['*'],
        },
        {
          id: 'backend-dev',
          send: true,
          receive: true,
          allowedIntents: ['handoff', 'request'],
          allowedPeers: ['alex'],
        },
      ],
    },
    ...overrides,
  };
}

/** Create a mock Slack client */
function makeMockSlackClient() {
  return {
    chat: {
      postMessage: vi.fn().mockResolvedValue({
        ok: true,
        ts: '1234567890.123456',
        channel: 'C0HQAGENTS',
      }),
    },
    conversations: {
      open: vi.fn().mockResolvedValue({
        ok: true,
        channel: { id: 'D0DM' },
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Transport interface', () => {
  describe('SlackTransport implements Transport', () => {
    let config: HiampConfig;
    let mockSlack: ReturnType<typeof makeMockSlackClient>;
    let transport: SlackTransport;

    beforeEach(() => {
      config = makeConfig();
      mockSlack = makeMockSlackClient();
      const resolver = new ChannelResolver(config, mockSlack as any);
      const limiter = new RateLimiter({ minIntervalMs: 0 });
      transport = new SlackTransport(config, {
        slackClient: mockSlack as any,
        channelResolver: resolver,
        rateLimiter: limiter,
      });
    });

    it('has the name "slack"', () => {
      expect(transport.name).toBe('slack');
    });

    it('satisfies the Transport interface shape', () => {
      // Verify all required methods exist
      const t: Transport = transport;
      expect(typeof t.name).toBe('string');
      expect(typeof t.send).toBe('function');
      expect(typeof t.sendReply).toBe('function');
      expect(typeof t.listen).toBe('function');
      expect(typeof t.resolveChannel).toBe('function');
      expect(typeof t.stop).toBe('function');
      expect(typeof t.isListening).toBe('function');
    });

    describe('send', () => {
      it('sends a HIAMP message and returns transport-generic result', async () => {
        const result = await transport.send({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'handoff',
          body: 'The API contract is ready.',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.messageId).toBe('1234567890.123456');
        expect(result.channelId).toBe('C0HQAGENTS');
        expect(result.messageText).toContain('stefan/architect');
        expect(result.messageText).toContain('alex/backend-dev');
        expect(result.messageText).toContain('The API contract is ready.');
        expect(result.thread).toMatch(/^thr-/);
      });

      it('returns transport-generic error on failure', async () => {
        const result = await transport.send({
          to: 'alex/backend-dev',
          intent: 'handoff',
          body: 'No from or worker.',
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('INVALID_MESSAGE');
      });

      it('maps SLACK_API_ERROR to TRANSPORT_ERROR', async () => {
        mockSlack.chat.postMessage.mockRejectedValue(new Error('channel_not_found'));

        const result = await transport.send({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'handoff',
          body: 'Test.',
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('TRANSPORT_ERROR');
      });

      it('preserves KILL_SWITCH error code', async () => {
        const killConfig = makeConfig({
          security: { defaultTrustLevel: 'channel-scoped', killSwitch: true },
        });
        const resolver = new ChannelResolver(killConfig, mockSlack as any);
        const killTransport = new SlackTransport(killConfig, {
          slackClient: mockSlack as any,
          channelResolver: resolver,
          rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
        });

        const result = await killTransport.send({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'handoff',
          body: 'Test.',
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('KILL_SWITCH');
      });

      it('preserves RATE_LIMITED error code', async () => {
        mockSlack.chat.postMessage.mockRejectedValue(new Error('rate_limited'));

        const result = await transport.send({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'handoff',
          body: 'Test.',
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('RATE_LIMITED');
      });

      it('preserves PERMISSION_DENIED error code', async () => {
        const result = await transport.send({
          to: 'alex/backend-dev',
          worker: 'unknown-worker',
          intent: 'handoff',
          body: 'Test.',
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('PERMISSION_DENIED');
      });

      it('preserves DISABLED error code', async () => {
        const disabledConfig = makeConfig({
          settings: {
            ackTimeout: 300,
            maxRetries: 1,
            threadIdleTimeout: 86400,
            threadMaxAge: 604800,
            inboxPath: 'workspace/inbox/',
            threadLogPath: 'workspace/threads/hiamp/',
            messageMaxLength: 4000,
            attachmentMaxInlineSize: 4000,
            enabled: false,
          },
        });
        const resolver = new ChannelResolver(disabledConfig, mockSlack as any);
        const disabledTransport = new SlackTransport(disabledConfig, {
          slackClient: mockSlack as any,
          channelResolver: resolver,
          rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
        });

        const result = await disabledTransport.send({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'handoff',
          body: 'Test.',
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('DISABLED');
      });

      it('passes optional fields through to the sender', async () => {
        const result = await transport.send({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'handoff',
          body: 'Test with fields.',
          priority: 'high',
          ack: 'requested',
          ref: 'https://example.com',
          thread: 'thr-custom01',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.messageText).toContain('priority:high');
        expect(result.messageText).toContain('ack:requested');
        expect(result.messageText).toContain('ref:https://example.com');
        expect(result.thread).toBe('thr-custom01');
      });

      it('uses explicit channelId override', async () => {
        const result = await transport.send({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'handoff',
          body: 'Test.',
          channelId: 'C0EXPLICIT',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.channelId).toBe('C0EXPLICIT');
      });
    });

    describe('sendReply', () => {
      it('sends a threaded reply', async () => {
        const result = await transport.sendReply({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'response',
          body: 'Here is the response.',
          threadRef: '1234567890.111111',
          replyTo: 'msg-original1',
          thread: 'thr-existing1',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.messageText).toContain('reply-to:msg-original1');
        expect(result.messageText).toContain('thread:thr-existing1');

        expect(mockSlack.chat.postMessage).toHaveBeenCalledWith({
          channel: 'C0HQAGENTS',
          text: expect.any(String),
          thread_ts: '1234567890.111111',
          unfurl_links: false,
          unfurl_media: false,
        });
      });

      it('returns transport-generic error on reply failure', async () => {
        const result = await transport.sendReply({
          to: 'alex/backend-dev',
          intent: 'response',
          body: 'Reply without from/worker.',
          threadRef: '123.456',
          replyTo: 'msg-orig1',
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('INVALID_MESSAGE');
      });
    });

    describe('resolveChannel', () => {
      it('resolves the dedicated channel', async () => {
        const result = await transport.resolveChannel({
          targetPeerOwner: 'alex',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.channelId).toBe('C0HQAGENTS');
        expect(result.channelName).toBe('#hq-agents');
      });

      it('uses explicit channelId override', async () => {
        const result = await transport.resolveChannel({
          targetPeerOwner: 'alex',
          channelId: 'C0EXPLICIT',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.channelId).toBe('C0EXPLICIT');
      });

      it('returns error for unknown peer', async () => {
        const result = await transport.resolveChannel({
          targetPeerOwner: 'unknown-person',
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('UNKNOWN_PEER');
      });

      it('resolves contextual channels', async () => {
        const ctxConfig = makeConfig({
          slack: {
            botToken: 'xoxb-test-token',
            appId: 'A0TEST',
            workspaceId: 'T0TEST',
            channelStrategy: 'contextual',
            channels: {
              dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
              contextual: [
                { context: 'hq-cloud', name: '#hq-cloud-dev', id: 'C0HQCLOUD', peers: ['alex'] },
              ],
            },
            eventMode: 'socket',
          },
        });
        const resolver = new ChannelResolver(ctxConfig, mockSlack as any);
        const ctxTransport = new SlackTransport(ctxConfig, {
          slackClient: mockSlack as any,
          channelResolver: resolver,
          rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
        });

        const result = await ctxTransport.resolveChannel({
          targetPeerOwner: 'alex',
          context: 'hq-cloud',
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.channelId).toBe('C0HQCLOUD');
      });
    });

    describe('listen and stop', () => {
      it('starts listening and can be stopped', async () => {
        expect(transport.isListening()).toBe(false);

        const hqTransport = new SlackTransport(config, {
          slackClient: mockSlack as any,
          channelResolver: new ChannelResolver(config, mockSlack as any),
          rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
          hqRoot: '/tmp/test-hq',
        });

        await hqTransport.listen({
          onMessage: () => {},
          onError: () => {},
        });

        expect(hqTransport.isListening()).toBe(true);

        await hqTransport.stop();
        expect(hqTransport.isListening()).toBe(false);
      });

      it('throws when listen() called without hqRoot', async () => {
        await expect(
          transport.listen({ onMessage: () => {} }),
        ).rejects.toThrow('hqRoot is required');
      });

      it('throws when listen() called twice', async () => {
        const hqTransport = new SlackTransport(config, {
          slackClient: mockSlack as any,
          channelResolver: new ChannelResolver(config, mockSlack as any),
          rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
          hqRoot: '/tmp/test-hq',
        });

        await hqTransport.listen({ onMessage: () => {} });

        await expect(
          hqTransport.listen({ onMessage: () => {} }),
        ).rejects.toThrow('already listening');

        await hqTransport.stop();
      });

      it('stop() is safe to call when not listening', async () => {
        expect(transport.isListening()).toBe(false);
        await transport.stop();
        expect(transport.isListening()).toBe(false);
      });
    });

    describe('backward compatibility accessors', () => {
      it('exposes getSender()', () => {
        const sender = transport.getSender();
        expect(sender).toBeDefined();
        expect(typeof sender.send).toBe('function');
      });

      it('exposes getChannelResolver()', () => {
        const resolver = transport.getChannelResolver();
        expect(resolver).toBeDefined();
        expect(typeof resolver.resolve).toBe('function');
      });

      it('returns null from getEventListener() before listen()', () => {
        expect(transport.getEventListener()).toBeNull();
      });

      it('returns EventListener from getEventListener() after listen()', async () => {
        const hqTransport = new SlackTransport(config, {
          slackClient: mockSlack as any,
          channelResolver: new ChannelResolver(config, mockSlack as any),
          rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
          hqRoot: '/tmp/test-hq',
        });

        await hqTransport.listen({ onMessage: () => {} });
        const listener = hqTransport.getEventListener();
        expect(listener).not.toBeNull();
        expect(typeof listener!.processEvent).toBe('function');

        await hqTransport.stop();
      });
    });
  });

  describe('Transport interface polymorphism', () => {
    it('can be used via the Transport type without knowing the implementation', async () => {
      const config = makeConfig();
      const mockSlack = makeMockSlackClient();
      const resolver = new ChannelResolver(config, mockSlack as any);

      const transport: Transport = new SlackTransport(config, {
        slackClient: mockSlack as any,
        channelResolver: resolver,
        rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
      });

      // This function only knows about Transport, not SlackTransport
      async function sendViaTransport(t: Transport): Promise<TransportSendResult> {
        return t.send({
          to: 'alex/backend-dev',
          worker: 'architect',
          intent: 'handoff',
          body: 'Transport-agnostic send.',
        });
      }

      const result = await sendViaTransport(transport);
      expect(result.success).toBe(true);
    });

    it('can resolve channels via the Transport type', async () => {
      const config = makeConfig();
      const mockSlack = makeMockSlackClient();
      const resolver = new ChannelResolver(config, mockSlack as any);

      const transport: Transport = new SlackTransport(config, {
        slackClient: mockSlack as any,
        channelResolver: resolver,
        rateLimiter: new RateLimiter({ minIntervalMs: 0 }),
      });

      async function resolveViaTransport(t: Transport): Promise<TransportResolveResult> {
        return t.resolveChannel({ targetPeerOwner: 'alex' });
      }

      const result = await resolveViaTransport(transport);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0HQAGENTS');
    });
  });
});
