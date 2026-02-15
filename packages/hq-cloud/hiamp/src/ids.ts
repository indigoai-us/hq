/**
 * HIAMP v1 ID Generation
 *
 * Generates unique, URL-safe IDs for messages and threads using Node.js crypto.
 * Format: msg-{8 hex chars} for messages, thr-{8 hex chars} for threads.
 */

import { randomBytes } from 'node:crypto';
import { MESSAGE_ID_PREFIX, THREAD_ID_PREFIX } from './constants.js';

/**
 * Generate a random 8-character lowercase hex string using crypto.randomBytes.
 */
function randomHex8(): string {
  return randomBytes(4).toString('hex');
}

/**
 * Generate a unique message ID.
 *
 * @returns A string in the format `msg-{8 hex chars}` (e.g., `msg-a1b2c3d4`).
 */
export function generateMessageId(): string {
  return `${MESSAGE_ID_PREFIX}${randomHex8()}`;
}

/**
 * Generate a unique thread ID.
 *
 * @returns A string in the format `thr-{8 hex chars}` (e.g., `thr-x1y2z3a4`).
 */
export function generateThreadId(): string {
  return `${THREAD_ID_PREFIX}${randomHex8()}`;
}
