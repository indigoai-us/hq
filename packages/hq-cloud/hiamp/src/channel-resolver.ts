/**
 * HIAMP Channel Resolver
 *
 * Resolves the target Slack channel for an outgoing HIAMP message
 * based on the configured channel strategy.
 *
 * Supports all 4 strategies defined in HIAMP spec section 8:
 * - dedicated: single shared channel for all peers
 * - dm: direct message to the peer's Slack user
 * - per-relationship: dedicated channel per peer relationship
 * - contextual: channel based on project/context
 *
 * @module channel-resolver
 */

import type { WebClient } from '@slack/web-api';
import type {
  HiampConfig,
  ChannelStrategy,
  HiampPeer,
} from './config-loader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for channel resolution */
export interface ChannelResolveInput {
  /** The target peer's owner name (e.g., "alex") */
  targetPeerOwner: string;

  /** Optional: explicit channel ID override. If set, skip strategy resolution. */
  channelId?: string;

  /** Optional: context string for contextual strategy (e.g., project name) */
  context?: string;

  /** Optional: strategy override (uses config default if not provided) */
  strategy?: ChannelStrategy;
}

/** Successful resolution */
export interface ChannelResolveSuccess {
  success: true;
  channelId: string;
  channelName?: string;
  strategy: ChannelStrategy;
}

/** Failed resolution */
export interface ChannelResolveFailure {
  success: false;
  error: string;
  code: 'UNKNOWN_PEER' | 'NO_CHANNEL' | 'DM_OPEN_FAILED' | 'NO_CONTEXT_MATCH' | 'NO_DEDICATED_CHANNEL';
}

/** Resolution result */
export type ChannelResolveResult = ChannelResolveSuccess | ChannelResolveFailure;

// ---------------------------------------------------------------------------
// ChannelResolver class
// ---------------------------------------------------------------------------

/**
 * Resolves Slack channels for outgoing HIAMP messages.
 *
 * Uses the HIAMP config to determine which Slack channel
 * to post a message to, based on the configured strategy.
 */
export class ChannelResolver {
  private readonly config: HiampConfig;
  private readonly slackClient: WebClient | null;
  /** Cache of DM channel IDs keyed by Slack user ID */
  private readonly dmCache: Map<string, string> = new Map();

  /**
   * @param config - The loaded HIAMP configuration.
   * @param slackClient - Optional Slack WebClient for DM channel resolution.
   *   Required only when using the 'dm' strategy.
   */
  constructor(config: HiampConfig, slackClient?: WebClient) {
    this.config = config;
    this.slackClient = slackClient ?? null;
  }

  /**
   * Resolve the target Slack channel for an outgoing message.
   *
   * Resolution algorithm (from HIAMP spec section 8 / configuration.md 5.4):
   * 1. If explicit channelId is provided, use it directly.
   * 2. Otherwise, apply the channel strategy:
   *    - dedicated: use channels.dedicated.id
   *    - dm: open a DM with the target peer's slack-bot-id
   *    - per-relationship: lookup peer in channels.perRelationship
   *    - contextual: match context against channels.contextual entries
   * 3. If strategy lookup fails, fall back to dedicated if configured.
   *
   * @param input - The resolution input.
   * @returns The resolved channel or an error.
   */
  async resolve(input: ChannelResolveInput): Promise<ChannelResolveResult> {
    // 1. Explicit channel override
    if (input.channelId) {
      return {
        success: true,
        channelId: input.channelId,
        strategy: input.strategy ?? this.config.slack!.channelStrategy,
      };
    }

    // Verify the target peer exists in config
    const peer = this.findPeer(input.targetPeerOwner);
    if (!peer) {
      return {
        success: false,
        error: `Unknown peer: "${input.targetPeerOwner}" not found in peer directory`,
        code: 'UNKNOWN_PEER',
      };
    }

    const strategy = input.strategy ?? this.config.slack!.channelStrategy;

    // 2. Apply strategy
    const result = await this.resolveByStrategy(strategy, peer, input.context);

    // 3. Fall back to dedicated if strategy failed and dedicated is configured
    if (!result.success && strategy !== 'dedicated') {
      const dedicated = this.config.slack!.channels?.dedicated;
      if (dedicated) {
        return {
          success: true,
          channelId: dedicated.id,
          channelName: dedicated.name,
          strategy: 'dedicated',
        };
      }
    }

    return result;
  }

  /**
   * Find a peer in the config by owner name.
   */
  private findPeer(ownerName: string): HiampPeer | undefined {
    return this.config.peers.find((p) => p.owner === ownerName);
  }

  /**
   * Resolve channel using a specific strategy.
   */
  private async resolveByStrategy(
    strategy: ChannelStrategy,
    peer: HiampPeer,
    context?: string,
  ): Promise<ChannelResolveResult> {
    switch (strategy) {
      case 'dedicated':
        return this.resolveDedicated();
      case 'dm':
        return this.resolveDm(peer);
      case 'per-relationship':
        return this.resolvePerRelationship(peer);
      case 'contextual':
        return this.resolveContextual(peer, context);
    }
  }

  /**
   * Dedicated strategy: single shared channel.
   */
  private resolveDedicated(): ChannelResolveResult {
    const dedicated = this.config.slack!.channels?.dedicated;
    if (!dedicated) {
      return {
        success: false,
        error: 'No dedicated channel configured in channels.dedicated',
        code: 'NO_DEDICATED_CHANNEL',
      };
    }
    return {
      success: true,
      channelId: dedicated.id,
      channelName: dedicated.name,
      strategy: 'dedicated',
    };
  }

  /**
   * DM strategy: open a DM with the peer's Slack user.
   */
  private async resolveDm(peer: HiampPeer): Promise<ChannelResolveResult> {
    if (!peer.slackBotId) {
      return {
        success: false,
        error: `Peer "${peer.owner}" has no slack-bot-id configured; cannot open DM`,
        code: 'DM_OPEN_FAILED',
      };
    }

    // Check cache first
    const cached = this.dmCache.get(peer.slackBotId);
    if (cached) {
      return {
        success: true,
        channelId: cached,
        strategy: 'dm',
      };
    }

    if (!this.slackClient) {
      return {
        success: false,
        error: 'Slack client required for DM strategy but not provided',
        code: 'DM_OPEN_FAILED',
      };
    }

    try {
      const response = await this.slackClient.conversations.open({
        users: peer.slackBotId,
      });

      const channelId = response.channel?.id;
      if (!channelId) {
        return {
          success: false,
          error: `Failed to open DM with ${peer.owner}: no channel ID returned`,
          code: 'DM_OPEN_FAILED',
        };
      }

      // Cache the DM channel
      this.dmCache.set(peer.slackBotId, channelId);

      return {
        success: true,
        channelId,
        strategy: 'dm',
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to open DM with ${peer.owner}: ${(err as Error).message}`,
        code: 'DM_OPEN_FAILED',
      };
    }
  }

  /**
   * Per-relationship strategy: dedicated channel per peer.
   */
  private resolvePerRelationship(peer: HiampPeer): ChannelResolveResult {
    const channels = this.config.slack!.channels?.perRelationship;
    if (!channels) {
      return {
        success: false,
        error: `No per-relationship channels configured`,
        code: 'NO_CHANNEL',
      };
    }

    const mapping = channels.find((ch) => ch.peer === peer.owner);
    if (!mapping) {
      return {
        success: false,
        error: `No per-relationship channel configured for peer "${peer.owner}"`,
        code: 'NO_CHANNEL',
      };
    }

    return {
      success: true,
      channelId: mapping.id,
      channelName: mapping.name,
      strategy: 'per-relationship',
    };
  }

  /**
   * Contextual strategy: channel based on project/context.
   */
  private resolveContextual(peer: HiampPeer, context?: string): ChannelResolveResult {
    const channels = this.config.slack!.channels?.contextual;
    if (!channels) {
      return {
        success: false,
        error: 'No contextual channels configured',
        code: 'NO_CONTEXT_MATCH',
      };
    }

    if (!context) {
      return {
        success: false,
        error: 'Contextual strategy requires a "context" parameter',
        code: 'NO_CONTEXT_MATCH',
      };
    }

    // Find a contextual channel that matches the context and includes the peer
    const mapping = channels.find(
      (ch) => ch.context === context && ch.peers.includes(peer.owner),
    );

    if (!mapping) {
      return {
        success: false,
        error: `No contextual channel matches context "${context}" for peer "${peer.owner}"`,
        code: 'NO_CONTEXT_MATCH',
      };
    }

    return {
      success: true,
      channelId: mapping.id,
      channelName: mapping.name,
      strategy: 'contextual',
    };
  }
}
