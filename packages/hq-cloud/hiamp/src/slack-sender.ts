/**
 * HIAMP Slack Sender
 *
 * Composes HIAMP messages and posts them to Slack channels.
 * Handles channel resolution, rate limiting, thread replies,
 * and structured error responses.
 *
 * @module slack-sender
 */

import { WebClient } from '@slack/web-api';
import { compose } from './compose.js';
import { validate } from './validate.js';
import { parse } from './parse.js';
import { generateThreadId } from './ids.js';
import type { ComposeInput, IntentType } from './types.js';
import type { HiampConfig } from './config-loader.js';
import type { ChannelStrategy } from './config-loader.js';
import { ChannelResolver } from './channel-resolver.js';
import { RateLimiter } from './rate-limiter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for sending a new HIAMP message */
export interface SendInput {
  /** Recipient worker address (e.g., "alex/backend-dev") */
  to: string;

  /** Sender worker address (e.g., "stefan/architect"). If omitted, derived from config identity + worker. */
  from?: string;

  /** The local worker ID sending this message (used to construct "from" if not explicit) */
  worker?: string;

  /** Message intent */
  intent: IntentType;

  /** Message body text */
  body: string;

  /** Thread ID for grouping. Auto-generated if not provided. */
  thread?: string;

  /** Priority */
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  /** Ack mode */
  ack?: 'requested' | 'optional' | 'none';

  /** Reference URI or path */
  ref?: string;

  /** Capability token */
  token?: string;

  /** Attached file paths (comma-separated) */
  attach?: string;

  /** ISO 8601 expiry timestamp */
  expires?: string;

  /** Explicit channel ID override */
  channelId?: string;

  /** Context for contextual channel strategy */
  context?: string;

  /** Channel strategy override */
  strategy?: ChannelStrategy;
}

/** Input for sending a threaded reply */
export interface ReplyInput extends SendInput {
  /** The Slack thread_ts to reply in */
  threadTs: string;

  /** The HIAMP message ID this is a reply to */
  replyTo: string;
}

/** Successful send result */
export interface SendSuccess {
  success: true;
  /** The Slack message timestamp (useful for threading) */
  ts: string;
  /** The channel the message was posted to */
  channelId: string;
  /** The composed HIAMP message text */
  messageText: string;
  /** The HIAMP thread ID */
  thread: string;
}

/** Failed send result */
export interface SendFailure {
  success: false;
  error: string;
  code:
    | 'INVALID_MESSAGE'
    | 'CHANNEL_RESOLVE_FAILED'
    | 'PERMISSION_DENIED'
    | 'SLACK_API_ERROR'
    | 'RATE_LIMITED'
    | 'KILL_SWITCH'
    | 'DISABLED';
}

/** Send result */
export type SendResult = SendSuccess | SendFailure;

// ---------------------------------------------------------------------------
// SlackSender class
// ---------------------------------------------------------------------------

/**
 * Sends HIAMP-formatted messages to Slack.
 *
 * Handles the full lifecycle of outgoing messages:
 * 1. Permission checking (worker-permissions config)
 * 2. Message composition (via HIAMP compose library)
 * 3. Message validation
 * 4. Channel resolution (via ChannelResolver)
 * 5. Rate limiting (via RateLimiter)
 * 6. Slack API posting
 *
 * @example
 * ```ts
 * const sender = new SlackSender(config);
 * const result = await sender.send({
 *   to: 'alex/backend-dev',
 *   worker: 'architect',
 *   intent: 'handoff',
 *   body: 'The API contract is ready.',
 * });
 * ```
 */
export class SlackSender {
  private readonly config: HiampConfig;
  private readonly slackClient: WebClient;
  private readonly channelResolver: ChannelResolver;
  private readonly rateLimiter: RateLimiter;

  /**
   * Create a SlackSender.
   *
   * @param config - The loaded HIAMP configuration.
   * @param options - Optional overrides for Slack client, channel resolver, and rate limiter.
   */
  constructor(
    config: HiampConfig,
    options?: {
      slackClient?: WebClient;
      channelResolver?: ChannelResolver;
      rateLimiter?: RateLimiter;
    },
  ) {
    this.config = config;
    this.slackClient =
      options?.slackClient ?? new WebClient(config.slack!.botToken);
    this.channelResolver =
      options?.channelResolver ?? new ChannelResolver(config, this.slackClient);
    this.rateLimiter = options?.rateLimiter ?? new RateLimiter();
  }

  /**
   * Send a new HIAMP message to a Slack channel.
   *
   * @param input - The message details.
   * @returns A SendResult indicating success or failure.
   */
  async send(input: SendInput): Promise<SendResult> {
    // Check kill switch
    if (this.config.security?.killSwitch) {
      return {
        success: false,
        error: 'HIAMP kill switch is active; all messaging is suspended',
        code: 'KILL_SWITCH',
      };
    }

    // Check enabled
    if (this.config.settings && !this.config.settings.enabled) {
      return {
        success: false,
        error: 'HIAMP subsystem is disabled',
        code: 'DISABLED',
      };
    }

    // Resolve "from" address
    const from = this.resolveFromAddress(input);
    if (!from) {
      return {
        success: false,
        error: 'Cannot determine sender address: provide "from" or "worker" in input',
        code: 'INVALID_MESSAGE',
      };
    }

    // Extract the local worker ID and target peer owner
    const localWorkerId = from.split('/')[1];
    const targetPeerOwner = input.to.split('/')[0];

    // Check permissions
    if (localWorkerId) {
      const permError = this.checkSendPermission(localWorkerId, input.intent, targetPeerOwner);
      if (permError) {
        return permError;
      }
    }

    // Validate target peer and worker exist in config
    const peerCheck = this.validateTargetAddress(input.to);
    if (peerCheck) {
      return peerCheck;
    }

    // Compose the HIAMP message
    const thread = input.thread ?? generateThreadId();
    const composeInput: ComposeInput = {
      from,
      to: input.to,
      intent: input.intent,
      body: input.body,
      thread,
      priority: input.priority,
      ack: input.ack,
      ref: input.ref,
      token: input.token,
      attach: input.attach,
      expires: input.expires,
    };

    const messageText = compose(composeInput);

    // Validate the composed message (parse it back and validate)
    const parseResult = parse(messageText);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Composed message failed parse validation: ${parseResult.errors.join(', ')}`,
        code: 'INVALID_MESSAGE',
      };
    }
    const validation = validate(parseResult.message);
    if (!validation.valid) {
      return {
        success: false,
        error: `Message validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
        code: 'INVALID_MESSAGE',
      };
    }

    // Resolve channel
    const channelResult = await this.channelResolver.resolve({
      targetPeerOwner,
      channelId: input.channelId,
      context: input.context ?? input.ref,
      strategy: input.strategy,
    });

    if (!channelResult.success) {
      return {
        success: false,
        error: channelResult.error,
        code: 'CHANNEL_RESOLVE_FAILED',
      };
    }

    // Post to Slack with rate limiting
    return this.postToSlack(channelResult.channelId, messageText, thread);
  }

  /**
   * Send a threaded reply to an existing Slack message.
   *
   * Uses Slack's thread_ts to create a threaded reply, maintaining
   * conversation continuity.
   *
   * @param input - The reply details including threadTs and replyTo.
   * @returns A SendResult indicating success or failure.
   */
  async sendReply(input: ReplyInput): Promise<SendResult> {
    // Check kill switch
    if (this.config.security?.killSwitch) {
      return {
        success: false,
        error: 'HIAMP kill switch is active; all messaging is suspended',
        code: 'KILL_SWITCH',
      };
    }

    // Check enabled
    if (this.config.settings && !this.config.settings.enabled) {
      return {
        success: false,
        error: 'HIAMP subsystem is disabled',
        code: 'DISABLED',
      };
    }

    // Resolve "from" address
    const from = this.resolveFromAddress(input);
    if (!from) {
      return {
        success: false,
        error: 'Cannot determine sender address: provide "from" or "worker" in input',
        code: 'INVALID_MESSAGE',
      };
    }

    // Extract the local worker ID and target peer owner
    const localWorkerId = from.split('/')[1];
    const targetPeerOwner = input.to.split('/')[0];

    // Check permissions
    if (localWorkerId) {
      const permError = this.checkSendPermission(localWorkerId, input.intent, targetPeerOwner);
      if (permError) {
        return permError;
      }
    }

    // Compose the HIAMP message with replyTo
    const thread = input.thread ?? generateThreadId();
    const composeInput: ComposeInput = {
      from,
      to: input.to,
      intent: input.intent,
      body: input.body,
      thread,
      priority: input.priority,
      ack: input.ack,
      ref: input.ref,
      token: input.token,
      attach: input.attach,
      expires: input.expires,
      replyTo: input.replyTo,
    };

    const messageText = compose(composeInput);

    // Resolve channel
    const channelResult = await this.channelResolver.resolve({
      targetPeerOwner,
      channelId: input.channelId,
      context: input.context ?? input.ref,
      strategy: input.strategy,
    });

    if (!channelResult.success) {
      return {
        success: false,
        error: channelResult.error,
        code: 'CHANNEL_RESOLVE_FAILED',
      };
    }

    // Post to Slack with thread_ts for threading
    return this.postToSlack(channelResult.channelId, messageText, thread, input.threadTs);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve the "from" address from input.
   * If input.from is set, use it. Otherwise derive from config identity + worker.
   */
  private resolveFromAddress(input: SendInput): string | null {
    if (input.from) {
      return input.from;
    }
    if (input.worker) {
      return `${this.config.identity.owner}/${input.worker}`;
    }
    return null;
  }

  /**
   * Check if the local worker has permission to send this message.
   */
  private checkSendPermission(
    workerId: string,
    intent: IntentType,
    targetPeerOwner: string,
  ): SendFailure | null {
    const wp = this.config.workerPermissions;

    // Find the worker's permission entry
    const workerPerm = wp.workers.find((w) => w.id === workerId);

    if (!workerPerm) {
      // Use default permission
      if (wp.default === 'deny') {
        return {
          success: false,
          error: `Worker "${workerId}" is not authorized to send external messages`,
          code: 'PERMISSION_DENIED',
        };
      }
      // default: allow -- no restrictions
      return null;
    }

    if (!workerPerm.send) {
      return {
        success: false,
        error: `Worker "${workerId}" does not have send permission`,
        code: 'PERMISSION_DENIED',
      };
    }

    // Check allowed intents
    if (workerPerm.allowedIntents && !workerPerm.allowedIntents.includes(intent)) {
      return {
        success: false,
        error: `Worker "${workerId}" is not allowed to send "${intent}" messages`,
        code: 'PERMISSION_DENIED',
      };
    }

    // Check allowed peers
    if (workerPerm.allowedPeers && !workerPerm.allowedPeers.includes('*')) {
      if (!workerPerm.allowedPeers.includes(targetPeerOwner)) {
        return {
          success: false,
          error: `Worker "${workerId}" is not allowed to message peer "${targetPeerOwner}"`,
          code: 'PERMISSION_DENIED',
        };
      }
    }

    return null;
  }

  /**
   * Validate that the target address (owner/worker) exists in the peer directory.
   */
  private validateTargetAddress(address: string): SendFailure | null {
    const parts = address.split('/');
    if (parts.length !== 2) {
      return {
        success: false,
        error: `Invalid target address format: "${address}". Expected "owner/worker-id".`,
        code: 'INVALID_MESSAGE',
      };
    }

    const [peerOwner, workerId] = parts;
    const peer = this.config.peers.find((p) => p.owner === peerOwner);
    if (!peer) {
      return {
        success: false,
        error: `Unknown peer "${peerOwner}" not found in peer directory`,
        code: 'INVALID_MESSAGE',
      };
    }

    const worker = peer.workers.find((w) => w.id === workerId);
    if (!worker) {
      return {
        success: false,
        error: `Unknown worker "${workerId}" for peer "${peerOwner}"`,
        code: 'INVALID_MESSAGE',
      };
    }

    return null;
  }

  /**
   * Post a message to Slack, using the rate limiter.
   */
  private async postToSlack(
    channelId: string,
    messageText: string,
    thread: string,
    threadTs?: string,
  ): Promise<SendResult> {
    try {
      const result = await this.rateLimiter.enqueue(channelId, async () => {
        return this.slackClient.chat.postMessage({
          channel: channelId,
          text: messageText,
          thread_ts: threadTs,
          // Disable link previews and name unfurling for cleaner protocol messages
          unfurl_links: false,
          unfurl_media: false,
        });
      });

      if (!result.ok || !result.ts) {
        return {
          success: false,
          error: `Slack API returned error: ${result.error ?? 'unknown'}`,
          code: 'SLACK_API_ERROR',
        };
      }

      return {
        success: true,
        ts: result.ts,
        channelId,
        messageText,
        thread,
      };
    } catch (err) {
      const errorMessage = (err as Error).message ?? String(err);

      // Detect Slack rate limiting
      if (errorMessage.includes('rate_limited') || errorMessage.includes('ratelimited')) {
        return {
          success: false,
          error: `Slack rate limit exceeded: ${errorMessage}`,
          code: 'RATE_LIMITED',
        };
      }

      return {
        success: false,
        error: `Slack API error: ${errorMessage}`,
        code: 'SLACK_API_ERROR',
      };
    }
  }
}
