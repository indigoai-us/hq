/**
 * HIAMP Slack Transport
 *
 * Implements the Transport interface using Slack as the messaging platform.
 * This wraps the existing SlackSender, EventListener, and ChannelResolver
 * components, providing a unified interface for sending and receiving
 * HIAMP messages via Slack.
 *
 * @deprecated SlackTransport is being replaced by LinearTransport.
 *   New integrations should use LinearTransport instead.
 *   SlackTransport will be maintained for backward compatibility
 *   but will not receive new features.
 *
 * @module slack-transport
 */

import { WebClient } from '@slack/web-api';
import { SlackSender } from './slack-sender.js';
import { ChannelResolver } from './channel-resolver.js';
import { EventListener } from './event-listener.js';
import { RateLimiter } from './rate-limiter.js';
import { Router } from './router.js';
import { Inbox } from './inbox.js';
import type { HiampConfig } from './config-loader.js';
import type { ChannelStrategy } from './config-loader.js';
import type { SendInput, ReplyInput } from './slack-sender.js';
import type {
  Transport,
  TransportSendInput,
  TransportReplyInput,
  TransportSendResult,
  TransportResolveInput,
  TransportResolveResult,
  TransportMessageHandler,
  TransportErrorHandler,
  TransportReceivedMessage,
} from './transport.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for constructing a SlackTransport */
export interface SlackTransportOptions {
  /** Absolute path to HQ root directory (required for listening) */
  hqRoot?: string;

  /** The local bot's Slack user ID (for echo prevention) */
  localBotId?: string;

  /** Override the Slack WebClient instance */
  slackClient?: WebClient;

  /** Override the ChannelResolver instance */
  channelResolver?: ChannelResolver;

  /** Override the RateLimiter instance */
  rateLimiter?: RateLimiter;

  /** Override the SlackSender instance */
  sender?: SlackSender;

  /** Override the EventListener instance */
  eventListener?: EventListener;

  /** Override the Router instance */
  router?: Router;

  /** Override the Inbox instance */
  inbox?: Inbox;

  /** Optional list of channel IDs to monitor */
  monitoredChannels?: string[];
}

// ---------------------------------------------------------------------------
// SlackTransport class
// ---------------------------------------------------------------------------

/**
 * Slack transport for HIAMP messaging.
 *
 * Wraps the existing Slack-based components (SlackSender, EventListener,
 * ChannelResolver) behind the unified Transport interface. This allows
 * HIAMP core to work with Slack through the same interface it would use
 * for any other transport.
 *
 * @deprecated Use LinearTransport for new integrations.
 *   SlackTransport is maintained for backward compatibility only.
 *
 * @example
 * ```ts
 * const transport = new SlackTransport(config, { hqRoot: '/path/to/hq' });
 *
 * // Send a message
 * const result = await transport.send({
 *   to: 'alex/backend-dev',
 *   worker: 'architect',
 *   intent: 'handoff',
 *   body: 'The API contract is ready.',
 * });
 *
 * // Start listening
 * await transport.listen({
 *   onMessage: (msg) => console.log('Received:', msg),
 * });
 *
 * // Stop
 * await transport.stop();
 * ```
 */
export class SlackTransport implements Transport {
  readonly name = 'slack';

  private readonly config: HiampConfig;
  private readonly slackClient: WebClient;
  private readonly channelResolver: ChannelResolver;
  private readonly rateLimiter: RateLimiter;
  private readonly sender: SlackSender;
  private readonly hqRoot?: string;
  private readonly localBotId?: string;
  private readonly monitoredChannels?: string[];
  private readonly routerOverride?: Router;
  private readonly inboxOverride?: Inbox;
  private readonly eventListenerOverride?: EventListener;

  private eventListener: EventListener | null = null;
  private listening = false;

  /**
   * Create a SlackTransport.
   *
   * @deprecated Use LinearTransport for new integrations.
   * @param config - The loaded HIAMP configuration.
   * @param options - Optional overrides for internal components.
   */
  constructor(config: HiampConfig, options?: SlackTransportOptions) {
    this.config = config;
    this.hqRoot = options?.hqRoot;
    this.localBotId = options?.localBotId;
    this.monitoredChannels = options?.monitoredChannels;
    this.routerOverride = options?.router;
    this.inboxOverride = options?.inbox;
    this.eventListenerOverride = options?.eventListener;

    // Initialize Slack components
    this.slackClient =
      options?.slackClient ?? new WebClient(config.slack!.botToken);
    this.channelResolver =
      options?.channelResolver ?? new ChannelResolver(config, this.slackClient);
    this.rateLimiter = options?.rateLimiter ?? new RateLimiter();
    this.sender =
      options?.sender ??
      new SlackSender(config, {
        slackClient: this.slackClient,
        channelResolver: this.channelResolver,
        rateLimiter: this.rateLimiter,
      });
  }

  /**
   * Send a HIAMP message via Slack.
   *
   * @deprecated Use LinearTransport for new integrations.
   */
  async send(input: TransportSendInput): Promise<TransportSendResult> {
    const slackInput: SendInput = {
      to: input.to,
      from: input.from,
      worker: input.worker,
      intent: input.intent,
      body: input.body,
      thread: input.thread,
      priority: input.priority,
      ack: input.ack,
      ref: input.ref,
      token: input.token,
      attach: input.attach,
      expires: input.expires,
      channelId: input.channelId,
      context: input.context,
    };

    const result = await this.sender.send(slackInput);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        code: this.mapErrorCode(result.code),
      };
    }

    return {
      success: true,
      messageId: result.ts,
      channelId: result.channelId,
      messageText: result.messageText,
      thread: result.thread,
    };
  }

  /**
   * Send a threaded reply via Slack.
   *
   * @deprecated Use LinearTransport for new integrations.
   */
  async sendReply(input: TransportReplyInput): Promise<TransportSendResult> {
    const slackInput: ReplyInput = {
      to: input.to,
      from: input.from,
      worker: input.worker,
      intent: input.intent,
      body: input.body,
      thread: input.thread,
      priority: input.priority,
      ack: input.ack,
      ref: input.ref,
      token: input.token,
      attach: input.attach,
      expires: input.expires,
      channelId: input.channelId,
      context: input.context,
      threadTs: input.threadRef, // Map generic threadRef to Slack-specific threadTs
      replyTo: input.replyTo,
    };

    const result = await this.sender.sendReply(slackInput);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        code: this.mapErrorCode(result.code),
      };
    }

    return {
      success: true,
      messageId: result.ts,
      channelId: result.channelId,
      messageText: result.messageText,
      thread: result.thread,
    };
  }

  /**
   * Start listening for incoming HIAMP messages from Slack.
   *
   * Creates an EventListener that processes incoming Slack events
   * and converts them to transport-agnostic received messages.
   *
   * @deprecated Use LinearTransport for new integrations.
   */
  async listen(options: {
    onMessage?: TransportMessageHandler;
    onError?: TransportErrorHandler;
  }): Promise<void> {
    if (this.listening) {
      throw new Error('SlackTransport is already listening');
    }

    const hqRoot = this.hqRoot;
    if (!hqRoot) {
      throw new Error('hqRoot is required for listening. Pass it in SlackTransportOptions.');
    }

    this.eventListener =
      this.eventListenerOverride ??
      new EventListener({
        config: this.config,
        hqRoot,
        localBotId: this.localBotId,
        router: this.routerOverride,
        sender: this.sender,
        inbox: this.inboxOverride,
        monitoredChannels: this.monitoredChannels,
        onMessage: (event) => {
          if (options.onMessage) {
            const received: TransportReceivedMessage = {
              rawText: event.slackEvent.text ?? '',
              message: event.message,
              detected: event.detected,
              channelId: event.slackEvent.channel,
              senderId: event.slackEvent.user,
              messageRef: event.slackEvent.ts,
              threadRef: event.slackEvent.thread_ts,
              error: event.error,
              processedAt: event.processedAt,
            };
            options.onMessage(received);
          }
        },
        onError: options.onError,
      });

    this.listening = true;
  }

  /**
   * Resolve a Slack channel for a target peer.
   *
   * @deprecated Use LinearTransport for new integrations.
   */
  async resolveChannel(input: TransportResolveInput): Promise<TransportResolveResult> {
    const result = await this.channelResolver.resolve({
      targetPeerOwner: input.targetPeerOwner,
      channelId: input.channelId,
      context: input.context,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        code: result.code,
      };
    }

    return {
      success: true,
      channelId: result.channelId,
      channelName: result.channelName,
    };
  }

  /**
   * Stop the Slack transport.
   *
   * @deprecated Use LinearTransport for new integrations.
   */
  async stop(): Promise<void> {
    if (this.eventListener) {
      await this.eventListener.stop();
    }
    this.eventListener = null;
    this.listening = false;
  }

  /**
   * Check if the transport is currently listening.
   *
   * @deprecated Use LinearTransport for new integrations.
   */
  isListening(): boolean {
    return this.listening;
  }

  // -------------------------------------------------------------------------
  // Accessors for direct component access (backward compatibility)
  // -------------------------------------------------------------------------

  /**
   * Get the underlying SlackSender instance.
   * Useful for backward-compatible code that needs Slack-specific features.
   *
   * @deprecated Access through the Transport interface instead.
   */
  getSender(): SlackSender {
    return this.sender;
  }

  /**
   * Get the underlying ChannelResolver instance.
   * Useful for backward-compatible code that needs Slack-specific resolution.
   *
   * @deprecated Access through the Transport interface instead.
   */
  getChannelResolver(): ChannelResolver {
    return this.channelResolver;
  }

  /**
   * Get the underlying EventListener instance (if listening).
   * Returns null if listen() hasn't been called.
   *
   * @deprecated Access through the Transport interface instead.
   */
  getEventListener(): EventListener | null {
    return this.eventListener;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Map Slack-specific error codes to transport-generic error codes.
   */
  private mapErrorCode(
    code: string,
  ): 'INVALID_MESSAGE' | 'CHANNEL_RESOLVE_FAILED' | 'PERMISSION_DENIED' | 'TRANSPORT_ERROR' | 'RATE_LIMITED' | 'KILL_SWITCH' | 'DISABLED' {
    if (code === 'SLACK_API_ERROR') {
      return 'TRANSPORT_ERROR';
    }
    // All other codes are shared between Slack and the Transport interface
    return code as 'INVALID_MESSAGE' | 'CHANNEL_RESOLVE_FAILED' | 'PERMISSION_DENIED' | 'RATE_LIMITED' | 'KILL_SWITCH' | 'DISABLED';
  }
}
