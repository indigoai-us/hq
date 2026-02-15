/**
 * HIAMP v1 Parse
 *
 * Parses a raw Slack message string and extracts the structured envelope + body.
 * Returns a result type — never throws.
 *
 * Expected input format:
 *   {from} → {to}
 *
 *   {body}
 *
 *   ───────────────
 *   {envelope}
 */

import type { HiampMessage, ParseResult } from './types.js';
import type { IntentType, Priority, AckMode } from './types.js';
import {
  SEPARATOR_LINE_REGEX,
  HEADER_LINE_REGEX,
  FIELD_DELIMITER,
  INTENT_TYPES,
  PRIORITY_LEVELS,
  ACK_MODES,
} from './constants.js';

/**
 * Parse a raw HIAMP message string into a structured HiampMessage.
 *
 * Returns `{ success: true, message }` on success, or
 * `{ success: false, errors }` on failure. Never throws.
 *
 * @param raw - The raw message string (e.g., from Slack).
 * @returns A ParseResult indicating success or failure with details.
 */
export function parse(raw: string): ParseResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'string') {
    return { success: false, errors: ['Input is empty or not a string'] };
  }

  // Split into lines
  const lines = raw.split('\n');

  // Find the separator line
  const separatorIndex = findSeparatorIndex(lines);

  if (separatorIndex === -1) {
    return {
      success: false,
      errors: ['No separator line found (expected 15+ box-drawing or hyphen characters)'],
    };
  }

  // Everything above the separator is header + body
  const aboveSeparator = lines.slice(0, separatorIndex);

  // Everything below the separator is envelope
  const belowSeparator = lines.slice(separatorIndex + 1);

  if (belowSeparator.length === 0 || belowSeparator.every((l) => l.trim() === '')) {
    return { success: false, errors: ['No envelope found below separator'] };
  }

  // Parse header (first non-empty line above separator)
  const headerResult = parseHeader(aboveSeparator);
  if (headerResult.errors.length > 0) {
    errors.push(...headerResult.errors);
  }

  // Extract body (everything between header line and separator, trimmed)
  const body = extractBody(aboveSeparator, headerResult.headerLineIndex);

  // Parse envelope
  const envelopeResult = parseEnvelope(belowSeparator);
  if (envelopeResult.errors.length > 0) {
    errors.push(...envelopeResult.errors);
  }

  const fields = envelopeResult.fields;

  // Validate required fields
  const requiredErrors = validateRequiredFields(fields);
  errors.push(...requiredErrors);

  // If we have critical errors, return failure
  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Build the HiampMessage
  const message: HiampMessage = {
    version: fields.get('hq-msg')!,
    id: fields.get('id')!,
    from: fields.get('from')!,
    to: fields.get('to')!,
    intent: fields.get('intent')! as IntentType,
    body,
  };

  // Optional fields
  const thread = fields.get('thread');
  if (thread) message.thread = thread;

  const priority = fields.get('priority');
  if (priority) message.priority = priority as Priority;

  const ack = fields.get('ack');
  if (ack) message.ack = ack as AckMode;

  const ref = fields.get('ref');
  if (ref) message.ref = ref;

  const token = fields.get('token');
  if (token) message.token = token;

  const replyTo = fields.get('reply-to');
  if (replyTo) message.replyTo = replyTo;

  const expires = fields.get('expires');
  if (expires) message.expires = expires;

  const attach = fields.get('attach');
  if (attach) message.attach = attach;

  return { success: true, message };
}

/**
 * Find the index of the separator line (last one, to handle body content
 * that might look similar but is shorter).
 */
function findSeparatorIndex(lines: string[]): number {
  // Search from bottom up — the separator is typically near the end
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SEPARATOR_LINE_REGEX.test(lines[i]!)) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse the header line from the lines above the separator.
 */
function parseHeader(
  lines: string[],
): { from: string; to: string; headerLineIndex: number; errors: string[] } {
  const errors: string[] = [];
  let from = '';
  let to = '';
  let headerLineIndex = -1;

  // Find the first non-empty line that matches the header pattern
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;

    const match = HEADER_LINE_REGEX.exec(line);
    if (match) {
      from = match[1]!.trim();
      to = match[2]!.trim();
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex === -1) {
    errors.push('No header line found (expected "from → to" or "from --> to")');
  }

  return { from, to, headerLineIndex, errors };
}

/**
 * Extract the body text from lines above the separator, excluding the header line.
 */
function extractBody(lines: string[], headerLineIndex: number): string {
  if (headerLineIndex === -1) {
    // No header found — treat everything above separator as body
    return lines.join('\n').trim();
  }

  // Body is everything after the header line, trimmed
  const bodyLines = lines.slice(headerLineIndex + 1);
  const bodyText = bodyLines.join('\n');

  // Trim leading/trailing blank lines but preserve internal formatting
  return bodyText.replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Parse envelope lines into a field map.
 */
function parseEnvelope(
  lines: string[],
): { fields: Map<string, string>; errors: string[] } {
  const errors: string[] = [];
  const fields = new Map<string, string>();

  // Join all envelope lines and split by field delimiter
  const envelopeText = lines
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .join(FIELD_DELIMITER);

  const rawFields = envelopeText.split(FIELD_DELIMITER);

  for (const rawField of rawFields) {
    const trimmed = rawField.trim();
    if (trimmed === '') continue;

    // Split by first colon
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      errors.push(`Malformed envelope field (no colon): "${trimmed}"`);
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (key === '') {
      errors.push(`Empty key in envelope field: "${trimmed}"`);
      continue;
    }

    // Empty values are treated as absent per spec
    if (value === '') continue;

    fields.set(key, value);
  }

  return { fields, errors };
}

/**
 * Validate that all required envelope fields are present.
 */
function validateRequiredFields(fields: Map<string, string>): string[] {
  const errors: string[] = [];

  if (!fields.has('hq-msg')) {
    errors.push('Missing required field: hq-msg');
  }

  if (!fields.has('id')) {
    errors.push('Missing required field: id');
  }

  if (!fields.has('from')) {
    errors.push('Missing required field: from');
  }

  if (!fields.has('to')) {
    errors.push('Missing required field: to');
  }

  if (!fields.has('intent')) {
    errors.push('Missing required field: intent');
  }

  return errors;
}
