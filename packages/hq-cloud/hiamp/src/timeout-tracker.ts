/**
 * HIAMP Timeout Tracker
 *
 * Tracks messages sent with `ack:requested` that haven't received
 * an acknowledgment yet. Detects timeouts and provides resolution
 * when acks are received.
 *
 * Uses in-memory tracking with optional periodic persistence to disk.
 *
 * @module timeout-tracker
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MessageId, ThreadId } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A tracked pending ack entry */
export interface PendingAck {
  /** The message ID that requested an ack */
  messageId: MessageId;

  /** The thread ID (if any) */
  threadId?: ThreadId;

  /** The target worker address that should ack */
  target: string;

  /** ISO 8601 timestamp when tracking started */
  sentAt: string;

  /** Timeout in milliseconds */
  timeoutMs: number;

  /** ISO 8601 timestamp when the ack times out */
  expiresAt: string;

  /** Number of retries already attempted */
  retries: number;
}

/** A timed-out entry */
export interface TimedOutEntry {
  /** The original pending ack entry */
  entry: PendingAck;

  /** How long ago it timed out (in ms) */
  overdueMs: number;
}

/** Options for the TimeoutTracker */
export interface TimeoutTrackerOptions {
  /** Default timeout in milliseconds. Defaults to 300000 (5 minutes). */
  defaultTimeoutMs?: number;

  /** Maximum number of retries before escalation. Defaults to 1. */
  maxRetries?: number;

  /** Path to persist tracking state (optional). If not set, no persistence. */
  persistPath?: string;
}

// ---------------------------------------------------------------------------
// TimeoutTracker class
// ---------------------------------------------------------------------------

/** Default ack timeout: 5 minutes */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Default max retries */
const DEFAULT_MAX_RETRIES = 1;

/**
 * Tracks messages awaiting acknowledgment and detects timeouts.
 *
 * When a message is sent with `ack:requested`, the sender calls `track()`
 * to start monitoring. When an ack is received, `resolve()` removes it.
 * `checkTimeouts()` returns entries that have exceeded their timeout window.
 *
 * @example
 * ```ts
 * const tracker = new TimeoutTracker({ defaultTimeoutMs: 300000 });
 *
 * // When sending a message with ack:requested
 * tracker.track('msg-abc123', 'alex/backend-dev', 'thr-xyz789');
 *
 * // When receiving an ack
 * tracker.resolve('msg-abc123');
 *
 * // Periodic check for timeouts
 * const timedOut = tracker.checkTimeouts();
 * ```
 */
export class TimeoutTracker {
  private readonly pending: Map<MessageId, PendingAck> = new Map();
  private readonly defaultTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly persistPath?: string;

  constructor(options?: TimeoutTrackerOptions) {
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.persistPath = options?.persistPath;
  }

  /**
   * Start tracking a message that expects an ack.
   *
   * @param messageId - The message ID to track.
   * @param target - The worker address expected to send the ack.
   * @param threadId - The thread ID (if any).
   * @param timeoutMs - Custom timeout in ms. Defaults to the tracker's default.
   */
  track(
    messageId: MessageId,
    target: string,
    threadId?: ThreadId,
    timeoutMs?: number,
  ): void {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeout);

    const entry: PendingAck = {
      messageId,
      threadId,
      target,
      sentAt: now.toISOString(),
      timeoutMs: timeout,
      expiresAt: expiresAt.toISOString(),
      retries: 0,
    };

    this.pending.set(messageId, entry);
  }

  /**
   * Mark a message as acknowledged (ack received).
   * Removes it from tracking.
   *
   * @param messageId - The message ID that was acknowledged.
   * @returns true if the message was being tracked and is now resolved, false otherwise.
   */
  resolve(messageId: MessageId): boolean {
    return this.pending.delete(messageId);
  }

  /**
   * Check for timed-out messages.
   *
   * @returns An array of entries that have exceeded their timeout window.
   */
  checkTimeouts(): TimedOutEntry[] {
    const now = Date.now();
    const timedOut: TimedOutEntry[] = [];

    for (const entry of this.pending.values()) {
      const expiresAt = new Date(entry.expiresAt).getTime();
      if (now > expiresAt) {
        timedOut.push({
          entry,
          overdueMs: now - expiresAt,
        });
      }
    }

    return timedOut;
  }

  /**
   * Check if a specific message is still pending acknowledgment.
   *
   * @param messageId - The message ID to check.
   * @returns true if the message is still awaiting an ack.
   */
  isPending(messageId: MessageId): boolean {
    return this.pending.has(messageId);
  }

  /**
   * Get a specific pending entry.
   *
   * @param messageId - The message ID.
   * @returns The pending ack entry, or undefined if not tracked.
   */
  get(messageId: MessageId): PendingAck | undefined {
    return this.pending.get(messageId);
  }

  /**
   * Record a retry attempt for a timed-out message.
   * Resets the timeout window and increments the retry counter.
   *
   * @param messageId - The message ID to retry.
   * @param newTimeoutMs - Optional new timeout for the retry.
   * @returns true if the entry was found and updated, false otherwise.
   */
  recordRetry(messageId: MessageId, newTimeoutMs?: number): boolean {
    const entry = this.pending.get(messageId);
    if (!entry) return false;

    entry.retries += 1;
    const timeout = newTimeoutMs ?? entry.timeoutMs;
    const now = new Date();
    entry.expiresAt = new Date(now.getTime() + timeout).toISOString();

    return true;
  }

  /**
   * Check if a message has exceeded the max retry count.
   *
   * @param messageId - The message ID to check.
   * @returns true if max retries exceeded, false otherwise.
   */
  hasExceededRetries(messageId: MessageId): boolean {
    const entry = this.pending.get(messageId);
    if (!entry) return false;
    return entry.retries >= this.maxRetries;
  }

  /**
   * Remove a timed-out entry from tracking (after escalation or abandonment).
   *
   * @param messageId - The message ID to remove.
   * @returns true if it was removed, false if not found.
   */
  remove(messageId: MessageId): boolean {
    return this.pending.delete(messageId);
  }

  /**
   * Get all currently pending entries.
   *
   * @returns An array of all pending ack entries.
   */
  getAllPending(): PendingAck[] {
    return Array.from(this.pending.values());
  }

  /**
   * Get the number of currently pending entries.
   */
  get size(): number {
    return this.pending.size;
  }

  /**
   * Persist the current tracking state to disk.
   * Only works if `persistPath` was configured.
   */
  async persist(): Promise<void> {
    if (!this.persistPath) return;

    const dir = this.persistPath.substring(0, this.persistPath.lastIndexOf('/'));
    if (dir) {
      await mkdir(dir, { recursive: true });
    }

    const data = {
      entries: Array.from(this.pending.values()),
      persistedAt: new Date().toISOString(),
    };

    await writeFile(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Restore tracking state from disk.
   * Only works if `persistPath` was configured.
   * Skips entries that have already timed out.
   */
  async restore(): Promise<number> {
    if (!this.persistPath) return 0;

    try {
      const content = await readFile(this.persistPath, 'utf-8');
      const data = JSON.parse(content) as { entries: PendingAck[] };

      const now = Date.now();
      let restored = 0;

      for (const entry of data.entries) {
        // Skip already-expired entries
        const expiresAt = new Date(entry.expiresAt).getTime();
        if (now > expiresAt) continue;

        this.pending.set(entry.messageId, entry);
        restored++;
      }

      return restored;
    } catch {
      return 0;
    }
  }

  /**
   * Clear all pending entries.
   */
  clear(): void {
    this.pending.clear();
  }
}
