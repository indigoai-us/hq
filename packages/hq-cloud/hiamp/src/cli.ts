/**
 * HIAMP CLI — Command-line interface for inter-agent messaging.
 *
 * Provides sub-commands that map to the HIAMP library functions,
 * enabling workers to send messages, check inboxes, reply, view threads,
 * and share files from the command line or skill definitions.
 *
 * Transport selection is config-driven: the `transport` field in hiamp.yaml
 * determines whether SlackTransport or LinearTransport is used. No CLI flags
 * are needed — the factory function `createTransport(config)` handles it.
 *
 * Usage:
 *   npx tsx packages/hq-cloud/hiamp/src/cli.ts <sub-command> [options]
 *
 * Sub-commands:
 *   send    — Send a message to a peer worker
 *   inbox   — Check unread messages
 *   reply   — Reply to a specific message
 *   thread  — View conversation history
 *   share   — Share files with a peer worker
 *   migrate — Migrate config between transports (e.g., slack -> linear)
 *
 * @module cli
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from './config-loader.js';
import { SlackTransport } from './slack-transport.js';
import { LinearTransport } from './linear-transport.js';
import { Inbox } from './inbox.js';
import { ThreadManager } from './thread-manager.js';
import type {
  HiampConfig,
  HiampSlackConfig,
  HiampLinearConfig,
  HiampLinearTeamConfig,
  HiampLinearProjectMapping,
} from './config-loader.js';
import type { Transport } from './transport.js';
import type { IntentType, Priority, AckMode } from './types.js';
import { INTENT_TYPES, PRIORITY_LEVELS, ACK_MODES } from './constants.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/** Parsed CLI arguments */
export interface CliArgs {
  subcommand: string;
  options: Record<string, string>;
  flags: Set<string>;
}

/**
 * Parse CLI arguments into structured form.
 *
 * Supports: --key value, --key=value, and --flag (boolean).
 */
export function parseArgs(argv: string[]): CliArgs {
  const subcommand = argv[0] ?? '';
  const options: Record<string, string> = {};
  const flags = new Set<string>();

  let i = 1;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        // --key=value
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        options[key] = value;
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
        // --key value
        const key = arg.slice(2);
        options[key] = argv[i + 1]!;
        i++;
      } else {
        // --flag
        flags.add(arg.slice(2));
      }
    }
    i++;
  }

  return { subcommand, options, flags };
}

// ---------------------------------------------------------------------------
// Sub-command handlers
// ---------------------------------------------------------------------------

/** Result returned by each sub-command handler */
export interface CliResult {
  success: boolean;
  output: string;
  exitCode: number;
}

// ---------------------------------------------------------------------------
// Transport factory
// ---------------------------------------------------------------------------

/** Options for creating a transport instance */
export interface CreateTransportOptions {
  /** HQ root directory (needed for listening/inbox features) */
  hqRoot?: string;
}

/**
 * Create the appropriate Transport based on the config's `transport` field.
 *
 * Returns a LinearTransport when `config.transport === 'linear'` and a
 * SlackTransport when `config.transport === 'slack'`. The caller does not
 * need to know which transport is in use — all interactions go through the
 * unified Transport interface.
 *
 * @param config - The loaded HIAMP configuration.
 * @param options - Optional overrides (hqRoot, etc.).
 * @returns A Transport implementation.
 */
export function createTransport(config: HiampConfig, options?: CreateTransportOptions): Transport {
  if (config.transport === 'linear') {
    return new LinearTransport(config, {
      hqRoot: options?.hqRoot,
    });
  }
  // Default / 'slack'
  return new SlackTransport(config, {
    hqRoot: options?.hqRoot,
  });
}

// ---------------------------------------------------------------------------
// Sub-command handlers (transport-agnostic)
// ---------------------------------------------------------------------------

/**
 * Handle the `send` sub-command.
 *
 * Sends a HIAMP message to a peer worker via the configured transport.
 */
export async function handleSend(args: CliArgs): Promise<CliResult> {
  const { options } = args;

  // Validate required arguments
  const to = options['to'];
  const intent = options['intent'];
  const body = options['body'];

  if (!to) {
    return { success: false, output: 'Error: --to is required (e.g., --to alex/backend-dev)', exitCode: 1 };
  }
  if (!intent) {
    return { success: false, output: 'Error: --intent is required (e.g., --intent handoff)', exitCode: 1 };
  }
  if (!INTENT_TYPES.includes(intent as IntentType)) {
    return {
      success: false,
      output: `Error: Invalid intent "${intent}". Must be one of: ${INTENT_TYPES.join(', ')}`,
      exitCode: 1,
    };
  }
  if (!body) {
    return { success: false, output: 'Error: --body is required', exitCode: 1 };
  }

  // Validate optional enum fields before loading config
  const priority = options['priority'] as Priority | undefined;
  if (priority && !PRIORITY_LEVELS.includes(priority)) {
    return {
      success: false,
      output: `Error: Invalid priority "${priority}". Must be one of: ${PRIORITY_LEVELS.join(', ')}`,
      exitCode: 1,
    };
  }

  const ack = options['ack'] as AckMode | undefined;
  if (ack && !ACK_MODES.includes(ack)) {
    return {
      success: false,
      output: `Error: Invalid ack mode "${ack}". Must be one of: ${ACK_MODES.join(', ')}`,
      exitCode: 1,
    };
  }

  // Load config
  const configResult = loadConfig(options['config']);
  if (!configResult.success) {
    const msgs = configResult.errors.map((e) => `  ${e.field}: ${e.message}`).join('\n');
    return { success: false, output: `Error loading HIAMP config:\n${msgs}`, exitCode: 1 };
  }

  const config = configResult.config;
  const transport = createTransport(config);

  // Resolve worker identity
  const worker = options['worker'];
  const from = worker ? `${config.identity.owner}/${worker}` : undefined;

  const result = await transport.send({
    to,
    from,
    worker,
    intent: intent as IntentType,
    body,
    ref: options['ref'],
    priority,
    ack,
    attach: options['attach'],
    thread: options['thread'],
  });

  if (!result.success) {
    return { success: false, output: `Error sending message: ${result.error} (${result.code})`, exitCode: 1 };
  }

  const output = [
    'Message sent successfully.',
    `  Message ID: ${extractMessageId(result.messageText)}`,
    `  Thread ID:  ${result.thread}`,
    `  To:         ${to}`,
    `  Intent:     ${intent}`,
    `  Channel:    ${result.channelId}`,
  ].join('\n');

  return { success: true, output, exitCode: 0 };
}

/**
 * Handle the `inbox` sub-command.
 *
 * Lists unread (or all) messages for a worker.
 */
export async function handleInbox(args: CliArgs): Promise<CliResult> {
  const { options, flags } = args;

  const workerId = options['worker'] ?? 'default';
  const showAll = flags.has('all');
  const hqRoot = options['hq-root'] ?? process.cwd();

  const inbox = new Inbox(hqRoot);
  const entries = showAll
    ? await inbox.readInbox(workerId)
    : await inbox.readUnread(workerId);

  if (entries.length === 0) {
    const label = showAll ? 'messages' : 'unread messages';
    return { success: true, output: `Inbox for ${workerId}: No ${label}.`, exitCode: 0 };
  }

  const label = showAll ? 'messages' : 'unread';
  const lines: string[] = [`Inbox for ${workerId} (${entries.length} ${label}):\n`];

  // Header
  lines.push(
    `  #  From${' '.repeat(17)}Intent${' '.repeat(6)}Received${' '.repeat(14)}Preview`,
  );

  entries.forEach((entry, i) => {
    const from = entry.message.from.padEnd(21);
    const intent = entry.message.intent.padEnd(12);
    const received = entry.receivedAt.slice(0, 22).padEnd(22);
    const preview = entry.message.body.slice(0, 50).replace(/\n/g, ' ');
    const suffix = entry.message.body.length > 50 ? '...' : '';
    lines.push(`  ${(i + 1).toString().padStart(2)}  ${from}${intent}${received}${preview}${suffix}`);
  });

  lines.push('');
  lines.push("Use 'message reply --message-id <id> --body \"...\"' to respond.");

  return { success: true, output: lines.join('\n'), exitCode: 0 };
}

/**
 * Handle the `reply` sub-command.
 *
 * Sends a threaded reply to an existing message.
 * Transport-agnostic: uses createTransport() to select the right transport
 * based on config, then calls transport.sendReply() or transport.send().
 */
export async function handleReply(args: CliArgs): Promise<CliResult> {
  const { options } = args;

  const messageId = options['message-id'];
  const body = options['body'];

  if (!messageId) {
    return { success: false, output: 'Error: --message-id is required', exitCode: 1 };
  }
  if (!body) {
    return { success: false, output: 'Error: --body is required', exitCode: 1 };
  }

  const hqRoot = options['hq-root'] ?? process.cwd();
  const workerId = options['worker'] ?? 'default';

  // Find the original message in the inbox
  const inbox = new Inbox(hqRoot);
  const allMessages = await inbox.readInbox(workerId);
  const original = allMessages.find((e) => e.message.id === messageId);

  if (!original) {
    return {
      success: false,
      output: `Error: Message "${messageId}" not found in inbox for worker "${workerId}"`,
      exitCode: 1,
    };
  }

  // Load config for sending
  const configResult = loadConfig(options['config']);
  if (!configResult.success) {
    const msgs = configResult.errors.map((e) => `  ${e.field}: ${e.message}`).join('\n');
    return { success: false, output: `Error loading HIAMP config:\n${msgs}`, exitCode: 1 };
  }

  const config = configResult.config;
  const transport = createTransport(config, { hqRoot });

  const intent = (options['intent'] ?? 'response') as IntentType;
  if (!INTENT_TYPES.includes(intent)) {
    return {
      success: false,
      output: `Error: Invalid intent "${intent}". Must be one of: ${INTENT_TYPES.join(', ')}`,
      exitCode: 1,
    };
  }

  const replyTo = original.message.from;
  const thread = original.message.thread;

  // Determine the transport-agnostic thread reference for threading.
  // Slack uses slackThreadTs/slackTs; Linear uses the channelId (issue ID).
  // Fall back to channelId which works for both transports.
  const threadRef = original.slackThreadTs ?? original.slackTs ?? original.channelId;

  // If we have a thread reference, use sendReply for proper threading
  const result = threadRef
    ? await transport.sendReply({
        to: replyTo,
        worker: workerId,
        intent,
        body,
        thread,
        ref: options['ref'],
        priority: options['priority'] as Priority | undefined,
        replyTo: messageId,
        threadRef,
      })
    : await transport.send({
        to: replyTo,
        worker: workerId,
        intent,
        body,
        thread,
        ref: options['ref'],
        priority: options['priority'] as Priority | undefined,
      });

  if (!result.success) {
    return { success: false, output: `Error sending reply: ${result.error} (${result.code})`, exitCode: 1 };
  }

  // Mark the original as read
  await inbox.markRead(workerId, messageId);

  const output = [
    'Reply sent successfully.',
    `  Message ID:   ${extractMessageId(result.messageText)}`,
    `  Thread ID:    ${result.thread}`,
    `  To:           ${replyTo}`,
    `  Intent:       ${intent}`,
    `  In reply to:  ${messageId}`,
  ].join('\n');

  return { success: true, output, exitCode: 0 };
}

/**
 * Handle the `thread` sub-command.
 *
 * Displays full conversation history for a thread.
 */
export async function handleThread(args: CliArgs): Promise<CliResult> {
  const { options } = args;

  const threadId = options['thread-id'];
  if (!threadId) {
    return { success: false, output: 'Error: --thread-id is required', exitCode: 1 };
  }

  const hqRoot = options['hq-root'] ?? process.cwd();
  const tm = new ThreadManager(hqRoot);
  const thread = await tm.getThread(threadId);

  if (!thread) {
    return { success: false, output: `Error: Thread "${threadId}" not found.`, exitCode: 1 };
  }

  const participantCount = thread.participants.length;
  const messageCount = thread.messages.length;
  const lines: string[] = [
    `Thread ${threadId} (${thread.status}, ${messageCount} messages, ${participantCount} participants)\n`,
  ];

  thread.messages.forEach((msg, i) => {
    lines.push(`  [${i + 1}] ${msg.timestamp}  ${msg.from} -> ${msg.to}`);
    lines.push(`      Intent: ${msg.intent}`);
    lines.push(`      ${msg.body}`);
    if (msg.replyTo) {
      lines.push(`      In reply to: ${msg.replyTo}`);
    }
    lines.push('');
  });

  return { success: true, output: lines.join('\n'), exitCode: 0 };
}

/**
 * Handle the `share` sub-command.
 *
 * Reads files and sends them as inline attachments via a share-intent message.
 * Transport-agnostic: uses createTransport() to select the right transport
 * based on config. File content is inlined in the message body.
 */
export async function handleShare(args: CliArgs): Promise<CliResult> {
  const { options } = args;

  const to = options['to'];
  const filesArg = options['files'];
  const body = options['body'];

  if (!to) {
    return { success: false, output: 'Error: --to is required (e.g., --to alex/backend-dev)', exitCode: 1 };
  }
  if (!filesArg) {
    return { success: false, output: 'Error: --files is required (comma-separated file paths)', exitCode: 1 };
  }
  if (!body) {
    return { success: false, output: 'Error: --body is required (explanation of what is being shared)', exitCode: 1 };
  }

  // Read files and compose inline attachments
  const filePaths = filesArg.split(',').map((f) => f.trim());
  const attachmentParts: string[] = [body, ''];

  for (const filePath of filePaths) {
    const resolvedPath = resolve(filePath);
    let content: string;
    try {
      content = await readFile(resolvedPath, 'utf-8');
    } catch (err) {
      return {
        success: false,
        output: `Error: Cannot read file "${filePath}": ${(err as Error).message}`,
        exitCode: 1,
      };
    }

    // Determine language hint from extension
    const ext = filePath.split('.').pop() ?? '';
    const langMap: Record<string, string> = {
      ts: 'typescript',
      js: 'javascript',
      md: 'markdown',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      py: 'python',
      rs: 'rust',
      go: 'go',
    };
    const lang = langMap[ext] ?? '';

    attachmentParts.push(`\u{1F4CE} ${filePath}`);
    attachmentParts.push(`\`\`\`${lang}`);
    attachmentParts.push(content);
    attachmentParts.push('```');
    attachmentParts.push('');
  }

  const composedBody = attachmentParts.join('\n');

  // Load config
  const configResult = loadConfig(options['config']);
  if (!configResult.success) {
    const msgs = configResult.errors.map((e) => `  ${e.field}: ${e.message}`).join('\n');
    return { success: false, output: `Error loading HIAMP config:\n${msgs}`, exitCode: 1 };
  }

  const config = configResult.config;
  const transport = createTransport(config);

  const worker = options['worker'];
  const result = await transport.send({
    to,
    worker,
    intent: 'share',
    body: composedBody,
    attach: filesArg,
    ref: options['ref'],
    priority: options['priority'] as Priority | undefined,
  });

  if (!result.success) {
    return { success: false, output: `Error sharing files: ${result.error} (${result.code})`, exitCode: 1 };
  }

  const output = [
    'Files shared successfully.',
    `  Message ID: ${extractMessageId(result.messageText)}`,
    `  Thread ID:  ${result.thread}`,
    `  To:         ${to}`,
    `  Files:      ${filePaths.join(', ')}`,
    `  Channel:    ${result.channelId}`,
    `  Intent:     share`,
  ].join('\n');

  return { success: true, output, exitCode: 0 };
}

// ---------------------------------------------------------------------------
// Migration logic
// ---------------------------------------------------------------------------

/** Result of generating a migration config */
export interface MigrationResult {
  /** The generated Linear config section */
  linear: HiampLinearConfig;

  /** Warnings about mappings that could not be automated */
  warnings: string[];

  /** Summary of what was mapped */
  summary: string[];
}

/**
 * Generate a Linear config section by mapping an existing Slack config.
 *
 * This is the pure migration logic, separated from CLI concerns for testability.
 *
 * Mapping rules:
 * - slack.channels.dedicated -> linear.defaultTeam (uses defaultTeam override or 'ENG')
 * - slack.channels.contextual[] -> linear.teams[].projectMappings[]
 * - Identity (owner, instance-id) is preserved (not changed by this function)
 * - Worker permissions are preserved (not changed by this function)
 *
 * @param slackConfig - The existing Slack configuration section.
 * @param options - Override options for the migration.
 * @returns The migration result with the generated Linear config and diagnostics.
 */
export function generateMigrationConfig(
  slackConfig: HiampSlackConfig,
  options?: {
    /** Override the default team key. Default: 'ENG' */
    defaultTeam?: string;
    /** Environment variable name for the API key. Default: 'LINEAR_API_KEY' */
    apiKeyEnv?: string;
  },
): MigrationResult {
  const defaultTeam = options?.defaultTeam ?? 'ENG';
  const apiKeyEnv = options?.apiKeyEnv ?? 'LINEAR_API_KEY';

  const warnings: string[] = [];
  const summary: string[] = [];

  // Build teams from contextual channels
  const teamMap = new Map<string, HiampLinearTeamConfig>();

  // Ensure the default team always exists
  teamMap.set(defaultTeam, { key: defaultTeam });

  summary.push(`Default team: ${defaultTeam}`);

  // Map dedicated channel
  if (slackConfig.channels?.dedicated) {
    summary.push(
      `Mapped dedicated channel "${slackConfig.channels.dedicated.name}" -> default team "${defaultTeam}"`,
    );
  }

  // Map contextual channels to project mappings
  if (slackConfig.channels?.contextual) {
    for (const ctx of slackConfig.channels.contextual) {
      // Determine which team this context belongs to.
      // Use the default team since we cannot infer Linear team from Slack channel.
      const teamKey = defaultTeam;
      const team = teamMap.get(teamKey) ?? { key: teamKey };

      const mapping: HiampLinearProjectMapping = {
        context: ctx.context,
        projectId: 'TODO',
      };

      if (!team.projectMappings) {
        team.projectMappings = [];
      }
      team.projectMappings.push(mapping);
      teamMap.set(teamKey, team);

      summary.push(
        `Mapped contextual channel "${ctx.name}" (context: "${ctx.context}") -> ${teamKey} project mapping (project-id: TODO)`,
      );

      if (ctx.peers && ctx.peers.length > 0) {
        warnings.push(
          `Contextual channel "${ctx.name}" had peers [${ctx.peers.join(', ')}]. ` +
          `Linear routing is context-based, not peer-based. Peer associations were not migrated.`,
        );
      }
    }
  }

  // Warn about per-relationship channels
  if (slackConfig.channels?.perRelationship && slackConfig.channels.perRelationship.length > 0) {
    for (const rel of slackConfig.channels.perRelationship) {
      warnings.push(
        `Per-relationship channel "${rel.name}" (peer: ${rel.peer}) has no Linear equivalent. ` +
        `Linear uses context-based routing. Messages to ${rel.peer} will route via context or default team.`,
      );
    }
  }

  const teams = Array.from(teamMap.values());

  const linear: HiampLinearConfig = {
    apiKey: `$${apiKeyEnv}`,
    defaultTeam,
    teams,
  };

  return { linear, warnings, summary };
}

/**
 * Format a HiampConfig as YAML-like output for the migrate command.
 *
 * Produces a human-readable YAML representation of the migrated config.
 */
export function formatMigratedConfig(config: HiampConfig): string {
  const lines: string[] = [];

  // Transport
  lines.push(`transport: ${config.transport}`);
  lines.push('');

  // Identity
  lines.push('identity:');
  lines.push(`  owner: ${config.identity.owner}`);
  lines.push(`  instance-id: ${config.identity.instanceId}`);
  if (config.identity.displayName) {
    lines.push(`  display-name: "${config.identity.displayName}"`);
  }
  lines.push('');

  // Peers
  lines.push('peers:');
  for (const peer of config.peers) {
    lines.push(`  - owner: ${peer.owner}`);
    if (peer.displayName) {
      lines.push(`    display-name: "${peer.displayName}"`);
    }
    if (peer.slackBotId) {
      lines.push(`    slack-bot-id: ${peer.slackBotId}`);
    }
    lines.push(`    trust-level: ${peer.trustLevel}`);
    lines.push('    workers:');
    for (const w of peer.workers) {
      lines.push(`      - id: ${w.id}`);
      if (w.description) {
        lines.push(`        description: "${w.description}"`);
      }
      if (w.skills && w.skills.length > 0) {
        lines.push(`        skills: [${w.skills.join(', ')}]`);
      }
    }
    if (peer.notes) {
      lines.push(`    notes: "${peer.notes}"`);
    }
  }
  lines.push('');

  // Linear
  if (config.linear) {
    lines.push('linear:');
    lines.push(`  api-key: ${config.linear.apiKey}`);
    lines.push(`  default-team: ${config.linear.defaultTeam}`);
    if (config.linear.heartbeatIntervalMinutes !== undefined) {
      lines.push(`  heartbeat-interval-minutes: ${config.linear.heartbeatIntervalMinutes}`);
    }
    if (config.linear.cacheTtlMs !== undefined) {
      lines.push(`  cache-ttl-ms: ${config.linear.cacheTtlMs}`);
    }
    lines.push('  teams:');
    for (const team of config.linear.teams) {
      lines.push(`    - key: ${team.key}`);
      if (team.teamId) {
        lines.push(`      team-id: ${team.teamId}`);
      }
      if (team.projectMappings && team.projectMappings.length > 0) {
        lines.push('      project-mappings:');
        for (const pm of team.projectMappings) {
          lines.push(`        - context: "${pm.context}"`);
          lines.push(`          project-id: "${pm.projectId}"`);
          if (pm.issueId) {
            lines.push(`          issue-id: "${pm.issueId}"`);
          }
        }
      }
      if (team.agentCommsIssueId) {
        lines.push(`      agent-comms-issue-id: ${team.agentCommsIssueId}`);
      }
    }
    lines.push('');
  }

  // Worker permissions
  lines.push('worker-permissions:');
  lines.push(`  default: ${config.workerPermissions.default}`);
  lines.push('  workers:');
  for (const w of config.workerPermissions.workers) {
    lines.push(`    - id: ${w.id}`);
    lines.push(`      send: ${w.send}`);
    lines.push(`      receive: ${w.receive}`);
    if (w.allowedIntents) {
      lines.push(`      allowed-intents: [${w.allowedIntents.join(', ')}]`);
    }
    if (w.allowedPeers) {
      lines.push(`      allowed-peers: [${w.allowedPeers.map((p) => `"${p}"`).join(', ')}]`);
    }
  }
  lines.push('');

  // Settings (if present)
  if (config.settings) {
    lines.push('settings:');
    lines.push(`  ack-timeout: ${config.settings.ackTimeout}`);
    lines.push(`  max-retries: ${config.settings.maxRetries}`);
    lines.push(`  thread-idle-timeout: ${config.settings.threadIdleTimeout}`);
    lines.push(`  thread-max-age: ${config.settings.threadMaxAge}`);
    lines.push(`  inbox-path: ${config.settings.inboxPath}`);
    lines.push(`  thread-log-path: ${config.settings.threadLogPath}`);
    lines.push(`  message-max-length: ${config.settings.messageMaxLength}`);
    lines.push(`  attachment-max-inline-size: ${config.settings.attachmentMaxInlineSize}`);
    lines.push(`  enabled: ${config.settings.enabled}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Handle the `migrate` sub-command.
 *
 * Reads an existing Slack-based HIAMP config and generates a Linear-based config.
 * Preserves peer identities, worker permissions, and security settings.
 */
export async function handleMigrate(args: CliArgs): Promise<CliResult> {
  const { options } = args;

  const from = options['from'];
  const to = options['to'];

  if (!from) {
    return { success: false, output: 'Error: --from is required (e.g., --from slack)', exitCode: 1 };
  }
  if (!to) {
    return { success: false, output: 'Error: --to is required (e.g., --to linear)', exitCode: 1 };
  }

  if (from !== 'slack') {
    return {
      success: false,
      output: `Error: Migration from "${from}" is not supported. Only "slack" is supported as source.`,
      exitCode: 1,
    };
  }
  if (to !== 'linear') {
    return {
      success: false,
      output: `Error: Migration to "${to}" is not supported. Only "linear" is supported as target.`,
      exitCode: 1,
    };
  }

  // Load existing config
  const configResult = loadConfig(options['config']);
  if (!configResult.success) {
    const msgs = configResult.errors.map((e) => `  ${e.field}: ${e.message}`).join('\n');
    return { success: false, output: `Error loading HIAMP config:\n${msgs}`, exitCode: 1 };
  }

  const config = configResult.config;

  // Verify source config has Slack section
  if (!config.slack) {
    return {
      success: false,
      output: 'Error: The loaded config does not contain a "slack" section. Nothing to migrate from.',
      exitCode: 1,
    };
  }

  // Run migration logic
  const migration = generateMigrationConfig(config.slack, {
    defaultTeam: options['default-team'],
    apiKeyEnv: options['api-key-env'],
  });

  // Build the migrated config
  const migratedConfig: HiampConfig = {
    transport: 'linear',
    identity: config.identity,
    peers: config.peers,
    linear: migration.linear,
    // Keep slack section for rollback
    slack: config.slack,
    security: config.security,
    workerPermissions: config.workerPermissions,
    settings: config.settings,
  };

  // Format output
  const outputParts: string[] = [];

  outputParts.push('# HIAMP Migration: Slack -> Linear');
  outputParts.push('#');
  outputParts.push('# Generated by: hiamp migrate --from slack --to linear');
  outputParts.push(`# Date: ${new Date().toISOString().split('T')[0]}`);
  outputParts.push('#');

  if (migration.warnings.length > 0) {
    outputParts.push('# WARNINGS:');
    for (const w of migration.warnings) {
      outputParts.push(`#   - ${w}`);
    }
    outputParts.push('#');
  }

  outputParts.push('# SUMMARY:');
  for (const s of migration.summary) {
    outputParts.push(`#   - ${s}`);
  }
  outputParts.push('#');
  outputParts.push('# NOTE: Replace all project-id "TODO" values with actual Linear project UUIDs.');
  outputParts.push('# NOTE: The slack section is preserved for rollback. Remove it when migration is confirmed.');
  outputParts.push('');
  outputParts.push(formatMigratedConfig(migratedConfig));

  return { success: true, output: outputParts.join('\n'), exitCode: 0 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract message ID from a composed HIAMP message text.
 * Looks for `id:msg-{hex}` in the envelope footer.
 */
export function extractMessageId(messageText: string): string {
  const match = messageText.match(/id:(msg-[a-z0-9]+)/);
  return match?.[1] ?? 'unknown';
}

/** Display usage help */
function showHelp(): string {
  return [
    'HIAMP CLI — Inter-agent messaging',
    '',
    'Usage: hiamp <sub-command> [options]',
    '',
    'Sub-commands:',
    '  send     Send a message to a peer worker',
    '  inbox    Check unread messages',
    '  reply    Reply to a specific message',
    '  thread   View conversation history',
    '  share    Share files with a peer worker',
    '  migrate  Migrate config between transports',
    '',
    'Examples:',
    '  hiamp send --to alex/backend-dev --intent handoff --body "API is ready."',
    '  hiamp inbox --worker architect',
    '  hiamp reply --message-id msg-a1b2c3d4 --body "Acknowledged."',
    '  hiamp thread --thread-id thr-x1y2z3a4',
    '  hiamp share --to alex/backend-dev --files "api.md,auth.md" --body "Docs requested."',
    '  hiamp migrate --from slack --to linear --config config/hiamp.yaml',
    '',
    'Options:',
    '  --config <path>    HIAMP config file (default: $HIAMP_CONFIG_PATH)',
    '  --hq-root <path>   HQ root directory (default: cwd)',
    '  --worker <id>      Override sending worker identity',
    '  --help             Show this help',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/** Sub-command dispatch map */
const HANDLERS: Record<string, (args: CliArgs) => Promise<CliResult>> = {
  send: handleSend,
  inbox: handleInbox,
  reply: handleReply,
  thread: handleThread,
  share: handleShare,
  migrate: handleMigrate,
};

/**
 * Main CLI entry point. Parses arguments, dispatches to the appropriate
 * sub-command handler, and outputs the result.
 *
 * @param argv - Command-line arguments (without node and script path).
 * @returns The CLI result.
 */
export async function main(argv: string[]): Promise<CliResult> {
  const args = parseArgs(argv);

  if (!args.subcommand || args.subcommand === '--help' || args.flags.has('help')) {
    return { success: true, output: showHelp(), exitCode: 0 };
  }

  const handler = HANDLERS[args.subcommand];
  if (!handler) {
    return {
      success: false,
      output: `Error: Unknown sub-command "${args.subcommand}". Run with --help for usage.`,
      exitCode: 1,
    };
  }

  return handler(args);
}

// Run if called directly
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('cli.ts') || process.argv[1].endsWith('cli.js'));

if (isDirectRun) {
  main(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.output + '\n');
      process.exit(result.exitCode);
    })
    .catch((err) => {
      process.stderr.write(`Fatal error: ${(err as Error).message}\n`);
      process.exit(2);
    });
}
