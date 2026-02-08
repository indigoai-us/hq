/**
 * Worker Logs Streaming Service
 *
 * Provides container log capture, CloudWatch streaming, API endpoint
 * support for fetching logs, and optional WebSocket live tail.
 *
 * Features:
 * 1. Container stdout/stderr captured via CloudWatch Logs
 * 2. Logs streamed to a configurable CloudWatch log group
 * 3. API endpoint support: GET /api/workers/:id/logs
 * 4. Optional WebSocket streaming for live tail
 * 5. Log retention policy configuration
 *
 * @module worker-logs
 */

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/**
 * Logger interface for the worker logs service
 */
export interface WorkerLogsLogger {
  info(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/**
 * Default console logger
 */
const DEFAULT_LOGGER: WorkerLogsLogger = {
  // eslint-disable-next-line no-console
  info: (msg: string) => console.log(`[WorkerLogs] ${msg}`),
  error: (msg: string) => console.error(`[WorkerLogs] ${msg}`),
  // eslint-disable-next-line no-console
  debug: (msg: string) => console.log(`[WorkerLogs:debug] ${msg}`),
};

/**
 * A single log entry from CloudWatch
 */
export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Log message content */
  message: string;
  /** Log stream name (usually container-id based) */
  logStreamName: string;
  /** Ingestion time from CloudWatch */
  ingestionTime?: string;
}

/**
 * Log level filter options
 */
export type LogLevel = 'all' | 'stdout' | 'stderr' | 'error' | 'info' | 'debug';

/**
 * Parameters for fetching worker logs
 */
export interface GetLogsParams {
  /** Worker ID to fetch logs for */
  workerId: string;
  /** ECS task ARN (used to derive the log stream name) */
  taskArn?: string;
  /** Start time for log range (ISO 8601 or epoch ms) */
  startTime?: string | number;
  /** End time for log range (ISO 8601 or epoch ms) */
  endTime?: string | number;
  /** Maximum number of log entries to return */
  limit?: number;
  /** Forward token for pagination */
  nextToken?: string;
  /** Filter pattern (CloudWatch Logs filter syntax) */
  filterPattern?: string;
  /** Log level filter */
  logLevel?: LogLevel;
}

/**
 * Response from a log fetch operation
 */
export interface GetLogsResponse {
  /** Log entries matching the query */
  entries: LogEntry[];
  /** Pagination token for fetching more results */
  nextToken?: string;
  /** Whether there are more entries available */
  hasMore: boolean;
  /** Total number of entries scanned */
  scannedCount: number;
}

/**
 * Log retention policy configuration
 */
export interface LogRetentionConfig {
  /** Retention period in days */
  retentionDays: number;
  /** Whether to delete expired logs automatically */
  autoDelete: boolean;
}

/**
 * Supported retention periods (matching CloudWatch Logs API)
 */
export const VALID_RETENTION_DAYS = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096,
  1827, 2192, 2557, 2922, 3288, 3653,
] as const;

/**
 * Default retention: 30 days
 */
export const DEFAULT_RETENTION_DAYS = 30;

/**
 * Default max log entries per request
 */
export const DEFAULT_LOG_LIMIT = 500;

/**
 * Maximum log entries per request
 */
export const MAX_LOG_LIMIT = 10000;

/**
 * CloudWatch Logs client interface - allows for mocking in tests
 */
export interface CloudWatchLogsClient {
  /**
   * Fetch log events from a specific log stream
   */
  getLogEvents(params: {
    logGroupName: string;
    logStreamName: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    nextToken?: string;
    startFromHead?: boolean;
  }): Promise<{
    events: Array<{
      timestamp?: number;
      message?: string;
      ingestionTime?: number;
    }>;
    nextForwardToken?: string;
    nextBackwardToken?: string;
  }>;

  /**
   * Filter log events across multiple log streams
   */
  filterLogEvents(params: {
    logGroupName: string;
    logStreamNamePrefix?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    nextToken?: string;
    filterPattern?: string;
  }): Promise<{
    events: Array<{
      logStreamName?: string;
      timestamp?: number;
      message?: string;
      ingestionTime?: number;
    }>;
    nextToken?: string;
    searchedLogStreams?: Array<{
      logStreamName?: string;
      searchedCompletely?: boolean;
    }>;
  }>;

  /**
   * Describe log streams to find the ones for a specific task
   */
  describeLogStreams(params: {
    logGroupName: string;
    logStreamNamePrefix?: string;
    orderBy?: 'LogStreamName' | 'LastEventTime';
    descending?: boolean;
    limit?: number;
  }): Promise<{
    logStreams: Array<{
      logStreamName?: string;
      creationTime?: number;
      firstEventTimestamp?: number;
      lastEventTimestamp?: number;
      lastIngestionTime?: number;
    }>;
    nextToken?: string;
  }>;

  /**
   * Set retention policy for a log group
   */
  putRetentionPolicy(params: {
    logGroupName: string;
    retentionInDays: number;
  }): Promise<void>;
}

/**
 * WebSocket connection for live log tailing
 */
export interface LogStreamConnection {
  /** Unique connection ID */
  connectionId: string;
  /** Worker ID being tailed */
  workerId: string;
  /** Send a log entry to the connected client */
  send(entry: LogEntry): void;
  /** Close the connection */
  close(): void;
  /** Whether the connection is active */
  isActive(): boolean;
}

/**
 * Event types emitted by the logs service
 */
export type LogsEventType =
  | 'logs_fetched'
  | 'stream_started'
  | 'stream_entry'
  | 'stream_stopped'
  | 'stream_error'
  | 'retention_updated';

/**
 * Configuration for the WorkerLogsService
 */
export interface WorkerLogsServiceConfig {
  /** CloudWatch log group name */
  logGroupName: string;
  /** AWS region */
  region: string;
  /** Log stream prefix (usually 'worker') */
  logStreamPrefix?: string;
  /** Default log retention in days */
  defaultRetentionDays?: number;
  /** Default maximum entries per request */
  defaultLimit?: number;
  /** Poll interval for live tail (ms) */
  liveTailPollIntervalMs?: number;
  /** Logger instance */
  logger?: WorkerLogsLogger;
}

// ────────────────────────────────────────────────────────────────
// Worker Logs Service
// ────────────────────────────────────────────────────────────────

/**
 * Worker Logs Service
 *
 * Manages log retrieval and live streaming for worker containers:
 * 1. Fetches historical logs from CloudWatch
 * 2. Resolves worker ID / task ARN to CloudWatch log streams
 * 3. Supports pagination for large log sets
 * 4. Manages WebSocket connections for live tailing
 * 5. Configures log retention policies
 */
export class WorkerLogsService {
  private readonly config: Required<WorkerLogsServiceConfig>;
  private readonly cwClient: CloudWatchLogsClient;
  private readonly logger: WorkerLogsLogger;
  private readonly activeStreams: Map<string, LiveTailState> = new Map();
  private running = false;

  constructor(
    config: WorkerLogsServiceConfig,
    cwClient: CloudWatchLogsClient
  ) {
    this.config = {
      ...config,
      logStreamPrefix: config.logStreamPrefix ?? 'worker',
      defaultRetentionDays: config.defaultRetentionDays ?? DEFAULT_RETENTION_DAYS,
      defaultLimit: config.defaultLimit ?? DEFAULT_LOG_LIMIT,
      liveTailPollIntervalMs: config.liveTailPollIntervalMs ?? 2000,
      logger: config.logger ?? DEFAULT_LOGGER,
    };
    this.cwClient = cwClient;
    this.logger = this.config.logger;
  }

  /**
   * Start the logs service (begins polling for active streams)
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.logger.info('Worker logs service started');
  }

  /**
   * Stop the logs service and close all active streams
   */
  stop(): void {
    this.running = false;

    // Close all active streams
    for (const [connectionId, state] of this.activeStreams) {
      this.closeLiveTail(connectionId);
      state.connection.close();
    }

    this.activeStreams.clear();
    this.logger.info('Worker logs service stopped');
  }

  /**
   * Get logs for a specific worker.
   * Maps to: GET /api/workers/:id/logs
   *
   * @param params - Log query parameters
   * @returns Log entries and pagination info
   */
  async getLogs(params: GetLogsParams): Promise<GetLogsResponse> {
    const {
      workerId,
      taskArn,
      startTime,
      endTime,
      limit,
      nextToken,
      filterPattern,
    } = params;

    const effectiveLimit = Math.min(
      limit ?? this.config.defaultLimit,
      MAX_LOG_LIMIT
    );

    // Resolve the log stream name prefix
    const streamPrefix = this.resolveLogStreamPrefix(workerId, taskArn);

    this.logger.debug(
      `Fetching logs for ${workerId} (stream prefix: ${streamPrefix}, ` +
      `limit: ${String(effectiveLimit)})`
    );

    try {
      // Use filterLogEvents for more flexible querying across streams
      const result = await this.cwClient.filterLogEvents({
        logGroupName: this.config.logGroupName,
        logStreamNamePrefix: streamPrefix,
        startTime: this.parseTimestamp(startTime),
        endTime: this.parseTimestamp(endTime),
        limit: effectiveLimit,
        nextToken,
        filterPattern: this.buildFilterPattern(filterPattern, params.logLevel),
      });

      const entries: LogEntry[] = (result.events ?? []).map((event) => ({
        timestamp: event.timestamp
          ? new Date(event.timestamp).toISOString()
          : new Date().toISOString(),
        message: event.message ?? '',
        logStreamName: event.logStreamName ?? '',
        ingestionTime: event.ingestionTime
          ? new Date(event.ingestionTime).toISOString()
          : undefined,
      }));

      const response: GetLogsResponse = {
        entries,
        nextToken: result.nextToken,
        hasMore: result.nextToken !== undefined && result.nextToken !== null,
        scannedCount: entries.length,
      };

      this.logger.debug(
        `Fetched ${String(entries.length)} log entries for ${workerId}`
      );

      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch logs for ${workerId}: ${errorMsg}`);
      throw new WorkerLogsError(
        `Failed to fetch logs for worker ${workerId}: ${errorMsg}`,
        'FETCH_FAILED',
        workerId
      );
    }
  }

  /**
   * Get available log streams for a worker
   *
   * @param workerId - Worker ID
   * @param taskArn - Optional ECS task ARN
   * @returns List of log stream names with metadata
   */
  async getLogStreams(
    workerId: string,
    taskArn?: string
  ): Promise<LogStreamInfo[]> {
    const streamPrefix = this.resolveLogStreamPrefix(workerId, taskArn);

    try {
      const result = await this.cwClient.describeLogStreams({
        logGroupName: this.config.logGroupName,
        logStreamNamePrefix: streamPrefix,
        orderBy: 'LastEventTime',
        descending: true,
        limit: 50,
      });

      return (result.logStreams ?? []).map((stream) => ({
        logStreamName: stream.logStreamName ?? '',
        creationTime: stream.creationTime
          ? new Date(stream.creationTime).toISOString()
          : undefined,
        firstEventTimestamp: stream.firstEventTimestamp
          ? new Date(stream.firstEventTimestamp).toISOString()
          : undefined,
        lastEventTimestamp: stream.lastEventTimestamp
          ? new Date(stream.lastEventTimestamp).toISOString()
          : undefined,
        lastIngestionTime: stream.lastIngestionTime
          ? new Date(stream.lastIngestionTime).toISOString()
          : undefined,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to describe log streams for ${workerId}: ${errorMsg}`);
      throw new WorkerLogsError(
        `Failed to get log streams for worker ${workerId}: ${errorMsg}`,
        'STREAMS_FAILED',
        workerId
      );
    }
  }

  /**
   * Start live tailing logs for a worker via WebSocket.
   *
   * Polls CloudWatch at a configured interval and pushes new entries
   * to the connected client.
   *
   * @param connection - WebSocket connection to stream to
   * @returns Connection ID for managing the stream
   */
  startLiveTail(connection: LogStreamConnection): string {
    if (this.activeStreams.has(connection.connectionId)) {
      this.logger.debug(
        `Live tail already active for connection ${connection.connectionId}`
      );
      return connection.connectionId;
    }

    const state: LiveTailState = {
      connection,
      lastTimestamp: Date.now(),
      pollTimer: null,
      entrySentCount: 0,
    };

    this.activeStreams.set(connection.connectionId, state);

    // Start polling for new log entries
    state.pollTimer = setInterval(() => {
      void this.pollLiveTail(connection.connectionId);
    }, this.config.liveTailPollIntervalMs);

    this.logger.info(
      `Started live tail for worker ${connection.workerId} ` +
      `(connection: ${connection.connectionId})`
    );

    return connection.connectionId;
  }

  /**
   * Stop live tailing for a specific connection
   *
   * @param connectionId - Connection ID to stop
   */
  closeLiveTail(connectionId: string): void {
    const state = this.activeStreams.get(connectionId);
    if (!state) {
      return;
    }

    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }

    this.activeStreams.delete(connectionId);

    this.logger.info(
      `Stopped live tail for connection ${connectionId} ` +
      `(sent ${String(state.entrySentCount)} entries)`
    );
  }

  /**
   * Update the log retention policy for the configured log group
   *
   * @param retentionDays - Retention period in days (must be a valid CloudWatch value)
   */
  async updateRetentionPolicy(retentionDays: number): Promise<void> {
    if (!isValidRetentionDays(retentionDays)) {
      throw new WorkerLogsError(
        `Invalid retention period: ${String(retentionDays)} days. ` +
        `Valid values: ${VALID_RETENTION_DAYS.join(', ')}`,
        'INVALID_RETENTION',
        undefined
      );
    }

    try {
      await this.cwClient.putRetentionPolicy({
        logGroupName: this.config.logGroupName,
        retentionInDays: retentionDays,
      });

      this.logger.info(
        `Updated retention policy for ${this.config.logGroupName} ` +
        `to ${String(retentionDays)} days`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to update retention policy: ${errorMsg}`
      );
      throw new WorkerLogsError(
        `Failed to update retention policy: ${errorMsg}`,
        'RETENTION_UPDATE_FAILED',
        undefined
      );
    }
  }

  /**
   * Get the current count of active live tail connections
   */
  get activeStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Check if the service is running
   */
  get isRunning(): boolean {
    return this.running;
  }

  // ────────────────────────────────────────────────────────────────
  // Private Methods
  // ────────────────────────────────────────────────────────────────

  /**
   * Poll for new log entries in a live tail session
   */
  private async pollLiveTail(connectionId: string): Promise<void> {
    const state = this.activeStreams.get(connectionId);
    if (!state || !state.connection.isActive()) {
      // Connection closed, clean up
      this.closeLiveTail(connectionId);
      return;
    }

    try {
      const streamPrefix = this.resolveLogStreamPrefix(
        state.connection.workerId
      );

      const result = await this.cwClient.filterLogEvents({
        logGroupName: this.config.logGroupName,
        logStreamNamePrefix: streamPrefix,
        startTime: state.lastTimestamp,
        limit: 100,
      });

      for (const event of result.events ?? []) {
        const entry: LogEntry = {
          timestamp: event.timestamp
            ? new Date(event.timestamp).toISOString()
            : new Date().toISOString(),
          message: event.message ?? '',
          logStreamName: event.logStreamName ?? '',
          ingestionTime: event.ingestionTime
            ? new Date(event.ingestionTime).toISOString()
            : undefined,
        };

        state.connection.send(entry);
        state.entrySentCount++;

        // Update the last timestamp to avoid re-sending
        if (event.timestamp && event.timestamp > state.lastTimestamp) {
          state.lastTimestamp = event.timestamp + 1;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Live tail poll error for connection ${connectionId}: ${errorMsg}`
      );
      // Don't close on transient errors - let the next poll retry
    }
  }

  /**
   * Resolve the CloudWatch log stream name prefix from worker ID and task ARN.
   *
   * CloudWatch log stream naming convention:
   *   {streamPrefix}/{containerName}/{taskId}
   * e.g., worker/worker/abc123def456
   *
   * If a task ARN is provided, we extract the task ID.
   * If only a worker ID is provided, we use it as a prefix search.
   */
  private resolveLogStreamPrefix(
    _workerId: string,
    taskArn?: string
  ): string {
    if (taskArn) {
      // Extract task ID from ARN: arn:aws:ecs:region:account:task/cluster/taskId
      const taskId = extractTaskIdFromArn(taskArn);
      if (taskId) {
        return `${this.config.logStreamPrefix}/worker/${taskId}`;
      }
    }

    // Fall back to prefix search based on worker ID
    return `${this.config.logStreamPrefix}`;
  }

  /**
   * Parse a timestamp parameter to epoch milliseconds
   */
  private parseTimestamp(
    value: string | number | undefined
  ): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'number') {
      return value;
    }

    // Parse ISO 8601 string
    const parsed = Date.parse(value);
    if (isNaN(parsed)) {
      this.logger.error(`Invalid timestamp: ${value}`);
      return undefined;
    }

    return parsed;
  }

  /**
   * Build a CloudWatch filter pattern from optional components
   */
  private buildFilterPattern(
    userPattern?: string,
    logLevel?: LogLevel
  ): string | undefined {
    const parts: string[] = [];

    if (userPattern) {
      parts.push(userPattern);
    }

    if (logLevel && logLevel !== 'all') {
      const levelFilter = LOG_LEVEL_FILTERS[logLevel];
      if (levelFilter) {
        parts.push(levelFilter);
      }
    }

    return parts.length > 0 ? parts.join(' ') : undefined;
  }
}

// ────────────────────────────────────────────────────────────────
// Internal state types
// ────────────────────────────────────────────────────────────────

/**
 * Internal state for a live tail session
 */
interface LiveTailState {
  connection: LogStreamConnection;
  lastTimestamp: number;
  pollTimer: ReturnType<typeof setInterval> | null;
  entrySentCount: number;
}

/**
 * Log stream info returned from describe operations
 */
export interface LogStreamInfo {
  logStreamName: string;
  creationTime?: string;
  firstEventTimestamp?: string;
  lastEventTimestamp?: string;
  lastIngestionTime?: string;
}

/**
 * Log level filter patterns for CloudWatch
 */
const LOG_LEVEL_FILTERS: Record<Exclude<LogLevel, 'all'>, string> = {
  stdout: '"[stdout]"',
  stderr: '"[stderr]"',
  error: '?"ERROR" ?"Error" ?"error" ?"[stderr]"',
  info: '?"INFO" ?"Info" ?"info" ?"[stdout]"',
  debug: '?"DEBUG" ?"Debug" ?"debug"',
};

// ────────────────────────────────────────────────────────────────
// Error class
// ────────────────────────────────────────────────────────────────

/**
 * Error class for worker logs operations
 */
export class WorkerLogsError extends Error {
  public readonly code: string;
  public readonly workerId: string | undefined;

  constructor(message: string, code: string, workerId: string | undefined) {
    super(message);
    this.name = 'WorkerLogsError';
    this.code = code;
    this.workerId = workerId;
  }
}

// ────────────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────────────

/**
 * Extract the task ID from an ECS task ARN
 *
 * @example
 * extractTaskIdFromArn('arn:aws:ecs:us-east-1:123456789:task/hq-workers/abc123')
 * // => 'abc123'
 */
export function extractTaskIdFromArn(taskArn: string): string | undefined {
  // Format: arn:aws:ecs:region:account:task/cluster/taskId
  const parts = taskArn.split('/');
  return parts.length >= 3 ? parts[parts.length - 1] : undefined;
}

/**
 * Validate that a retention period is a valid CloudWatch Logs value
 */
export function isValidRetentionDays(days: number): boolean {
  return (VALID_RETENTION_DAYS as readonly number[]).includes(days);
}

/**
 * Build CloudWatch log configuration for ECS task definition.
 * This generates the awslogs driver configuration that routes
 * container stdout/stderr to CloudWatch Logs.
 */
export function buildCloudWatchLogConfig(config: {
  logGroupName: string;
  region: string;
  streamPrefix: string;
  createGroup?: boolean;
}): {
  logDriver: 'awslogs';
  options: Record<string, string>;
} {
  return {
    logDriver: 'awslogs',
    options: {
      'awslogs-group': config.logGroupName,
      'awslogs-region': config.region,
      'awslogs-stream-prefix': config.streamPrefix,
      'awslogs-create-group': config.createGroup !== false ? 'true' : 'false',
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Mock CloudWatch client factory (for testing)
// ────────────────────────────────────────────────────────────────

/**
 * Create a mock CloudWatch Logs client for testing
 */
export function createMockCloudWatchLogsClient(options?: {
  filterLogEventsResult?: {
    events: Array<{
      logStreamName?: string;
      timestamp?: number;
      message?: string;
      ingestionTime?: number;
    }>;
    nextToken?: string;
  };
  getLogEventsResult?: {
    events: Array<{
      timestamp?: number;
      message?: string;
      ingestionTime?: number;
    }>;
    nextForwardToken?: string;
  };
  describeLogStreamsResult?: {
    logStreams: Array<{
      logStreamName?: string;
      creationTime?: number;
      firstEventTimestamp?: number;
      lastEventTimestamp?: number;
      lastIngestionTime?: number;
    }>;
  };
  filterLogEventsError?: Error;
  putRetentionPolicyError?: Error;
}): CloudWatchLogsClient {
  return {
    getLogEvents(): Promise<{
      events: Array<{
        timestamp?: number;
        message?: string;
        ingestionTime?: number;
      }>;
      nextForwardToken?: string;
      nextBackwardToken?: string;
    }> {
      if (options?.getLogEventsResult) {
        return Promise.resolve(options.getLogEventsResult);
      }
      return Promise.resolve({
        events: [],
        nextForwardToken: undefined,
        nextBackwardToken: undefined,
      });
    },

    filterLogEvents(): Promise<{
      events: Array<{
        logStreamName?: string;
        timestamp?: number;
        message?: string;
        ingestionTime?: number;
      }>;
      nextToken?: string;
    }> {
      if (options?.filterLogEventsError) {
        return Promise.reject(options.filterLogEventsError);
      }
      if (options?.filterLogEventsResult) {
        return Promise.resolve(options.filterLogEventsResult);
      }
      return Promise.resolve({
        events: [],
        nextToken: undefined,
      });
    },

    describeLogStreams(): Promise<{
      logStreams: Array<{
        logStreamName?: string;
        creationTime?: number;
        firstEventTimestamp?: number;
        lastEventTimestamp?: number;
        lastIngestionTime?: number;
      }>;
      nextToken?: string;
    }> {
      if (options?.describeLogStreamsResult) {
        return Promise.resolve({
          ...options.describeLogStreamsResult,
          nextToken: undefined,
        });
      }
      return Promise.resolve({
        logStreams: [],
        nextToken: undefined,
      });
    },

    putRetentionPolicy(): Promise<void> {
      if (options?.putRetentionPolicyError) {
        return Promise.reject(options.putRetentionPolicyError);
      }
      return Promise.resolve();
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Factory: Create from environment
// ────────────────────────────────────────────────────────────────

/**
 * Create a WorkerLogsService from environment variables.
 * Typical usage inside the HQ API server.
 *
 * Required env vars:
 * - CLOUDWATCH_LOG_GROUP: CloudWatch log group name
 * - AWS_REGION: AWS region
 *
 * Optional env vars:
 * - LOG_STREAM_PREFIX: Stream prefix (default: 'worker')
 * - LOG_RETENTION_DAYS: Retention in days (default: 30)
 * - LOG_DEFAULT_LIMIT: Default entries per request (default: 500)
 * - LOG_LIVE_TAIL_INTERVAL_MS: Live tail poll interval (default: 2000)
 */
export function createWorkerLogsServiceFromEnv(
  cwClient: CloudWatchLogsClient,
  options?: {
    logger?: WorkerLogsLogger;
  }
): WorkerLogsService {
  const logGroupName = process.env['CLOUDWATCH_LOG_GROUP'] ?? '/hq/workers';
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  const logStreamPrefix = process.env['LOG_STREAM_PREFIX'] ?? 'worker';
  const defaultRetentionDays = parseInt(
    process.env['LOG_RETENTION_DAYS'] ?? String(DEFAULT_RETENTION_DAYS),
    10
  );
  const defaultLimit = parseInt(
    process.env['LOG_DEFAULT_LIMIT'] ?? String(DEFAULT_LOG_LIMIT),
    10
  );
  const liveTailPollIntervalMs = parseInt(
    process.env['LOG_LIVE_TAIL_INTERVAL_MS'] ?? '2000',
    10
  );

  return new WorkerLogsService(
    {
      logGroupName,
      region,
      logStreamPrefix,
      defaultRetentionDays,
      defaultLimit,
      liveTailPollIntervalMs,
      logger: options?.logger,
    },
    cwClient
  );
}
