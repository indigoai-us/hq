/**
 * HIAMP Configuration Loader
 *
 * Loads and validates HIAMP configuration from a YAML file.
 * Resolves secret references ($ENV_VAR) from environment variables at runtime.
 *
 * @module config-loader
 */

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Transport type selection */
export type TransportType = 'linear' | 'slack';

/** Trust levels for peers */
export type TrustLevel = 'open' | 'channel-scoped' | 'token-verified';

/** Channel strategies */
export type ChannelStrategy = 'dedicated' | 'dm' | 'per-relationship' | 'contextual';

/** Event mode for Slack */
export type EventMode = 'socket' | 'webhook';

/** HQ identity section */
export interface HiampIdentity {
  owner: string;
  instanceId: string;
  displayName?: string;
}

/** Remote worker entry */
export interface PeerWorker {
  id: string;
  description?: string;
  skills?: string[];
}

/** Peer entry */
export interface HiampPeer {
  owner: string;
  displayName?: string;
  slackBotId?: string;
  trustLevel: TrustLevel;
  workers: PeerWorker[];
  notes?: string;
}

/** Dedicated channel config */
export interface DedicatedChannel {
  name: string;
  id: string;
}

/** Per-relationship channel mapping */
export interface RelationshipChannel {
  peer: string;
  name: string;
  id: string;
}

/** Contextual channel mapping */
export interface ContextualChannel {
  context: string;
  name: string;
  id: string;
  peers: string[];
}

/** Channel mappings */
export interface ChannelConfig {
  dedicated?: DedicatedChannel;
  perRelationship?: RelationshipChannel[];
  contextual?: ContextualChannel[];
}

/** Slack integration section */
export interface HiampSlackConfig {
  botToken: string;
  appId: string;
  workspaceId: string;
  channelStrategy: ChannelStrategy;
  channels?: ChannelConfig;
  eventMode: EventMode;
  webhookUrl?: string | null;
  socketAppToken?: string;
}

/** Mapping from HIAMP context tag to a Linear project */
export interface HiampLinearProjectMapping {
  /** HIAMP context tag (e.g., "hq-cloud") */
  context: string;

  /** Linear project UUID */
  projectId: string;

  /** Optional: specific issue ID to route to for this project */
  issueId?: string;
}

/** Configuration for a single Linear team */
export interface HiampLinearTeamConfig {
  /** Linear team key (e.g., "ENG") */
  key: string;

  /** Team UUID (resolved and cached at runtime if not provided) */
  teamId?: string;

  /** Mappings from HIAMP context tags to Linear projects */
  projectMappings?: HiampLinearProjectMapping[];

  /** Optional: explicit issue ID for the team's agent-comms fallback */
  agentCommsIssueId?: string;
}

/** Linear integration section */
export interface HiampLinearConfig {
  /** Linear API key (env var reference, e.g., $LINEAR_API_KEY) */
  apiKey: string;

  /** Default team key when no context matches */
  defaultTeam: string;

  /** Team configurations */
  teams: HiampLinearTeamConfig[];

  /** Heartbeat poll interval in minutes. Default: 5 */
  heartbeatIntervalMinutes?: number;

  /** Cache TTL in milliseconds for resolver lookups. Default: 300000 (5 min) */
  cacheTtlMs?: number;

  /** Linear issue IDs to watch immediately */
  watchedQueries?: string[];
}

/** Rate limiting config */
export interface RateLimitingConfig {
  maxMessagesPerMinute: number;
  maxMessagesPerMinuteGlobal: number;
}

/** Audit config */
export interface AuditConfig {
  enabled: boolean;
  logPath: string;
  retentionDays: number;
}

/** Token shared secret entry */
export interface SharedSecret {
  peer: string;
  secret: string;
}

/** Token config */
export interface TokenConfig {
  signingAlgorithm: string;
  defaultTtl: number;
  sharedSecrets?: SharedSecret[];
  revocationList?: string[];
}

/** Security section */
export interface HiampSecurityConfig {
  defaultTrustLevel: TrustLevel;
  killSwitch: boolean;
  audit?: AuditConfig;
  tokens?: TokenConfig;
  rateLimiting?: RateLimitingConfig;
}

/** Worker permission entry */
export interface WorkerPermission {
  id: string;
  send: boolean;
  receive: boolean;
  allowedIntents?: string[];
  allowedPeers?: string[];
}

/** Worker permissions section */
export interface WorkerPermissionsConfig {
  default: 'deny' | 'allow';
  workers: WorkerPermission[];
}

/** Operational settings */
export interface HiampSettings {
  ackTimeout: number;
  maxRetries: number;
  threadIdleTimeout: number;
  threadMaxAge: number;
  inboxPath: string;
  threadLogPath: string;
  messageMaxLength: number;
  attachmentMaxInlineSize: number;
  enabled: boolean;
}

/** Complete HIAMP configuration */
export interface HiampConfig {
  /** Transport type: 'linear' or 'slack'. Default: 'linear' */
  transport: TransportType;
  identity: HiampIdentity;
  peers: HiampPeer[];
  /** Slack config. Required when transport is 'slack', optional when 'linear'. */
  slack?: HiampSlackConfig;
  /** Linear config. Required when transport is 'linear'. */
  linear?: HiampLinearConfig;
  security?: HiampSecurityConfig;
  workerPermissions: WorkerPermissionsConfig;
  settings?: HiampSettings;
}

/** Validation error from config loading */
export interface ConfigValidationError {
  field: string;
  message: string;
}

/** Result of loading config */
export type ConfigLoadResult =
  | { success: true; config: HiampConfig }
  | { success: false; errors: ConfigValidationError[] };

// ---------------------------------------------------------------------------
// Environment variable resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a value that may be an environment variable reference.
 * If the value starts with `$`, look up the rest as an env var name.
 * Returns the resolved value or undefined if the env var is not set.
 */
export function resolveEnvRef(value: string): string | undefined {
  if (value.startsWith('$')) {
    const envName = value.slice(1);
    return process.env[envName];
  }
  return value;
}

// ---------------------------------------------------------------------------
// Internal: raw YAML shape (kebab-case keys)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
interface RawConfig {
  transport?: string;
  identity?: any;
  peers?: any[];
  slack?: any;
  linear?: any;
  security?: any;
  'worker-permissions'?: any;
  settings?: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const OWNER_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const TRANSPORT_TYPES: TransportType[] = ['linear', 'slack'];
const CHANNEL_STRATEGIES: ChannelStrategy[] = ['dedicated', 'dm', 'per-relationship', 'contextual'];
const TRUST_LEVELS: TrustLevel[] = ['open', 'channel-scoped', 'token-verified'];

function validateRequired(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  fields: string[],
  prefix: string,
  errors: ConfigValidationError[],
): boolean {
  let valid = true;
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null) {
      errors.push({ field: `${prefix}.${f}`, message: `Required field '${f}' is missing` });
      valid = false;
    }
  }
  return valid;
}

// ---------------------------------------------------------------------------
// Transform raw YAML to typed config
// ---------------------------------------------------------------------------

function transformConfig(raw: RawConfig, errors: ConfigValidationError[]): HiampConfig | null {
  // --- transport ---
  // If explicit transport is set, validate it. Otherwise infer from presence of sections:
  // - If linear: section present -> linear
  // - If only slack: section present -> slack (backward compatibility)
  // - Default: linear
  let transport: TransportType;
  if (raw.transport) {
    if (!TRANSPORT_TYPES.includes(raw.transport as TransportType)) {
      errors.push({
        field: 'transport',
        message: `Invalid transport type: "${raw.transport}". Must be one of: ${TRANSPORT_TYPES.join(', ')}`,
      });
    }
    transport = raw.transport as TransportType;
  } else if (raw.linear) {
    transport = 'linear';
  } else if (raw.slack) {
    transport = 'slack';
  } else {
    transport = 'linear';
  }

  // --- identity ---
  if (!raw.identity) {
    errors.push({ field: 'identity', message: 'Required section "identity" is missing' });
    return null;
  }
  if (!validateRequired(raw.identity, ['owner', 'instance-id'], 'identity', errors)) {
    return null;
  }
  if (!OWNER_PATTERN.test(raw.identity.owner)) {
    errors.push({ field: 'identity.owner', message: 'Owner must match [a-z0-9][a-z0-9-]*[a-z0-9]' });
  }
  if (!INSTANCE_ID_PATTERN.test(raw.identity['instance-id'])) {
    errors.push({ field: 'identity.instance-id', message: 'Instance ID must match [a-z0-9][a-z0-9-]*[a-z0-9]' });
  }

  const identity: HiampIdentity = {
    owner: raw.identity.owner,
    instanceId: raw.identity['instance-id'],
    displayName: raw.identity['display-name'],
  };

  // --- peers ---
  if (!raw.peers || !Array.isArray(raw.peers)) {
    errors.push({ field: 'peers', message: 'Required section "peers" is missing or not an array' });
    return null;
  }
  const peers: HiampPeer[] = raw.peers.map((p, i) => {
    const prefix = `peers[${i}]`;
    validateRequired(p, ['owner', 'trust-level', 'workers'], prefix, errors);
    if (p['trust-level'] && !TRUST_LEVELS.includes(p['trust-level'])) {
      errors.push({ field: `${prefix}.trust-level`, message: `Invalid trust level: ${p['trust-level']}` });
    }
    return {
      owner: p.owner,
      displayName: p['display-name'],
      slackBotId: p['slack-bot-id'],
      trustLevel: p['trust-level'] as TrustLevel,
      workers: (p.workers ?? []).map((w: { id: string; description?: string; skills?: string[] }) => ({
        id: w.id,
        description: w.description,
        skills: w.skills,
      })),
      notes: p.notes,
    };
  });

  // --- slack (required for 'slack' transport, optional for 'linear') ---
  let slack: HiampSlackConfig | undefined;
  if (transport === 'slack' && !raw.slack) {
    errors.push({ field: 'slack', message: 'Required section "slack" is missing (required when transport is "slack")' });
    return null;
  }
  if (raw.slack) {
    validateRequired(raw.slack, ['bot-token', 'app-id', 'workspace-id', 'channel-strategy', 'event-mode'], 'slack', errors);

    if (raw.slack['channel-strategy'] && !CHANNEL_STRATEGIES.includes(raw.slack['channel-strategy'])) {
      errors.push({
        field: 'slack.channel-strategy',
        message: `Invalid channel strategy: ${raw.slack['channel-strategy']}`,
      });
    }

    // Resolve bot token from env
    const rawBotToken: string = raw.slack['bot-token'] ?? '';
    const resolvedBotToken = resolveEnvRef(rawBotToken);

    const channels: ChannelConfig = {};
    if (raw.slack.channels) {
      const ch = raw.slack.channels;
      if (ch.dedicated) {
        channels.dedicated = { name: ch.dedicated.name, id: ch.dedicated.id };
      }
      if (ch['per-relationship']) {
        channels.perRelationship = ch['per-relationship'].map(
          (r: { peer: string; name: string; id: string }) => ({
            peer: r.peer,
            name: r.name,
            id: r.id,
          }),
        );
      }
      if (ch.contextual) {
        channels.contextual = ch.contextual.map(
          (c: { context: string; name: string; id: string; peers: string[] }) => ({
            context: c.context,
            name: c.name,
            id: c.id,
            peers: c.peers,
          }),
        );
      }
    }

    slack = {
      botToken: resolvedBotToken ?? rawBotToken,
      appId: raw.slack['app-id'],
      workspaceId: raw.slack['workspace-id'],
      channelStrategy: raw.slack['channel-strategy'] as ChannelStrategy,
      channels,
      eventMode: raw.slack['event-mode'] as EventMode,
      webhookUrl: raw.slack['webhook-url'] ?? null,
      socketAppToken: raw.slack['socket-app-token']
        ? resolveEnvRef(raw.slack['socket-app-token'])
        : undefined,
    };
  }

  // --- linear (required for 'linear' transport, optional for 'slack') ---
  let linear: HiampLinearConfig | undefined;
  if (transport === 'linear' && !raw.linear) {
    errors.push({ field: 'linear', message: 'Required section "linear" is missing (required when transport is "linear")' });
    return null;
  }
  if (raw.linear) {
    // Validate required Linear fields
    if (!raw.linear['api-key'] && !raw.linear.apiKey) {
      errors.push({ field: 'linear.api-key', message: 'Required field "api-key" is missing in linear section' });
    }
    if (!raw.linear['default-team'] && !raw.linear.defaultTeam) {
      errors.push({ field: 'linear.default-team', message: 'Required field "default-team" is missing in linear section' });
    }
    if (!raw.linear.teams || !Array.isArray(raw.linear.teams) || raw.linear.teams.length === 0) {
      errors.push({ field: 'linear.teams', message: 'Required field "teams" is missing or empty in linear section' });
    }

    // Validate team entries
    const rawTeams = raw.linear.teams ?? [];
    for (let i = 0; i < rawTeams.length; i++) {
      const t = rawTeams[i];
      if (!t.key) {
        errors.push({ field: `linear.teams[${i}].key`, message: 'Required field "key" is missing in team entry' });
      }
      // Validate project mappings if present
      if (t['project-mappings'] && Array.isArray(t['project-mappings'])) {
        for (let j = 0; j < t['project-mappings'].length; j++) {
          const pm = t['project-mappings'][j];
          if (!pm.context) {
            errors.push({ field: `linear.teams[${i}].project-mappings[${j}].context`, message: 'Required field "context" is missing in project mapping' });
          }
          if (!pm['project-id'] && !pm.projectId) {
            errors.push({ field: `linear.teams[${i}].project-mappings[${j}].project-id`, message: 'Required field "project-id" is missing in project mapping' });
          }
        }
      }
    }

    // Resolve API key from env
    const rawApiKey: string = raw.linear['api-key'] ?? raw.linear.apiKey ?? '';
    const resolvedApiKey = resolveEnvRef(rawApiKey);

    // Verify default team is listed in teams
    const defaultTeamKey: string = raw.linear['default-team'] ?? raw.linear.defaultTeam ?? '';
    if (defaultTeamKey && rawTeams.length > 0) {
      const hasDefaultTeam = rawTeams.some((t: { key: string }) => t.key === defaultTeamKey);
      if (!hasDefaultTeam) {
        errors.push({
          field: 'linear.default-team',
          message: `Default team "${defaultTeamKey}" is not listed in linear.teams`,
        });
      }
    }

    // Transform teams
    const teams: HiampLinearTeamConfig[] = rawTeams.map(
      (t: {
        key: string;
        'team-id'?: string;
        teamId?: string;
        'project-mappings'?: Array<{
          context: string;
          'project-id'?: string;
          projectId?: string;
          'issue-id'?: string;
          issueId?: string;
        }>;
        'agent-comms-issue-id'?: string;
        agentCommsIssueId?: string;
      }) => {
        const teamConfig: HiampLinearTeamConfig = {
          key: t.key,
          teamId: t['team-id'] ?? t.teamId,
          agentCommsIssueId: t['agent-comms-issue-id'] ?? t.agentCommsIssueId,
        };
        if (t['project-mappings'] && Array.isArray(t['project-mappings'])) {
          teamConfig.projectMappings = t['project-mappings'].map((pm) => ({
            context: pm.context,
            projectId: pm['project-id'] ?? pm.projectId ?? '',
            issueId: pm['issue-id'] ?? pm.issueId,
          }));
        }
        return teamConfig;
      },
    );

    linear = {
      apiKey: resolvedApiKey ?? rawApiKey,
      defaultTeam: defaultTeamKey,
      teams,
      heartbeatIntervalMinutes: raw.linear['heartbeat-interval-minutes'] ?? raw.linear.heartbeatIntervalMinutes,
      cacheTtlMs: raw.linear['cache-ttl-ms'] ?? raw.linear.cacheTtlMs,
      watchedQueries: raw.linear['watched-queries'] ?? raw.linear.watchedQueries,
    };
  }

  // --- security ---
  let security: HiampSecurityConfig | undefined;
  if (raw.security) {
    const sec = raw.security;
    security = {
      defaultTrustLevel: (sec['default-trust-level'] ?? 'channel-scoped') as TrustLevel,
      killSwitch: sec['kill-switch'] ?? false,
    };
    if (sec.audit) {
      security.audit = {
        enabled: sec.audit.enabled ?? true,
        logPath: sec.audit['log-path'] ?? 'workspace/audit/hiamp/',
        retentionDays: sec.audit['retention-days'] ?? 30,
      };
    }
    if (sec.tokens) {
      security.tokens = {
        signingAlgorithm: sec.tokens['signing-algorithm'] ?? 'HS256',
        defaultTtl: sec.tokens['default-ttl'] ?? 86400,
        sharedSecrets: sec.tokens['shared-secrets']?.map(
          (s: { peer: string; secret: string }) => ({
            peer: s.peer,
            secret: resolveEnvRef(s.secret) ?? s.secret,
          }),
        ),
        revocationList: sec.tokens['revocation-list'] ?? [],
      };
    }
    if (sec['rate-limiting']) {
      security.rateLimiting = {
        maxMessagesPerMinute: sec['rate-limiting']['max-messages-per-minute'] ?? 30,
        maxMessagesPerMinuteGlobal: sec['rate-limiting']['max-messages-per-minute-global'] ?? 100,
      };
    }
  }

  // --- worker-permissions ---
  const rawWp = raw['worker-permissions'];
  if (!rawWp) {
    errors.push({ field: 'worker-permissions', message: 'Required section "worker-permissions" is missing' });
    return null;
  }
  const workerPermissions: WorkerPermissionsConfig = {
    default: rawWp.default ?? 'deny',
    workers: (rawWp.workers ?? []).map(
      (w: {
        id: string;
        send?: boolean;
        receive?: boolean;
        'allowed-intents'?: string[];
        'allowed-peers'?: string[];
      }) => ({
        id: w.id,
        send: w.send ?? false,
        receive: w.receive ?? false,
        allowedIntents: w['allowed-intents'],
        allowedPeers: w['allowed-peers'],
      }),
    ),
  };

  // --- settings ---
  let settings: HiampSettings | undefined;
  if (raw.settings) {
    const s = raw.settings;
    settings = {
      ackTimeout: s['ack-timeout'] ?? 300,
      maxRetries: s['max-retries'] ?? 1,
      threadIdleTimeout: s['thread-idle-timeout'] ?? 86400,
      threadMaxAge: s['thread-max-age'] ?? 604800,
      inboxPath: s['inbox-path'] ?? 'workspace/inbox/',
      threadLogPath: s['thread-log-path'] ?? 'workspace/threads/hiamp/',
      messageMaxLength: s['message-max-length'] ?? 4000,
      attachmentMaxInlineSize: s['attachment-max-inline-size'] ?? 4000,
      enabled: s.enabled ?? true,
    };
  }

  if (errors.length > 0) {
    return null;
  }

  return {
    transport,
    identity,
    peers,
    slack,
    linear,
    security,
    workerPermissions,
    settings,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load HIAMP configuration from a YAML file path.
 *
 * Reads the file, parses YAML, validates required fields,
 * resolves environment variable references, and returns a typed config.
 *
 * @param filePath - Absolute path to the hiamp.yaml file.
 *   Also supports the `HIAMP_CONFIG_PATH` env var override.
 * @returns A ConfigLoadResult indicating success or failure with errors.
 */
export function loadConfig(filePath?: string): ConfigLoadResult {
  const resolvedPath = filePath ?? process.env['HIAMP_CONFIG_PATH'];
  if (!resolvedPath) {
    return {
      success: false,
      errors: [{ field: 'filePath', message: 'No config file path provided and HIAMP_CONFIG_PATH is not set' }],
    };
  }

  let rawYaml: string;
  try {
    rawYaml = readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    return {
      success: false,
      errors: [{ field: 'filePath', message: `Failed to read config file: ${(err as Error).message}` }],
    };
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(rawYaml);
  } catch (err) {
    return {
      success: false,
      errors: [{ field: 'yaml', message: `Failed to parse YAML: ${(err as Error).message}` }],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      errors: [{ field: 'yaml', message: 'Config file is empty or not a valid YAML object' }],
    };
  }

  const errors: ConfigValidationError[] = [];
  const config = transformConfig(parsed as RawConfig, errors);

  if (!config || errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, config };
}

/**
 * Load HIAMP configuration from a YAML string (useful for testing).
 *
 * @param yamlContent - Raw YAML string.
 * @returns A ConfigLoadResult.
 */
export function loadConfigFromString(yamlContent: string): ConfigLoadResult {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch (err) {
    return {
      success: false,
      errors: [{ field: 'yaml', message: `Failed to parse YAML: ${(err as Error).message}` }],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      errors: [{ field: 'yaml', message: 'YAML content is empty or not a valid object' }],
    };
  }

  const errors: ConfigValidationError[] = [];
  const config = transformConfig(parsed as RawConfig, errors);

  if (!config || errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, config };
}
