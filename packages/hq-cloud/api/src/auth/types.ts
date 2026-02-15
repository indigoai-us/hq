/**
 * Authenticated user attached to request by auth middleware
 */
export interface AuthUser {
  userId: string;
  sessionId: string;
}

/**
 * Rate limit status (kept for future use)
 */
export interface RateLimitStatus {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count in window */
  current: number;
  /** Maximum requests allowed in window */
  limit: number;
  /** Seconds until window resets */
  resetIn: number;
  /** Remaining requests in current window */
  remaining: number;
}
