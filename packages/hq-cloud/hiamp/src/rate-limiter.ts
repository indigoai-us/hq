/**
 * HIAMP Rate Limiter
 *
 * Per-channel rate limiter using a token bucket algorithm.
 * Enforces max 1 message per second per channel to prevent
 * hitting Slack API rate limits.
 *
 * Messages that exceed the rate are queued and sent when a slot opens.
 *
 * @module rate-limiter
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A queued message waiting to be sent */
interface QueuedMessage<T> {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  execute: () => Promise<T>;
}

/** Rate limiter options */
export interface RateLimiterOptions {
  /** Minimum interval between messages per channel, in milliseconds. Default: 1000 (1 msg/sec). */
  minIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// RateLimiter class
// ---------------------------------------------------------------------------

/**
 * Per-channel rate limiter.
 *
 * Ensures at most 1 message per second per channel by tracking
 * the last send time for each channel and queuing excess messages.
 *
 * @example
 * ```ts
 * const limiter = new RateLimiter();
 * const result = await limiter.enqueue('C0CHANNEL', () => slackClient.chat.postMessage({ ... }));
 * ```
 */
export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly lastSendTime: Map<string, number> = new Map();
  private readonly queues: Map<string, Array<QueuedMessage<unknown>>> = new Map();
  private readonly processing: Set<string> = new Set();

  constructor(options?: RateLimiterOptions) {
    this.minIntervalMs = options?.minIntervalMs ?? 1000;
  }

  /**
   * Enqueue an operation for rate-limited execution on the given channel.
   *
   * If the channel is free (last message was > minIntervalMs ago), the
   * operation executes immediately. Otherwise it is queued and will
   * execute when its turn comes.
   *
   * @param channelId - The Slack channel ID (used as the rate-limit key).
   * @param execute - An async function that performs the actual send.
   * @returns The result of the execute function.
   */
  async enqueue<T>(channelId: string, execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let queue = this.queues.get(channelId);
      if (!queue) {
        queue = [];
        this.queues.set(channelId, queue);
      }

      queue.push({
        resolve: resolve as (value: unknown) => void,
        reject,
        execute: execute as () => Promise<unknown>,
      });

      // Start processing if not already running for this channel
      if (!this.processing.has(channelId)) {
        void this.processQueue(channelId);
      }
    });
  }

  /**
   * Get the current queue length for a channel.
   */
  getQueueLength(channelId: string): number {
    return this.queues.get(channelId)?.length ?? 0;
  }

  /**
   * Process the queue for a specific channel.
   */
  private async processQueue(channelId: string): Promise<void> {
    if (this.processing.has(channelId)) {
      return;
    }
    this.processing.add(channelId);

    try {
      const queue = this.queues.get(channelId);
      while (queue && queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        // Calculate delay needed
        const lastTime = this.lastSendTime.get(channelId) ?? 0;
        const now = Date.now();
        const elapsed = now - lastTime;
        const delay = Math.max(0, this.minIntervalMs - elapsed);

        if (delay > 0) {
          await this.sleep(delay);
        }

        try {
          const result = await item.execute();
          this.lastSendTime.set(channelId, Date.now());
          item.resolve(result);
        } catch (err) {
          item.reject(err);
        }
      }
    } finally {
      this.processing.delete(channelId);
      // Clean up empty queues
      const queue = this.queues.get(channelId);
      if (queue && queue.length === 0) {
        this.queues.delete(channelId);
      }
    }
  }

  /**
   * Sleep for a given number of milliseconds.
   * Extracted as a method so tests can override it.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reset all state (useful for testing).
   */
  reset(): void {
    this.lastSendTime.clear();
    this.queues.clear();
    this.processing.clear();
  }
}
