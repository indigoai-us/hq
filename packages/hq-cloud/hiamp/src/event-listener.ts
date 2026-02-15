/**
 * HIAMP Event Listener
 *
 * Listens for incoming Slack message events and processes them through
 * the HIAMP receive pipeline: detect -> parse -> validate -> route -> deliver.
 *
 * Supports two modes:
 * - `socket`: Uses @slack/socket-mode for local dev (no public endpoint needed)
 * - `webhook`: HTTP endpoint for production (handles Slack URL verification challenge)
 *
 * @module event-listener
 */

import { parse } from './parse.js';
import { validate } from './validate.js';
import { detectHiampMessage } from './message-detector.js';
import { Router } from './router.js';
import { Inbox } from './inbox.js';
import { SlackSender } from './slack-sender.js';
import type { SlackMessageEvent } from './message-detector.js';
import type { RouteResult } from './router.js';
import type { HiampConfig } from './config-loader.js';
import type { HiampMessage } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the event listener */
export interface EventListenerOptions {
  /** The loaded HIAMP configuration */
  config: HiampConfig;

  /** Absolute path to HQ root directory */
  hqRoot: string;

  /** The local bot's Slack user ID (for echo prevention) */
  localBotId?: string;

  /** Optional Router instance (for testing) */
  router?: Router;

  /** Optional SlackSender instance (for testing / bounce messages) */
  sender?: SlackSender;

  /** Optional Inbox instance (for testing) */
  inbox?: Inbox;

  /** Optional callback for processed messages */
  onMessage?: (event: ProcessedEvent) => void;

  /** Optional callback for errors */
  onError?: (error: Error) => void;

  /** Optional list of channel IDs to monitor. If not provided, uses config channels. */
  monitoredChannels?: string[];
}

/** A processed event (emitted after the full pipeline) */
export interface ProcessedEvent {
  /** The Slack message event */
  slackEvent: SlackMessageEvent;

  /** Whether the message was detected as HIAMP */
  detected: boolean;

  /** The parsed HIAMP message (if detection succeeded) */
  message?: HiampMessage;

  /** The route result (if parsing and validation succeeded) */
  routeResult?: RouteResult;

  /** Error message if any stage failed */
  error?: string;

  /** Processing timestamp */
  processedAt: string;
}

/** Slack URL verification challenge (webhook mode) */
export interface SlackUrlVerification {
  type: 'url_verification';
  challenge: string;
  token: string;
}

/** Slack event callback wrapper */
export interface SlackEventCallback {
  type: 'event_callback';
  token: string;
  team_id: string;
  event: SlackMessageEvent & { type: string };
  event_id: string;
  event_time: number;
}

/** Union of possible Slack payloads for webhook mode */
export type SlackWebhookPayload = SlackUrlVerification | SlackEventCallback;

// ---------------------------------------------------------------------------
// EventListener class
// ---------------------------------------------------------------------------

/**
 * Listens for and processes incoming HIAMP messages from Slack.
 *
 * The full receive pipeline:
 * 1. Receive Slack message event (via socket-mode or webhook)
 * 2. Detect: Is this a HIAMP message? (cheap pre-filter)
 * 3. Parse: Extract header, body, and envelope
 * 4. Validate: Check required fields and formats
 * 5. Route: Deliver to the correct local worker's inbox
 *
 * @example
 * ```ts
 * const listener = new EventListener({
 *   config,
 *   hqRoot: '/path/to/hq',
 *   localBotId: 'U0MYBOT',
 *   onMessage: (event) => console.log('Processed:', event),
 * });
 *
 * // For socket mode:
 * await listener.startSocketMode();
 *
 * // For webhook mode (in a request handler):
 * const response = await listener.handleWebhook(requestBody);
 * ```
 */
export class EventListener {
  private readonly config: HiampConfig;
  private readonly hqRoot: string;
  private readonly localBotId?: string;
  private readonly router: Router;
  private readonly onMessage?: (event: ProcessedEvent) => void;
  private readonly onError?: (error: Error) => void;
  private readonly monitoredChannels: Set<string>;
  private socketModeClient: unknown | null = null;
  private running = false;

  constructor(options: EventListenerOptions) {
    this.config = options.config;
    this.hqRoot = options.hqRoot;
    this.localBotId = options.localBotId;
    this.onMessage = options.onMessage;
    this.onError = options.onError;

    // Build the router
    this.router =
      options.router ??
      new Router(options.config, {
        hqRoot: options.hqRoot,
        sender: options.sender,
        inbox: options.inbox,
      });

    // Determine monitored channels from config
    this.monitoredChannels = new Set(
      options.monitoredChannels ?? this.getConfiguredChannels(),
    );
  }

  /**
   * Process a single Slack message event through the HIAMP pipeline.
   *
   * This is the core method used by both socket-mode and webhook handlers.
   *
   * @param event - The Slack message event.
   * @returns A ProcessedEvent with the result.
   */
  async processEvent(event: SlackMessageEvent): Promise<ProcessedEvent> {
    const processedAt = new Date().toISOString();

    try {
      // Check kill switch
      if (this.config.security?.killSwitch) {
        return {
          slackEvent: event,
          detected: false,
          error: 'HIAMP kill switch is active',
          processedAt,
        };
      }

      // Check if HIAMP is enabled
      if (this.config.settings && !this.config.settings.enabled) {
        return {
          slackEvent: event,
          detected: false,
          error: 'HIAMP subsystem is disabled',
          processedAt,
        };
      }

      // Check if message is from a monitored channel
      if (event.channel && this.monitoredChannels.size > 0) {
        if (!this.monitoredChannels.has(event.channel)) {
          return {
            slackEvent: event,
            detected: false,
            error: `Channel ${event.channel} is not monitored`,
            processedAt,
          };
        }
      }

      // Step 1: Detect
      const detection = detectHiampMessage(event, this.localBotId);
      if (!detection.isHiamp) {
        return {
          slackEvent: event,
          detected: false,
          error: detection.reason,
          processedAt,
        };
      }

      // Step 2: Parse
      const parseResult = parse(event.text!);
      if (!parseResult.success) {
        return {
          slackEvent: event,
          detected: true,
          error: `Parse failed: ${parseResult.errors.join(', ')}`,
          processedAt,
        };
      }

      // Step 3: Validate
      const validation = validate(parseResult.message);
      if (!validation.valid) {
        return {
          slackEvent: event,
          detected: true,
          message: parseResult.message,
          error: `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
          processedAt,
        };
      }

      // Step 4: Route
      const routeResult = await this.router.route(
        parseResult.message,
        event.text!,
        event.channel ?? '',
        event.user,
        event.ts,
        event.thread_ts,
      );

      const result: ProcessedEvent = {
        slackEvent: event,
        detected: true,
        message: parseResult.message,
        routeResult,
        processedAt,
      };

      // Notify listener
      this.onMessage?.(result);

      return result;
    } catch (err) {
      const error = err as Error;
      this.onError?.(error);

      return {
        slackEvent: event,
        detected: false,
        error: `Processing error: ${error.message}`,
        processedAt,
      };
    }
  }

  /**
   * Handle a webhook request body from Slack.
   *
   * Supports:
   * - URL verification challenge (returns the challenge string)
   * - Event callbacks (processes the message event)
   *
   * @param payload - The parsed request body from Slack.
   * @returns An object with statusCode and body for the HTTP response.
   */
  async handleWebhook(
    payload: SlackWebhookPayload,
  ): Promise<{ statusCode: number; body: string }> {
    // Handle URL verification challenge
    if (payload.type === 'url_verification') {
      return {
        statusCode: 200,
        body: JSON.stringify({ challenge: (payload as SlackUrlVerification).challenge }),
      };
    }

    // Handle event callback
    if (payload.type === 'event_callback') {
      const callback = payload as SlackEventCallback;

      // Only process 'message' type events
      if (callback.event?.type !== 'message') {
        return { statusCode: 200, body: 'OK' };
      }

      // Process the message event asynchronously but respond immediately
      // (Slack expects a 200 within 3 seconds)
      const event: SlackMessageEvent = {
        text: callback.event.text,
        user: callback.event.user,
        bot_id: callback.event.bot_id,
        channel: callback.event.channel,
        subtype: callback.event.subtype,
        ts: callback.event.ts,
        thread_ts: callback.event.thread_ts,
        files: callback.event.files,
      };

      // Process in the background (don't await)
      this.processEvent(event).catch((err) => {
        this.onError?.(err as Error);
      });

      return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 400, body: 'Unknown payload type' };
  }

  /**
   * Start listening in socket mode.
   *
   * Requires @slack/socket-mode to be installed.
   * Uses the socket-app-token from config.
   *
   * @returns A promise that resolves when the connection is established.
   */
  async startSocketMode(): Promise<void> {
    if (this.running) {
      throw new Error('EventListener is already running');
    }

    const appToken = this.config.slack.socketAppToken;
    if (!appToken) {
      throw new Error(
        'Socket mode requires socket-app-token in the Slack config',
      );
    }

    // Dynamic import to avoid requiring @slack/socket-mode as a hard dependency
    const { SocketModeClient } = await import('@slack/socket-mode');

    const client = new SocketModeClient({ appToken });

    // Listen for message events
    client.on('message', async ({ event, ack }: { event: SlackMessageEvent & { type: string }; ack: () => Promise<void> }) => {
      // Acknowledge the event immediately
      await ack();

      // Process the message
      const messageEvent: SlackMessageEvent = {
        text: event.text,
        user: event.user,
        bot_id: event.bot_id,
        channel: event.channel,
        subtype: event.subtype,
        ts: event.ts,
        thread_ts: event.thread_ts,
        files: event.files,
      };

      await this.processEvent(messageEvent);
    });

    // Handle errors
    client.on('error', (error: Error) => {
      this.onError?.(error);
    });

    await client.start();
    this.socketModeClient = client;
    this.running = true;
  }

  /**
   * Stop the event listener.
   */
  async stop(): Promise<void> {
    if (this.socketModeClient && typeof (this.socketModeClient as { disconnect?: () => Promise<void> }).disconnect === 'function') {
      await (this.socketModeClient as { disconnect: () => Promise<void> }).disconnect();
    }
    this.socketModeClient = null;
    this.running = false;
  }

  /**
   * Check if the listener is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Extract all configured channel IDs from the config.
   */
  private getConfiguredChannels(): string[] {
    const channels: string[] = [];
    const ch = this.config.slack.channels;

    if (ch?.dedicated) {
      channels.push(ch.dedicated.id);
    }

    if (ch?.perRelationship) {
      for (const rel of ch.perRelationship) {
        channels.push(rel.id);
      }
    }

    if (ch?.contextual) {
      for (const ctx of ch.contextual) {
        channels.push(ctx.id);
      }
    }

    return channels;
  }
}
