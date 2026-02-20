/**
 * Linear GraphQL API Client
 *
 * Typed client for interacting with Linear's GraphQL API.
 * Provides methods for issues, comments, teams, and projects
 * with built-in rate limiting (1500 req/hr) and pagination.
 *
 * Auth: LINEAR_API_KEY env var or passed explicitly.
 *
 * @module linear-client
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Linear issue (subset of fields relevant to HIAMP) */
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: { id: string; name: string } | null;
  assignee: { id: string; name: string; email: string } | null;
  team: { id: string; key: string; name: string } | null;
  priority: number;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/** Linear comment */
export interface LinearComment {
  id: string;
  body: string;
  user: { id: string; name: string } | null;
  issue: { id: string; identifier: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Linear team */
export interface LinearTeam {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

/** Linear project */
export interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  state: string;
  url: string;
  startDate: string | null;
  targetDate: string | null;
  progress: number;
}

/** Paginated result wrapper */
export interface PaginatedResult<T> {
  nodes: T[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  totalCount?: number;
}

/** Options for list operations */
export interface ListOptions {
  /** Number of items per page (default: 50, max: 250) */
  first?: number;
  /** Cursor for pagination */
  after?: string;
}

/** Options for searching issues */
export interface SearchIssuesOptions extends ListOptions {
  /** Filter by team key(s) */
  teamKeys?: string[];
  /** Filter by assignee ID */
  assigneeId?: string;
  /** Filter by state name(s) */
  stateNames?: string[];
}

/** GraphQL error from Linear */
export interface LinearGraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: Record<string, unknown>;
}

/** Result of a Linear API call */
export type LinearResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: LinearErrorCode };

/** Error codes */
export type LinearErrorCode =
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'GRAPHQL_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_INPUT';

/** Options for constructing a LinearClient */
export interface LinearClientOptions {
  /** Linear personal API key. Falls back to LINEAR_API_KEY env var. */
  apiKey?: string;

  /** Override the API endpoint (for testing). Default: https://api.linear.app/graphql */
  endpoint?: string;

  /** Maximum requests per hour. Default: 1500 */
  maxRequestsPerHour?: number;

  /** Custom fetch implementation (for testing). Default: global fetch */
  fetchFn?: typeof fetch;
}

// ---------------------------------------------------------------------------
// GraphQL fragments
// ---------------------------------------------------------------------------

const ISSUE_FRAGMENT = `
  id
  identifier
  title
  description
  state { id name }
  assignee { id name email }
  team { id key name }
  priority
  url
  createdAt
  updatedAt
`;

const COMMENT_FRAGMENT = `
  id
  body
  user { id name }
  issue { id identifier }
  createdAt
  updatedAt
`;

const TEAM_FRAGMENT = `
  id
  key
  name
  description
`;

const PROJECT_FRAGMENT = `
  id
  name
  description
  state
  url
  startDate
  targetDate
  progress
`;

// ---------------------------------------------------------------------------
// LinearClient class
// ---------------------------------------------------------------------------

/**
 * Typed client for Linear's GraphQL API.
 *
 * Provides methods for common operations (issues, comments, teams, projects)
 * with built-in rate limiting using exponential backoff.
 *
 * @example
 * ```ts
 * const client = new LinearClient({ apiKey: 'lin_api_...' });
 *
 * // Get an issue
 * const result = await client.getIssue('ABC-123');
 * if (result.success) {
 *   console.log(result.data.title);
 * }
 *
 * // Create a comment
 * const comment = await client.createComment({
 *   issueId: 'issue-uuid',
 *   body: 'HIAMP message content here',
 * });
 *
 * // Search issues with pagination
 * const issues = await client.searchIssues('auth bug', { first: 10 });
 * ```
 */
export class LinearClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly maxRequestsPerHour: number;
  private readonly fetchFn: typeof fetch;

  // Rate limiting state
  private requestTimestamps: number[] = [];
  private readonly maxRetries = 5;
  private readonly baseDelayMs = 1000;

  constructor(options?: LinearClientOptions) {
    const key = options?.apiKey ?? process.env['LINEAR_API_KEY'];
    if (!key) {
      throw new Error(
        'Linear API key is required. Pass apiKey in options or set LINEAR_API_KEY env var.',
      );
    }
    this.apiKey = key;
    this.endpoint = options?.endpoint ?? 'https://api.linear.app/graphql';
    this.maxRequestsPerHour = options?.maxRequestsPerHour ?? 1500;
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Get a single issue by its identifier (e.g., "ENG-123").
   */
  async getIssue(identifier: string): Promise<LinearResult<LinearIssue>> {
    if (!identifier || typeof identifier !== 'string') {
      return { success: false, error: 'Issue identifier is required', code: 'INVALID_INPUT' };
    }

    const query = `
      query GetIssue($identifier: String!) {
        issue(id: $identifier) {
          ${ISSUE_FRAGMENT}
        }
      }
    `;

    // Linear's API uses the "id" parameter for identifiers like "ENG-123"
    // but for searching by identifier we need to use issueVcNumber + team filter.
    // Actually, Linear supports looking up by identifier directly:
    const searchQuery = `
      query SearchIssue($filter: IssueFilter) {
        issues(filter: $filter, first: 1) {
          nodes {
            ${ISSUE_FRAGMENT}
          }
        }
      }
    `;

    // Parse identifier: "TEAM-123" -> team key + number
    const match = identifier.match(/^([A-Za-z]+)-(\d+)$/);
    if (!match) {
      // Try as UUID
      const result = await this.execute<{ issue: LinearIssue }>(query, { identifier });
      if (!result.success) return result;
      if (!result.data.issue) {
        return { success: false, error: `Issue not found: ${identifier}`, code: 'NOT_FOUND' };
      }
      return { success: true, data: result.data.issue };
    }

    const [, teamKey, numberStr] = match;
    const number = parseInt(numberStr, 10);

    const filterResult = await this.execute<{ issues: { nodes: LinearIssue[] } }>(searchQuery, {
      filter: {
        team: { key: { eq: teamKey.toUpperCase() } },
        number: { eq: number },
      },
    });

    if (!filterResult.success) return filterResult;
    const issues = filterResult.data.issues?.nodes ?? [];
    if (issues.length === 0) {
      return { success: false, error: `Issue not found: ${identifier}`, code: 'NOT_FOUND' };
    }
    return { success: true, data: issues[0] };
  }

  /**
   * List comments on an issue.
   */
  async listComments(
    issueId: string,
    options?: ListOptions,
  ): Promise<LinearResult<PaginatedResult<LinearComment>>> {
    if (!issueId) {
      return { success: false, error: 'Issue ID is required', code: 'INVALID_INPUT' };
    }

    const first = Math.min(options?.first ?? 50, 250);
    const query = `
      query ListComments($issueId: String!, $first: Int!, $after: String) {
        issue(id: $issueId) {
          comments(first: $first, after: $after) {
            nodes {
              ${COMMENT_FRAGMENT}
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const result = await this.execute<{
      issue: { comments: PaginatedResult<LinearComment> } | null;
    }>(query, {
      issueId,
      first,
      after: options?.after ?? null,
    });

    if (!result.success) return result;
    if (!result.data.issue) {
      return { success: false, error: `Issue not found: ${issueId}`, code: 'NOT_FOUND' };
    }

    return { success: true, data: result.data.issue.comments };
  }

  /**
   * Create a comment on an issue.
   */
  async createComment(input: {
    issueId: string;
    body: string;
  }): Promise<LinearResult<LinearComment>> {
    if (!input.issueId) {
      return { success: false, error: 'Issue ID is required', code: 'INVALID_INPUT' };
    }
    if (!input.body) {
      return { success: false, error: 'Comment body is required', code: 'INVALID_INPUT' };
    }

    const mutation = `
      mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            ${COMMENT_FRAGMENT}
          }
        }
      }
    `;

    const result = await this.execute<{
      commentCreate: { success: boolean; comment: LinearComment };
    }>(mutation, {
      input: { issueId: input.issueId, body: input.body },
    });

    if (!result.success) return result;
    if (!result.data.commentCreate?.success) {
      return {
        success: false,
        error: 'Failed to create comment',
        code: 'GRAPHQL_ERROR',
      };
    }

    return { success: true, data: result.data.commentCreate.comment };
  }

  /**
   * Search issues with optional filters.
   */
  async searchIssues(
    searchTerm: string,
    options?: SearchIssuesOptions,
  ): Promise<LinearResult<PaginatedResult<LinearIssue>>> {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return { success: false, error: 'Search term is required', code: 'INVALID_INPUT' };
    }

    const first = Math.min(options?.first ?? 50, 250);

    const query = `
      query SearchIssues($filter: IssueFilter, $first: Int!, $after: String) {
        issues(filter: $filter, first: $first, after: $after) {
          nodes {
            ${ISSUE_FRAGMENT}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    // Build filter object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};

    // Linear's issue search uses a title/description contain filter
    // combined with an "or" for text matching
    filter.or = [
      { title: { containsIgnoreCase: searchTerm } },
      { description: { containsIgnoreCase: searchTerm } },
    ];

    if (options?.teamKeys?.length) {
      filter.team = { key: { in: options.teamKeys } };
    }

    if (options?.assigneeId) {
      filter.assignee = { id: { eq: options.assigneeId } };
    }

    if (options?.stateNames?.length) {
      filter.state = { name: { in: options.stateNames } };
    }

    const result = await this.execute<{ issues: PaginatedResult<LinearIssue> }>(query, {
      filter,
      first,
      after: options?.after ?? null,
    });

    if (!result.success) return result;
    return { success: true, data: result.data.issues };
  }

  /**
   * Get all teams.
   */
  async getTeams(
    options?: ListOptions,
  ): Promise<LinearResult<PaginatedResult<LinearTeam>>> {
    const first = Math.min(options?.first ?? 50, 250);

    const query = `
      query GetTeams($first: Int!, $after: String) {
        teams(first: $first, after: $after) {
          nodes {
            ${TEAM_FRAGMENT}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const result = await this.execute<{ teams: PaginatedResult<LinearTeam> }>(query, {
      first,
      after: options?.after ?? null,
    });

    if (!result.success) return result;
    return { success: true, data: result.data.teams };
  }

  /**
   * Get all projects.
   */
  async getProjects(
    options?: ListOptions,
  ): Promise<LinearResult<PaginatedResult<LinearProject>>> {
    const first = Math.min(options?.first ?? 50, 250);

    const query = `
      query GetProjects($first: Int!, $after: String) {
        projects(first: $first, after: $after) {
          nodes {
            ${PROJECT_FRAGMENT}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const result = await this.execute<{ projects: PaginatedResult<LinearProject> }>(query, {
      first,
      after: options?.after ?? null,
    });

    if (!result.success) return result;
    return { success: true, data: result.data.projects };
  }

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  /**
   * Check if we're within the rate limit.
   * Prunes timestamps older than 1 hour.
   */
  private checkRateLimit(): boolean {
    const oneHourAgo = Date.now() - 3600_000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > oneHourAgo);
    return this.requestTimestamps.length < this.maxRequestsPerHour;
  }

  /**
   * Record a request timestamp.
   */
  private recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Calculate delay with exponential backoff and jitter.
   */
  private getBackoffDelay(attempt: number): number {
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.baseDelayMs;
    return exponentialDelay + jitter;
  }

  /**
   * Sleep for a given number of milliseconds.
   * Extracted as a method so tests can override it.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // GraphQL execution
  // -------------------------------------------------------------------------

  /**
   * Execute a GraphQL query/mutation against the Linear API.
   * Includes rate limiting with exponential backoff retry.
   */
  private async execute<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<LinearResult<T>> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Check local rate limit
      if (!this.checkRateLimit()) {
        if (attempt === this.maxRetries) {
          return {
            success: false,
            error: 'Rate limit exceeded: too many requests in the last hour',
            code: 'RATE_LIMITED',
          };
        }
        const delay = this.getBackoffDelay(attempt);
        await this.sleep(delay);
        continue;
      }

      this.recordRequest();

      try {
        const response = await this.fetchFn(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.apiKey,
          },
          body: JSON.stringify({ query, variables }),
        });

        // Handle HTTP-level rate limiting (429)
        if (response.status === 429) {
          if (attempt === this.maxRetries) {
            return {
              success: false,
              error: 'Rate limited by Linear API after retries',
              code: 'RATE_LIMITED',
            };
          }
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : this.getBackoffDelay(attempt);
          await this.sleep(delay);
          continue;
        }

        // Handle auth errors
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: `Authentication failed (HTTP ${response.status})`,
            code: 'AUTH_ERROR',
          };
        }

        // Handle other HTTP errors
        if (!response.ok) {
          return {
            success: false,
            error: `Linear API error: HTTP ${response.status}`,
            code: 'NETWORK_ERROR',
          };
        }

        const json = (await response.json()) as {
          data?: T;
          errors?: LinearGraphQLError[];
        };

        // Handle GraphQL errors
        if (json.errors?.length) {
          const firstError = json.errors[0];
          // Check for common error patterns
          if (firstError.extensions?.code === 'AUTHENTICATION_ERROR') {
            return {
              success: false,
              error: firstError.message,
              code: 'AUTH_ERROR',
            };
          }
          if (firstError.message?.includes('not found') || firstError.extensions?.code === 'NOT_FOUND') {
            return {
              success: false,
              error: firstError.message,
              code: 'NOT_FOUND',
            };
          }
          return {
            success: false,
            error: json.errors.map((e) => e.message).join('; '),
            code: 'GRAPHQL_ERROR',
          };
        }

        if (!json.data) {
          return {
            success: false,
            error: 'No data in response',
            code: 'GRAPHQL_ERROR',
          };
        }

        return { success: true, data: json.data };
      } catch (err) {
        if (attempt === this.maxRetries) {
          return {
            success: false,
            error: `Network error: ${(err as Error).message}`,
            code: 'NETWORK_ERROR',
          };
        }
        const delay = this.getBackoffDelay(attempt);
        await this.sleep(delay);
        continue;
      }
    }

    // Should not reach here, but TypeScript needs this
    return {
      success: false,
      error: 'Exhausted retries',
      code: 'NETWORK_ERROR',
    };
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  /**
   * Get the number of requests recorded in the current window.
   * Useful for testing rate limiting behavior.
   */
  getRequestCount(): number {
    const oneHourAgo = Date.now() - 3600_000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > oneHourAgo);
    return this.requestTimestamps.length;
  }

  /**
   * Reset rate limiter state (for testing).
   */
  resetRateLimiter(): void {
    this.requestTimestamps = [];
  }
}
