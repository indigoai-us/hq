/**
 * HIAMP Linear Sender
 *
 * Composes HIAMP messages and posts them as comments on Linear issues.
 * Handles channel resolution via LinearChannelResolver, rate limiting
 * (respecting Linear's 1500 req/hr limit), thread continuity, and
 * structured error responses.
 *
 * Messages are formatted for Linear's markdown-based comments:
 * - Human-readable header and body remain visible
 * - HIAMP envelope is preserved in a collapsed `<details>` block
 *
 * Implements the Transport interface's send() contract for the Linear
 * transport layer.
 *
 * @module linear-sender
 */

import { compose } from './compose.js';
import { validate } from './validate.js';
import { parse } from './parse.js';
import { generateThreadId } from './ids.js';
import { DEFAULT_SEPARATOR } from './constants.js';
import type { ComposeInput } from './types.js';
import type { HiampConfig } from './config-loader.js';
import type { LinearClient } from './linear-client.js';
import type { LinearChannelResolver, LinearResolveResult } from './linear-channel-resolver.js';
import type {
  TransportSendInput,
  TransportSendResult,
  TransportSendFailure,
  TransportReplyInput,
} from './transport.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for constructing a LinearSender */
export interface LinearSenderOptions {
  /** The loaded HIAMP configuration */
  config: HiampConfig;

  /** An initialized LinearClient instance */
  linearClient: LinearClient;

  /** A configured LinearChannelResolver instance */
  channelResolver: LinearChannelResolver;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a composed HIAMP message for Linear's markdown comment format.
 *
 * The human-readable header line and body stay visible.
 * The machine-readable envelope is placed inside a collapsed `<details>` block.
 *
 * @param messageText - The raw composed HIAMP message string.
 * @returns The Linear-formatted markdown string.
 */
export function formatForLinear(messageText: string): string {
  // Split on the separator line
  const separatorIndex = messageText.indexOf(DEFAULT_SEPARATOR);

  if (separatorIndex === -1) {
    // No separator found — just return as-is
    return messageText;
  }

  const headerAndBody = messageText.slice(0, separatorIndex).trimEnd();
  const envelope = messageText.slice(separatorIndex).trimStart();

  return [
    headerAndBody,
    '',
    '<details>',
    '<summary>HIAMP envelope</summary>',
    '',
    '```',
    envelope,
    '```',
    '</details>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// LinearSender class
// ---------------------------------------------------------------------------

/**
 * Sends HIAMP-formatted messages as comments on Linear issues.
 *
 * Handles the full lifecycle of outgoing messages:
 * 1. Permission checking (worker-permissions config)
 * 2. Message composition (via HIAMP compose library)
 * 3. Message validation
 * 4. Channel resolution (via LinearChannelResolver — maps context to issue)
 * 5. Formatting for Linear markdown (collapsed envelope)
 * 6. Posting as a comment via LinearClient
 *
 * Threading: subsequent messages in the same HIAMP thread post on the
 * same Linear issue. The thread-to-issue mapping is maintained internally.
 *
 * Rate limiting: defers to LinearClient's built-in rate limiting (1500 req/hr).
 *
 * @example
 * ```ts
 * const sender = new LinearSender({
 *   config,
 *   linearClient,
 *   channelResolver,
 * });
 *
 * const result = await sender.send({
 *   to: 'alex/backend-dev',
 *   worker: 'architect',
 *   intent: 'handoff',
 *   body: 'The API contract is ready.',
 *   context: 'hq-cloud',
 * });
 * ```
 */
export class LinearSender {
  private readonly config: HiampConfig;
  private readonly linearClient: LinearClient;
  private readonly channelResolver: LinearChannelResolver;

  /**
   * Maps HIAMP thread IDs to Linear issue IDs.
   * Ensures subsequent messages in the same thread are posted
   * as comments on the same issue.
   */
  private readonly threadToIssue = new Map<string, string>();

  constructor(options: LinearSenderOptions) {
    this.config = options.config;
    this.linearClient = options.linearClient;
    this.channelResolver = options.channelResolver;
  }

  /**
   * Send a new HIAMP message as a comment on a Linear issue.
   *
   * @param input - The message details (TransportSendInput).
   * @returns A TransportSendResult indicating success or failure.
   */
  async send(input: TransportSendInput): Promise<TransportSendResult> {
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
    const localWorkerId = from.split('/')[1] ?? '';
    const targetPeerOwner = input.to.split('/')[0] ?? '';

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

    // Resolve the target Linear issue
    const issueId = await this.resolveIssueId(thread, input, targetPeerOwner);
    if (!issueId.success) {
      return issueId;
    }

    // Post to Linear
    return this.postToLinear(issueId.issueId, messageText, thread);
  }

  /**
   * Send a threaded reply to an existing HIAMP message on a Linear issue.
   *
   * The reply is posted as another comment on the same issue that the
   * original message was posted to (resolved via threadRef, which is the
   * Linear issue ID).
   *
   * @param input - The reply details including threadRef and replyTo.
   * @returns A TransportSendResult indicating success or failure.
   */
  async sendReply(input: TransportReplyInput): Promise<TransportSendResult> {
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
    const localWorkerId = from.split('/')[1] ?? '';
    const targetPeerOwner = input.to.split('/')[0] ?? '';

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

    // The threadRef is the Linear issue ID for replies
    const issueId = input.threadRef;

    // Record the thread-to-issue mapping
    this.threadToIssue.set(thread, issueId);

    // Post to Linear
    return this.postToLinear(issueId, messageText, thread);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve the "from" address from input.
   * If input.from is set, use it. Otherwise derive from config identity + worker.
   */
  private resolveFromAddress(input: TransportSendInput): string | null {
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
    intent: TransportSendInput['intent'],
    targetPeerOwner: string,
  ): TransportSendFailure | null {
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
  private validateTargetAddress(address: string): TransportSendFailure | null {
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
   * Resolve the Linear issue ID for this message.
   *
   * Priority:
   * 1. If this thread already has a mapped issue, use it (threading continuity)
   * 2. If explicit channelId is provided, use it directly
   * 3. Resolve via LinearChannelResolver (context-based or fallback)
   */
  private async resolveIssueId(
    thread: string,
    input: TransportSendInput,
    targetPeerOwner: string,
  ): Promise<{ success: true; issueId: string } | TransportSendFailure> {
    // Check thread-to-issue mapping first (threading continuity)
    const existingIssueId = this.threadToIssue.get(thread);
    if (existingIssueId) {
      return { success: true, issueId: existingIssueId };
    }

    // If explicit channelId is provided, use it as the issue ID
    if (input.channelId) {
      this.threadToIssue.set(thread, input.channelId);
      return { success: true, issueId: input.channelId };
    }

    // Resolve via LinearChannelResolver
    const resolveResult: LinearResolveResult = await this.channelResolver.resolve({
      targetPeerOwner,
      context: input.context ?? input.ref,
    });

    if (!resolveResult.success) {
      return {
        success: false,
        error: resolveResult.error,
        code: 'CHANNEL_RESOLVE_FAILED',
      };
    }

    // Store the thread-to-issue mapping for subsequent messages
    this.threadToIssue.set(thread, resolveResult.issueId);

    return { success: true, issueId: resolveResult.issueId };
  }

  /**
   * Post a HIAMP message as a comment on a Linear issue.
   *
   * Formats the message for Linear markdown (collapsed envelope)
   * and uses LinearClient.createComment to post it.
   *
   * Rate limiting is handled by LinearClient's built-in rate limiter.
   */
  private async postToLinear(
    issueId: string,
    messageText: string,
    thread: string,
  ): Promise<TransportSendResult> {
    // Format the message for Linear's markdown
    const formattedText = formatForLinear(messageText);

    try {
      const result = await this.linearClient.createComment({
        issueId,
        body: formattedText,
      });

      if (!result.success) {
        // Map Linear error codes to transport error codes
        if (result.code === 'RATE_LIMITED') {
          return {
            success: false,
            error: `Linear rate limit exceeded: ${result.error}`,
            code: 'RATE_LIMITED',
          };
        }

        if (result.code === 'AUTH_ERROR') {
          return {
            success: false,
            error: `Linear permission denied: ${result.error}`,
            code: 'PERMISSION_DENIED',
          };
        }

        return {
          success: false,
          error: `Linear API error: ${result.error}`,
          code: 'TRANSPORT_ERROR',
        };
      }

      return {
        success: true,
        messageId: result.data.id,
        channelId: issueId,
        messageText: formattedText,
        thread,
      };
    } catch (err) {
      const errorMessage = (err as Error).message ?? String(err);

      return {
        success: false,
        error: `Linear API error: ${errorMessage}`,
        code: 'TRANSPORT_ERROR',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  /**
   * Get the thread-to-issue mapping (for testing).
   */
  getThreadMapping(thread: string): string | undefined {
    return this.threadToIssue.get(thread);
  }

  /**
   * Get the number of thread-to-issue mappings (for testing).
   */
  getThreadMappingCount(): number {
    return this.threadToIssue.size;
  }
}
