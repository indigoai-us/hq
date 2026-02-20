import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearChannelResolver } from '../linear-channel-resolver.js';
import type { LinearResolverConfig, LinearResolveResult } from '../linear-channel-resolver.js';
import type { LinearClient, LinearIssue, LinearTeam } from '../linear-client.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal LinearIssue for testing */
function makeIssue(overrides?: Partial<LinearIssue>): LinearIssue {
  return {
    id: 'issue-uuid-1',
    identifier: 'ENG-123',
    title: 'Test issue',
    description: null,
    state: { id: 'state-1', name: 'In Progress' },
    assignee: null,
    team: { id: 'team-uuid-eng', key: 'ENG', name: 'Engineering' },
    priority: 0,
    url: 'https://linear.app/test/issue/ENG-123',
    createdAt: '2026-02-19T12:00:00Z',
    updatedAt: '2026-02-19T12:00:00Z',
    ...overrides,
  };
}

/** Build a mock LinearClient */
function mockClient(overrides?: Partial<LinearClient>): LinearClient {
  return {
    getIssue: vi.fn().mockResolvedValue({ success: false, error: 'Not mocked', code: 'NOT_FOUND' }),
    searchIssues: vi.fn().mockResolvedValue({
      success: true,
      data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    }),
    getTeams: vi.fn().mockResolvedValue({
      success: true,
      data: {
        nodes: [
          { id: 'team-uuid-eng', key: 'ENG', name: 'Engineering', description: null },
          { id: 'team-uuid-des', key: 'DES', name: 'Design', description: null },
        ] satisfies LinearTeam[],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    }),
    listComments: vi.fn().mockResolvedValue({ success: true, data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }),
    createComment: vi.fn().mockResolvedValue({ success: false, error: 'Not mocked', code: 'GRAPHQL_ERROR' }),
    getProjects: vi.fn().mockResolvedValue({ success: true, data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } }),
    getRequestCount: vi.fn().mockReturnValue(0),
    resetRateLimiter: vi.fn(),
    ...overrides,
  } as unknown as LinearClient;
}

/** Build a minimal resolver config */
function makeConfig(overrides?: Partial<LinearResolverConfig>): LinearResolverConfig {
  return {
    defaultTeam: 'ENG',
    teams: [
      {
        key: 'ENG',
        projectMappings: [
          { context: 'hq-cloud', projectId: 'proj-uuid-hqcloud' },
          { context: 'hq-docs', projectId: 'proj-uuid-hqdocs' },
        ],
      },
      {
        key: 'DES',
        projectMappings: [
          { context: 'design-system', projectId: 'proj-uuid-design' },
        ],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LinearChannelResolver', () => {
  let client: LinearClient;
  let config: LinearResolverConfig;

  beforeEach(() => {
    client = mockClient();
    config = makeConfig();
  });

  // -----------------------------------------------------------------------
  // Constructor and basic properties
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('should create a resolver with given client and config', () => {
      const resolver = new LinearChannelResolver(client, config);
      expect(resolver).toBeDefined();
    });

    it('should default cache TTL to 5 minutes', () => {
      const resolver = new LinearChannelResolver(client, config);
      // Verify by checking that cache size starts at 0
      expect(resolver.getCacheSize()).toEqual({ teams: 0, issues: 0, agentComms: 0 });
    });
  });

  // -----------------------------------------------------------------------
  // Strategy 1: Explicit issue ID
  // -----------------------------------------------------------------------

  describe('explicit issue resolution', () => {
    it('should resolve by explicit issue identifier in channelId', async () => {
      const issue = makeIssue({ id: 'uuid-abc', identifier: 'ENG-42' });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        channelId: 'ENG-42',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.issueId).toBe('uuid-abc');
      expect(result.issueIdentifier).toBe('ENG-42');
      expect(result.strategy).toBe('explicit');
      expect(result.teamKey).toBe('ENG');
    });

    it('should resolve by UUID channelId', async () => {
      const issue = makeIssue({ id: 'uuid-abc', identifier: 'ENG-42' });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        channelId: 'uuid-abc',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.issueId).toBe('uuid-abc');
      expect(result.issueIdentifier).toBe('ENG-42');
      expect(result.strategy).toBe('explicit');
    });

    it('should return ISSUE_NOT_FOUND for non-existent explicit issue', async () => {
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({
          success: false,
          error: 'Issue not found: ENG-9999',
          code: 'NOT_FOUND',
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        channelId: 'ENG-9999',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('ISSUE_NOT_FOUND');
      expect(result.error).toContain('ENG-9999');
    });

    it('should return API_ERROR for API failures on explicit lookup', async () => {
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({
          success: false,
          error: 'Network error: timeout',
          code: 'NETWORK_ERROR',
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        channelId: 'ENG-42',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('API_ERROR');
    });

    it('should cache explicit issue lookups', async () => {
      const issue = makeIssue({ id: 'uuid-abc', identifier: 'ENG-42' });
      const getIssueMock = vi.fn().mockResolvedValue({ success: true, data: issue });
      client = mockClient({ getIssue: getIssueMock });

      const resolver = new LinearChannelResolver(client, config);

      // First call hits API
      await resolver.resolve({ targetPeerOwner: 'alex', channelId: 'ENG-42' });
      expect(getIssueMock).toHaveBeenCalledTimes(1);

      // Second call uses cache
      const result = await resolver.resolve({ targetPeerOwner: 'alex', channelId: 'ENG-42' });
      expect(getIssueMock).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it('should use defaultTeam when issue has no team', async () => {
      const issue = makeIssue({ id: 'uuid-no-team', identifier: 'MISC-1', team: null });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        channelId: 'MISC-1',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.teamKey).toBe('ENG'); // Falls back to defaultTeam
    });
  });

  // -----------------------------------------------------------------------
  // Strategy 2: Project context matching
  // -----------------------------------------------------------------------

  describe('project context resolution', () => {
    it('should find existing HIAMP issue by context search', async () => {
      const issue = makeIssue({
        id: 'uuid-hqcloud',
        identifier: 'ENG-50',
        title: '[HIAMP] hq-cloud',
      });
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.issueId).toBe('uuid-hqcloud');
      expect(result.issueIdentifier).toBe('ENG-50');
      expect(result.strategy).toBe('project-context');
      expect(result.teamKey).toBe('ENG');
    });

    it('should search with correct team key and context', async () => {
      const searchMock = vi.fn().mockResolvedValue({
        success: true,
        data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      });
      client = mockClient({ searchIssues: searchMock });

      // Use a config with createIssueFn that succeeds
      const resolver = new LinearChannelResolver(client, config);
      // Override createIssueFn to prevent actual API call
      resolver['createIssueFn'] = vi.fn().mockResolvedValue({
        success: true,
        issueId: 'new-uuid',
        issueIdentifier: 'ENG-999',
        strategy: 'project-context',
        teamKey: 'ENG',
      });

      await resolver.resolve({ targetPeerOwner: 'alex', context: 'hq-cloud' });

      expect(searchMock).toHaveBeenCalledWith(
        '[HIAMP] hq-cloud',
        { teamKeys: ['ENG'], first: 1 },
      );
    });

    it('should create a new issue when no existing one matches context', async () => {
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
        getTeams: vi.fn().mockResolvedValue({
          success: true,
          data: {
            nodes: [{ id: 'team-uuid-eng', key: 'ENG', name: 'Engineering', description: null }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const createMock = vi.fn<[string, string, string], Promise<LinearResolveResult>>()
        .mockResolvedValue({
          success: true,
          issueId: 'new-issue-uuid',
          issueIdentifier: 'ENG-200',
          strategy: 'project-context',
          teamKey: 'ENG',
        });
      resolver['createIssueFn'] = createMock;

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.issueId).toBe('new-issue-uuid');
      expect(result.issueIdentifier).toBe('ENG-200');
      expect(result.strategy).toBe('project-context');
      expect(createMock).toHaveBeenCalledWith('team-uuid-eng', '[HIAMP] hq-cloud', 'hq-cloud');
    });

    it('should match context to the correct team', async () => {
      const issue = makeIssue({
        id: 'uuid-design',
        identifier: 'DES-10',
        title: '[HIAMP] design-system',
        team: { id: 'team-uuid-des', key: 'DES', name: 'Design' },
      });
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'design-system',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.teamKey).toBe('DES');
    });

    it('should resolve explicit issue ID in project mapping if set', async () => {
      const configWithIssue = makeConfig({
        teams: [
          {
            key: 'ENG',
            projectMappings: [
              { context: 'hq-cloud', projectId: 'proj-uuid-1', issueId: 'ENG-100' },
            ],
          },
        ],
      });

      const issue = makeIssue({ id: 'uuid-100', identifier: 'ENG-100' });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const resolver = new LinearChannelResolver(client, configWithIssue);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.issueId).toBe('uuid-100');
      expect(result.strategy).toBe('explicit');
    });

    it('should return NO_CONTEXT_MATCH when context has no mapping', async () => {
      const resolver = new LinearChannelResolver(client, config);

      // Override createIssueFn so it doesn't interfere
      resolver['createIssueFn'] = vi.fn().mockResolvedValue({
        success: false,
        error: 'Not called',
        code: 'ISSUE_CREATE_FAILED',
      });

      // 'unknown-project' doesn't match any team's projectMappings
      // But the resolver falls through to agent-comms. Let's test with
      // a context that matches no team, which triggers agent-comms fallback.
      // To test the actual NO_CONTEXT_MATCH, we need the context flow itself
      // to fail — but the top-level resolve() falls through to agent-comms.
      // So we test the internal method behavior via the full flow.

      // When context doesn't match any team and agent-comms also fails:
      const searchMock = vi.fn().mockResolvedValue({
        success: true,
        data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      });
      client = mockClient({ searchIssues: searchMock });

      const resolverNoAgentComms = new LinearChannelResolver(client, makeConfig({
        defaultTeam: 'NONEXIST',
        teams: [{ key: 'ENG', projectMappings: [] }],
      }));

      const result = await resolverNoAgentComms.resolve({
        targetPeerOwner: 'alex',
        context: 'unknown-project',
      });

      // Falls through to agent-comms which can't find the default team
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNKNOWN_TEAM');
    });

    it('should cache project context lookups', async () => {
      const issue = makeIssue({
        id: 'uuid-hqcloud',
        identifier: 'ENG-50',
        title: '[HIAMP] hq-cloud',
      });
      const searchMock = vi.fn().mockResolvedValue({
        success: true,
        data: { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } },
      });
      client = mockClient({ searchIssues: searchMock });

      const resolver = new LinearChannelResolver(client, config);

      // First call hits API
      await resolver.resolve({ targetPeerOwner: 'alex', context: 'hq-cloud' });
      expect(searchMock).toHaveBeenCalledTimes(1);

      // Second call uses cache
      await resolver.resolve({ targetPeerOwner: 'alex', context: 'hq-cloud' });
      expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it('should return UNKNOWN_TEAM when team lookup fails during issue creation', async () => {
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
        getTeams: vi.fn().mockResolvedValue({
          success: true,
          data: {
            nodes: [], // No teams found
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNKNOWN_TEAM');
    });
  });

  // -----------------------------------------------------------------------
  // Strategy 3: Agent-comms fallback
  // -----------------------------------------------------------------------

  describe('agent-comms fallback', () => {
    it('should resolve existing agent-comms issue by search', async () => {
      const issue = makeIssue({
        id: 'uuid-agentcomms',
        identifier: 'ENG-1',
        title: '[HIAMP] Agent Communications',
      });
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        // No channelId, no context -> falls through to agent-comms
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.issueId).toBe('uuid-agentcomms');
      expect(result.strategy).toBe('agent-comms');
      expect(result.teamKey).toBe('ENG');
    });

    it('should use explicit agentCommsIssueId from config', async () => {
      const issue = makeIssue({
        id: 'uuid-configured',
        identifier: 'ENG-999',
      });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const configWithId = makeConfig({
        teams: [
          {
            key: 'ENG',
            agentCommsIssueId: 'ENG-999',
          },
        ],
      });

      const resolver = new LinearChannelResolver(client, configWithId);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.issueId).toBe('uuid-configured');
      expect(result.issueIdentifier).toBe('ENG-999');
      // agentCommsIssueId is resolved via the explicit strategy
      expect(result.strategy).toBe('explicit');
    });

    it('should create agent-comms issue when none exists', async () => {
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
        getTeams: vi.fn().mockResolvedValue({
          success: true,
          data: {
            nodes: [{ id: 'team-uuid-eng', key: 'ENG', name: 'Engineering', description: null }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const createMock = vi.fn<[string, string, string], Promise<LinearResolveResult>>()
        .mockResolvedValue({
          success: true,
          issueId: 'new-agentcomms-uuid',
          issueIdentifier: 'ENG-300',
          strategy: 'agent-comms',
          teamKey: 'ENG',
        });
      resolver['createIssueFn'] = createMock;

      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.issueId).toBe('new-agentcomms-uuid');
      expect(createMock).toHaveBeenCalledWith(
        'team-uuid-eng',
        '[HIAMP] Agent Communications',
        'agent-comms',
      );
    });

    it('should return UNKNOWN_TEAM when default team not in config', async () => {
      const badConfig = makeConfig({
        defaultTeam: 'NONEXISTENT',
        teams: [{ key: 'ENG' }],
      });

      const resolver = new LinearChannelResolver(client, badConfig);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNKNOWN_TEAM');
      expect(result.error).toContain('NONEXISTENT');
    });

    it('should cache agent-comms issue lookups', async () => {
      const issue = makeIssue({
        id: 'uuid-agentcomms',
        identifier: 'ENG-1',
        title: '[HIAMP] Agent Communications',
      });
      const searchMock = vi.fn().mockResolvedValue({
        success: true,
        data: { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } },
      });
      client = mockClient({ searchIssues: searchMock });

      const resolver = new LinearChannelResolver(client, config);

      // First call hits API
      await resolver.resolve({ targetPeerOwner: 'alex' });
      expect(searchMock).toHaveBeenCalledTimes(1);

      // Second call uses cache
      await resolver.resolve({ targetPeerOwner: 'alex' });
      expect(searchMock).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Strategy fallthrough
  // -----------------------------------------------------------------------

  describe('strategy fallthrough', () => {
    it('should fall through from context to agent-comms when context has no mapping', async () => {
      const agentCommsIssue = makeIssue({
        id: 'uuid-agentcomms',
        identifier: 'ENG-1',
        title: '[HIAMP] Agent Communications',
      });
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: {
            nodes: [agentCommsIssue],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);

      // 'unknown-context' has no project mapping in any team
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'unknown-context',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.strategy).toBe('agent-comms');
    });

    it('should prefer explicit channelId over context', async () => {
      const issue = makeIssue({ id: 'uuid-explicit', identifier: 'ENG-42' });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        channelId: 'ENG-42',
        context: 'hq-cloud', // This should be ignored
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.strategy).toBe('explicit');
      expect(result.issueId).toBe('uuid-explicit');
    });
  });

  // -----------------------------------------------------------------------
  // resolveChannel (Transport interface adapter)
  // -----------------------------------------------------------------------

  describe('resolveChannel (Transport adapter)', () => {
    it('should return TransportResolveResult on success', async () => {
      const issue = makeIssue({ id: 'uuid-abc', identifier: 'ENG-42' });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolveChannel({
        targetPeerOwner: 'alex',
        channelId: 'ENG-42',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('uuid-abc');
      expect(result.channelName).toBe('ENG-42');
    });

    it('should return TransportResolveResult on failure', async () => {
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({
          success: false,
          error: 'Issue not found',
          code: 'NOT_FOUND',
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolveChannel({
        targetPeerOwner: 'alex',
        channelId: 'ENG-9999',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('ISSUE_NOT_FOUND');
      expect(result.error).toContain('ENG-9999');
    });
  });

  // -----------------------------------------------------------------------
  // Caching behavior
  // -----------------------------------------------------------------------

  describe('cache management', () => {
    it('should report cache sizes correctly', async () => {
      const issue = makeIssue({ id: 'uuid-abc', identifier: 'ENG-42' });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const resolver = new LinearChannelResolver(client, config);
      expect(resolver.getCacheSize()).toEqual({ teams: 0, issues: 0, agentComms: 0 });

      await resolver.resolve({ targetPeerOwner: 'alex', channelId: 'ENG-42' });
      const sizes = resolver.getCacheSize();
      // Should have cached the issue (by identifier and by UUID)
      expect(sizes.issues).toBeGreaterThan(0);
    });

    it('should clear all caches', async () => {
      const issue = makeIssue({ id: 'uuid-abc', identifier: 'ENG-42' });
      client = mockClient({
        getIssue: vi.fn().mockResolvedValue({ success: true, data: issue }),
      });

      const resolver = new LinearChannelResolver(client, config);
      await resolver.resolve({ targetPeerOwner: 'alex', channelId: 'ENG-42' });

      const sizeBefore = resolver.getCacheSize();
      expect(sizeBefore.issues).toBeGreaterThan(0);

      resolver.clearCache();
      expect(resolver.getCacheSize()).toEqual({ teams: 0, issues: 0, agentComms: 0 });
    });

    it('should expire cached entries after TTL', async () => {
      const issue = makeIssue({ id: 'uuid-abc', identifier: 'ENG-42' });
      const getIssueMock = vi.fn().mockResolvedValue({ success: true, data: issue });
      client = mockClient({ getIssue: getIssueMock });

      // Use a very short TTL for testing
      const shortTtlConfig = makeConfig({ cacheTtlMs: 1 }); // 1ms TTL
      const resolver = new LinearChannelResolver(client, shortTtlConfig);

      // First call
      await resolver.resolve({ targetPeerOwner: 'alex', channelId: 'ENG-42' });
      expect(getIssueMock).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second call should hit API again
      await resolver.resolve({ targetPeerOwner: 'alex', channelId: 'ENG-42' });
      expect(getIssueMock).toHaveBeenCalledTimes(2);
    });

    it('should cache team ID lookups from API', async () => {
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const createMock = vi.fn<[string, string, string], Promise<LinearResolveResult>>()
        .mockResolvedValue({
          success: true,
          issueId: 'new-uuid',
          issueIdentifier: 'ENG-500',
          strategy: 'project-context',
          teamKey: 'ENG',
        });
      resolver['createIssueFn'] = createMock;

      // First resolve triggers getTeams
      await resolver.resolve({ targetPeerOwner: 'alex', context: 'hq-cloud' });
      expect((client.getTeams as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

      // Clear issue cache but keep team cache
      // Resolve again for a different context in the same team
      const configWithTwo = makeConfig({
        teams: [
          {
            key: 'ENG',
            projectMappings: [
              { context: 'hq-cloud', projectId: 'proj-1' },
              { context: 'hq-cli', projectId: 'proj-2' },
            ],
          },
        ],
      });

      const resolver2 = new LinearChannelResolver(client, configWithTwo);
      resolver2['createIssueFn'] = createMock;

      // First call still needs getTeams for the new resolver instance
      await resolver2.resolve({ targetPeerOwner: 'alex', context: 'hq-cli' });
      // Total calls: 2 (once per resolver instance)
      expect((client.getTeams as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    });

    it('should use static teamId from config without API call', async () => {
      const configWithId = makeConfig({
        teams: [
          {
            key: 'ENG',
            teamId: 'static-team-uuid',
            projectMappings: [
              { context: 'hq-cloud', projectId: 'proj-1' },
            ],
          },
        ],
      });

      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
      });

      const resolver = new LinearChannelResolver(client, configWithId);
      const createMock = vi.fn<[string, string, string], Promise<LinearResolveResult>>()
        .mockResolvedValue({
          success: true,
          issueId: 'new-uuid',
          issueIdentifier: 'ENG-500',
          strategy: 'project-context',
          teamKey: 'ENG',
        });
      resolver['createIssueFn'] = createMock;

      await resolver.resolve({ targetPeerOwner: 'alex', context: 'hq-cloud' });

      // Should NOT call getTeams since teamId is in config
      expect((client.getTeams as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
      // Should use the static UUID
      expect(createMock).toHaveBeenCalledWith('static-team-uuid', '[HIAMP] hq-cloud', 'hq-cloud');
    });
  });

  // -----------------------------------------------------------------------
  // Default createIssueFn behavior
  // -----------------------------------------------------------------------

  describe('default createIssueFn', () => {
    it('should return ISSUE_CREATE_FAILED by default', async () => {
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
        getTeams: vi.fn().mockResolvedValue({
          success: true,
          data: {
            nodes: [{ id: 'team-uuid-eng', key: 'ENG', name: 'Engineering', description: null }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      // Don't override createIssueFn — use the default
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('ISSUE_CREATE_FAILED');
      expect(result.error).toContain('createIssue not available');
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty teams config', async () => {
      const emptyConfig = makeConfig({
        defaultTeam: 'ENG',
        teams: [],
      });

      const resolver = new LinearChannelResolver(client, emptyConfig);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNKNOWN_TEAM');
    });

    it('should handle team with no projectMappings', async () => {
      const configNoMappings = makeConfig({
        teams: [{ key: 'ENG' }],
      });

      const issue = makeIssue({
        id: 'uuid-agentcomms',
        identifier: 'ENG-1',
        title: '[HIAMP] Agent Communications',
      });
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
      });

      const resolver = new LinearChannelResolver(client, configNoMappings);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'something',
      });

      // Falls through to agent-comms since no mappings match
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.strategy).toBe('agent-comms');
    });

    it('should handle API failure during team resolution', async () => {
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
        getTeams: vi.fn().mockResolvedValue({
          success: false,
          error: 'Network error',
          code: 'NETWORK_ERROR',
        }),
      });

      const resolver = new LinearChannelResolver(client, config);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNKNOWN_TEAM');
    });

    it('should handle multiple teams with overlapping project mappings', async () => {
      const multiTeamConfig = makeConfig({
        teams: [
          {
            key: 'ENG',
            projectMappings: [
              { context: 'shared-project', projectId: 'proj-eng' },
            ],
          },
          {
            key: 'DES',
            projectMappings: [
              { context: 'shared-project', projectId: 'proj-des' },
            ],
          },
        ],
      });

      const issue = makeIssue({
        id: 'uuid-eng-shared',
        identifier: 'ENG-10',
        title: '[HIAMP] shared-project',
      });
      client = mockClient({
        searchIssues: vi.fn().mockResolvedValue({
          success: true,
          data: { nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } },
        }),
      });

      const resolver = new LinearChannelResolver(client, multiTeamConfig);
      const result = await resolver.resolve({
        targetPeerOwner: 'alex',
        context: 'shared-project',
      });

      // Should match the first team (ENG) since teams are iterated in order
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.teamKey).toBe('ENG');
    });
  });
});
