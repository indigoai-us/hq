import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackSender } from '../slack-sender.js';
import { ChannelResolver } from '../channel-resolver.js';
import { RateLimiter } from '../rate-limiter.js';
import type { HiampConfig } from '../config-loader.js';

/** Build a minimal HiampConfig for testing */
function makeConfig(overrides?: Partial<HiampConfig>): HiampConfig {
  return {
    transport: 'slack',
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
        {
          id: 'qa-tester',
          send: false,
          receive: true,
          allowedIntents: ['query'],
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

/** Create a mock rate limiter that executes immediately */
function makeMockRateLimiter() {
  const limiter = new RateLimiter({ minIntervalMs: 0 });
  return limiter;
}

describe('SlackSender', () => {
  let config: HiampConfig;
  let mockSlack: ReturnType<typeof makeMockSlackClient>;
  let sender: SlackSender;

  beforeEach(() => {
    config = makeConfig();
    mockSlack = makeMockSlackClient();
    const resolver = new ChannelResolver(config, mockSlack as any);
    const limiter = makeMockRateLimiter();
    sender = new SlackSender(config, {
      slackClient: mockSlack as any,
      channelResolver: resolver,
      rateLimiter: limiter,
    });
  });

  describe('send', () => {
    it('should send a basic HIAMP message', async () => {
      const result = await sender.send({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'handoff',
        body: 'The API contract is ready.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.ts).toBe('1234567890.123456');
      expect(result.channelId).toBe('C0HQAGENTS');
      expect(result.messageText).toContain('stefan/architect');
      expect(result.messageText).toContain('alex/backend-dev');
      expect(result.messageText).toContain('The API contract is ready.');
      expect(result.messageText).toContain('intent:handoff');
      expect(result.thread).toMatch(/^thr-/);

      expect(mockSlack.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C0HQAGENTS',
        text: expect.any(String),
        thread_ts: undefined,
        unfurl_links: false,
        unfurl_media: false,
      });
    });

    it('should use explicit "from" address', async () => {
      const result = await sender.send({
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.messageText).toContain('stefan/architect');
    });

    it('should derive "from" from config identity + worker', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.messageText).toContain('stefan/architect');
    });

    it('should fail when neither from nor worker is provided', async () => {
      const result = await sender.send({
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_MESSAGE');
    });

    it('should use provided thread ID', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
        thread: 'thr-custom01',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.thread).toBe('thr-custom01');
      expect(result.messageText).toContain('thread:thr-custom01');
    });

    it('should include optional fields in the message', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
        priority: 'high',
        ack: 'requested',
        ref: 'https://example.com/doc',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.messageText).toContain('priority:high');
      expect(result.messageText).toContain('ack:requested');
      expect(result.messageText).toContain('ref:https://example.com/doc');
    });
  });

  describe('sendReply', () => {
    it('should send a threaded reply with thread_ts', async () => {
      const result = await sender.sendReply({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'response',
        body: 'Here is the response.',
        threadTs: '1234567890.111111',
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
  });

  describe('permission checks', () => {
    it('should deny workers not in permission list (default: deny)', async () => {
      const result = await sender.send({
        worker: 'unknown-worker',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('unknown-worker');
    });

    it('should deny workers with send: false', async () => {
      const result = await sender.send({
        worker: 'qa-tester',
        to: 'alex/backend-dev',
        intent: 'query',
        body: 'Question?',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('send permission');
    });

    it('should deny disallowed intent types', async () => {
      const result = await sender.send({
        worker: 'backend-dev',
        to: 'alex/qa-tester',
        intent: 'share', // not in backend-dev's allowed intents
        body: 'Sharing knowledge.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('share');
    });

    it('should deny messaging unauthorized peers', async () => {
      const result = await sender.send({
        worker: 'backend-dev',
        to: 'maria/designer', // backend-dev only allowed to talk to alex
        intent: 'request',
        body: 'Need design help.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('maria');
    });

    it('should allow wildcard peer access', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'maria/designer', // architect has allowed-peers: ["*"]
        intent: 'request',
        body: 'Design review needed.',
      });

      expect(result.success).toBe(true);
    });

    it('should allow workers when default is allow and worker not listed', async () => {
      config.workerPermissions.default = 'allow';
      const resolver = new ChannelResolver(config, mockSlack as any);
      const limiter = makeMockRateLimiter();
      const allowSender = new SlackSender(config, {
        slackClient: mockSlack as any,
        channelResolver: resolver,
        rateLimiter: limiter,
      });

      const result = await allowSender.send({
        worker: 'unlisted-worker',
        to: 'alex/backend-dev',
        intent: 'inform',
        body: 'Hello.',
      });

      // Should pass permission check (default: allow)
      // May still fail on address validation depending on config
      // The unlisted-worker won't be in permission list so default:allow applies
      expect(result.success).toBe(true);
    });
  });

  describe('target address validation', () => {
    it('should reject unknown peer owner', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'unknown-person/some-worker',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_MESSAGE');
      expect(result.error).toContain('unknown-person');
    });

    it('should reject unknown worker for known peer', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/nonexistent-worker',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_MESSAGE');
      expect(result.error).toContain('nonexistent-worker');
    });

    it('should reject malformed address', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'no-slash-here',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_MESSAGE');
    });
  });

  describe('kill switch and disabled', () => {
    it('should refuse to send when kill switch is active', async () => {
      config.security = { defaultTrustLevel: 'channel-scoped', killSwitch: true };
      const resolver = new ChannelResolver(config, mockSlack as any);
      const killSwitchSender = new SlackSender(config, {
        slackClient: mockSlack as any,
        channelResolver: resolver,
        rateLimiter: makeMockRateLimiter(),
      });

      const result = await killSwitchSender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('KILL_SWITCH');
    });

    it('should refuse to send when HIAMP is disabled', async () => {
      config.settings = {
        ackTimeout: 300,
        maxRetries: 1,
        threadIdleTimeout: 86400,
        threadMaxAge: 604800,
        inboxPath: 'workspace/inbox/',
        threadLogPath: 'workspace/threads/hiamp/',
        messageMaxLength: 4000,
        attachmentMaxInlineSize: 4000,
        enabled: false,
      };
      const resolver = new ChannelResolver(config, mockSlack as any);
      const disabledSender = new SlackSender(config, {
        slackClient: mockSlack as any,
        channelResolver: resolver,
        rateLimiter: makeMockRateLimiter(),
      });

      const result = await disabledSender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('DISABLED');
    });

    it('should also check kill switch on sendReply', async () => {
      config.security = { defaultTrustLevel: 'channel-scoped', killSwitch: true };
      const resolver = new ChannelResolver(config, mockSlack as any);
      const killSwitchSender = new SlackSender(config, {
        slackClient: mockSlack as any,
        channelResolver: resolver,
        rateLimiter: makeMockRateLimiter(),
      });

      const result = await killSwitchSender.sendReply({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'response',
        body: 'Reply.',
        threadTs: '123.456',
        replyTo: 'msg-original1',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('KILL_SWITCH');
    });
  });

  describe('Slack API errors', () => {
    it('should handle Slack API rejection', async () => {
      mockSlack.chat.postMessage.mockRejectedValue(new Error('channel_not_found'));

      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('SLACK_API_ERROR');
      expect(result.error).toContain('channel_not_found');
    });

    it('should detect Slack rate limiting', async () => {
      mockSlack.chat.postMessage.mockRejectedValue(new Error('rate_limited'));

      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('RATE_LIMITED');
    });

    it('should handle Slack API returning ok: false', async () => {
      mockSlack.chat.postMessage.mockResolvedValue({
        ok: false,
        error: 'invalid_auth',
      });

      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('SLACK_API_ERROR');
      expect(result.error).toContain('invalid_auth');
    });
  });

  describe('channel resolution', () => {
    it('should use explicit channelId when provided', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
        channelId: 'C0EXPLICIT',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0EXPLICIT');
    });

    it('should pass context to channel resolver', async () => {
      // Set up with contextual channels
      config.slack!.channelStrategy = 'contextual';
      config.slack!.channels = {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
        contextual: [
          { context: 'hq-cloud', name: '#hq-cloud-dev', id: 'C0HQCLOUD', peers: ['alex'] },
        ],
      };

      const resolver = new ChannelResolver(config, mockSlack as any);
      const contextSender = new SlackSender(config, {
        slackClient: mockSlack as any,
        channelResolver: resolver,
        rateLimiter: makeMockRateLimiter(),
      });

      const result = await contextSender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Working on hq-cloud.',
        context: 'hq-cloud',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0HQCLOUD');
    });
  });
});
