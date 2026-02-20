/**
 * HIAMP Linear Channel Resolver
 *
 * Resolves the target Linear issue for an outgoing HIAMP message
 * based on org/project-aware routing strategies.
 *
 * Three resolution strategies (tried in order):
 * 1. **Explicit issue ID** — message metadata contains a Linear issue identifier
 * 2. **Project context** — match HIAMP context tag to a Linear project via team config
 * 3. **Fallback agent-comms** — dedicated "agent-comms" issue per team
 *
 * Auto-creates issues for new threads when no existing issue matches.
 * Caches team/project lookups with a configurable TTL (default 5 min).
 *
 * Config via hiamp.yaml `linear.teams[]` section:
 * ```yaml
 * linear:
 *   apiKey: $LINEAR_API_KEY
 *   defaultTeam: ENG
 *   teams:
 *     - key: ENG
 *       projectMappings:
 *         - context: hq-cloud
 *           projectId: proj-uuid-1
 *         - context: hq-docs
 *           projectId: proj-uuid-2
 *       agentCommsIssueId: ENG-999   # optional, auto-created if missing
 * ```
 *
 * @module linear-channel-resolver
 */

import type { LinearClient, LinearIssue } from './linear-client.js';
import type {
  TransportResolveInput,
  TransportResolveResult,
} from './transport.js';

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

/** Mapping from HIAMP context tag to a Linear project ID */
export interface LinearProjectMapping {
  /** HIAMP context tag (e.g., "hq-cloud") */
  context: string;

  /** Linear project UUID */
  projectId: string;

  /** Optional: specific issue ID to route to for this project */
  issueId?: string;
}

/** Configuration for a single Linear team */
export interface LinearTeamConfig {
  /** Linear team key (e.g., "ENG") */
  key: string;

  /** Team UUID (resolved and cached at runtime if not provided) */
  teamId?: string;

  /** Mappings from HIAMP context tags to Linear projects */
  projectMappings?: LinearProjectMapping[];

  /** Optional: explicit issue ID for the team's agent-comms fallback */
  agentCommsIssueId?: string;
}

/** Top-level Linear configuration in hiamp.yaml */
export interface LinearResolverConfig {
  /** The default team key to use when no context matches */
  defaultTeam: string;

  /** Team configurations */
  teams: LinearTeamConfig[];

  /** Cache TTL in milliseconds. Default: 300000 (5 minutes) */
  cacheTtlMs?: number;
}

// ---------------------------------------------------------------------------
// Cache types
// ---------------------------------------------------------------------------

/** A cached value with expiry timestamp */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Resolution result types (internal, more specific than Transport interface)
// ---------------------------------------------------------------------------

/** Successful Linear channel resolution */
export interface LinearResolveSuccess {
  success: true;

  /** The Linear issue ID (UUID) — this is the "channel" for Linear transport */
  issueId: string;

  /** The human-readable issue identifier (e.g., "ENG-123") */
  issueIdentifier: string;

  /** Which strategy was used */
  strategy: 'explicit' | 'project-context' | 'agent-comms';

  /** The team key */
  teamKey: string;
}

/** Failed Linear channel resolution */
export interface LinearResolveFailure {
  success: false;

  /** Human-readable error message */
  error: string;

  /** Error code */
  code:
    | 'NO_CONFIG'
    | 'UNKNOWN_TEAM'
    | 'NO_CONTEXT_MATCH'
    | 'ISSUE_NOT_FOUND'
    | 'ISSUE_CREATE_FAILED'
    | 'API_ERROR';
}

/** Result of Linear channel resolution */
export type LinearResolveResult = LinearResolveSuccess | LinearResolveFailure;

// ---------------------------------------------------------------------------
// LinearChannelResolver class
// ---------------------------------------------------------------------------

/**
 * Resolves Linear issues for outgoing HIAMP messages.
 *
 * Maps HIAMP peer/context to the correct Linear team, project, and issue.
 * Caches lookups to minimize API calls (configurable TTL, default 5 minutes).
 *
 * @example
 * ```ts
 * const resolver = new LinearChannelResolver(linearClient, {
 *   defaultTeam: 'ENG',
 *   teams: [
 *     {
 *       key: 'ENG',
 *       projectMappings: [
 *         { context: 'hq-cloud', projectId: 'proj-uuid-1' },
 *       ],
 *     },
 *   ],
 * });
 *
 * // Resolve by context
 * const result = await resolver.resolve({
 *   targetPeerOwner: 'alex',
 *   context: 'hq-cloud',
 * });
 *
 * // Resolve with explicit issue
 * const explicit = await resolver.resolve({
 *   targetPeerOwner: 'alex',
 *   channelId: 'ENG-123',
 * });
 * ```
 */
export class LinearChannelResolver {
  private readonly client: LinearClient;
  private readonly config: LinearResolverConfig;
  private readonly cacheTtlMs: number;

  /** Cache: team key -> team UUID */
  private readonly teamIdCache = new Map<string, CacheEntry<string>>();

  /** Cache: issue identifier -> LinearIssue */
  private readonly issueCache = new Map<string, CacheEntry<LinearIssue>>();

  /** Cache: team key -> agent-comms issue ID */
  private readonly agentCommsCache = new Map<string, CacheEntry<string>>();

  /**
   * @param client - An initialized LinearClient instance.
   * @param config - Linear resolver configuration from hiamp.yaml.
   */
  constructor(client: LinearClient, config: LinearResolverConfig) {
    this.client = client;
    this.config = config;
    this.cacheTtlMs = config.cacheTtlMs ?? 300_000; // 5 minutes
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Resolve the target Linear issue for an outgoing HIAMP message.
   *
   * Resolution algorithm (tried in order):
   * 1. If explicit channelId is provided, look it up as an issue identifier.
   * 2. If context is provided, match against team projectMappings.
   * 3. Fall back to the team's dedicated agent-comms issue.
   *
   * @param input - The resolution input from the Transport interface.
   * @returns The resolved issue or an error.
   */
  async resolve(input: TransportResolveInput): Promise<LinearResolveResult> {
    // Strategy 1: Explicit issue ID in channelId
    if (input.channelId) {
      return this.resolveExplicit(input.channelId);
    }

    // Strategy 2: Project context matching
    if (input.context) {
      const contextResult = await this.resolveByProjectContext(input.context);
      if (contextResult.success) {
        return contextResult;
      }
      // If context resolution fails, fall through to agent-comms
    }

    // Strategy 3: Fallback to agent-comms issue
    return this.resolveAgentComms();
  }

  /**
   * Adapt the internal resolution result to the Transport interface format.
   *
   * This is a convenience method for use inside a LinearTransport that
   * needs to return a TransportResolveResult.
   *
   * @param input - The TransportResolveInput.
   * @returns A TransportResolveResult.
   */
  async resolveChannel(input: TransportResolveInput): Promise<TransportResolveResult> {
    const result = await this.resolve(input);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        code: result.code,
      };
    }

    return {
      success: true,
      channelId: result.issueId,
      channelName: result.issueIdentifier,
    };
  }

  /**
   * Clear all cached data.
   * Useful for testing or when config changes at runtime.
   */
  clearCache(): void {
    this.teamIdCache.clear();
    this.issueCache.clear();
    this.agentCommsCache.clear();
  }

  /**
   * Get the current number of cached entries (for testing).
   */
  getCacheSize(): { teams: number; issues: number; agentComms: number } {
    return {
      teams: this.teamIdCache.size,
      issues: this.issueCache.size,
      agentComms: this.agentCommsCache.size,
    };
  }

  // -------------------------------------------------------------------------
  // Strategy 1: Explicit issue ID
  // -------------------------------------------------------------------------

  /**
   * Resolve by explicit issue identifier (e.g., "ENG-123" or UUID).
   */
  private async resolveExplicit(issueIdentifier: string): Promise<LinearResolveResult> {
    // Check cache first
    const cached = this.getCached(this.issueCache, issueIdentifier);
    if (cached) {
      return {
        success: true,
        issueId: cached.id,
        issueIdentifier: cached.identifier,
        strategy: 'explicit',
        teamKey: cached.team?.key ?? this.config.defaultTeam,
      };
    }

    // Look up the issue
    const result = await this.client.getIssue(issueIdentifier);
    if (!result.success) {
      if (result.code === 'NOT_FOUND') {
        return {
          success: false,
          error: `Issue not found: ${issueIdentifier}`,
          code: 'ISSUE_NOT_FOUND',
        };
      }
      return {
        success: false,
        error: `Failed to look up issue ${issueIdentifier}: ${result.error}`,
        code: 'API_ERROR',
      };
    }

    const issue = result.data;

    // Cache the issue
    this.setCache(this.issueCache, issueIdentifier, issue);
    // Also cache by UUID if the identifier was human-readable
    if (issueIdentifier !== issue.id) {
      this.setCache(this.issueCache, issue.id, issue);
    }

    return {
      success: true,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      strategy: 'explicit',
      teamKey: issue.team?.key ?? this.config.defaultTeam,
    };
  }

  // -------------------------------------------------------------------------
  // Strategy 2: Project context matching
  // -------------------------------------------------------------------------

  /**
   * Resolve by matching HIAMP context tag to a Linear project via team config.
   */
  private async resolveByProjectContext(context: string): Promise<LinearResolveResult> {
    // Search all teams for a matching project mapping
    for (const teamConfig of this.config.teams) {
      const mapping = teamConfig.projectMappings?.find((m) => m.context === context);
      if (!mapping) continue;

      // If the mapping has a specific issue ID, resolve it explicitly
      if (mapping.issueId) {
        return this.resolveExplicit(mapping.issueId);
      }

      // Otherwise, search for an existing agent-comms issue in this project
      // or create one for the thread
      const teamKey = teamConfig.key;
      const cacheKey = `project:${teamKey}:${context}`;

      const cached = this.getCached(this.issueCache, cacheKey);
      if (cached) {
        return {
          success: true,
          issueId: cached.id,
          issueIdentifier: cached.identifier,
          strategy: 'project-context',
          teamKey,
        };
      }

      // Search for an existing HIAMP issue in this team with the context tag
      const searchResult = await this.client.searchIssues(
        `[HIAMP] ${context}`,
        { teamKeys: [teamKey], first: 1 },
      );

      if (searchResult.success && searchResult.data.nodes.length > 0) {
        const issue = searchResult.data.nodes[0]!;
        this.setCache(this.issueCache, cacheKey, issue);
        return {
          success: true,
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          strategy: 'project-context',
          teamKey,
        };
      }

      // No existing issue — create one for this context
      const teamId = await this.resolveTeamId(teamKey);
      if (!teamId) {
        return {
          success: false,
          error: `Team not found: ${teamKey}`,
          code: 'UNKNOWN_TEAM',
        };
      }

      const createResult = await this.createAgentIssue(teamId, `[HIAMP] ${context}`, context);
      if (!createResult.success) {
        return createResult;
      }

      // Cache the newly created issue
      this.setCache(this.issueCache, cacheKey, {
        id: createResult.issueId,
        identifier: createResult.issueIdentifier,
        title: `[HIAMP] ${context}`,
        description: null,
        state: null,
        assignee: null,
        team: { id: teamId, key: teamKey, name: teamKey },
        priority: 0,
        url: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return createResult;
    }

    // No mapping found for this context
    return {
      success: false,
      error: `No project mapping found for context "${context}"`,
      code: 'NO_CONTEXT_MATCH',
    };
  }

  // -------------------------------------------------------------------------
  // Strategy 3: Agent-comms fallback
  // -------------------------------------------------------------------------

  /**
   * Resolve the fallback agent-comms issue for the default team.
   */
  private async resolveAgentComms(): Promise<LinearResolveResult> {
    const defaultTeamConfig = this.config.teams.find(
      (t) => t.key === this.config.defaultTeam,
    );

    if (!defaultTeamConfig) {
      return {
        success: false,
        error: `Default team "${this.config.defaultTeam}" not found in config`,
        code: 'UNKNOWN_TEAM',
      };
    }

    const teamKey = defaultTeamConfig.key;

    // If an explicit agent-comms issue ID is configured, use it
    if (defaultTeamConfig.agentCommsIssueId) {
      return this.resolveExplicit(defaultTeamConfig.agentCommsIssueId);
    }

    // Check cache for previously resolved/created agent-comms issue
    const cachedId = this.getCached(this.agentCommsCache, teamKey);
    if (cachedId) {
      // We have the issue ID, but need the identifier for the result.
      // Check if we have it in the issue cache too.
      const cachedIssue = this.getCached(this.issueCache, `agent-comms:${teamKey}`);
      if (cachedIssue) {
        return {
          success: true,
          issueId: cachedIssue.id,
          issueIdentifier: cachedIssue.identifier,
          strategy: 'agent-comms',
          teamKey,
        };
      }
    }

    // Search for an existing agent-comms issue
    const searchResult = await this.client.searchIssues(
      '[HIAMP] Agent Communications',
      { teamKeys: [teamKey], first: 1 },
    );

    if (searchResult.success && searchResult.data.nodes.length > 0) {
      const issue = searchResult.data.nodes[0]!;
      this.setCache(this.agentCommsCache, teamKey, issue.id);
      this.setCache(this.issueCache, `agent-comms:${teamKey}`, issue);
      return {
        success: true,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        strategy: 'agent-comms',
        teamKey,
      };
    }

    // No existing agent-comms issue — create one
    const teamId = await this.resolveTeamId(teamKey);
    if (!teamId) {
      return {
        success: false,
        error: `Team not found: ${teamKey}`,
        code: 'UNKNOWN_TEAM',
      };
    }

    const createResult = await this.createAgentIssue(
      teamId,
      '[HIAMP] Agent Communications',
      'agent-comms',
    );

    if (!createResult.success) {
      return createResult;
    }

    // Cache the newly created issue
    this.setCache(this.agentCommsCache, teamKey, createResult.issueId);
    this.setCache(this.issueCache, `agent-comms:${teamKey}`, {
      id: createResult.issueId,
      identifier: createResult.issueIdentifier,
      title: '[HIAMP] Agent Communications',
      description: null,
      state: null,
      assignee: null,
      team: { id: teamId, key: teamKey, name: teamKey },
      priority: 0,
      url: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return createResult;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve a team key to a team UUID, using cache.
   */
  private async resolveTeamId(teamKey: string): Promise<string | null> {
    // Check config first (static team ID)
    const teamConfig = this.config.teams.find((t) => t.key === teamKey);
    if (teamConfig?.teamId) {
      return teamConfig.teamId;
    }

    // Check cache
    const cached = this.getCached(this.teamIdCache, teamKey);
    if (cached) {
      return cached;
    }

    // Look up from API
    const result = await this.client.getTeams({ first: 100 });
    if (!result.success) {
      return null;
    }

    // Cache all teams from the response
    for (const team of result.data.nodes) {
      this.setCache(this.teamIdCache, team.key, team.id);
    }

    // Return the one we need
    const match = result.data.nodes.find((t) => t.key === teamKey);
    return match?.id ?? null;
  }

  /**
   * Create a new Linear issue for HIAMP agent communications.
   */
  private async createAgentIssue(
    teamId: string,
    title: string,
    contextTag: string,
  ): Promise<LinearResolveResult> {
    // We use searchIssues + createComment pattern from the LinearClient,
    // but for creating issues we need a raw GraphQL mutation.
    // Since LinearClient doesn't have createIssue yet, we do it through
    // the create-comment flow: search for it, and if not found,
    // we need to indicate the issue needs to be created.
    //
    // For now, we use a workaround: create via the client's internal API.
    // The LinearClient will gain a createIssue method in US-004.
    //
    // IMPLEMENTATION NOTE: We call the createIssue helper which uses
    // the LinearClient's underlying API. This is injected via the
    // createIssueFn constructor option for testability.
    const result = await this.createIssueFn(teamId, title, contextTag);
    return result;
  }

  /**
   * Default issue creation function.
   * This is a method so it can be overridden in tests or replaced
   * when LinearClient gains a native createIssue method.
   */
  protected createIssueFn: (
    teamId: string,
    title: string,
    contextTag: string,
  ) => Promise<LinearResolveResult> = async (_teamId, title, _contextTag) => {
    // Without a createIssue API in LinearClient, we return an error.
    // In practice, the LinearTransport (US-006) will inject a real
    // implementation or LinearClient will be extended.
    return {
      success: false,
      error: `Cannot auto-create issue "${title}": createIssue not available. Configure an explicit agentCommsIssueId or issue ID in project mappings.`,
      code: 'ISSUE_CREATE_FAILED' as const,
    };
  };

  // -------------------------------------------------------------------------
  // Cache helpers
  // -------------------------------------------------------------------------

  /**
   * Get a value from cache if it exists and hasn't expired.
   */
  private getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set a value in cache with the configured TTL.
   */
  private setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}
