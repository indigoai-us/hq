/**
 * HIAMP Message Router
 *
 * Routes incoming HIAMP messages to local workers based on the `to` address.
 * Performs address resolution, worker existence checks, permission validation,
 * and delivers messages to the worker's inbox.
 *
 * For messages addressed to unknown or inactive workers, generates error
 * bounce messages via SlackSender.
 *
 * @module router
 */

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { parse } from './parse.js';
import { validate } from './validate.js';
import type { HiampMessage, ParseResult } from './types.js';
import type { HiampConfig, WorkerPermission } from './config-loader.js';
import { SlackSender } from './slack-sender.js';
import { Inbox } from './inbox.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A local worker entry from the worker registry */
export interface LocalWorker {
  id: string;
  name?: string;
  type?: string;
  status?: string;
  path?: string;
}

/** Route result */
export interface RouteResult {
  /** Whether the message was successfully routed */
  success: boolean;

  /** The action taken */
  action: 'delivered' | 'bounced' | 'ignored' | 'rejected';

  /** The target worker ID (if resolved) */
  workerId?: string;

  /** Error code for bounced messages */
  errorCode?: string;

  /** Human-readable reason */
  reason: string;
}

/** Options for the Router */
export interface RouterOptions {
  /** Absolute path to HQ root directory */
  hqRoot: string;

  /** Path to workers/registry.yaml, relative to hqRoot. Defaults to 'workers/registry.yaml'. */
  registryPath?: string;

  /** Override for loading the worker registry (useful for testing) */
  registryLoader?: () => LocalWorker[];

  /** SlackSender instance for sending bounce/error responses */
  sender?: SlackSender;

  /** Inbox instance for delivering messages */
  inbox?: Inbox;
}

// ---------------------------------------------------------------------------
// Router class
// ---------------------------------------------------------------------------

/**
 * Routes incoming HIAMP messages to local workers.
 *
 * The routing pipeline:
 * 1. Extract the `to` address from the parsed message
 * 2. Check if the `owner` matches the local HQ identity
 * 3. Look up the `worker-id` in the local worker registry
 * 4. Check worker permissions (receive, allowed intents, allowed peers)
 * 5. If all checks pass: deliver to the worker's inbox
 * 6. If any check fails: send an error bounce message
 *
 * @example
 * ```ts
 * const router = new Router(config, { hqRoot: '/path/to/hq' });
 * const result = await router.route(parsedMessage, rawText, 'C0CHAN', 'U0USER');
 * ```
 */
export class Router {
  private readonly config: HiampConfig;
  private readonly hqRoot: string;
  private readonly registryPath: string;
  private readonly sender?: SlackSender;
  private readonly inbox: Inbox;
  private readonly registryLoader?: () => LocalWorker[];
  private localWorkers: LocalWorker[] | null = null;

  constructor(config: HiampConfig, options: RouterOptions) {
    this.config = config;
    this.hqRoot = options.hqRoot;
    this.registryPath = options.registryPath ?? 'workers/registry.yaml';
    this.sender = options.sender;
    this.inbox =
      options.inbox ??
      new Inbox(options.hqRoot, config.settings?.inboxPath ?? 'workspace/inbox');
    this.registryLoader = options.registryLoader;
  }

  /**
   * Route a parsed HIAMP message to the correct local worker.
   *
   * @param message - The parsed HIAMP message.
   * @param rawText - The raw message text from Slack.
   * @param channelId - The Slack channel ID where the message was received.
   * @param slackUserId - The Slack user/bot ID of the sender.
   * @param slackTs - The Slack message timestamp.
   * @param slackThreadTs - The Slack thread timestamp.
   * @returns A RouteResult indicating what happened.
   */
  async route(
    message: HiampMessage,
    rawText: string,
    channelId: string,
    slackUserId?: string,
    slackTs?: string,
    slackThreadTs?: string,
  ): Promise<RouteResult> {
    // 1. Extract the target address
    const toAddress = message.to;
    const parts = toAddress.split('/');
    if (parts.length !== 2) {
      return {
        success: false,
        action: 'rejected',
        reason: `Invalid 'to' address format: ${toAddress}`,
      };
    }

    const [targetOwner, targetWorkerId] = parts;

    // 2. Check if the owner matches local identity
    if (targetOwner !== this.config.identity.owner) {
      return {
        success: false,
        action: 'ignored',
        reason: `Message not for local owner. Target: ${targetOwner}, local: ${this.config.identity.owner}`,
      };
    }

    // 3. Look up the worker in the local registry
    const workers = this.getLocalWorkers();
    const worker = workers.find((w) => w.id === targetWorkerId);

    if (!worker) {
      // Send error bounce
      await this.sendBounce(message, channelId, slackTs, {
        errorCode: 'ERR_UNKNOWN_RECIPIENT',
        body: `ERR_UNKNOWN_RECIPIENT: Worker "${targetWorkerId}" does not exist in ${this.config.identity.owner}'s HQ.\n\nAvailable workers:\n${workers.map((w) => `- ${this.config.identity.owner}/${w.id}`).join('\n')}`,
      });

      return {
        success: false,
        action: 'bounced',
        workerId: targetWorkerId,
        errorCode: 'ERR_UNKNOWN_RECIPIENT',
        reason: `Worker "${targetWorkerId}" not found in local registry`,
      };
    }

    // 4. Check worker status (if available)
    if (worker.status === 'inactive' || worker.status === 'disabled') {
      await this.sendBounce(message, channelId, slackTs, {
        errorCode: 'ERR_UNKNOWN_RECIPIENT',
        body: `ERR_UNKNOWN_RECIPIENT: Worker "${targetWorkerId}" is currently ${worker.status} in ${this.config.identity.owner}'s HQ.`,
      });

      return {
        success: false,
        action: 'bounced',
        workerId: targetWorkerId,
        errorCode: 'ERR_UNKNOWN_RECIPIENT',
        reason: `Worker "${targetWorkerId}" is ${worker.status}`,
      };
    }

    // 5. Check worker permissions
    const permResult = this.checkReceivePermission(
      targetWorkerId!,
      message.intent,
      message.from.split('/')[0]!,
    );

    if (permResult) {
      await this.sendBounce(message, channelId, slackTs, {
        errorCode: permResult.errorCode,
        body: permResult.body,
      });

      return {
        success: false,
        action: 'bounced',
        workerId: targetWorkerId,
        errorCode: permResult.errorCode,
        reason: permResult.reason,
      };
    }

    // 6. Check message expiry
    if (message.expires) {
      const expiryDate = new Date(message.expires);
      if (!isNaN(expiryDate.getTime()) && expiryDate.getTime() < Date.now()) {
        await this.sendBounce(message, channelId, slackTs, {
          errorCode: 'ERR_EXPIRED',
          body: `ERR_EXPIRED: Message ${message.id} expired at ${message.expires}. Current time: ${new Date().toISOString()}`,
        });

        return {
          success: false,
          action: 'bounced',
          workerId: targetWorkerId,
          errorCode: 'ERR_EXPIRED',
          reason: `Message expired at ${message.expires}`,
        };
      }
    }

    // 7. Deliver to inbox
    const deliverResult = await this.inbox.deliver(
      message,
      rawText,
      channelId,
      slackUserId,
      slackTs,
      slackThreadTs,
    );

    if (!deliverResult.success) {
      return {
        success: false,
        action: 'rejected',
        workerId: targetWorkerId,
        reason: deliverResult.error ?? 'Failed to deliver to inbox',
      };
    }

    return {
      success: true,
      action: 'delivered',
      workerId: targetWorkerId,
      reason: `Message ${message.id} delivered to ${targetWorkerId}'s inbox`,
    };
  }

  /**
   * Process a raw message text through the full pipeline: parse -> validate -> route.
   *
   * @param rawText - The raw message text from Slack.
   * @param channelId - The Slack channel ID.
   * @param slackUserId - The Slack user/bot ID.
   * @param slackTs - The Slack message timestamp.
   * @param slackThreadTs - The Slack thread timestamp.
   * @returns A RouteResult.
   */
  async processRaw(
    rawText: string,
    channelId: string,
    slackUserId?: string,
    slackTs?: string,
    slackThreadTs?: string,
  ): Promise<RouteResult> {
    // Parse
    const parseResult: ParseResult = parse(rawText);
    if (!parseResult.success) {
      return {
        success: false,
        action: 'rejected',
        reason: `Parse failed: ${parseResult.errors.join(', ')}`,
      };
    }

    // Validate
    const validation = validate(parseResult.message);
    if (!validation.valid) {
      return {
        success: false,
        action: 'rejected',
        reason: `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
      };
    }

    // Route
    return this.route(
      parseResult.message,
      rawText,
      channelId,
      slackUserId,
      slackTs,
      slackThreadTs,
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Load local workers from the registry.
   * Caches the result after first load.
   */
  private getLocalWorkers(): LocalWorker[] {
    if (this.localWorkers !== null) {
      return this.localWorkers;
    }

    if (this.registryLoader) {
      this.localWorkers = this.registryLoader();
      return this.localWorkers;
    }

    try {
      const fullPath = `${this.hqRoot}/${this.registryPath}`;
      const content = readFileSync(fullPath, 'utf-8');
      const parsed = yaml.load(content) as { workers?: Array<{ id: string; name?: string; type?: string; status?: string; path?: string }> };

      if (parsed && parsed.workers && Array.isArray(parsed.workers)) {
        this.localWorkers = parsed.workers.map((w) => ({
          id: w.id,
          name: w.name,
          type: w.type,
          status: w.status ?? 'active',
          path: w.path,
        }));
      } else {
        this.localWorkers = [];
      }
    } catch {
      this.localWorkers = [];
    }

    return this.localWorkers;
  }

  /**
   * Check if the local worker has permission to receive this message.
   */
  private checkReceivePermission(
    workerId: string,
    intent: string,
    senderOwner: string,
  ): { errorCode: string; body: string; reason: string } | null {
    const wp = this.config.workerPermissions;

    // Find the worker's permission entry
    const workerPerm = wp.workers.find((w) => w.id === workerId);

    if (!workerPerm) {
      // Use default permission
      if (wp.default === 'deny') {
        // Per spec: "do not reveal that the worker exists but is restricted"
        return {
          errorCode: 'ERR_UNKNOWN_RECIPIENT',
          body: `ERR_UNKNOWN_RECIPIENT: Worker "${workerId}" is not available in ${this.config.identity.owner}'s HQ.`,
          reason: `Worker "${workerId}" has no permission entry and default is deny`,
        };
      }
      // default: allow -- no restrictions
      return null;
    }

    if (!workerPerm.receive) {
      // Per spec: use ERR_UNKNOWN_RECIPIENT to not reveal worker exists
      return {
        errorCode: 'ERR_UNKNOWN_RECIPIENT',
        body: `ERR_UNKNOWN_RECIPIENT: Worker "${workerId}" is not available in ${this.config.identity.owner}'s HQ.`,
        reason: `Worker "${workerId}" does not have receive permission`,
      };
    }

    // Check allowed intents
    if (workerPerm.allowedIntents && !workerPerm.allowedIntents.includes(intent)) {
      return {
        errorCode: 'ERR_UNSUPPORTED_INTENT',
        body: `ERR_UNSUPPORTED_INTENT: Worker "${this.config.identity.owner}/${workerId}" does not handle "${intent}" messages.`,
        reason: `Worker "${workerId}" does not accept intent "${intent}"`,
      };
    }

    // Check allowed peers
    if (workerPerm.allowedPeers && !workerPerm.allowedPeers.includes('*')) {
      if (!workerPerm.allowedPeers.includes(senderOwner)) {
        return {
          errorCode: 'ERR_AUTH_FAILED',
          body: `ERR_AUTH_FAILED: Message rejected.`,
          reason: `Worker "${workerId}" does not accept messages from peer "${senderOwner}"`,
        };
      }
    }

    return null;
  }

  /**
   * Send an error bounce message back to the sender.
   */
  private async sendBounce(
    originalMessage: HiampMessage,
    channelId: string,
    slackTs?: string,
    error?: { errorCode: string; body: string },
  ): Promise<void> {
    if (!this.sender) return;

    try {
      // Find a fallback local worker for the "from" field of the bounce
      const workers = this.getLocalWorkers();
      const fallbackWorker = workers[0]?.id ?? 'system';

      const bounceFrom = `${this.config.identity.owner}/${fallbackWorker}`;

      if (slackTs) {
        await this.sender.sendReply({
          from: bounceFrom,
          to: originalMessage.from,
          intent: 'error',
          body: error?.body ?? 'An error occurred processing your message.',
          thread: originalMessage.thread,
          replyTo: originalMessage.id,
          ack: 'none',
          threadTs: slackTs,
          channelId,
        });
      } else {
        await this.sender.send({
          from: bounceFrom,
          to: originalMessage.from,
          intent: 'error',
          body: error?.body ?? 'An error occurred processing your message.',
          thread: originalMessage.thread,
          ack: 'none',
          channelId,
        });
      }
    } catch {
      // Bounce sending failed -- log but don't crash
    }
  }

  /**
   * Force-reload the worker registry.
   * Useful after workers are added or removed.
   */
  reloadRegistry(): void {
    this.localWorkers = null;
  }
}
