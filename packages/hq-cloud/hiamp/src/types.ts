/**
 * HIAMP v1 TypeScript Types
 *
 * All interfaces and type definitions for the HIAMP message envelope library.
 */

import type { INTENT_TYPES, PRIORITY_LEVELS, ACK_MODES } from './constants.js';

/** One of the 8 intent types defined in HIAMP v1 */
export type IntentType = (typeof INTENT_TYPES)[number];

/** Priority levels */
export type Priority = (typeof PRIORITY_LEVELS)[number];

/** Acknowledgment modes */
export type AckMode = (typeof ACK_MODES)[number];

/** Worker address in owner/worker-id format */
export type WorkerAddress = string;

/** Message ID in msg-{alphanumeric} format */
export type MessageId = string;

/** Thread ID in thr-{alphanumeric} format */
export type ThreadId = string;

/**
 * A fully parsed HIAMP message.
 */
export interface HiampMessage {
  /** Protocol version (always 'v1' for this spec) */
  version: string;

  /** Unique message identifier (msg-{alphanumeric}) */
  id: MessageId;

  /** Sender's worker address (owner/worker-id) */
  from: WorkerAddress;

  /** Recipient's worker address (owner/worker-id) */
  to: WorkerAddress;

  /** The purpose of this message */
  intent: IntentType;

  /** Human-readable body text */
  body: string;

  /** Thread identifier for grouping related messages */
  thread?: ThreadId;

  /** Processing priority hint */
  priority?: Priority;

  /** Acknowledgment mode */
  ack?: AckMode;

  /** Reference to external resource(s) — URI, path, or comma-separated list */
  ref?: string;

  /** Capability token (base64-encoded) */
  token?: string;

  /** ID of the message this is a reply to */
  replyTo?: MessageId;

  /** ISO 8601 expiry timestamp */
  expires?: string;

  /** Comma-separated list of attached file paths */
  attach?: string;
}

/**
 * Input for compose() — all the fields needed to construct a HIAMP message.
 * Same as HiampMessage but id and version are optional (auto-generated if missing).
 */
export interface ComposeInput {
  /** Protocol version. Defaults to 'v1'. */
  version?: string;

  /** Message ID. Auto-generated if not provided. */
  id?: MessageId;

  /** Sender's worker address */
  from: WorkerAddress;

  /** Recipient's worker address */
  to: WorkerAddress;

  /** The purpose of this message */
  intent: IntentType;

  /** Human-readable body text */
  body: string;

  /** Thread identifier */
  thread?: ThreadId;

  /** Processing priority */
  priority?: Priority;

  /** Acknowledgment mode */
  ack?: AckMode;

  /** Reference to external resource(s) */
  ref?: string;

  /** Capability token */
  token?: string;

  /** ID of the message this is a reply to */
  replyTo?: MessageId;

  /** ISO 8601 expiry timestamp */
  expires?: string;

  /** Comma-separated list of attached file paths */
  attach?: string;
}

/**
 * Successful parse result.
 */
export interface ParseSuccess {
  success: true;
  message: HiampMessage;
}

/**
 * Failed parse result with error details.
 */
export interface ParseFailure {
  success: false;
  errors: string[];
}

/** Result of parsing a raw message string */
export type ParseResult = ParseSuccess | ParseFailure;

/**
 * A single validation error.
 */
export interface ValidationError {
  /** The field that failed validation (or 'message' for structural issues) */
  field: string;

  /** Human-readable error message */
  message: string;
}

/**
 * Result of validating a HiampMessage.
 */
export interface ValidationResult {
  /** Whether the message is valid */
  valid: boolean;

  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
}
