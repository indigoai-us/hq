import { verifyToken } from '@clerk/backend';
import { config } from '../config.js';

export interface ClerkTokenPayload {
  userId: string;
  sessionId: string;
}

/**
 * Verify a Clerk JWT token and extract user info.
 * Throws if the token is invalid or expired.
 * When SKIP_AUTH is enabled, returns a mock user without calling Clerk.
 */
export async function verifyClerkToken(token: string): Promise<ClerkTokenPayload> {
  if (config.skipAuth) {
    return { userId: 'test-user', sessionId: 'test-session' };
  }

  const options: Parameters<typeof verifyToken>[1] = {
    secretKey: config.clerkSecretKey,
  };

  // Use local JWT key verification when available (avoids network call to Clerk JWKS)
  if (config.clerkJwtKey) {
    options.jwtKey = config.clerkJwtKey;
  }

  const payload = await verifyToken(token, options);

  return {
    userId: payload.sub,
    sessionId: payload.sid ?? '',
  };
}
