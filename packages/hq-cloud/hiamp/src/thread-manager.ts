/**
 * HIAMP Thread Manager
 *
 * Persists thread state to workspace/threads/hiamp/{thread-id}.json.
 * Maintains conversation history including all messages, participants,
 * and thread lifecycle status.
 *
 * @module thread-manager
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { HiampMessage, ThreadId } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Thread lifecycle status per HIAMP v1 spec Section 7.6 */
export type ThreadStatus = 'open' | 'idle' | 'closed' | 'expired';

/** A single entry in the thread's message log */
export interface ThreadMessageEntry {
  /** The HIAMP message ID */
  messageId: string;

  /** Sender worker address */
  from: string;

  /** Recipient worker address */
  to: string;

  /** Message intent */
  intent: string;

  /** Message body (truncated for log brevity if needed) */
  body: string;

  /** The message this replies to (if any) */
  replyTo?: string;

  /** ISO 8601 timestamp when the message was added to the thread log */
  timestamp: string;
}

/** Persisted thread state */
export interface ThreadState {
  /** Thread ID */
  threadId: ThreadId;

  /** Current thread status */
  status: ThreadStatus;

  /** Worker addresses that have participated in this thread */
  participants: string[];

  /** Ordered list of messages in the thread */
  messages: ThreadMessageEntry[];

  /** ISO 8601 timestamp when the thread was created */
  createdAt: string;

  /** ISO 8601 timestamp of the last message */
  updatedAt: string;

  /** Slack thread_ts if known (for Slack threading alignment) */
  slackThreadTs?: string;
}

/** Options for listing threads */
export interface ListThreadsOptions {
  /** Filter by participant worker address */
  participant?: string;

  /** Filter by status */
  status?: ThreadStatus;
}

// ---------------------------------------------------------------------------
// ThreadManager class
// ---------------------------------------------------------------------------

/**
 * Manages HIAMP thread state and conversation history.
 *
 * Thread state is persisted as individual JSON files in the configured
 * thread log directory (default: workspace/threads/hiamp/).
 *
 * @example
 * ```ts
 * const tm = new ThreadManager('/path/to/hq');
 * await tm.addMessage('thr-abc123', parsedMessage);
 * const thread = await tm.getThread('thr-abc123');
 * ```
 */
export class ThreadManager {
  private readonly threadLogDir: string;

  /**
   * @param hqRoot - The root directory of the HQ instance.
   * @param threadLogPath - Relative path for thread logs. Defaults to 'workspace/threads/hiamp'.
   */
  constructor(hqRoot: string, threadLogPath: string = 'workspace/threads/hiamp') {
    this.threadLogDir = join(hqRoot, threadLogPath);
  }

  /**
   * Add a message to a thread's conversation log.
   *
   * If the thread does not exist yet, it is created. If it exists, the message
   * is appended and the thread state is updated.
   *
   * @param threadId - The HIAMP thread ID.
   * @param message - The parsed HIAMP message.
   * @param slackThreadTs - Optional Slack thread_ts for alignment.
   * @returns The updated thread state.
   */
  async addMessage(
    threadId: ThreadId,
    message: HiampMessage,
    slackThreadTs?: string,
  ): Promise<ThreadState> {
    let thread = await this.loadThread(threadId);
    const now = new Date().toISOString();

    if (!thread) {
      // Create new thread
      thread = {
        threadId,
        status: 'open',
        participants: [],
        messages: [],
        createdAt: now,
        updatedAt: now,
        slackThreadTs,
      };
    }

    // Add participants if not already present
    if (!thread.participants.includes(message.from)) {
      thread.participants.push(message.from);
    }
    if (!thread.participants.includes(message.to)) {
      thread.participants.push(message.to);
    }

    // Append message entry
    const entry: ThreadMessageEntry = {
      messageId: message.id,
      from: message.from,
      to: message.to,
      intent: message.intent,
      body: message.body,
      replyTo: message.replyTo,
      timestamp: now,
    };

    thread.messages.push(entry);
    thread.updatedAt = now;

    // Update Slack thread_ts if provided and not already set
    if (slackThreadTs && !thread.slackThreadTs) {
      thread.slackThreadTs = slackThreadTs;
    }

    // Reopen if closed/idle and new message arrives
    if (thread.status === 'idle' || thread.status === 'expired') {
      thread.status = 'open';
    }

    await this.saveThread(thread);
    return thread;
  }

  /**
   * Get the full thread state and conversation history.
   *
   * @param threadId - The HIAMP thread ID.
   * @returns The thread state, or null if not found.
   */
  async getThread(threadId: ThreadId): Promise<ThreadState | null> {
    return this.loadThread(threadId);
  }

  /**
   * List threads, optionally filtered by participant or status.
   *
   * @param options - Filter options.
   * @returns An array of thread states matching the filters.
   */
  async listThreads(options?: ListThreadsOptions): Promise<ThreadState[]> {
    let files: string[];
    try {
      files = await readdir(this.threadLogDir);
    } catch {
      return [];
    }

    const threads: ThreadState[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await readFile(join(this.threadLogDir, file), 'utf-8');
        const thread = JSON.parse(content) as ThreadState;

        // Apply filters
        if (options?.participant && !thread.participants.includes(options.participant)) {
          continue;
        }
        if (options?.status && thread.status !== options.status) {
          continue;
        }

        threads.push(thread);
      } catch {
        // Skip malformed files
        continue;
      }
    }

    // Sort by updatedAt descending (most recent first)
    threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return threads;
  }

  /**
   * Close a thread. Sets status to 'closed'.
   *
   * @param threadId - The HIAMP thread ID.
   * @returns true if the thread was found and closed, false otherwise.
   */
  async closeThread(threadId: ThreadId): Promise<boolean> {
    const thread = await this.loadThread(threadId);
    if (!thread) return false;

    thread.status = 'closed';
    thread.updatedAt = new Date().toISOString();
    await this.saveThread(thread);
    return true;
  }

  /**
   * Mark a thread as idle.
   *
   * @param threadId - The HIAMP thread ID.
   * @returns true if the thread was found and marked idle, false otherwise.
   */
  async markIdle(threadId: ThreadId): Promise<boolean> {
    const thread = await this.loadThread(threadId);
    if (!thread) return false;

    thread.status = 'idle';
    thread.updatedAt = new Date().toISOString();
    await this.saveThread(thread);
    return true;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private threadFilePath(threadId: ThreadId): string {
    return join(this.threadLogDir, `${threadId}.json`);
  }

  private async loadThread(threadId: ThreadId): Promise<ThreadState | null> {
    try {
      const content = await readFile(this.threadFilePath(threadId), 'utf-8');
      return JSON.parse(content) as ThreadState;
    } catch {
      return null;
    }
  }

  private async saveThread(thread: ThreadState): Promise<void> {
    await mkdir(this.threadLogDir, { recursive: true });
    await writeFile(
      this.threadFilePath(thread.threadId),
      JSON.stringify(thread, null, 2),
      'utf-8',
    );
  }
}
