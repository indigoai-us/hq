/**
 * CLI token generation and verification.
 *
 * CLI tokens are HMAC-signed JSON payloads with a 30-day expiry.
 * They allow the hq-cli to make authenticated API requests without
 * needing to refresh short-lived Clerk JWTs.
 *
 * Format: hqcli_<base64url(payload)>.<base64url(signature)>
 */

import * as crypto from 'crypto';
import { config } from '../config.js';
import type { AuthUser } from './types.js';

export const CLI_TOKEN_PREFIX = 'hqcli_';

/** 30 days in milliseconds */
const CLI_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface CliTokenPayload {
  /** Clerk user ID */
  sub: string;
  /** Clerk session ID (from the session that created the token) */
  sid: string;
  /** Issued at (Unix timestamp in seconds) */
  iat: number;
  /** Expires at (Unix timestamp in seconds) */
  exp: number;
  /** Token type identifier */
  typ: 'hq-cli';
}

/**
 * Get the signing key. Uses TOKEN_ENCRYPTION_KEY from config,
 * falling back to CLERK_SECRET_KEY if not set.
 */
function getSigningKey(): string {
  const key = config.tokenEncryptionKey || config.clerkSecretKey;
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY or CLERK_SECRET_KEY must be set for CLI token signing');
  }
  return key;
}

/**
 * Base64url encode a buffer or string.
 */
function base64urlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return buf.toString('base64url');
}

/**
 * Base64url decode to a string.
 */
function base64urlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

/**
 * Create a CLI token for the given user.
 */
export function createCliToken(userId: string, sessionId: string): string {
  const now = Math.floor(Date.now() / 1000);

  const payload: CliTokenPayload = {
    sub: userId,
    sid: sessionId,
    iat: now,
    exp: now + Math.floor(CLI_TOKEN_EXPIRY_MS / 1000),
    typ: 'hq-cli',
  };

  const payloadStr = base64urlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getSigningKey())
    .update(payloadStr)
    .digest();
  const signatureStr = base64urlEncode(signature);

  return `${CLI_TOKEN_PREFIX}${payloadStr}.${signatureStr}`;
}

/**
 * Verify a CLI token and extract the user info.
 * Throws if the token is invalid, expired, or has a bad signature.
 */
export function verifyCliToken(token: string): AuthUser {
  if (!token.startsWith(CLI_TOKEN_PREFIX)) {
    throw new Error('Not a CLI token');
  }

  const tokenBody = token.slice(CLI_TOKEN_PREFIX.length);
  const dotIndex = tokenBody.indexOf('.');
  if (dotIndex === -1) {
    throw new Error('Invalid CLI token format');
  }

  const payloadStr = tokenBody.slice(0, dotIndex);
  const signatureStr = tokenBody.slice(dotIndex + 1);

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', getSigningKey())
    .update(payloadStr)
    .digest();
  const actualSignature = Buffer.from(signatureStr, 'base64url');

  if (!crypto.timingSafeEqual(expectedSignature, actualSignature)) {
    throw new Error('Invalid CLI token signature');
  }

  // Decode and validate payload
  let payload: CliTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadStr)) as CliTokenPayload;
  } catch {
    throw new Error('Invalid CLI token payload');
  }

  if (payload.typ !== 'hq-cli') {
    throw new Error('Invalid CLI token type');
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('CLI token expired');
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
  };
}

/**
 * Check if a token string looks like a CLI token (starts with prefix).
 */
export function isCliToken(token: string): boolean {
  return token.startsWith(CLI_TOKEN_PREFIX);
}
