/**
 * HIAMP Linear Transport
 *
 * Implements the Transport interface using Linear as the messaging platform.
 * Wires together LinearClient, LinearChannelResolver, LinearSender, and
 * HeartbeatPoller into a unified transport layer.
 *
 * Constructor takes hiamp.yaml config and initializes all components.
 * start() begins heartbeat polling, stop() gracefully shuts down.
 * send() delegates to LinearSender, listen() starts HeartbeatPoller.
 *
 * Transport selection: hiamp.yaml `transport: linear | slack` (default: linear)
 *
 * @module linear-transport
 */

import { LinearClient } from './linear-client.js';
import { LinearChannelResolver } from './linear-channel-resolver.js';
import { LinearSender } from './linear-sender.js';
import { HeartbeatPoller } from './heartbeat-poller.js';
import { Router } from './router.js';
import { Inbox } from './inbox.js';
import type { HiampConfig } from './config-loader.js';
import type { LinearResolverConfig } from './linear-channel-resolver.js';
import type { Logger, PollCycleResult } from './heartbeat-poller.js';
import type {
  Transport,
  TransportSendInput,
  TransportReplyInput,
  TransportSendResult,
  TransportResolveInput,
  TransportResolveResult,
  TransportMessageHandler,
  TransportErrorHandler,
  TransportReceivedMessage,
} from './transport.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for constructing a LinearTransport */
export interface LinearTransportOptions {
  /** Absolute path to HQ root directory (required for listening) */
  hqRoot?: string;

  /** Linear API key. Falls back to LINEAR_API_KEY env var. */
  apiKey?: string;

  /** Linear resolver configuration (teams, project mappings, etc.) */
  resolverConfig?: LinearResolverConfig;

  /** Override the LinearClient instance */
  linearClient?: LinearClient;

  /** Override the LinearChannelResolver instance */
  channelResolver?: LinearChannelResolver;

  /** Override the LinearSender instance */
  sender?: LinearSender;

  /** Override the HeartbeatPoller instance */
  heartbeatPoller?: HeartbeatPoller;

  /** Override the Router instance */
  router?: Router;

  /** Override the Inbox instance */
  inbox?: Inbox;

  /** Polling interval in minutes for HeartbeatPoller. Default: 5 */
  pollIntervalMinutes?: number;

  /** Agent names to monitor for mentions. Defaults to config identity owner. */
  agentNames?: string[];

  /** Linear user IDs representing agent identities (for assignment polling) */
  agentLinearUserIds?: string[];

  /** Logger instance. Defaults to silent logger. */
  logger?: Logger;

  /** How far back to look on first poll (ms). Default: 3600000 (1 hour) */
  initialLookbackMs?: number;

  /** Linear API endpoint override (for testing) */
  linearEndpoint?: string;

  /** Custom fetch implementation (for testing) */
  fetchFn?: typeof fetch;

  /** Linear issue IDs to watch immediately upon start */
  watchIssueIds?: string[];
}

// ---------------------------------------------------------------------------
// Default silent logger
// ---------------------------------------------------------------------------

const SILENT_LOGGER: Logger = {
  debug: () => {},
  warn: () => {},
};

// ---------------------------------------------------------------------------
// LinearTransport class
// ---------------------------------------------------------------------------

/**
 * Linear transport for HIAMP messaging.
 *
 * Wires together the Linear-based components (LinearClient, LinearChannelResolver,
 * LinearSender, HeartbeatPoller) behind the unified Transport interface.
 *
 * @example
 * ```ts
 * const transport = new LinearTransport(config, {
 *   hqRoot: '/path/to/hq',
 *   resolverConfig: {
 *     defaultTeam: 'ENG',
 *     teams: [{ key: 'ENG' }],
 *   },
 * });
 *
 * // Send a message
 * const result = await transport.send({
 *   to: 'alex/backend-dev',
 *   worker: 'architect',
 *   intent: 'handoff',
 *   body: 'The API contract is ready.',
 * });
 *
 * // Start listening (begins heartbeat polling)
 * await transport.listen({
 *   onMessage: (msg) => console.log('Received:', msg),
 * });
 *
 * // Stop
 * await transport.stop();
 * ```
 */
export class LinearTransport implements Transport {
  readonly name = 'linear';

  private readonly config: HiampConfig;
  private readonly linearClient: LinearClient;
  private readonly channelResolver: LinearChannelResolver;
  private readonly sender: LinearSender;
  private readonly hqRoot?: string;
  private readonly logger: Logger;
  private readonly pollIntervalMinutes: number;
  private readonly agentNames?: string[];
  private readonly agentLinearUserIds?: string[];
  private readonly initialLookbackMs?: number;
  private readonly watchIssueIds?: string[];
  private readonly routerOverride?: Router;
  private readonly inboxOverride?: Inbox;
  private readonly heartbeatPollerOverride?: HeartbeatPoller;

  private heartbeatPoller: HeartbeatPoller | null = null;
  private listening = false;
  private messageHandler: TransportMessageHandler | null = null;
  private errorHandler: TransportErrorHandler | null = null;

  /**
   * Create a LinearTransport.
   *
   * @param config - The loaded HIAMP configuration.
   * @param options - Optional overrides for internal components.
   */
  constructor(config: HiampConfig, options?: LinearTransportOptions) {
    this.config = config;
    this.hqRoot = options?.hqRoot;
    this.logger = options?.logger ?? SILENT_LOGGER;
    this.pollIntervalMinutes = options?.pollIntervalMinutes ?? 5;
    this.agentNames = options?.agentNames;
    this.agentLinearUserIds = options?.agentLinearUserIds;
    this.initialLookbackMs = options?.initialLookbackMs;
    this.watchIssueIds = options?.watchIssueIds;
    this.routerOverride = options?.router;
    this.inboxOverride = options?.inbox;
    this.heartbeatPollerOverride = options?.heartbeatPoller;

    // Initialize Linear components
    this.linearClient =
      options?.linearClient ??
      new LinearClient({
        apiKey: options?.apiKey,
        endpoint: options?.linearEndpoint,
        fetchFn: options?.fetchFn,
      });

    // Build resolver config from options or use a minimal default
    const resolverConfig: LinearResolverConfig = options?.resolverConfig ?? {
      defaultTeam: 'ENG',
      teams: [{ key: 'ENG' }],
    };

    this.channelResolver =
      options?.channelResolver ??
      new LinearChannelResolver(this.linearClient, resolverConfig);

    this.sender =
      options?.sender ??
      new LinearSender({
        config,
        linearClient: this.linearClient,
        channelResolver: this.channelResolver,
      });
  }

  /**
   * Send a HIAMP message via Linear (as a comment on a Linear issue).
   */
  async send(input: TransportSendInput): Promise<TransportSendResult> {
    return this.sender.send(input);
  }

  /**
   * Send a threaded reply via Linear.
   *
   * The threadRef should be the Linear issue ID. The reply is posted
   * as another comment on the same issue.
   */
  async sendReply(input: TransportReplyInput): Promise<TransportSendResult> {
    return this.sender.sendReply(input);
  }

  /**
   * Start listening for incoming HIAMP messages via Linear.
   *
   * Creates and starts a HeartbeatPoller that polls watched Linear issues
   * for new comments. Detected HIAMP messages are parsed and delivered
   * through the onMessage callback.
   *
   * Non-HIAMP comments that mention agent names are delivered as inform
   * messages through the inbox.
   */
  async listen(options: {
    onMessage?: TransportMessageHandler;
    onError?: TransportErrorHandler;
  }): Promise<void> {
    if (this.listening) {
      throw new Error('LinearTransport is already listening');
    }

    const hqRoot = this.hqRoot;
    if (!hqRoot) {
      throw new Error(
        'hqRoot is required for listening. Pass it in LinearTransportOptions.',
      );
    }

    this.messageHandler = options.onMessage ?? null;
    this.errorHandler = options.onError ?? null;

    // Build or use overridden Router
    const router =
      this.routerOverride ??
      new Router(this.config, { hqRoot });

    // Build or use overridden Inbox
    const inbox =
      this.inboxOverride ??
      new Inbox(
        hqRoot,
        this.config.settings?.inboxPath ?? 'workspace/inbox',
      );

    // Build or use overridden HeartbeatPoller
    this.heartbeatPoller =
      this.heartbeatPollerOverride ??
      new HeartbeatPoller({
        config: this.config,
        hqRoot,
        linearClient: this.linearClient,
        router,
        inbox,
        pollIntervalMinutes: this.pollIntervalMinutes,
        agentNames: this.agentNames ?? [this.config.identity.owner],
        agentLinearUserIds: this.agentLinearUserIds,
        logger: this.logger,
        initialLookbackMs: this.initialLookbackMs,
        onPollComplete: (result: PollCycleResult) => {
          this.handlePollComplete(result);
        },
        onError: (error: Error) => {
          this.errorHandler?.(error);
        },
      });

    // Add any pre-configured watch issues
    if (this.watchIssueIds) {
      for (const issueId of this.watchIssueIds) {
        this.heartbeatPoller.watchIssue(issueId);
      }
    }

    // Start the polling loop
    await this.heartbeatPoller.start();
    this.listening = true;
  }

  /**
   * Resolve the destination Linear issue for a target peer.
   *
   * Delegates to LinearChannelResolver which uses the resolution strategy:
   * 1. Explicit issue ID
   * 2. Project context matching
   * 3. Fallback agent-comms issue
   */
  async resolveChannel(
    input: TransportResolveInput,
  ): Promise<TransportResolveResult> {
    return this.channelResolver.resolveChannel(input);
  }

  /**
   * Stop the Linear transport.
   *
   * Stops the HeartbeatPoller and cleans up resources.
   */
  async stop(): Promise<void> {
    if (this.heartbeatPoller) {
      await this.heartbeatPoller.stop();
    }
    this.heartbeatPoller = null;
    this.listening = false;
    this.messageHandler = null;
    this.errorHandler = null;
  }

  /**
   * Check if the transport is currently listening.
   */
  isListening(): boolean {
    return this.listening;
  }

  // -------------------------------------------------------------------------
  // Accessors for direct component access
  // -------------------------------------------------------------------------

  /**
   * Get the underlying LinearClient instance.
   */
  getLinearClient(): LinearClient {
    return this.linearClient;
  }

  /**
   * Get the underlying LinearChannelResolver instance.
   */
  getChannelResolver(): LinearChannelResolver {
    return this.channelResolver;
  }

  /**
   * Get the underlying LinearSender instance.
   */
  getSender(): LinearSender {
    return this.sender;
  }

  /**
   * Get the underlying HeartbeatPoller instance (if listening).
   * Returns null if listen() hasn't been called.
   */
  getHeartbeatPoller(): HeartbeatPoller | null {
    return this.heartbeatPoller;
  }

  /**
   * Add a Linear issue to the watch list.
   * Can be called before or after listen() — if called before,
   * the issue will be watched when listen() starts.
   *
   * @param issueId - The Linear issue ID (UUID) to watch.
   */
  watchIssue(issueId: string): void {
    if (this.heartbeatPoller) {
      this.heartbeatPoller.watchIssue(issueId);
    }
  }

  /**
   * Remove a Linear issue from the watch list.
   *
   * @param issueId - The Linear issue ID (UUID) to stop watching.
   */
  unwatchIssue(issueId: string): void {
    if (this.heartbeatPoller) {
      this.heartbeatPoller.unwatchIssue(issueId);
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Handle poll cycle completion from HeartbeatPoller.
   *
   * Converts poll results into TransportReceivedMessage objects
   * and delivers them through the onMessage callback.
   */
  private handlePollComplete(result: PollCycleResult): void {
    if (!this.messageHandler) return;

    for (const commentResult of result.results) {
      // Only surface HIAMP-detected comments or agent-mentioned inform messages
      if (!commentResult.isHiamp && !commentResult.deliveredAsInform) {
        continue;
      }

      const received: TransportReceivedMessage = {
        rawText: commentResult.isHiamp
          ? (commentResult.routeResult?.reason ?? '')
          : '',
        message: commentResult.isHiamp
          ? commentResult.routeResult
            ? undefined  // The message was already routed by HeartbeatPoller
            : undefined
          : undefined,
        detected: commentResult.isHiamp,
        channelId: commentResult.issueIdentifier,
        senderId: undefined,
        messageRef: commentResult.commentId,
        threadRef: undefined,
        error: commentResult.error,
        processedAt: result.pollFinishedAt,
      };

      this.messageHandler(received);
    }
  }
}
