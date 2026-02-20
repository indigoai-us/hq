import { describe, it, expect, vi } from 'vitest';
import { ChannelResolver } from '../channel-resolver.js';
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
          { id: 'backend-dev' },
          { id: 'qa-tester' },
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
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated',
      channels: {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
        perRelationship: [
          { peer: 'alex', name: '#hq-alex-stefan', id: 'C0ALEXSTEFAN' },
          { peer: 'maria', name: '#hq-maria-stefan', id: 'C0MARIASTEFAN' },
        ],
        contextual: [
          { context: 'hq-cloud', name: '#hq-cloud-dev', id: 'C0HQCLOUD', peers: ['alex'] },
          { context: 'design-system', name: '#design-collab', id: 'C0DESIGN', peers: ['maria'] },
        ],
      },
      eventMode: 'socket',
      socketAppToken: 'xapp-test',
    },
    workerPermissions: {
      default: 'deny',
      workers: [],
    },
    ...overrides,
  };
}

describe('ChannelResolver', () => {
  describe('explicit channel override', () => {
    it('should use explicit channelId when provided', async () => {
      const config = makeConfig();
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        channelId: 'C0EXPLICIT',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0EXPLICIT');
    });
  });

  describe('unknown peer', () => {
    it('should return error for unknown peer', async () => {
      const config = makeConfig();
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'unknown-person',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNKNOWN_PEER');
    });
  });

  describe('dedicated strategy', () => {
    it('should resolve to the dedicated channel', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dedicated';
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0HQAGENTS');
      expect(result.channelName).toBe('#hq-agents');
      expect(result.strategy).toBe('dedicated');
    });

    it('should fail when no dedicated channel configured', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dedicated';
      config.slack!.channels = {};
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NO_DEDICATED_CHANNEL');
    });
  });

  describe('dm strategy', () => {
    it('should open a DM with the peer Slack user', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dm';

      const mockSlackClient = {
        conversations: {
          open: vi.fn().mockResolvedValue({
            ok: true,
            channel: { id: 'D0DMCHANNEL' },
          }),
        },
      };

      const resolver = new ChannelResolver(config, mockSlackClient as any);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('D0DMCHANNEL');
      expect(result.strategy).toBe('dm');
      expect(mockSlackClient.conversations.open).toHaveBeenCalledWith({
        users: 'U0ALEX1234',
      });
    });

    it('should cache DM channel IDs', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dm';

      const mockSlackClient = {
        conversations: {
          open: vi.fn().mockResolvedValue({
            ok: true,
            channel: { id: 'D0DMCHANNEL' },
          }),
        },
      };

      const resolver = new ChannelResolver(config, mockSlackClient as any);

      await resolver.resolve({ targetPeerOwner: 'alex' });
      await resolver.resolve({ targetPeerOwner: 'alex' });

      // Should only call open once due to caching
      expect(mockSlackClient.conversations.open).toHaveBeenCalledTimes(1);
    });

    it('should fail when peer has no slack-bot-id and no dedicated fallback', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dm';
      config.slack!.channels = {}; // Remove dedicated fallback
      config.peers[0] = { ...config.peers[0]!, slackBotId: undefined };

      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('DM_OPEN_FAILED');
    });

    it('should fall back to dedicated when peer has no slack-bot-id', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dm';
      config.peers[0] = { ...config.peers[0]!, slackBotId: undefined };

      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      // Falls back to dedicated
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.strategy).toBe('dedicated');
    });

    it('should fail when no Slack client and no dedicated fallback', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dm';
      config.slack!.channels = {}; // Remove dedicated fallback

      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('DM_OPEN_FAILED');
    });

    it('should handle Slack API error and fall back to dedicated', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dm';

      const mockSlackClient = {
        conversations: {
          open: vi.fn().mockRejectedValue(new Error('user_not_found')),
        },
      };

      const resolver = new ChannelResolver(config, mockSlackClient as any);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      // Falls back to dedicated
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.strategy).toBe('dedicated');
    });

    it('should fail on Slack API error with no dedicated fallback', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dm';
      config.slack!.channels = {}; // Remove dedicated fallback

      const mockSlackClient = {
        conversations: {
          open: vi.fn().mockRejectedValue(new Error('user_not_found')),
        },
      };

      const resolver = new ChannelResolver(config, mockSlackClient as any);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('DM_OPEN_FAILED');
      expect(result.error).toContain('user_not_found');
    });
  });

  describe('per-relationship strategy', () => {
    it('should resolve to the peer-specific channel', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'per-relationship';
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0ALEXSTEFAN');
      expect(result.channelName).toBe('#hq-alex-stefan');
      expect(result.strategy).toBe('per-relationship');
    });

    it('should resolve to different channels per peer', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'per-relationship';
      const resolver = new ChannelResolver(config);

      const alexResult = await resolver.resolve({ targetPeerOwner: 'alex' });
      const mariaResult = await resolver.resolve({ targetPeerOwner: 'maria' });

      expect(alexResult.success).toBe(true);
      expect(mariaResult.success).toBe(true);
      if (!alexResult.success || !mariaResult.success) return;

      expect(alexResult.channelId).toBe('C0ALEXSTEFAN');
      expect(mariaResult.channelId).toBe('C0MARIASTEFAN');
    });

    it('should fall back to dedicated when peer has no relationship channel', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'per-relationship';
      config.slack!.channels!.perRelationship = []; // empty
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      // Should fall back to dedicated
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0HQAGENTS');
      expect(result.strategy).toBe('dedicated');
    });
  });

  describe('contextual strategy', () => {
    it('should resolve based on context and peer', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'contextual';
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0HQCLOUD');
      expect(result.channelName).toBe('#hq-cloud-dev');
      expect(result.strategy).toBe('contextual');
    });

    it('should fail when no context is provided', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'contextual';
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      // Should fail first, then fall back to dedicated
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.strategy).toBe('dedicated'); // fallback
    });

    it('should fail when context does not match any channel for the peer', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'contextual';
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'nonexistent-project',
      });

      // Falls back to dedicated
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.strategy).toBe('dedicated');
    });

    it('should resolve design context to Maria channel', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'contextual';
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'maria',
        context: 'design-system',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0DESIGN');
    });
  });

  describe('strategy override', () => {
    it('should use strategy from input instead of config default', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'dedicated'; // default
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        strategy: 'per-relationship', // override
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0ALEXSTEFAN');
      expect(result.strategy).toBe('per-relationship');
    });
  });

  describe('fallback to dedicated', () => {
    it('should fall back to dedicated when strategy fails and dedicated is configured', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'contextual';
      // No contextual channels configured
      config.slack!.channels!.contextual = [];
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'something',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('C0HQAGENTS');
      expect(result.strategy).toBe('dedicated');
    });

    it('should fail entirely when strategy fails and no dedicated configured', async () => {
      const config = makeConfig();
      config.slack!.channelStrategy = 'per-relationship';
      config.slack!.channels = {}; // no channels at all
      const resolver = new ChannelResolver(config);

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(false);
    });
  });
});
