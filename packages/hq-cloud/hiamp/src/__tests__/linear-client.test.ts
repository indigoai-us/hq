import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearClient } from '../linear-client.js';
import type {
  LinearIssue,
  LinearComment,
  LinearTeam,
  LinearProject,
} from '../linear-client.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = 'lin_api_test_key_1234567890';

/** Build a mock fetch that returns a successful GraphQL response */
function mockFetch(data: unknown, options?: { status?: number; headers?: Record<string, string> }) {
  const status = options?.status ?? 200;
  const headers = new Map(Object.entries(options?.headers ?? {}));
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers.get(key) ?? null },
    json: () => Promise.resolve({ data }),
  });
}

/** Build a mock fetch that returns GraphQL errors */
function mockFetchWithErrors(errors: Array<{ message: string; extensions?: Record<string, unknown> }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve({ data: null, errors }),
  });
}

/** Build a mock fetch that rejects (network error) */
function mockFetchNetworkError(message: string) {
  return vi.fn().mockRejectedValue(new Error(message));
}

/** Create a LinearClient with a mock fetch */
function makeClient(fetchFn: typeof fetch, opts?: { maxRequestsPerHour?: number }) {
  return new LinearClient({
    apiKey: TEST_API_KEY,
    fetchFn,
    maxRequestsPerHour: opts?.maxRequestsPerHour,
  });
}

/** Sample issue data */
const sampleIssue: LinearIssue = {
  id: 'issue-uuid-1',
  identifier: 'ENG-123',
  title: 'Fix authentication bug',
  description: 'Users cannot log in after password reset',
  state: { id: 'state-1', name: 'In Progress' },
  assignee: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
  team: { id: 'team-1', key: 'ENG', name: 'Engineering' },
  priority: 1,
  url: 'https://linear.app/team/ENG-123',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-16T14:30:00Z',
};

/** Sample comment data */
const sampleComment: LinearComment = {
  id: 'comment-uuid-1',
  body: 'This has been fixed in PR #456',
  user: { id: 'user-1', name: 'Alice' },
  issue: { id: 'issue-uuid-1', identifier: 'ENG-123' },
  createdAt: '2026-01-16T15:00:00Z',
  updatedAt: '2026-01-16T15:00:00Z',
};

/** Sample team data */
const sampleTeam: LinearTeam = {
  id: 'team-1',
  key: 'ENG',
  name: 'Engineering',
  description: 'Core engineering team',
};

/** Sample project data */
const sampleProject: LinearProject = {
  id: 'project-1',
  name: 'Q1 2026 Goals',
  description: 'Main objectives for Q1',
  state: 'started',
  url: 'https://linear.app/team/project/q1-2026',
  startDate: '2026-01-01',
  targetDate: '2026-03-31',
  progress: 0.45,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LinearClient', () => {
  const originalEnv = process.env['LINEAR_API_KEY'];

  beforeEach(() => {
    delete process.env['LINEAR_API_KEY'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['LINEAR_API_KEY'] = originalEnv;
    } else {
      delete process.env['LINEAR_API_KEY'];
    }
  });

  // -----------------------------------------------------------------------
  // Constructor / Auth
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates client with explicit API key', () => {
      const client = new LinearClient({ apiKey: TEST_API_KEY, fetchFn: mockFetch({}) });
      expect(client).toBeDefined();
    });

    it('creates client with LINEAR_API_KEY env var', () => {
      process.env['LINEAR_API_KEY'] = 'lin_api_from_env';
      const client = new LinearClient({ fetchFn: mockFetch({}) });
      expect(client).toBeDefined();
    });

    it('throws when no API key is provided', () => {
      expect(() => new LinearClient({ fetchFn: mockFetch({}) })).toThrow(
        'Linear API key is required',
      );
    });

    it('uses default endpoint when not specified', async () => {
      const fetch = mockFetch({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
      const client = makeClient(fetch);
      await client.searchIssues('test');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.any(Object),
      );
    });

    it('uses custom endpoint when specified', async () => {
      const fetch = mockFetch({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
      const client = new LinearClient({
        apiKey: TEST_API_KEY,
        fetchFn: fetch,
        endpoint: 'https://custom.api/graphql',
      });
      await client.searchIssues('test');
      expect(fetch).toHaveBeenCalledWith(
        'https://custom.api/graphql',
        expect.any(Object),
      );
    });

    it('passes API key as Authorization header', async () => {
      const fetch = mockFetch({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
      const client = makeClient(fetch);
      await client.searchIssues('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: TEST_API_KEY,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getIssue
  // -----------------------------------------------------------------------

  describe('getIssue', () => {
    it('fetches an issue by identifier (TEAM-NUMBER format)', async () => {
      const fetch = mockFetch({
        issues: { nodes: [sampleIssue] },
      });
      const client = makeClient(fetch);

      const result = await client.getIssue('ENG-123');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.identifier).toBe('ENG-123');
      expect(result.data.title).toBe('Fix authentication bug');

      // Verify it used filter-based query for identifiers
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.filter).toBeDefined();
      expect(body.variables.filter.team.key.eq).toBe('ENG');
      expect(body.variables.filter.number.eq).toBe(123);
    });

    it('fetches an issue by UUID', async () => {
      const fetch = mockFetch({ issue: sampleIssue });
      const client = makeClient(fetch);

      const result = await client.getIssue('issue-uuid-1');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.id).toBe('issue-uuid-1');
    });

    it('returns NOT_FOUND when issue does not exist (identifier format)', async () => {
      const fetch = mockFetch({ issues: { nodes: [] } });
      const client = makeClient(fetch);

      const result = await client.getIssue('ENG-999');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');
      expect(result.error).toContain('ENG-999');
    });

    it('returns NOT_FOUND when issue does not exist (UUID format)', async () => {
      const fetch = mockFetch({ issue: null });
      const client = makeClient(fetch);

      const result = await client.getIssue('nonexistent-uuid');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');
    });

    it('returns INVALID_INPUT for empty identifier', async () => {
      const client = makeClient(mockFetch({}));

      const result = await client.getIssue('');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_INPUT');
    });

    it('handles lowercase team key in identifier', async () => {
      const fetch = mockFetch({ issues: { nodes: [sampleIssue] } });
      const client = makeClient(fetch);

      const result = await client.getIssue('eng-123');
      expect(result.success).toBe(true);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.filter.team.key.eq).toBe('ENG');
    });
  });

  // -----------------------------------------------------------------------
  // listComments
  // -----------------------------------------------------------------------

  describe('listComments', () => {
    it('lists comments on an issue', async () => {
      const fetch = mockFetch({
        issue: {
          comments: {
            nodes: [sampleComment],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      const client = makeClient(fetch);

      const result = await client.listComments('issue-uuid-1');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.nodes).toHaveLength(1);
      expect(result.data.nodes[0].body).toBe('This has been fixed in PR #456');
      expect(result.data.pageInfo.hasNextPage).toBe(false);
    });

    it('supports pagination with after cursor', async () => {
      const fetch = mockFetch({
        issue: {
          comments: {
            nodes: [sampleComment],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-abc' },
          },
        },
      });
      const client = makeClient(fetch);

      const result = await client.listComments('issue-uuid-1', {
        first: 10,
        after: 'cursor-prev',
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.pageInfo.hasNextPage).toBe(true);
      expect(result.data.pageInfo.endCursor).toBe('cursor-abc');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.first).toBe(10);
      expect(body.variables.after).toBe('cursor-prev');
    });

    it('caps first at 250', async () => {
      const fetch = mockFetch({
        issue: {
          comments: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
      const client = makeClient(fetch);

      await client.listComments('issue-uuid-1', { first: 500 });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.first).toBe(250);
    });

    it('returns NOT_FOUND when issue does not exist', async () => {
      const fetch = mockFetch({ issue: null });
      const client = makeClient(fetch);

      const result = await client.listComments('nonexistent');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');
    });

    it('returns INVALID_INPUT for empty issue ID', async () => {
      const client = makeClient(mockFetch({}));

      const result = await client.listComments('');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_INPUT');
    });
  });

  // -----------------------------------------------------------------------
  // createComment
  // -----------------------------------------------------------------------

  describe('createComment', () => {
    it('creates a comment on an issue', async () => {
      const fetch = mockFetch({
        commentCreate: {
          success: true,
          comment: sampleComment,
        },
      });
      const client = makeClient(fetch);

      const result = await client.createComment({
        issueId: 'issue-uuid-1',
        body: 'This has been fixed in PR #456',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.id).toBe('comment-uuid-1');
      expect(result.data.body).toBe('This has been fixed in PR #456');

      // Verify the mutation was called correctly
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.input.issueId).toBe('issue-uuid-1');
      expect(body.variables.input.body).toBe('This has been fixed in PR #456');
    });

    it('returns GRAPHQL_ERROR when mutation fails', async () => {
      const fetch = mockFetch({
        commentCreate: { success: false, comment: null },
      });
      const client = makeClient(fetch);

      const result = await client.createComment({
        issueId: 'issue-uuid-1',
        body: 'Test comment',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('GRAPHQL_ERROR');
    });

    it('returns INVALID_INPUT for empty issue ID', async () => {
      const client = makeClient(mockFetch({}));

      const result = await client.createComment({ issueId: '', body: 'test' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.error).toContain('Issue ID');
    });

    it('returns INVALID_INPUT for empty body', async () => {
      const client = makeClient(mockFetch({}));

      const result = await client.createComment({ issueId: 'issue-1', body: '' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.error).toContain('body');
    });
  });

  // -----------------------------------------------------------------------
  // searchIssues
  // -----------------------------------------------------------------------

  describe('searchIssues', () => {
    it('searches issues by term', async () => {
      const fetch = mockFetch({
        issues: {
          nodes: [sampleIssue],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const client = makeClient(fetch);

      const result = await client.searchIssues('auth bug');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.nodes).toHaveLength(1);
      expect(result.data.nodes[0].identifier).toBe('ENG-123');

      // Verify filter includes title/description search
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.filter.or).toEqual([
        { title: { containsIgnoreCase: 'auth bug' } },
        { description: { containsIgnoreCase: 'auth bug' } },
      ]);
    });

    it('filters by team keys', async () => {
      const fetch = mockFetch({
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const client = makeClient(fetch);

      await client.searchIssues('bug', { teamKeys: ['ENG', 'DES'] });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.filter.team.key.in).toEqual(['ENG', 'DES']);
    });

    it('filters by assignee ID', async () => {
      const fetch = mockFetch({
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const client = makeClient(fetch);

      await client.searchIssues('bug', { assigneeId: 'user-1' });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.filter.assignee.id.eq).toBe('user-1');
    });

    it('filters by state names', async () => {
      const fetch = mockFetch({
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const client = makeClient(fetch);

      await client.searchIssues('bug', { stateNames: ['In Progress', 'Todo'] });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.filter.state.name.in).toEqual(['In Progress', 'Todo']);
    });

    it('supports pagination', async () => {
      const fetch = mockFetch({
        issues: {
          nodes: [sampleIssue],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-xyz' },
        },
      });
      const client = makeClient(fetch);

      const result = await client.searchIssues('test', { first: 5, after: 'cursor-prev' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.pageInfo.hasNextPage).toBe(true);
      expect(result.data.pageInfo.endCursor).toBe('cursor-xyz');

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.first).toBe(5);
      expect(body.variables.after).toBe('cursor-prev');
    });

    it('caps first at 250', async () => {
      const fetch = mockFetch({
        issues: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const client = makeClient(fetch);

      await client.searchIssues('test', { first: 1000 });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.first).toBe(250);
    });

    it('returns INVALID_INPUT for empty search term', async () => {
      const client = makeClient(mockFetch({}));

      const result = await client.searchIssues('');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_INPUT');
    });
  });

  // -----------------------------------------------------------------------
  // getTeams
  // -----------------------------------------------------------------------

  describe('getTeams', () => {
    it('fetches teams', async () => {
      const fetch = mockFetch({
        teams: {
          nodes: [sampleTeam],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const client = makeClient(fetch);

      const result = await client.getTeams();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.nodes).toHaveLength(1);
      expect(result.data.nodes[0].key).toBe('ENG');
      expect(result.data.nodes[0].name).toBe('Engineering');
    });

    it('supports pagination', async () => {
      const fetch = mockFetch({
        teams: {
          nodes: [sampleTeam],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-teams' },
        },
      });
      const client = makeClient(fetch);

      const result = await client.getTeams({ first: 10, after: 'cursor-start' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.pageInfo.hasNextPage).toBe(true);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.first).toBe(10);
      expect(body.variables.after).toBe('cursor-start');
    });

    it('defaults first to 50', async () => {
      const fetch = mockFetch({
        teams: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const client = makeClient(fetch);

      await client.getTeams();
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.first).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // getProjects
  // -----------------------------------------------------------------------

  describe('getProjects', () => {
    it('fetches projects', async () => {
      const fetch = mockFetch({
        projects: {
          nodes: [sampleProject],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const client = makeClient(fetch);

      const result = await client.getProjects();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.nodes).toHaveLength(1);
      expect(result.data.nodes[0].name).toBe('Q1 2026 Goals');
      expect(result.data.nodes[0].progress).toBe(0.45);
    });

    it('supports pagination', async () => {
      const fetch = mockFetch({
        projects: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-proj' },
        },
      });
      const client = makeClient(fetch);

      const result = await client.getProjects({ first: 25, after: 'cursor-prev' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.pageInfo.hasNextPage).toBe(true);

      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.variables.first).toBe(25);
      expect(body.variables.after).toBe('cursor-prev');
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('returns AUTH_ERROR for HTTP 401', async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      });
      const client = makeClient(fetch);

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('AUTH_ERROR');
    });

    it('returns AUTH_ERROR for HTTP 403', async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      });
      const client = makeClient(fetch);

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('AUTH_ERROR');
    });

    it('returns NETWORK_ERROR for HTTP 500', async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      });
      const client = makeClient(fetch);

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NETWORK_ERROR');
    });

    it('returns AUTH_ERROR for GraphQL AUTHENTICATION_ERROR', async () => {
      const fetch = mockFetchWithErrors([
        { message: 'Not authenticated', extensions: { code: 'AUTHENTICATION_ERROR' } },
      ]);
      const client = makeClient(fetch);

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('AUTH_ERROR');
    });

    it('returns NOT_FOUND for GraphQL not found errors', async () => {
      const fetch = mockFetchWithErrors([
        { message: 'Entity not found', extensions: { code: 'NOT_FOUND' } },
      ]);
      const client = makeClient(fetch);

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');
    });

    it('returns GRAPHQL_ERROR for other GraphQL errors', async () => {
      const fetch = mockFetchWithErrors([
        { message: 'Variable $filter is invalid' },
        { message: 'Another error' },
      ]);
      const client = makeClient(fetch);

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('GRAPHQL_ERROR');
      expect(result.error).toContain('Variable $filter is invalid');
      expect(result.error).toContain('Another error');
    });

    it('returns GRAPHQL_ERROR when response has no data', async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ data: null }),
      });
      const client = makeClient(fetch);

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('GRAPHQL_ERROR');
      expect(result.error).toBe('No data in response');
    });

    it('returns NETWORK_ERROR after exhausting retries on network failure', async () => {
      const fetch = mockFetchNetworkError('ECONNREFUSED');

      // Create a client that doesn't actually sleep during retries
      class TestClient extends LinearClient {
        protected override sleep(): Promise<void> {
          return Promise.resolve();
        }
      }

      const client = new TestClient({
        apiKey: TEST_API_KEY,
        fetchFn: fetch,
      });

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.error).toContain('ECONNREFUSED');

      // Should have retried (initial + 5 retries = 6 total calls)
      expect(fetch).toHaveBeenCalledTimes(6);
    });
  });

  // -----------------------------------------------------------------------
  // Rate limiting
  // -----------------------------------------------------------------------

  describe('rate limiting', () => {
    it('tracks request count', async () => {
      const fetch = mockFetch({
        issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      });
      const client = makeClient(fetch);

      expect(client.getRequestCount()).toBe(0);
      await client.searchIssues('test1');
      expect(client.getRequestCount()).toBe(1);
      await client.searchIssues('test2');
      expect(client.getRequestCount()).toBe(2);
    });

    it('resets rate limiter', async () => {
      const fetch = mockFetch({
        issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      });
      const client = makeClient(fetch);

      await client.searchIssues('test');
      expect(client.getRequestCount()).toBe(1);

      client.resetRateLimiter();
      expect(client.getRequestCount()).toBe(0);
    });

    it('returns RATE_LIMITED when local limit exceeded and retries exhausted', async () => {
      const fetch = mockFetch({
        issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      });

      class TestClient extends LinearClient {
        protected override sleep(): Promise<void> {
          return Promise.resolve();
        }
      }

      // Set very low limit
      const client = new TestClient({
        apiKey: TEST_API_KEY,
        fetchFn: fetch,
        maxRequestsPerHour: 2,
      });

      // Use up the quota
      await client.searchIssues('test1');
      await client.searchIssues('test2');

      // Next request should hit rate limit
      const result = await client.searchIssues('test3');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('RATE_LIMITED');
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('retries with backoff on HTTP 429', async () => {
      let callCount = 0;
      const fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: { get: (key: string) => (key === 'retry-after' ? '1' : null) },
            json: () => Promise.resolve({}),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () =>
            Promise.resolve({
              data: {
                issues: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            }),
        });
      });

      class TestClient extends LinearClient {
        protected override sleep(): Promise<void> {
          return Promise.resolve();
        }
      }

      const client = new TestClient({
        apiKey: TEST_API_KEY,
        fetchFn: fetch,
      });

      const result = await client.searchIssues('test');
      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(3); // 2 retries + 1 success
    });

    it('returns RATE_LIMITED after exhausting retries on 429', async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      });

      class TestClient extends LinearClient {
        protected override sleep(): Promise<void> {
          return Promise.resolve();
        }
      }

      const client = new TestClient({
        apiKey: TEST_API_KEY,
        fetchFn: fetch,
      });

      const result = await client.searchIssues('test');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('RATE_LIMITED');
    });
  });

  // -----------------------------------------------------------------------
  // Request format
  // -----------------------------------------------------------------------

  describe('request format', () => {
    it('sends POST with JSON content type', async () => {
      const fetch = mockFetch({
        issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      });
      const client = makeClient(fetch);

      await client.searchIssues('test');
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        }),
      );
    });

    it('sends valid JSON body with query and variables', async () => {
      const fetch = mockFetch({
        issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      });
      const client = makeClient(fetch);

      await client.searchIssues('test');
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.query).toBeDefined();
      expect(body.variables).toBeDefined();
      expect(typeof body.query).toBe('string');
      expect(body.query).toContain('query');
    });
  });
});
