import type { RateLimitStatus } from './types.js';

/**
 * Window data for rate limiting
 */
interface RateLimitWindow {
  /** Request count in current window */
  count: number;
  /** Window start timestamp (ms) */
  windowStart: number;
}

/** Window duration in milliseconds (1 minute) */
const WINDOW_MS = 60 * 1000;

/**
 * In-memory rate limiter using sliding window.
 * Tracks requests per API key hash.
 */
class RateLimiter {
  private windows: Map<string, RateLimitWindow> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Cleanup old windows every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), WINDOW_MS);
  }

  /**
   * Check if a request is allowed and consume a token if so
   */
  check(keyHash: string, limit: number): RateLimitStatus {
    const now = Date.now();
    let window = this.windows.get(keyHash);

    // If no window or window expired, create new one
    if (!window || now - window.windowStart >= WINDOW_MS) {
      window = {
        count: 0,
        windowStart: now,
      };
      this.windows.set(keyHash, window);
    }

    const resetIn = Math.ceil((WINDOW_MS - (now - window.windowStart)) / 1000);
    const remaining = Math.max(0, limit - window.count);
    const allowed = window.count < limit;

    if (allowed) {
      window.count++;
    }

    return {
      allowed,
      current: window.count,
      limit,
      resetIn,
      remaining: allowed ? remaining - 1 : 0,
    };
  }

  /**
   * Get current rate limit status without consuming a token
   */
  status(keyHash: string, limit: number): RateLimitStatus {
    const now = Date.now();
    const window = this.windows.get(keyHash);

    if (!window || now - window.windowStart >= WINDOW_MS) {
      return {
        allowed: true,
        current: 0,
        limit,
        resetIn: 60,
        remaining: limit,
      };
    }

    const resetIn = Math.ceil((WINDOW_MS - (now - window.windowStart)) / 1000);
    const remaining = Math.max(0, limit - window.count);

    return {
      allowed: window.count < limit,
      current: window.count,
      limit,
      resetIn,
      remaining,
    };
  }

  /**
   * Reset rate limit for a key (e.g., after key rotation)
   */
  reset(keyHash: string): void {
    this.windows.delete(keyHash);
  }

  /**
   * Cleanup expired windows
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (now - window.windowStart >= WINDOW_MS * 2) {
        this.windows.delete(key);
      }
    }
  }

  /**
   * Get number of active rate limit windows (for monitoring)
   */
  get activeWindows(): number {
    return this.windows.size;
  }

  /**
   * Clear all data and stop cleanup (for testing/shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.windows.clear();
  }
}

// Singleton instance
let limiter: RateLimiter | null = null;

/**
 * Get the rate limiter singleton
 */
export function getRateLimiter(): RateLimiter {
  if (!limiter) {
    limiter = new RateLimiter();
  }
  return limiter;
}

/**
 * Reset the rate limiter (for testing)
 */
export function resetRateLimiter(): void {
  if (limiter) {
    limiter.destroy();
  }
  limiter = null;
}
