/**
 * HIAMP v1 Constants
 *
 * All constant values defined by the HIAMP v1 specification.
 */

/** Current protocol version */
export const PROTOCOL_VERSION = 'v1' as const;

/** The 8 intent types defined in HIAMP v1 (Section 6) */
export const INTENT_TYPES = [
  'handoff',
  'request',
  'inform',
  'acknowledge',
  'query',
  'response',
  'error',
  'share',
] as const;

/** Priority levels (Section 5.1) */
export const PRIORITY_LEVELS = ['low', 'normal', 'high', 'urgent'] as const;

/** Acknowledgment modes (Section 5.1) */
export const ACK_MODES = ['requested', 'optional', 'none'] as const;

/** Unicode box-drawing horizontal character (U+2500) */
export const SEPARATOR_CHAR = '\u2500';

/** ASCII fallback separator character */
export const SEPARATOR_CHAR_ASCII = '-';

/** Minimum separator length */
export const SEPARATOR_MIN_LENGTH = 15;

/** Default separator line (15 box-drawing chars) */
export const DEFAULT_SEPARATOR = SEPARATOR_CHAR.repeat(SEPARATOR_MIN_LENGTH);

/** Unicode right arrow (U+2192) used in the header */
export const HEADER_ARROW = '\u2192';

/** ASCII fallback arrow */
export const HEADER_ARROW_ASCII = '-->';

/** Envelope field delimiter */
export const FIELD_DELIMITER = ' | ';

/** Regex for message IDs: msg-{6-12 alphanumeric} */
export const MESSAGE_ID_PATTERN = /^msg-[a-z0-9]{6,12}$/;

/** Regex for thread IDs: thr-{6-12 alphanumeric} */
export const THREAD_ID_PATTERN = /^thr-[a-z0-9]{6,12}$/;

/** Regex for worker addresses: owner/worker-id */
export const WORKER_ADDRESS_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]\/[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/** Max total length for a worker address */
export const MAX_ADDRESS_LENGTH = 64;

/** Regex to detect a separator line (15+ of U+2500 or hyphens) */
export const SEPARATOR_LINE_REGEX = /^\s*(?:\u2500{15,}|-{15,})\s*$/;

/** Regex to detect the header line (from → to or from --> to) */
export const HEADER_LINE_REGEX = /^(.+?)\s*(?:\u2192|-->)\s*(.+)$/;

/** Required envelope fields (Section 5.1) */
export const REQUIRED_FIELDS = ['hq-msg', 'id', 'from', 'to', 'intent'] as const;

/** All known envelope fields */
export const KNOWN_FIELDS = [
  'hq-msg',
  'id',
  'thread',
  'from',
  'to',
  'intent',
  'priority',
  'ack',
  'ref',
  'token',
  'reply-to',
  'expires',
  'attach',
] as const;

/** Message ID prefix */
export const MESSAGE_ID_PREFIX = 'msg-';

/** Thread ID prefix */
export const THREAD_ID_PREFIX = 'thr-';
