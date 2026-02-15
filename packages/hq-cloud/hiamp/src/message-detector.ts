/**
 * HIAMP Message Detector
 *
 * A cheap pre-filter that determines whether an incoming Slack message
 * contains a HIAMP protocol message, before invoking the full parser.
 *
 * Checks for the presence of the separator pattern (15+ U+2500 or hyphens)
 * and the header arrow pattern (from -> to). Also filters out messages
 * from the bot itself to prevent echo loops.
 *
 * @module message-detector
 */

import { SEPARATOR_LINE_REGEX, HEADER_LINE_REGEX } from './constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A minimal representation of a Slack message event */
export interface SlackMessageEvent {
  /** The message text */
  text?: string;

  /** The Slack user/bot ID that posted the message */
  user?: string;

  /** Bot ID if the message was posted by a bot */
  bot_id?: string;

  /** Channel the message was posted in */
  channel?: string;

  /** Message subtype (e.g., 'bot_message', 'message_changed') */
  subtype?: string;

  /** Message timestamp */
  ts?: string;

  /** Thread timestamp (if a threaded reply) */
  thread_ts?: string;

  /** Files attached to the message */
  files?: Array<{ name?: string; url_private?: string; mimetype?: string }>;
}

/** Detection result */
export interface DetectionResult {
  /** Whether this message appears to be a HIAMP message */
  isHiamp: boolean;

  /** Reason for the detection result (useful for logging) */
  reason: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether a Slack message event contains a HIAMP protocol message.
 *
 * This is a fast pre-filter check. It does NOT fully parse or validate
 * the message -- that is done by the parser after detection.
 *
 * Checks:
 * 1. Message has text content
 * 2. Message is not from the local bot (prevents echo loops)
 * 3. Message text contains a separator line (15+ box-drawing or hyphen chars)
 * 4. Message text contains a header arrow pattern (from -> to)
 *
 * @param event - The Slack message event.
 * @param localBotId - The local bot's Slack user/bot ID (to filter own messages).
 * @returns A DetectionResult indicating whether this is a HIAMP message.
 */
export function detectHiampMessage(
  event: SlackMessageEvent,
  localBotId?: string,
): DetectionResult {
  // No text content
  if (!event.text || event.text.trim() === '') {
    return { isHiamp: false, reason: 'No text content in message' };
  }

  // Filter out message subtypes that are not regular messages
  // (message_changed, message_deleted, channel_join, etc.)
  const ignoredSubtypes = new Set([
    'message_changed',
    'message_deleted',
    'channel_join',
    'channel_leave',
    'channel_topic',
    'channel_purpose',
    'channel_name',
    'channel_archive',
    'channel_unarchive',
    'pinned_item',
    'unpinned_item',
  ]);

  if (event.subtype && ignoredSubtypes.has(event.subtype)) {
    return { isHiamp: false, reason: `Ignored message subtype: ${event.subtype}` };
  }

  // Prevent echo loops -- ignore messages from our own bot
  if (localBotId) {
    if (event.user === localBotId || event.bot_id === localBotId) {
      return { isHiamp: false, reason: 'Message is from local bot (echo prevention)' };
    }
  }

  const text = event.text;
  const lines = text.split('\n');

  // Check for separator line
  let hasSeparator = false;
  for (const line of lines) {
    if (SEPARATOR_LINE_REGEX.test(line)) {
      hasSeparator = true;
      break;
    }
  }

  if (!hasSeparator) {
    return { isHiamp: false, reason: 'No HIAMP separator line found' };
  }

  // Check for header arrow pattern
  let hasHeader = false;
  for (const line of lines) {
    if (HEADER_LINE_REGEX.test(line.trim())) {
      hasHeader = true;
      break;
    }
  }

  if (!hasHeader) {
    return { isHiamp: false, reason: 'No HIAMP header line (from -> to) found' };
  }

  return { isHiamp: true, reason: 'Message contains HIAMP separator and header' };
}
