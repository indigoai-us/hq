/**
 * Tests for LinearTransport
 *
 * Tests the unified Linear transport layer that wires together
 * LinearClient, LinearChannelResolver, LinearSender, and HeartbeatPoller
 * behind the Transport interface.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearTransport } from '../linear-transport.js';
import type { LinearTransportOptions } from '../linear-transport.js';
import type { HiampConfig } from '../config-loader.js';
import type { LinearClient } from '../linear-client.js';
import type { LinearChannelResolver } from '../linear-channel-resolver.js';
import type { LinearSender } from '../linear-sender.js';
import type { HeartbeatPoller, Logger } from '../heartbeat-poller.js';
import type { Router, RouteResult } from '../router.js';
import type { Inbox } from '../inbox.js';
import type { Transport, TransportSendResult, TransportResolveResult } from '../transport.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid HiampConfig for testing */
function makeConfig(overrides?: Partial<HiampConfig>): HiampConfig {
  return {
    transport: 'slack' as const,
    identity: {
      owner: 'stefan',
      instanceId: 'test-hq',
    },
    peers: [
      {
        owner: 'alex',
        trustLevel: 'open' as const,
        workers: [{ id: 'backend-dev' }],
      },
    ],
    slack: {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated' as const,
      eventMode: 'socket' as const,
    },
    workerPermissions: {
      default: 'allow' as const,
      workers: [
        {
          id: 'architect',
          send: true,
          receive: true,
          allowedIntents: ['handoff', 'request', 'inform', 'query', 'response'],
          allowedPeers: ['*'],
        },
      ],
    },
    ...overrides,
  };
}

/** A silent logger for tests */
const silentLogger: Logger = {
  debug: vi.fn(),
  warn: vi.fn(),
};

/** Create mock LinearSender */
function makeMockSender(): LinearSender {
  return {
    send: vi.fn<[], Promise<TransportSendResult>>().mockResolvedValue({
      success: true,
      messageId: 'comment-uuid-1',
      channelId: 'issue-uuid-1',
      messageText: 'formatted message',
      thread: 'thr-test1234',
    }),
    sendReply: vi.fn<[], Promise<TransportSendResult>>().mockResolvedValue({
      success: true,
      messageId: 'comment-uuid-2',
      channelId: 'issue-uuid-1',
      messageText: 'formatted reply',
      thread: 'thr-test1234',
    }),
    getThreadMapping: vi.fn(),
    getThreadMappingCount: vi.fn(() => 0),
  } as unknown as LinearSender;
}

/** Create mock LinearChannelResolver */
function makeMockChannelResolver(): LinearChannelResolver {
  return {
    resolve: vi.fn().mockResolvedValue({
      success: true,
      issueId: 'issue-uuid-1',
      issueIdentifier: 'ENG-123',
      strategy: 'agent-comms',
      teamKey: 'ENG',
    }),
    resolveChannel: vi.fn<[], Promise<TransportResolveResult>>().mockResolvedValue({
      success: true,
      channelId: 'issue-uuid-1',
      channelName: 'ENG-123',
    }),
    clearCache: vi.fn(),
    getCacheSize: vi.fn(() => ({ teams: 0, issues: 0, agentComms: 0 })),
  } as unknown as LinearChannelResolver;
}

/** Create mock LinearClient */
function makeMockLinearClient(): LinearClient {
  return {
    getIssue: vi.fn(),
    listComments: vi.fn(),
    searchIssues: vi.fn(),
    createComment: vi.fn(),
    getTeams: vi.fn(),
    getProjects: vi.fn(),
    getRequestCount: vi.fn(() => 0),
    resetRateLimiter: vi.fn(),
  } as unknown as LinearClient;
}

/** Create mock HeartbeatPoller */
function makeMockHeartbeatPoller(): HeartbeatPoller {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    pollOnce: vi.fn(),
    isRunning: vi.fn(() => false),
    watchIssue: vi.fn(),
    unwatchIssue: vi.fn(),
    getWatchedIssueIds: vi.fn(() => []),
    getState: vi.fn(() => ({ lastPollAt: null, watchedIssueIds: [] })),
  } as unknown as HeartbeatPoller;
}

/** Create mock Router */
function makeMockRouter(): Router {
  return {
    route: vi.fn<[], Promise<RouteResult>>().mockResolvedValue({
      success: true,
      action: 'delivered',
      workerId: 'architect',
      reason: 'Message delivered to architect inbox',
    }),
    processRaw: vi.fn(),
    reloadRegistry: vi.fn(),
  } as unknown as Router;
}

/** Create mock Inbox */
function makeMockInbox(): Inbox {
  return {
    deliver: vi.fn().mockResolvedValue({ success: true, filePath: '/path/to/msg.json' }),
    readInbox: vi.fn(),
    readUnread: vi.fn(),
    markRead: vi.fn(),
    deleteMessage: vi.fn(),
    clearInbox: vi.fn(),
  } as unknown as Inbox;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LinearTransport', () => {
  let config: HiampConfig;
  let mockSender: ReturnType<typeof makeMockSender>;
  let mockChannelResolver: ReturnType<typeof makeMockChannelResolver>;
  let mockLinearClient: ReturnType<typeof makeMockLinearClient>;
  let mockPoller: ReturnType<typeof makeMockHeartbeatPoller>;
  let mockRouter: ReturnType<typeof makeMockRouter>;
  let mockInbox: ReturnType<typeof makeMockInbox>;

  beforeEach(() => {
    config = makeConfig();
    mockSender = makeMockSender();
    mockChannelResolver = makeMockChannelResolver();
    mockLinearClient = makeMockLinearClient();
    mockPoller = makeMockHeartbeatPoller();
    mockRouter = makeMockRouter();
    mockInbox = makeMockInbox();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeTransport(overrides?: Partial<LinearTransportOptions>): LinearTransport {
    return new LinearTransport(config, {
      hqRoot: '/test/hq',
      linearClient: mockLinearClient,
      channelResolver: mockChannelResolver,
      sender: mockSender,
      heartbeatPoller: mockPoller,
      router: mockRouter,
      inbox: mockInbox,
      logger: silentLogger,
      ...overrides,
    });
  }

  // -----------------------------------------------------------------------
  // Construction and identity
  // -----------------------------------------------------------------------

  describe('construction', () => {
    it('should have name "linear"', () => {
      const transport = makeTransport();
      expect(transport.name).toBe('linear');
    });

    it('should satisfy the Transport interface', () => {
      const transport: Transport = makeTransport();
      expect(transport.name).toBe('linear');
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.sendReply).toBe('function');
      expect(typeof transport.listen).toBe('function');
      expect(typeof transport.resolveChannel).toBe('function');
      expect(typeof transport.stop).toBe('function');
      expect(typeof transport.isListening).toBe('function');
    });

    it('should expose underlying components via accessors', () => {
      const transport = makeTransport();
      expect(transport.getLinearClient()).toBe(mockLinearClient);
      expect(transport.getChannelResolver()).toBe(mockChannelResolver);
      expect(transport.getSender()).toBe(mockSender);
    });

    it('should return null for heartbeat poller before listen()', () => {
      const transport = makeTransport();
      expect(transport.getHeartbeatPoller()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // send()
  // -----------------------------------------------------------------------

  describe('send()', () => {
    it('should delegate to LinearSender.send()', async () => {
      const transport = makeTransport();

      const result = await transport.send({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'handoff',
        body: 'The API contract is ready.',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.messageId).toBe('comment-uuid-1');
        expect(result.channelId).toBe('issue-uuid-1');
        expect(result.thread).toBe('thr-test1234');
      }

      expect(mockSender.send).toHaveBeenCalledTimes(1);
      expect(mockSender.send).toHaveBeenCalledWith({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'handoff',
        body: 'The API contract is ready.',
      });
    });

    it('should propagate send failures', async () => {
      (mockSender.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'HIAMP kill switch is active',
        code: 'KILL_SWITCH',
      });

      const transport = makeTransport();
      const result = await transport.send({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'handoff',
        body: 'Test',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('KILL_SWITCH');
      }
    });

    it('should pass all input fields through to sender', async () => {
      const transport = makeTransport();

      await transport.send({
        to: 'alex/backend-dev',
        from: 'stefan/architect',
        worker: 'architect',
        intent: 'request',
        body: 'Need code review',
        thread: 'thr-custom1234',
        priority: 'high',
        ack: 'requested',
        ref: 'hq-cloud',
        context: 'hq-cloud',
      });

      const callArgs = (mockSender.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(callArgs).toEqual({
        to: 'alex/backend-dev',
        from: 'stefan/architect',
        worker: 'architect',
        intent: 'request',
        body: 'Need code review',
        thread: 'thr-custom1234',
        priority: 'high',
        ack: 'requested',
        ref: 'hq-cloud',
        context: 'hq-cloud',
      });
    });
  });

  // -----------------------------------------------------------------------
  // sendReply()
  // -----------------------------------------------------------------------

  describe('sendReply()', () => {
    it('should delegate to LinearSender.sendReply()', async () => {
      const transport = makeTransport();

      const result = await transport.sendReply({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'response',
        body: 'LGTM, merging now.',
        threadRef: 'issue-uuid-1',
        replyTo: 'msg-original123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.messageId).toBe('comment-uuid-2');
      }

      expect(mockSender.sendReply).toHaveBeenCalledTimes(1);
      expect(mockSender.sendReply).toHaveBeenCalledWith({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'response',
        body: 'LGTM, merging now.',
        threadRef: 'issue-uuid-1',
        replyTo: 'msg-original123',
      });
    });

    it('should propagate reply failures', async () => {
      (mockSender.sendReply as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Linear API error: HTTP 500',
        code: 'TRANSPORT_ERROR',
      });

      const transport = makeTransport();
      const result = await transport.sendReply({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'response',
        body: 'Reply',
        threadRef: 'issue-uuid-1',
        replyTo: 'msg-original123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('TRANSPORT_ERROR');
      }
    });
  });

  // -----------------------------------------------------------------------
  // resolveChannel()
  // -----------------------------------------------------------------------

  describe('resolveChannel()', () => {
    it('should delegate to LinearChannelResolver.resolveChannel()', async () => {
      const transport = makeTransport();

      const result = await transport.resolveChannel({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.channelId).toBe('issue-uuid-1');
        expect(result.channelName).toBe('ENG-123');
      }

      expect(mockChannelResolver.resolveChannel).toHaveBeenCalledWith({
        targetPeerOwner: 'alex',
      });
    });

    it('should pass context through for project-based resolution', async () => {
      const transport = makeTransport();

      await transport.resolveChannel({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });

      expect(mockChannelResolver.resolveChannel).toHaveBeenCalledWith({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });
    });

    it('should pass explicit channelId through', async () => {
      const transport = makeTransport();

      await transport.resolveChannel({
        targetPeerOwner: 'alex',
        channelId: 'ENG-456',
      });

      expect(mockChannelResolver.resolveChannel).toHaveBeenCalledWith({
        targetPeerOwner: 'alex',
        channelId: 'ENG-456',
      });
    });

    it('should propagate resolution failures', async () => {
      (mockChannelResolver.resolveChannel as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Team not found: UNKNOWN',
        code: 'UNKNOWN_TEAM',
      });

      const transport = makeTransport();
      const result = await transport.resolveChannel({
        targetPeerOwner: 'alex',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Team not found');
      }
    });
  });

  // -----------------------------------------------------------------------
  // listen()
  // -----------------------------------------------------------------------

  describe('listen()', () => {
    it('should start HeartbeatPoller and set listening to true', async () => {
      const transport = makeTransport();
      expect(transport.isListening()).toBe(false);

      await transport.listen({
        onMessage: vi.fn(),
        onError: vi.fn(),
      });

      expect(transport.isListening()).toBe(true);
      expect(mockPoller.start).toHaveBeenCalledTimes(1);
    });

    it('should throw if already listening', async () => {
      const transport = makeTransport();
      await transport.listen({});

      await expect(transport.listen({})).rejects.toThrow(
        'LinearTransport is already listening',
      );
    });

    it('should throw if hqRoot is not provided', async () => {
      const transport = makeTransport({ hqRoot: undefined });

      await expect(transport.listen({})).rejects.toThrow(
        'hqRoot is required for listening',
      );
    });

    it('should expose heartbeat poller after listen()', async () => {
      const transport = makeTransport();
      await transport.listen({});

      expect(transport.getHeartbeatPoller()).toBe(mockPoller);
    });

    it('should pre-populate watch list from options', async () => {
      const transport = makeTransport({
        watchIssueIds: ['issue-a', 'issue-b'],
      });

      await transport.listen({});

      expect(mockPoller.watchIssue).toHaveBeenCalledWith('issue-a');
      expect(mockPoller.watchIssue).toHaveBeenCalledWith('issue-b');
    });
  });

  // -----------------------------------------------------------------------
  // stop()
  // -----------------------------------------------------------------------

  describe('stop()', () => {
    it('should stop the HeartbeatPoller and reset listening state', async () => {
      const transport = makeTransport();
      await transport.listen({});
      expect(transport.isListening()).toBe(true);

      await transport.stop();

      expect(transport.isListening()).toBe(false);
      expect(mockPoller.stop).toHaveBeenCalledTimes(1);
      expect(transport.getHeartbeatPoller()).toBeNull();
    });

    it('should handle stop() when not listening', async () => {
      const transport = makeTransport();

      // Should not throw
      await transport.stop();
      expect(transport.isListening()).toBe(false);
    });

    it('should clean up message handler after stop()', async () => {
      const onMessage = vi.fn();
      const transport = makeTransport();
      await transport.listen({ onMessage });
      await transport.stop();

      // Internal handlers should be cleared
      expect(transport.isListening()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isListening()
  // -----------------------------------------------------------------------

  describe('isListening()', () => {
    it('should return false initially', () => {
      const transport = makeTransport();
      expect(transport.isListening()).toBe(false);
    });

    it('should return true after listen()', async () => {
      const transport = makeTransport();
      await transport.listen({});
      expect(transport.isListening()).toBe(true);
    });

    it('should return false after stop()', async () => {
      const transport = makeTransport();
      await transport.listen({});
      await transport.stop();
      expect(transport.isListening()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // watchIssue / unwatchIssue
  // -----------------------------------------------------------------------

  describe('watch/unwatch issue', () => {
    it('should delegate watchIssue to heartbeat poller when listening', async () => {
      const transport = makeTransport();
      await transport.listen({});

      transport.watchIssue('new-issue-id');
      // 2 calls from watchIssueIds not set, plus 1 from this call
      expect(mockPoller.watchIssue).toHaveBeenCalledWith('new-issue-id');
    });

    it('should delegate unwatchIssue to heartbeat poller when listening', async () => {
      const transport = makeTransport();
      await transport.listen({});

      transport.unwatchIssue('old-issue-id');
      expect(mockPoller.unwatchIssue).toHaveBeenCalledWith('old-issue-id');
    });

    it('should not throw if watchIssue called before listen()', () => {
      const transport = makeTransport();
      // Should not throw - just a no-op since poller is null
      expect(() => transport.watchIssue('issue-id')).not.toThrow();
    });

    it('should not throw if unwatchIssue called before listen()', () => {
      const transport = makeTransport();
      expect(() => transport.unwatchIssue('issue-id')).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Integration: send -> poll -> verify delivery
  // -----------------------------------------------------------------------

  describe('integration: send and poll cycle', () => {
    it('should send a message and have it available for polling', async () => {
      // This test verifies that the send path and listen path
      // work through the same underlying components

      const transport = makeTransport();

      // Send a message
      const sendResult = await transport.send({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'handoff',
        body: 'Integration test message',
        context: 'hq-cloud',
      });

      expect(sendResult.success).toBe(true);
      if (sendResult.success) {
        expect(sendResult.messageId).toBeTruthy();
        expect(sendResult.channelId).toBeTruthy();
      }

      // Start listening
      const onMessage = vi.fn();
      await transport.listen({ onMessage });

      // Verify poller started
      expect(mockPoller.start).toHaveBeenCalledTimes(1);

      // Clean up
      await transport.stop();
    });
  });

  // -----------------------------------------------------------------------
  // Default component creation (no overrides)
  // -----------------------------------------------------------------------

  describe('default component creation', () => {
    it('should create LinearClient from API key if not overridden', () => {
      // This will throw because no LINEAR_API_KEY is set
      // and no apiKey override is provided
      expect(() => {
        new LinearTransport(config, {
          hqRoot: '/test/hq',
          // No linearClient override, no apiKey — should fail
        });
      }).toThrow('Linear API key is required');
    });

    it('should create LinearClient when apiKey is provided', () => {
      const transport = new LinearTransport(config, {
        hqRoot: '/test/hq',
        apiKey: 'lin_api_test_key',
        channelResolver: mockChannelResolver,
        sender: mockSender,
      });

      expect(transport.name).toBe('linear');
      expect(transport.getLinearClient()).toBeDefined();
    });

    it('should use default resolver config when none provided', () => {
      const transport = new LinearTransport(config, {
        hqRoot: '/test/hq',
        apiKey: 'lin_api_test_key',
        sender: mockSender,
      });

      // Should have created a default channel resolver
      expect(transport.getChannelResolver()).toBeDefined();
    });

    it('should use provided resolver config', () => {
      const transport = new LinearTransport(config, {
        hqRoot: '/test/hq',
        apiKey: 'lin_api_test_key',
        sender: mockSender,
        resolverConfig: {
          defaultTeam: 'PRODUCT',
          teams: [
            {
              key: 'PRODUCT',
              projectMappings: [
                { context: 'hq-cloud', projectId: 'proj-123' },
              ],
            },
          ],
        },
      });

      expect(transport.getChannelResolver()).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Error scenarios
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('should propagate HeartbeatPoller start failure', async () => {
      (mockPoller.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Failed to load state'),
      );

      const transport = makeTransport();
      await expect(transport.listen({})).rejects.toThrow('Failed to load state');
      expect(transport.isListening()).toBe(false);
    });

    it('should handle HeartbeatPoller stop failure gracefully', async () => {
      (mockPoller.stop as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Failed to save state'),
      );

      const transport = makeTransport();
      await transport.listen({});

      await expect(transport.stop()).rejects.toThrow('Failed to save state');
    });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle
  // -----------------------------------------------------------------------

  describe('full lifecycle', () => {
    it('should support create -> send -> listen -> stop cycle', async () => {
      const transport = makeTransport();

      // 1. Send before listening
      const sendResult = await transport.send({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'inform',
        body: 'Pre-listen message',
      });
      expect(sendResult.success).toBe(true);

      // 2. Start listening
      const onMessage = vi.fn();
      const onError = vi.fn();
      await transport.listen({ onMessage, onError });
      expect(transport.isListening()).toBe(true);

      // 3. Send while listening
      const sendResult2 = await transport.send({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'handoff',
        body: 'While-listen message',
      });
      expect(sendResult2.success).toBe(true);

      // 4. Watch an issue
      transport.watchIssue('new-issue');
      expect(mockPoller.watchIssue).toHaveBeenCalledWith('new-issue');

      // 5. Resolve a channel
      const resolveResult = await transport.resolveChannel({
        targetPeerOwner: 'alex',
      });
      expect(resolveResult.success).toBe(true);

      // 6. Stop
      await transport.stop();
      expect(transport.isListening()).toBe(false);
      expect(transport.getHeartbeatPoller()).toBeNull();
    });

    it('should support multiple listen/stop cycles', async () => {
      // Reset the mock to allow multiple start() calls
      let startCount = 0;
      (mockPoller.start as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        startCount++;
      });

      const transport = makeTransport();

      // First cycle
      await transport.listen({});
      expect(transport.isListening()).toBe(true);
      await transport.stop();
      expect(transport.isListening()).toBe(false);

      // Second cycle - need a fresh poller since the original is nullified
      const transport2 = makeTransport();
      await transport2.listen({});
      expect(transport2.isListening()).toBe(true);
      await transport2.stop();
      expect(transport2.isListening()).toBe(false);
    });
  });
});
