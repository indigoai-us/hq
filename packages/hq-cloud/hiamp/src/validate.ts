/**
 * HIAMP v1 Validate
 *
 * Validates a HiampMessage for completeness and field format correctness.
 * Returns specific validation errors for each issue found.
 */

import type { HiampMessage, ValidationResult, ValidationError } from './types.js';
import {
  PROTOCOL_VERSION,
  MESSAGE_ID_PATTERN,
  THREAD_ID_PATTERN,
  WORKER_ADDRESS_PATTERN,
  MAX_ADDRESS_LENGTH,
  INTENT_TYPES,
  PRIORITY_LEVELS,
  ACK_MODES,
} from './constants.js';

/**
 * Validate a HiampMessage for completeness and field formats.
 *
 * Checks:
 * - All required fields are present and non-empty
 * - Protocol version is recognized
 * - Message ID matches the expected format
 * - Thread ID (if present) matches the expected format
 * - Worker addresses match the expected format and length
 * - Intent is one of the 8 defined types
 * - Priority (if present) is a valid level
 * - Ack (if present) is a valid mode
 * - reply-to (if present) matches message ID format
 * - expires (if present) is a valid ISO 8601 datetime
 *
 * @param message - The HiampMessage to validate.
 * @returns A ValidationResult with `valid` flag and list of errors.
 */
export function validate(message: HiampMessage): ValidationResult {
  const errors: ValidationError[] = [];

  // Required: version
  if (!message.version) {
    errors.push({ field: 'version', message: 'Protocol version (hq-msg) is required' });
  } else if (message.version !== PROTOCOL_VERSION) {
    errors.push({
      field: 'version',
      message: `Unsupported protocol version: "${message.version}" (expected "${PROTOCOL_VERSION}")`,
    });
  }

  // Required: id
  if (!message.id) {
    errors.push({ field: 'id', message: 'Message ID is required' });
  } else if (!MESSAGE_ID_PATTERN.test(message.id)) {
    errors.push({
      field: 'id',
      message: `Invalid message ID format: "${message.id}" (expected msg-{6-12 alphanumeric})`,
    });
  }

  // Required: from
  if (!message.from) {
    errors.push({ field: 'from', message: 'Sender address (from) is required' });
  } else {
    const fromErrors = validateAddress(message.from, 'from');
    errors.push(...fromErrors);
  }

  // Required: to
  if (!message.to) {
    errors.push({ field: 'to', message: 'Recipient address (to) is required' });
  } else {
    const toErrors = validateAddress(message.to, 'to');
    errors.push(...toErrors);
  }

  // Required: intent
  if (!message.intent) {
    errors.push({ field: 'intent', message: 'Intent is required' });
  } else if (!(INTENT_TYPES as readonly string[]).includes(message.intent)) {
    errors.push({
      field: 'intent',
      message: `Unknown intent type: "${message.intent}" (expected one of: ${INTENT_TYPES.join(', ')})`,
    });
  }

  // Required: body (can be empty string but should exist)
  if (message.body === undefined || message.body === null) {
    errors.push({ field: 'body', message: 'Message body is required' });
  }

  // Optional: thread
  if (message.thread !== undefined) {
    if (!THREAD_ID_PATTERN.test(message.thread)) {
      errors.push({
        field: 'thread',
        message: `Invalid thread ID format: "${message.thread}" (expected thr-{6-12 alphanumeric})`,
      });
    }
  }

  // Optional: priority
  if (message.priority !== undefined) {
    if (!(PRIORITY_LEVELS as readonly string[]).includes(message.priority)) {
      errors.push({
        field: 'priority',
        message: `Invalid priority: "${message.priority}" (expected one of: ${PRIORITY_LEVELS.join(', ')})`,
      });
    }
  }

  // Optional: ack
  if (message.ack !== undefined) {
    if (!(ACK_MODES as readonly string[]).includes(message.ack)) {
      errors.push({
        field: 'ack',
        message: `Invalid ack mode: "${message.ack}" (expected one of: ${ACK_MODES.join(', ')})`,
      });
    }
  }

  // Optional: replyTo
  if (message.replyTo !== undefined) {
    if (!MESSAGE_ID_PATTERN.test(message.replyTo)) {
      errors.push({
        field: 'replyTo',
        message: `Invalid reply-to ID format: "${message.replyTo}" (expected msg-{6-12 alphanumeric})`,
      });
    }
  }

  // Optional: expires
  if (message.expires !== undefined) {
    const expiresDate = new Date(message.expires);
    if (isNaN(expiresDate.getTime())) {
      errors.push({
        field: 'expires',
        message: `Invalid expires timestamp: "${message.expires}" (expected ISO 8601 datetime)`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a worker address format.
 */
function validateAddress(address: string, fieldName: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (address.length > MAX_ADDRESS_LENGTH) {
    errors.push({
      field: fieldName,
      message: `Address too long: "${address}" (max ${MAX_ADDRESS_LENGTH} characters)`,
    });
  }

  if (!WORKER_ADDRESS_PATTERN.test(address)) {
    errors.push({
      field: fieldName,
      message: `Invalid address format: "${address}" (expected owner/worker-id, lowercase alphanumeric + hyphens, min 2 chars each part)`,
    });
  }

  return errors;
}
