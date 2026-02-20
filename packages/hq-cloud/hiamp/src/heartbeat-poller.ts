/**
 * HIAMP Heartbeat Poller for Linear Transport
 *
 * Polls the Linear API on a configurable interval (default 5 minutes) to
 * detect incoming HIAMP messages and agent-relevant activity on watched issues.
 *
 * Polling targets:
 * 1. New comments on explicitly watched issues
 * 2. Issues assigned to configured agent identities
 * 3. Comments mentioning agent names or @-mentions
 *
 * Detected HIAMP messages are parsed via `parse()` and routed through
 * `Router` to local workers. Non-HIAMP comments that mention agents are
 * wrapped as `inform` intent messages and delivered to the inbox.
 *
 * Poller state (last poll timestamp, watched issues) is persisted to
 * `workspace/hiamp/heartbeat-state.json` for crash recovery.
 *
 * Graceful startup: the first poll looks back 1 hour to catch activity
 * that may have been missed while the poller was offline.
 *
 * @module heartbeat-poller
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parse } from './parse.js';
import { validate } from './validate.js';
import type { HiampConfig } from './config-loader.js';
import type { LinearClient, LinearComment } from './linear-client.js';
import type { Router, RouteResult } from './router.js';
import { Inbox } from './inbox.js';
import { generateMessageId, generateThreadId } from './ids.js';
import type { HiampMessage } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Persisted poller state */
export interface HeartbeatState {
  /** ISO 8601 timestamp of the last successful poll */
  lastPollAt: string | null;

  /** List of Linear issue IDs being actively watched */
  watchedIssueIds: string[];
}

/** Configuration for the HeartbeatPoller */
export interface HeartbeatPollerOptions {
  /** The loaded HIAMP configuration */
  config: HiampConfig;

  /** Absolute path to HQ root directory */
  hqRoot: string;

  /** An initialized LinearClient instance */
  linearClient: LinearClient;

  /** Router instance for processing detected HIAMP messages */
  router: Router;

  /** Optional Inbox instance (for delivering non-HIAMP inform messages) */
  inbox?: Inbox;

  /** Polling interval in minutes. Default: 5 */
  pollIntervalMinutes?: number;

  /** Path to the heartbeat state file, relative to hqRoot. Default: 'workspace/hiamp/heartbeat-state.json' */
  statePath?: string;

  /** Agent identities to monitor. These are the owner names from config + any display names. */
  agentNames?: string[];

  /** Linear user IDs that represent agent identities (for assignment-based polling) */
  agentLinearUserIds?: string[];

  /** Optional callback for poll cycle results */
  onPollComplete?: (result: PollCycleResult) => void;

  /** Optional callback for errors */
  onError?: (error: Error) => void;

  /** Optional logger. Defaults to console. */
  logger?: Logger;

  /** How far back to look on first poll (in milliseconds). Default: 3600000 (1 hour) */
  initialLookbackMs?: number;
}

/** Minimal logger interface */
export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
}

/** Result of processing a single comment */
export interface CommentProcessResult {
  /** The Linear comment ID */
  commentId: string;

  /** The Linear issue identifier (e.g., "ENG-123") */
  issueIdentifier: string;

  /** Whether the comment was detected as a HIAMP message */
  isHiamp: boolean;

  /** Route result if HIAMP message was routed */
  routeResult?: RouteResult;

  /** Whether the comment was delivered as an inform message */
  deliveredAsInform: boolean;

  /** Error message if processing failed */
  error?: string;
}

/** Result of a single poll cycle */
export interface PollCycleResult {
  /** When this poll cycle started */
  pollStartedAt: string;

  /** When this poll cycle finished */
  pollFinishedAt: string;

  /** Number of new comments found */
  commentsFound: number;

  /** Number of HIAMP messages detected and routed */
  hiampMessagesRouted: number;

  /** Number of non-HIAMP mentions delivered as inform */
  informMessagesDelivered: number;

  /** Number of errors encountered */
  errors: number;

  /** Per-comment results */
  results: CommentProcessResult[];
}

// ---------------------------------------------------------------------------
// Default logger (no-op for debug, console.warn for warn)
// ---------------------------------------------------------------------------

const DEFAULT_LOGGER: Logger = {
  debug: () => {},
  warn: (msg: string, ...args: unknown[]) => console.warn(msg, ...args),
};

// ---------------------------------------------------------------------------
// HeartbeatPoller class
// ---------------------------------------------------------------------------

/**
 * Polls Linear API for new activity and routes HIAMP messages to local workers.
 *
 * Lifecycle:
 * - `start()` begins the polling loop
 * - `stop()` stops polling and persists state
 * - `pollOnce()` runs a single poll cycle (useful for testing)
 *
 * @example
 * ```ts
 * const poller = new HeartbeatPoller({
 *   config,
 *   hqRoot: '/path/to/hq',
 *   linearClient,
 *   router,
 *   pollIntervalMinutes: 5,
 *   agentNames: ['stefan', 'Stefan'],
 * });
 *
 * await poller.start();
 *
 * // Later:
 * await poller.stop();
 * ```
 */
export class HeartbeatPoller {
  private readonly config: HiampConfig;
  private readonly hqRoot: string;
  private readonly linearClient: LinearClient;
  private readonly router: Router;
  private readonly inbox: Inbox;
  private readonly pollIntervalMs: number;
  private readonly statePath: string;
  private readonly agentNames: string[];
  private readonly onPollComplete?: (result: PollCycleResult) => void;
  private readonly onError?: (error: Error) => void;
  private readonly logger: Logger;
  private readonly initialLookbackMs: number;

  private state: HeartbeatState = {
    lastPollAt: null,
    watchedIssueIds: [],
  };

  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: HeartbeatPollerOptions) {
    this.config = options.config;
    this.hqRoot = options.hqRoot;
    this.linearClient = options.linearClient;
    this.router = options.router;
    this.inbox =
      options.inbox ??
      new Inbox(options.hqRoot, options.config.settings?.inboxPath ?? 'workspace/inbox');
    this.pollIntervalMs = (options.pollIntervalMinutes ?? 5) * 60 * 1000;
    this.statePath = options.statePath ?? 'workspace/hiamp/heartbeat-state.json';
    this.agentNames = options.agentNames ?? [options.config.identity.owner];
    this.onPollComplete = options.onPollComplete;
    this.onError = options.onError;
    this.logger = options.logger ?? DEFAULT_LOGGER;
    this.initialLookbackMs = options.initialLookbackMs ?? 3_600_000; // 1 hour
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start the polling loop.
   *
   * Loads persisted state, runs the first poll immediately, then schedules
   * subsequent polls at the configured interval.
   *
   * @throws If the poller is already running.
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('HeartbeatPoller is already running');
    }

    this.running = true;
    this.logger.debug('HeartbeatPoller starting');

    // Load persisted state
    await this.loadState();

    // Run first poll immediately
    await this.executePollCycle();

    // Schedule recurring polls
    this.scheduleNext();
  }

  /**
   * Stop the polling loop and persist state.
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    await this.saveState();
    this.logger.debug('HeartbeatPoller stopped');
  }

  /**
   * Run a single poll cycle without starting the loop.
   * Useful for testing or manual triggering.
   *
   * @returns The poll cycle result.
   */
  async pollOnce(): Promise<PollCycleResult> {
    await this.loadState();
    const result = await this.executePollCycle();
    return result;
  }

  /**
   * Check if the poller is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Add an issue ID to the watch list.
   *
   * @param issueId - The Linear issue ID (UUID) to watch.
   */
  watchIssue(issueId: string): void {
    if (!this.state.watchedIssueIds.includes(issueId)) {
      this.state.watchedIssueIds.push(issueId);
      this.logger.debug(`HeartbeatPoller: now watching issue ${issueId}`);
    }
  }

  /**
   * Remove an issue ID from the watch list.
   *
   * @param issueId - The Linear issue ID (UUID) to stop watching.
   */
  unwatchIssue(issueId: string): void {
    this.state.watchedIssueIds = this.state.watchedIssueIds.filter(
      (id) => id !== issueId,
    );
    this.logger.debug(`HeartbeatPoller: stopped watching issue ${issueId}`);
  }

  /**
   * Get the list of currently watched issue IDs.
   */
  getWatchedIssueIds(): string[] {
    return [...this.state.watchedIssueIds];
  }

  /**
   * Get the current poller state (for testing/inspection).
   */
  getState(): HeartbeatState {
    return { ...this.state, watchedIssueIds: [...this.state.watchedIssueIds] };
  }

  // -------------------------------------------------------------------------
  // Poll cycle execution
  // -------------------------------------------------------------------------

  /**
   * Execute a single poll cycle.
   *
   * 1. Determine the `since` cursor (lastPollAt or initial lookback)
   * 2. For each watched issue, fetch comments updated since `since`
   * 3. Process each comment through the HIAMP pipeline
   * 4. Update state and persist
   */
  private async executePollCycle(): Promise<PollCycleResult> {
    const pollStartedAt = new Date().toISOString();
    const results: CommentProcessResult[] = [];
    let hiampMessagesRouted = 0;
    let informMessagesDelivered = 0;
    let errorCount = 0;

    // Determine the "since" cursor
    const since = this.getSinceCursor();
    this.logger.debug(
      `HeartbeatPoller: polling for activity since ${since}`,
    );

    // Collect comments from all watched issues
    const allComments: Array<{ comment: LinearComment; issueIdentifier: string }> = [];

    for (const issueId of this.state.watchedIssueIds) {
      try {
        const commentsResult = await this.linearClient.listComments(issueId, {
          first: 100,
        });

        if (!commentsResult.success) {
          this.logger.warn(
            `HeartbeatPoller: failed to fetch comments for issue ${issueId}: ${commentsResult.error}`,
          );
          errorCount++;
          continue;
        }

        // Filter to comments updated after the `since` cursor
        const newComments = commentsResult.data.nodes.filter(
          (c) => c.updatedAt > since,
        );

        for (const comment of newComments) {
          const issueIdentifier =
            comment.issue?.identifier ?? issueId;
          allComments.push({ comment, issueIdentifier });
        }
      } catch (err) {
        this.logger.warn(
          `HeartbeatPoller: error fetching comments for issue ${issueId}: ${(err as Error).message}`,
        );
        this.onError?.(err as Error);
        errorCount++;
      }
    }

    this.logger.debug(
      `HeartbeatPoller: found ${allComments.length} new comment(s) across ${this.state.watchedIssueIds.length} watched issue(s)`,
    );

    // Process each comment
    for (const { comment, issueIdentifier } of allComments) {
      const processResult = await this.processComment(
        comment,
        issueIdentifier,
      );
      results.push(processResult);

      if (processResult.isHiamp && processResult.routeResult?.success) {
        hiampMessagesRouted++;
      }
      if (processResult.deliveredAsInform) {
        informMessagesDelivered++;
      }
      if (processResult.error) {
        errorCount++;
      }
    }

    // Update state
    this.state.lastPollAt = new Date().toISOString();
    await this.saveState();

    const pollFinishedAt = new Date().toISOString();

    const cycleResult: PollCycleResult = {
      pollStartedAt,
      pollFinishedAt,
      commentsFound: allComments.length,
      hiampMessagesRouted,
      informMessagesDelivered,
      errors: errorCount,
      results,
    };

    this.logger.debug(
      `HeartbeatPoller: poll cycle complete. ` +
        `Found=${allComments.length}, HIAMP=${hiampMessagesRouted}, ` +
        `Inform=${informMessagesDelivered}, Errors=${errorCount}`,
    );

    this.onPollComplete?.(cycleResult);

    return cycleResult;
  }

  // -------------------------------------------------------------------------
  // Comment processing
  // -------------------------------------------------------------------------

  /**
   * Process a single Linear comment through the HIAMP detection and routing pipeline.
   *
   * 1. Check if the comment body is a HIAMP message (try to parse it)
   * 2. If HIAMP: validate and route through Router
   * 3. If not HIAMP but mentions an agent: wrap as 'inform' and deliver to inbox
   */
  private async processComment(
    comment: LinearComment,
    issueIdentifier: string,
  ): Promise<CommentProcessResult> {
    const body = comment.body;

    // Strip Linear's HTML details blocks to recover the raw HIAMP text
    const rawText = this.extractRawHiampText(body);

    // Attempt HIAMP parse
    const parseResult = parse(rawText);

    if (parseResult.success) {
      // Validate
      const validation = validate(parseResult.message);
      if (!validation.valid) {
        return {
          commentId: comment.id,
          issueIdentifier,
          isHiamp: true,
          deliveredAsInform: false,
          error: `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
        };
      }

      // Route the message through the Router
      try {
        const routeResult = await this.router.route(
          parseResult.message,
          rawText,
          issueIdentifier, // use issue identifier as "channelId" for Linear
          comment.user?.id,
          comment.id,
          undefined, // no thread_ts equivalent for Linear
        );

        return {
          commentId: comment.id,
          issueIdentifier,
          isHiamp: true,
          routeResult,
          deliveredAsInform: false,
        };
      } catch (err) {
        return {
          commentId: comment.id,
          issueIdentifier,
          isHiamp: true,
          deliveredAsInform: false,
          error: `Routing error: ${(err as Error).message}`,
        };
      }
    }

    // Not a HIAMP message -- check if it mentions one of our agent names
    if (this.mentionsAgent(body)) {
      const delivered = await this.deliverAsInform(
        comment,
        issueIdentifier,
      );
      return {
        commentId: comment.id,
        issueIdentifier,
        isHiamp: false,
        deliveredAsInform: delivered,
        error: delivered ? undefined : 'Failed to deliver inform message',
      };
    }

    // Not HIAMP, doesn't mention agent -- skip
    return {
      commentId: comment.id,
      issueIdentifier,
      isHiamp: false,
      deliveredAsInform: false,
    };
  }

  /**
   * Check if a comment body mentions any of the configured agent names.
   */
  private mentionsAgent(body: string): boolean {
    const lower = body.toLowerCase();
    return this.agentNames.some((name) =>
      lower.includes(name.toLowerCase()),
    );
  }

  /**
   * Extract raw HIAMP text from a Linear comment body.
   *
   * Linear comments posted via LinearSender use a `<details>` block
   * for the HIAMP envelope. This method reconstructs the raw HIAMP
   * text by extracting content from the details block and combining
   * it with the visible header/body.
   */
  private extractRawHiampText(commentBody: string): string {
    // Try to extract from <details> block used by LinearSender's formatForLinear
    const detailsMatch = commentBody.match(
      /<details>\s*<summary>HIAMP envelope<\/summary>\s*```\s*([\s\S]*?)```\s*<\/details>/,
    );

    if (detailsMatch?.[1]) {
      // Reconstruct: header+body (everything before <details>) + envelope
      const beforeDetails = commentBody
        .slice(0, commentBody.indexOf('<details>'))
        .trim();
      const envelope = detailsMatch[1].trim();
      return `${beforeDetails}\n${envelope}`;
    }

    // No details block -- return as-is (might be a plain HIAMP message)
    return commentBody;
  }

  /**
   * Wrap a non-HIAMP comment as an 'inform' intent message and deliver to inbox.
   *
   * Creates a synthetic HIAMP message envelope so the comment can be
   * processed by local workers through the standard inbox.
   */
  private async deliverAsInform(
    comment: LinearComment,
    issueIdentifier: string,
  ): Promise<boolean> {
    // Build a synthetic HIAMP message for the inform
    const fromOwner = comment.user?.name ?? 'unknown';
    const toOwner = this.config.identity.owner;

    // Find the first worker that can receive messages as the target
    const targetWorker = this.findDefaultReceiveWorker();
    if (!targetWorker) {
      this.logger.warn(
        'HeartbeatPoller: no worker configured to receive inform messages',
      );
      return false;
    }

    const informMessage: HiampMessage = {
      version: 'v1',
      id: generateMessageId(),
      from: `${fromOwner}/linear`,
      to: `${toOwner}/${targetWorker}`,
      intent: 'inform',
      body: comment.body,
      thread: generateThreadId(),
      ref: issueIdentifier,
    };

    try {
      const result = await this.inbox.deliver(
        informMessage,
        comment.body,
        issueIdentifier,
        comment.user?.id,
        comment.id,
      );
      return result.success;
    } catch (err) {
      this.logger.warn(
        `HeartbeatPoller: failed to deliver inform message: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Find the first worker in the registry that has receive permission.
   * Falls back to the first worker in worker-permissions, or the owner name.
   */
  private findDefaultReceiveWorker(): string | null {
    const wp = this.config.workerPermissions;

    // Find a worker with receive: true
    const receivable = wp.workers.find((w) => w.receive);
    if (receivable) {
      return receivable.id;
    }

    // If default is 'allow', any worker can receive
    if (wp.default === 'allow' && wp.workers.length > 0) {
      return wp.workers[0]!.id;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // State persistence
  // -------------------------------------------------------------------------

  /**
   * Load poller state from disk.
   * If no state file exists, initializes with defaults.
   */
  private async loadState(): Promise<void> {
    const fullPath = join(this.hqRoot, this.statePath);

    try {
      const content = await readFile(fullPath, 'utf-8');
      const loaded = JSON.parse(content) as Partial<HeartbeatState>;
      this.state = {
        lastPollAt: loaded.lastPollAt ?? null,
        watchedIssueIds: loaded.watchedIssueIds ?? [],
      };
      this.logger.debug(
        `HeartbeatPoller: loaded state, lastPollAt=${this.state.lastPollAt}, ` +
          `watchedIssues=${this.state.watchedIssueIds.length}`,
      );
    } catch {
      // No state file or malformed -- start fresh
      this.logger.debug('HeartbeatPoller: no persisted state found, starting fresh');
      this.state = {
        lastPollAt: null,
        watchedIssueIds: [],
      };
    }
  }

  /**
   * Persist poller state to disk.
   */
  private async saveState(): Promise<void> {
    const fullPath = join(this.hqRoot, this.statePath);

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, JSON.stringify(this.state, null, 2), 'utf-8');
      this.logger.debug('HeartbeatPoller: state saved');
    } catch (err) {
      this.logger.warn(
        `HeartbeatPoller: failed to save state: ${(err as Error).message}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Cursor and scheduling
  // -------------------------------------------------------------------------

  /**
   * Determine the ISO 8601 cursor for filtering new activity.
   *
   * If we have a lastPollAt, use it.
   * Otherwise (first poll), look back `initialLookbackMs` (default 1 hour).
   */
  private getSinceCursor(): string {
    if (this.state.lastPollAt) {
      return this.state.lastPollAt;
    }
    // First poll: look back 1 hour
    return new Date(Date.now() - this.initialLookbackMs).toISOString();
  }

  /**
   * Schedule the next poll cycle.
   */
  private scheduleNext(): void {
    if (!this.running) return;

    this.timer = setTimeout(async () => {
      if (!this.running) return;
      try {
        await this.executePollCycle();
      } catch (err) {
        this.logger.warn(
          `HeartbeatPoller: poll cycle error: ${(err as Error).message}`,
        );
        this.onError?.(err as Error);
      }
      this.scheduleNext();
    }, this.pollIntervalMs);
  }
}
