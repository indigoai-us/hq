/**
 * HIAMP Transport Interface
 *
 * Defines the abstract transport layer for HIAMP messaging.
 * Transports handle the platform-specific details of sending and receiving
 * messages, allowing the HIAMP protocol core to remain transport-agnostic.
 *
 * Implementations:
 * - SlackTransport (deprecated) — posts messages to Slack channels
 * - LinearTransport (planned) — posts messages as Linear issue comments
 *
 * @module transport
 */

import type { ComposeInput, HiampMessage } from './types.js';

// ---------------------------------------------------------------------------
// Transport result types
// ---------------------------------------------------------------------------

/** Successful send result from a transport */
export interface TransportSendSuccess {
  success: true;

  /** Transport-specific message identifier (e.g., Slack ts, Linear comment ID) */
  messageId: string;

  /** The channel/destination the message was sent to */
  channelId: string;

  /** The composed HIAMP message text */
  messageText: string;

  /** The HIAMP thread ID */
  thread: string;
}

/** Failed send result from a transport */
export interface TransportSendFailure {
  success: false;

  /** Human-readable error message */
  error: string;

  /** Error code categorizing the failure */
  code:
    | 'INVALID_MESSAGE'
    | 'CHANNEL_RESOLVE_FAILED'
    | 'PERMISSION_DENIED'
    | 'TRANSPORT_ERROR'
    | 'RATE_LIMITED'
    | 'KILL_SWITCH'
    | 'DISABLED';
}

/** Result of a transport send operation */
export type TransportSendResult = TransportSendSuccess | TransportSendFailure;

/** Input for sending a message through a transport */
export interface TransportSendInput {
  /** Recipient worker address (e.g., "alex/backend-dev") */
  to: string;

  /** Sender worker address. If omitted, derived from config identity + worker. */
  from?: string;

  /** The local worker ID sending this message */
  worker?: string;

  /** Message intent */
  intent: ComposeInput['intent'];

  /** Message body text */
  body: string;

  /** Thread ID for grouping. Auto-generated if not provided. */
  thread?: string;

  /** Priority */
  priority?: ComposeInput['priority'];

  /** Ack mode */
  ack?: ComposeInput['ack'];

  /** Reference URI or path */
  ref?: string;

  /** Capability token */
  token?: string;

  /** Attached file paths (comma-separated) */
  attach?: string;

  /** ISO 8601 expiry timestamp */
  expires?: string;

  /** Explicit channel/destination ID override */
  channelId?: string;

  /** Context for contextual routing */
  context?: string;
}

/** Input for sending a threaded reply */
export interface TransportReplyInput extends TransportSendInput {
  /** Transport-specific thread reference (e.g., Slack thread_ts, Linear issue ID) */
  threadRef: string;

  /** The HIAMP message ID this is a reply to */
  replyTo: string;
}

/** Successful channel resolution */
export interface TransportResolveSuccess {
  success: true;

  /** Resolved channel/destination identifier */
  channelId: string;

  /** Optional human-readable channel name */
  channelName?: string;
}

/** Failed channel resolution */
export interface TransportResolveFailure {
  success: false;

  /** Human-readable error message */
  error: string;

  /** Error code */
  code: string;
}

/** Result of resolving a channel/destination */
export type TransportResolveResult = TransportResolveSuccess | TransportResolveFailure;

/** Input for resolving a channel/destination */
export interface TransportResolveInput {
  /** The target peer's owner name (e.g., "alex") */
  targetPeerOwner: string;

  /** Optional: explicit channel ID override */
  channelId?: string;

  /** Optional: context for contextual routing */
  context?: string;
}

/** A message received by the transport's listener */
export interface TransportReceivedMessage {
  /** The raw message text */
  rawText: string;

  /** The parsed HIAMP message (if detection and parse succeeded) */
  message?: HiampMessage;

  /** Whether the message was detected as HIAMP */
  detected: boolean;

  /** The channel/source where the message was received */
  channelId?: string;

  /** Transport-specific sender identifier */
  senderId?: string;

  /** Transport-specific message reference (for threading) */
  messageRef?: string;

  /** Transport-specific thread reference */
  threadRef?: string;

  /** Error message if detection/parsing failed */
  error?: string;

  /** Processing timestamp */
  processedAt: string;
}

/** Callback for received messages */
export type TransportMessageHandler = (message: TransportReceivedMessage) => void;

/** Callback for transport errors */
export type TransportErrorHandler = (error: Error) => void;

// ---------------------------------------------------------------------------
// Transport interface
// ---------------------------------------------------------------------------

/**
 * Abstract transport interface for HIAMP messaging.
 *
 * A Transport handles the platform-specific details of:
 * - **Sending** messages to remote peers
 * - **Listening** for incoming messages from remote peers
 * - **Resolving** the destination channel/endpoint for a given peer
 *
 * The Transport interface decouples the HIAMP protocol core from any
 * specific communication platform. New transports can be plugged in
 * by implementing this interface.
 *
 * @example
 * ```ts
 * // Using a transport
 * const transport: Transport = new SlackTransport(config);
 *
 * // Send a message
 * const result = await transport.send({
 *   to: 'alex/backend-dev',
 *   worker: 'architect',
 *   intent: 'handoff',
 *   body: 'The API contract is ready.',
 * });
 *
 * // Start listening for incoming messages
 * await transport.listen({
 *   onMessage: (msg) => console.log('Received:', msg),
 *   onError: (err) => console.error('Error:', err),
 * });
 *
 * // Resolve a channel
 * const channel = await transport.resolveChannel({
 *   targetPeerOwner: 'alex',
 * });
 *
 * // Stop the transport
 * await transport.stop();
 * ```
 */
export interface Transport {
  /** Human-readable name of this transport (e.g., "slack", "linear") */
  readonly name: string;

  /**
   * Send a HIAMP message to a remote peer.
   *
   * @param input - The message details.
   * @returns A result indicating success or failure.
   */
  send(input: TransportSendInput): Promise<TransportSendResult>;

  /**
   * Send a threaded reply to an existing message.
   *
   * @param input - The reply details including thread reference.
   * @returns A result indicating success or failure.
   */
  sendReply(input: TransportReplyInput): Promise<TransportSendResult>;

  /**
   * Start listening for incoming messages.
   *
   * @param options - Callbacks for received messages and errors.
   * @returns A promise that resolves when the listener is ready.
   */
  listen(options: {
    onMessage?: TransportMessageHandler;
    onError?: TransportErrorHandler;
  }): Promise<void>;

  /**
   * Resolve the destination channel/endpoint for a peer.
   *
   * @param input - The resolution input.
   * @returns The resolved channel or an error.
   */
  resolveChannel(input: TransportResolveInput): Promise<TransportResolveResult>;

  /**
   * Stop the transport (cease listening, clean up resources).
   */
  stop(): Promise<void>;

  /**
   * Check if the transport is currently listening for messages.
   */
  isListening(): boolean;
}
