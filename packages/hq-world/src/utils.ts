/**
 * Shared utility functions for the World Protocol implementation.
 */

import { randomBytes } from 'node:crypto';

/**
 * Generate a transfer ID: txfr-{12 hex chars from UUIDv4}
 */
export function generateTransferId(): string {
  const hex = randomBytes(6).toString('hex');
  return `txfr-${hex}`;
}

/**
 * Get the current UTC timestamp in ISO 8601 format.
 */
export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Get today's date in YYYY-MM-DD format (UTC).
 */
export function todayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Validate an owner name: [a-z0-9][a-z0-9-]*[a-z0-9], 2-32 chars
 */
export function isValidOwnerName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) && name.length >= 2 && name.length <= 32;
}

/**
 * Validate a transfer ID: txfr-{12+ hex chars}
 */
export function isValidTransferId(id: string): boolean {
  return /^txfr-[a-f0-9]{12,}$/.test(id);
}

/**
 * Validate a SHA-256 hash string: sha256:{64 hex chars}
 */
export function isValidHash(hash: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(hash);
}
