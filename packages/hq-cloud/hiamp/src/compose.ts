/**
 * HIAMP v1 Compose
 *
 * Composes a structured HiampMessage into the hybrid Slack message string
 * defined by the HIAMP v1 specification.
 *
 * Output format:
 *   {from} → {to}
 *
 *   {body}
 *
 *   ───────────────
 *   {envelope key:value | key:value ...}
 */

import type { ComposeInput } from './types.js';
import {
  HEADER_ARROW,
  DEFAULT_SEPARATOR,
  FIELD_DELIMITER,
  PROTOCOL_VERSION,
} from './constants.js';
import { generateMessageId } from './ids.js';

/**
 * Compose a HIAMP message from structured input.
 *
 * Produces the hybrid human-readable + machine-parseable message format:
 * - Header line: `from → to`
 * - Body: freeform text
 * - Separator: 15 box-drawing characters
 * - Envelope: pipe-delimited key:value pairs
 *
 * If `id` is not provided, one is auto-generated.
 * If `version` is not provided, defaults to 'v1'.
 *
 * @param input - The structured message fields.
 * @returns The formatted HIAMP message string.
 */
export function compose(input: ComposeInput): string {
  const version = input.version ?? PROTOCOL_VERSION;
  const id = input.id ?? generateMessageId();

  // Build header
  const header = `${input.from} ${HEADER_ARROW} ${input.to}`;

  // Build envelope fields in spec order
  const fields: Array<[string, string]> = [];

  fields.push(['hq-msg', version]);
  fields.push(['id', id]);

  if (input.thread) {
    fields.push(['thread', input.thread]);
  }

  fields.push(['from', input.from]);
  fields.push(['to', input.to]);
  fields.push(['intent', input.intent]);

  if (input.priority) {
    fields.push(['priority', input.priority]);
  }

  if (input.ack) {
    fields.push(['ack', input.ack]);
  }

  if (input.replyTo) {
    fields.push(['reply-to', input.replyTo]);
  }

  if (input.ref) {
    fields.push(['ref', input.ref]);
  }

  if (input.token) {
    fields.push(['token', input.token]);
  }

  if (input.expires) {
    fields.push(['expires', input.expires]);
  }

  if (input.attach) {
    fields.push(['attach', input.attach]);
  }

  // Format envelope: group into lines of reasonable length
  // Put first 3 fields on line 1, next batch on line 2, rest on subsequent lines
  const envelopeLines = formatEnvelopeLines(fields);

  // Assemble full message
  const parts = [
    header,
    '',
    input.body,
    '',
    DEFAULT_SEPARATOR,
    ...envelopeLines,
  ];

  return parts.join('\n');
}

/**
 * Format envelope fields into lines, grouping related fields.
 *
 * Strategy: put hq-msg, id, thread on line 1; from, to on line 2;
 * intent + modifiers on line 3; remaining fields on subsequent lines.
 * But if the total field count is small, fewer lines are used.
 */
function formatEnvelopeLines(fields: Array<[string, string]>): string[] {
  // For simplicity and spec compliance, we group fields into lines
  // with a reasonable number of fields per line.
  // The spec says envelope MAY be split across multiple lines.

  if (fields.length <= 4) {
    // All on one line
    return [fields.map(([k, v]) => `${k}:${v}`).join(FIELD_DELIMITER)];
  }

  const lines: string[] = [];
  let currentLine: string[] = [];
  let currentLen = 0;

  for (const [key, value] of fields) {
    const field = `${key}:${value}`;
    const addition = currentLine.length > 0 ? FIELD_DELIMITER.length + field.length : field.length;

    // Start a new line if current one would get too long (> ~80 chars)
    if (currentLen + addition > 80 && currentLine.length > 0) {
      lines.push(currentLine.join(FIELD_DELIMITER));
      currentLine = [field];
      currentLen = field.length;
    } else {
      currentLine.push(field);
      currentLen += addition;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(FIELD_DELIMITER));
  }

  return lines;
}
