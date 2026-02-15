/**
 * HIAMP Ack Handler
 *
 * Handles automatic acknowledgment of incoming messages.
 * When a message arrives with `ack:requested`, this handler composes
 * and sends an `acknowledge` intent response via the SlackSender.
 *
 * For negative acknowledgments (nack), sends an `error` intent
 * with a reason in the body.
 *
 * @module ack-handler
 */

import { compose } from './compose.js';
import { generateMessageId } from './ids.js';
import type { HiampMessage, ComposeInput } from './types.js';
import type { SlackSender, SendResult } from './slack-sender.js';
import type { ThreadManager } from './thread-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of handling an incoming message for acknowledgment */
export interface AckHandleResult {
  /** Whether an ack/nack was sent */
  sent: boolean;

  /** The type of response sent, if any */
  type?: 'ack' | 'nack' | 'none';

  /** The composed ack/nack message ID (if sent) */
  messageId?: string;

  /** Send result from SlackSender (if sent) */
  sendResult?: SendResult;

  /** Reason why no ack was sent (if not sent) */
  reason?: string;
}

/** Options for the AckHandler */
export interface AckHandlerOptions {
  /** The local owner identity (e.g., "stefan") */
  localOwner: string;

  /** SlackSender for sending ack/nack responses */
  sender: SlackSender;

  /** ThreadManager for logging ack messages to threads */
  threadManager?: ThreadManager;

  /** Default worker ID to use as the "from" sender for acks when target worker is ambiguous */
  defaultWorker?: string;
}

/** Input for sending a nack (negative acknowledgment) */
export interface NackInput {
  /** The original message being rejected */
  originalMessage: HiampMessage;

  /** Reason for rejection */
  reason: string;

  /** Slack channel ID where the original message was received */
  channelId: string;

  /** Slack thread_ts for threading */
  slackThreadTs?: string;

  /** Override the "from" address for the nack */
  from?: string;
}

// ---------------------------------------------------------------------------
// AckHandler class
// ---------------------------------------------------------------------------

/**
 * Handles automatic acknowledgment of incoming HIAMP messages.
 *
 * When a message with `ack:requested` is received, the handler automatically
 * composes and sends an `acknowledge` intent response. The ack is sent
 * back to the original sender, in the same thread, with `reply-to` pointing
 * to the original message.
 *
 * @example
 * ```ts
 * const handler = new AckHandler({
 *   localOwner: 'stefan',
 *   sender: slackSender,
 *   threadManager: threadManager,
 * });
 *
 * const result = await handler.handleIncoming(message, 'C0CHAN', '12345.6789');
 * if (result.sent && result.type === 'ack') {
 *   console.log('Auto-ack sent:', result.messageId);
 * }
 * ```
 */
export class AckHandler {
  private readonly localOwner: string;
  private readonly sender: SlackSender;
  private readonly threadManager?: ThreadManager;
  private readonly defaultWorker: string;

  constructor(options: AckHandlerOptions) {
    this.localOwner = options.localOwner;
    this.sender = options.sender;
    this.threadManager = options.threadManager;
    this.defaultWorker = options.defaultWorker ?? 'system';
  }

  /**
   * Handle an incoming message for acknowledgment.
   *
   * If the message has `ack:requested`, compose and send an `acknowledge`
   * intent response. If `ack:optional` or `ack:none`, no action is taken.
   *
   * @param message - The parsed incoming HIAMP message.
   * @param channelId - The Slack channel ID where the message was received.
   * @param slackThreadTs - The Slack thread_ts for threading.
   * @returns An AckHandleResult indicating what action was taken.
   */
  async handleIncoming(
    message: HiampMessage,
    channelId: string,
    slackThreadTs?: string,
  ): Promise<AckHandleResult> {
    // Only auto-ack when ack:requested
    if (message.ack !== 'requested') {
      return {
        sent: false,
        type: 'none',
        reason: `No ack needed (ack mode: ${message.ack ?? 'none'})`,
      };
    }

    // Don't ack an ack or an error (prevents infinite loops)
    if (message.intent === 'acknowledge' || message.intent === 'error') {
      return {
        sent: false,
        type: 'none',
        reason: `Skipping ack for ${message.intent} intent (would cause loop)`,
      };
    }

    // Determine the "from" address for the ack
    // Use the target worker from the original message's "to" field
    const targetWorkerId = message.to.split('/')[1] ?? this.defaultWorker;
    const ackFrom = `${this.localOwner}/${targetWorkerId}`;

    // Compose the acknowledgment message
    const ackId = generateMessageId();
    const ackBody = `Acknowledged. Message ${message.id} received and understood.`;

    const composeInput: ComposeInput = {
      id: ackId,
      from: ackFrom,
      to: message.from,
      intent: 'acknowledge',
      body: ackBody,
      thread: message.thread,
      replyTo: message.id,
      ack: 'none',
    };

    // Send via SlackSender
    let sendResult: SendResult;

    if (slackThreadTs && message.thread) {
      sendResult = await this.sender.sendReply({
        from: ackFrom,
        to: message.from,
        intent: 'acknowledge',
        body: ackBody,
        thread: message.thread,
        replyTo: message.id,
        ack: 'none',
        threadTs: slackThreadTs,
        channelId,
      });
    } else {
      sendResult = await this.sender.send({
        from: ackFrom,
        to: message.from,
        intent: 'acknowledge',
        body: ackBody,
        thread: message.thread,
        ack: 'none',
        channelId,
      });
    }

    // Log the ack message to the thread if ThreadManager is available
    if (this.threadManager && message.thread) {
      const ackMessage: HiampMessage = {
        version: 'v1',
        id: ackId,
        from: ackFrom,
        to: message.from,
        intent: 'acknowledge',
        body: ackBody,
        thread: message.thread,
        replyTo: message.id,
        ack: 'none',
      };
      await this.threadManager.addMessage(message.thread, ackMessage);
    }

    return {
      sent: sendResult.success,
      type: 'ack',
      messageId: ackId,
      sendResult,
      reason: sendResult.success ? undefined : `Send failed: ${!sendResult.success ? (sendResult as { error: string }).error : ''}`,
    };
  }

  /**
   * Send a negative acknowledgment (nack) for a message.
   *
   * Nacks are sent as `error` intent messages per HIAMP v1 spec (Section 10.3).
   * The body contains the reason for rejection.
   *
   * @param input - The nack input details.
   * @returns An AckHandleResult indicating what action was taken.
   */
  async sendNack(input: NackInput): Promise<AckHandleResult> {
    const { originalMessage, reason, channelId, slackThreadTs } = input;

    // Determine the "from" address
    const targetWorkerId = originalMessage.to.split('/')[1] ?? this.defaultWorker;
    const nackFrom = input.from ?? `${this.localOwner}/${targetWorkerId}`;

    const nackId = generateMessageId();
    const nackBody = `${reason}`;

    let sendResult: SendResult;

    if (slackThreadTs && originalMessage.thread) {
      sendResult = await this.sender.sendReply({
        from: nackFrom,
        to: originalMessage.from,
        intent: 'error',
        body: nackBody,
        thread: originalMessage.thread,
        replyTo: originalMessage.id,
        ack: 'none',
        threadTs: slackThreadTs,
        channelId,
      });
    } else {
      sendResult = await this.sender.send({
        from: nackFrom,
        to: originalMessage.from,
        intent: 'error',
        body: nackBody,
        thread: originalMessage.thread,
        ack: 'none',
        channelId,
      });
    }

    // Log the nack to the thread if ThreadManager is available
    if (this.threadManager && originalMessage.thread) {
      const nackMessage: HiampMessage = {
        version: 'v1',
        id: nackId,
        from: nackFrom,
        to: originalMessage.from,
        intent: 'error',
        body: nackBody,
        thread: originalMessage.thread,
        replyTo: originalMessage.id,
        ack: 'none',
      };
      await this.threadManager.addMessage(originalMessage.thread, nackMessage);
    }

    return {
      sent: sendResult.success,
      type: 'nack',
      messageId: nackId,
      sendResult,
      reason: sendResult.success ? undefined : `Send failed: ${!sendResult.success ? (sendResult as { error: string }).error : ''}`,
    };
  }

  /**
   * Compose an ack message without sending it.
   * Useful for testing or manual sending.
   *
   * @param message - The original message to acknowledge.
   * @returns The composed ack message string.
   */
  composeAck(message: HiampMessage): string {
    const targetWorkerId = message.to.split('/')[1] ?? this.defaultWorker;
    const ackFrom = `${this.localOwner}/${targetWorkerId}`;

    return compose({
      from: ackFrom,
      to: message.from,
      intent: 'acknowledge',
      body: `Acknowledged. Message ${message.id} received and understood.`,
      thread: message.thread,
      replyTo: message.id,
      ack: 'none',
    });
  }

  /**
   * Compose a nack message without sending it.
   * Useful for testing or manual sending.
   *
   * @param message - The original message to reject.
   * @param reason - The rejection reason.
   * @returns The composed nack message string.
   */
  composeNack(message: HiampMessage, reason: string): string {
    const targetWorkerId = message.to.split('/')[1] ?? this.defaultWorker;
    const nackFrom = `${this.localOwner}/${targetWorkerId}`;

    return compose({
      from: nackFrom,
      to: message.from,
      intent: 'error',
      body: reason,
      thread: message.thread,
      replyTo: message.id,
      ack: 'none',
    });
  }
}
