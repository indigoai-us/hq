/**
 * Tests for HeartbeatPoller
 *
 * Tests the Linear polling lifecycle, HIAMP message detection and routing,
 * non-HIAMP inform delivery, state persistence, and cursor management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatPoller } from '../heartbeat-poller.js';
import type { HeartbeatPollerOptions, Logger, HeartbeatState } from '../heartbeat-poller.js';
import type { HiampConfig } from '../config-loader.js';
import type { Router, RouteResult } from '../router.js';
import type { LinearClient, LinearComment } from '../linear-client.js';
import type { Inbox } from '../inbox.js';

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

/** Build a mock LinearComment */
function makeComment(overrides?: Partial<LinearComment>): LinearComment {
  return {
    id: 'comment-uuid-1',
    body: 'A regular comment',
    user: { id: 'user-uuid-1', name: 'Alex' },
    issue: { id: 'issue-uuid-1', identifier: 'ENG-123' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a HIAMP-formatted comment body (as posted by LinearSender) */
function makeHiampCommentBody(): string {
  return [
    'alex/backend-dev \u2192 stefan/architect',
    '',
    'The API contract is ready for review.',
    '',
    '<details>',
    '<summary>HIAMP envelope</summary>',
    '',
    '```',
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    'hq-msg: v1 | id: msg-a1b2c3d4 | from: alex/backend-dev | to: stefan/architect | intent: handoff | thread: thr-x1y2z3a4',
    '```',
    '</details>',
  ].join('\n');
}

/** Build a raw HIAMP message (no details block) */
function makeRawHiampBody(): string {
  return [
    'alex/backend-dev \u2192 stefan/architect',
    '',
    'The API contract is ready for review.',
    '',
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    'hq-msg: v1 | id: msg-a1b2c3d4 | from: alex/backend-dev | to: stefan/architect | intent: handoff | thread: thr-x1y2z3a4',
  ].join('\n');
}

/** A silent logger for tests */
const silentLogger: Logger = {
  debug: vi.fn(),
  warn: vi.fn(),
};

/** Create mock LinearClient */
function makeMockLinearClient(): LinearClient {
  return {
    listComments: vi.fn(),
    getIssue: vi.fn(),
    searchIssues: vi.fn(),
    createComment: vi.fn(),
    getTeams: vi.fn(),
    getProjects: vi.fn(),
    getRequestCount: vi.fn(() => 0),
    resetRateLimiter: vi.fn(),
  } as unknown as LinearClient;
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

// Mock fs module
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HeartbeatPoller', () => {
  let config: HiampConfig;
  let linearClient: ReturnType<typeof makeMockLinearClient>;
  let router: ReturnType<typeof makeMockRouter>;
  let inbox: ReturnType<typeof makeMockInbox>;

  beforeEach(() => {
    vi.useFakeTimers();
    config = makeConfig();
    linearClient = makeMockLinearClient();
    router = makeMockRouter();
    inbox = makeMockInbox();

    // Default: no state file, successful write
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    // Default: no comments
    (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makePoller(overrides?: Partial<HeartbeatPollerOptions>): HeartbeatPoller {
    return new HeartbeatPoller({
      config,
      hqRoot: '/test/hq',
      linearClient,
      router,
      inbox,
      logger: silentLogger,
      pollIntervalMinutes: 5,
      agentNames: ['stefan', 'Stefan'],
      ...overrides,
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('should start and become running', async () => {
      const poller = makePoller();
      expect(poller.isRunning()).toBe(false);

      await poller.start();
      expect(poller.isRunning()).toBe(true);

      await poller.stop();
      expect(poller.isRunning()).toBe(false);
    });

    it('should throw if started twice', async () => {
      const poller = makePoller();
      await poller.start();

      await expect(poller.start()).rejects.toThrow('already running');

      await poller.stop();
    });

    it('should run pollOnce without starting the loop', async () => {
      const poller = makePoller();
      poller.watchIssue('issue-1');

      const result = await poller.pollOnce();

      expect(result.commentsFound).toBe(0);
      expect(poller.isRunning()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Watch list management
  // -----------------------------------------------------------------------

  describe('watch list', () => {
    it('should add and remove watched issues', () => {
      const poller = makePoller();

      poller.watchIssue('issue-1');
      poller.watchIssue('issue-2');
      expect(poller.getWatchedIssueIds()).toEqual(['issue-1', 'issue-2']);

      poller.unwatchIssue('issue-1');
      expect(poller.getWatchedIssueIds()).toEqual(['issue-2']);
    });

    it('should not add duplicate issue IDs', () => {
      const poller = makePoller();

      poller.watchIssue('issue-1');
      poller.watchIssue('issue-1');
      expect(poller.getWatchedIssueIds()).toEqual(['issue-1']);
    });
  });

  // -----------------------------------------------------------------------
  // State persistence
  // -----------------------------------------------------------------------

  describe('state persistence', () => {
    it('should load persisted state on start', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-18T12:00:00.000Z',
        watchedIssueIds: ['issue-saved-1', 'issue-saved-2'],
      };

      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const poller = makePoller();
      await poller.start();

      expect(poller.getWatchedIssueIds()).toEqual(['issue-saved-1', 'issue-saved-2']);
      expect(poller.getState().lastPollAt).not.toBeNull(); // Updated after poll

      await poller.stop();
    });

    it('should save state after each poll cycle', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: null,
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const poller = makePoller();
      await poller.pollOnce();

      expect(mockWriteFile).toHaveBeenCalled();
      const writtenContent = (mockWriteFile as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
      const writtenState = JSON.parse(writtenContent) as HeartbeatState;
      expect(writtenState.lastPollAt).toBeTruthy();
      expect(writtenState.watchedIssueIds).toEqual(['issue-1']);
    });

    it('should save state on stop', async () => {
      const poller = makePoller();
      await poller.start();

      mockWriteFile.mockClear();
      await poller.stop();

      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should handle missing state file gracefully', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const poller = makePoller();
      const result = await poller.pollOnce();

      // Should not throw, should work with empty state
      expect(result).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Cursor management
  // -----------------------------------------------------------------------

  describe('cursor management', () => {
    it('should look back 1 hour on first poll', async () => {
      const now = new Date('2026-02-19T12:00:00.000Z');
      vi.setSystemTime(now);

      const savedState: HeartbeatState = {
        lastPollAt: null,
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const poller = makePoller();
      await poller.pollOnce();

      // Verify listComments was called
      expect(linearClient.listComments).toHaveBeenCalledWith('issue-1', { first: 100 });
    });

    it('should use lastPollAt as cursor on subsequent polls', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const comment = makeComment({
        updatedAt: '2026-02-19T11:30:00.000Z', // after lastPollAt
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [comment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.commentsFound).toBe(1);
    });

    it('should filter out comments older than the cursor', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const oldComment = makeComment({
        id: 'old-comment',
        updatedAt: '2026-02-19T10:00:00.000Z', // before lastPollAt
      });
      const newComment = makeComment({
        id: 'new-comment',
        updatedAt: '2026-02-19T11:30:00.000Z', // after lastPollAt
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [oldComment, newComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.commentsFound).toBe(1);
      expect(result.results[0]?.commentId).toBe('new-comment');
    });

    it('should use configurable initial lookback', async () => {
      const now = new Date('2026-02-19T12:00:00.000Z');
      vi.setSystemTime(now);

      const savedState: HeartbeatState = {
        lastPollAt: null,
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      // 30 minutes lookback instead of 1 hour
      const poller = makePoller({ initialLookbackMs: 30 * 60 * 1000 });

      const oldComment = makeComment({
        id: 'old',
        updatedAt: '2026-02-19T11:20:00.000Z', // 40 min ago, before 30-min lookback
      });
      const recentComment = makeComment({
        id: 'recent',
        updatedAt: '2026-02-19T11:40:00.000Z', // 20 min ago, within 30-min lookback
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [oldComment, recentComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const result = await poller.pollOnce();

      expect(result.commentsFound).toBe(1);
      expect(result.results[0]?.commentId).toBe('recent');
    });
  });

  // -----------------------------------------------------------------------
  // HIAMP message detection and routing
  // -----------------------------------------------------------------------

  describe('HIAMP message processing', () => {
    it('should detect and route a HIAMP message in a details block', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const hiampComment = makeComment({
        id: 'hiamp-comment',
        body: makeHiampCommentBody(),
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [hiampComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.hiampMessagesRouted).toBe(1);
      expect(result.results[0]?.isHiamp).toBe(true);
      expect(result.results[0]?.routeResult?.success).toBe(true);

      // Verify the router was called with the parsed message
      expect(router.route).toHaveBeenCalledTimes(1);
    });

    it('should detect and route a raw HIAMP message (no details block)', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const rawComment = makeComment({
        id: 'raw-hiamp-comment',
        body: makeRawHiampBody(),
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [rawComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.hiampMessagesRouted).toBe(1);
      expect(result.results[0]?.isHiamp).toBe(true);
    });

    it('should handle routing failure gracefully', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      (router.route as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        action: 'rejected',
        reason: 'Worker not found',
      });

      const hiampComment = makeComment({
        body: makeRawHiampBody(),
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [hiampComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.hiampMessagesRouted).toBe(0);
      expect(result.results[0]?.isHiamp).toBe(true);
      expect(result.results[0]?.routeResult?.success).toBe(false);
    });

    it('should handle router throwing an error', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      (router.route as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Router crashed'),
      );

      const hiampComment = makeComment({
        body: makeRawHiampBody(),
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [hiampComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.results[0]?.isHiamp).toBe(true);
      expect(result.results[0]?.error).toContain('Router crashed');
    });
  });

  // -----------------------------------------------------------------------
  // Non-HIAMP agent mention -> inform delivery
  // -----------------------------------------------------------------------

  describe('inform message delivery', () => {
    it('should deliver non-HIAMP comments mentioning agent as inform', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const mentionComment = makeComment({
        id: 'mention-comment',
        body: 'Hey Stefan, can you take a look at this?',
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [mentionComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.informMessagesDelivered).toBe(1);
      expect(result.results[0]?.isHiamp).toBe(false);
      expect(result.results[0]?.deliveredAsInform).toBe(true);

      // Verify inbox.deliver was called with an inform intent
      expect(inbox.deliver).toHaveBeenCalledTimes(1);
      const deliveredMsg = (inbox.deliver as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(deliveredMsg.intent).toBe('inform');
      expect(deliveredMsg.to).toMatch(/^stefan\//);
    });

    it('should be case-insensitive for agent name matching', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const mentionComment = makeComment({
        id: 'mention-lower',
        body: 'hey stefan, check this out',
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [mentionComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.informMessagesDelivered).toBe(1);
    });

    it('should skip comments that do not mention agent', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const unrelatedComment = makeComment({
        id: 'unrelated',
        body: 'This is a comment about the weather.',
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [unrelatedComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.informMessagesDelivered).toBe(0);
      expect(result.results[0]?.deliveredAsInform).toBe(false);
      expect(inbox.deliver).not.toHaveBeenCalled();
    });

    it('should handle inbox delivery failure gracefully', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      (inbox.deliver as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        error: 'Disk full',
      });

      const mentionComment = makeComment({
        body: 'Stefan please review',
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [mentionComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.informMessagesDelivered).toBe(0);
      expect(result.results[0]?.deliveredAsInform).toBe(false);
      expect(result.results[0]?.error).toContain('Failed to deliver inform');
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('should handle Linear API failure for a watched issue', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1', 'issue-2'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      // First issue fails, second succeeds
      (linearClient.listComments as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          success: false,
          error: 'Rate limited',
          code: 'RATE_LIMITED',
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.errors).toBe(1);
      // Should still have attempted the second issue
      expect(linearClient.listComments).toHaveBeenCalledTimes(2);
    });

    it('should handle listComments throwing an exception', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const onError = vi.fn();

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network failure'),
      );

      const poller = makePoller({ onError });
      const result = await poller.pollOnce();

      expect(result.errors).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle write state failure gracefully', async () => {
      mockWriteFile.mockRejectedValue(new Error('Permission denied'));

      const poller = makePoller();
      // Should not throw
      const result = await poller.pollOnce();
      expect(result).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Callbacks
  // -----------------------------------------------------------------------

  describe('callbacks', () => {
    it('should call onPollComplete after each cycle', async () => {
      const onPollComplete = vi.fn();

      const poller = makePoller({ onPollComplete });
      poller.watchIssue('issue-1');

      await poller.pollOnce();

      expect(onPollComplete).toHaveBeenCalledTimes(1);
      expect(onPollComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          pollStartedAt: expect.any(String),
          pollFinishedAt: expect.any(String),
          commentsFound: expect.any(Number),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Default worker resolution for inform delivery
  // -----------------------------------------------------------------------

  describe('default receive worker', () => {
    it('should not deliver inform if no worker can receive', async () => {
      const restrictedConfig = makeConfig({
        workerPermissions: {
          default: 'deny' as const,
          workers: [], // No workers at all
        },
      });

      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const mentionComment = makeComment({
        body: 'Hey Stefan, can you help?',
        updatedAt: '2026-02-19T11:30:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: {
          nodes: [mentionComment],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

      const poller = makePoller({ config: restrictedConfig });
      const result = await poller.pollOnce();

      expect(result.informMessagesDelivered).toBe(0);
      expect(inbox.deliver).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // No watched issues
  // -----------------------------------------------------------------------

  describe('no watched issues', () => {
    it('should complete a poll cycle with zero results if no issues watched', async () => {
      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.commentsFound).toBe(0);
      expect(result.hiampMessagesRouted).toBe(0);
      expect(result.informMessagesDelivered).toBe(0);
      expect(linearClient.listComments).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Multiple issues polling
  // -----------------------------------------------------------------------

  describe('multiple watched issues', () => {
    it('should poll all watched issues and aggregate results', async () => {
      const savedState: HeartbeatState = {
        lastPollAt: '2026-02-19T11:00:00.000Z',
        watchedIssueIds: ['issue-1', 'issue-2'],
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(savedState));

      const comment1 = makeComment({
        id: 'c1',
        body: 'Hey Stefan, check this',
        issue: { id: 'issue-1', identifier: 'ENG-1' },
        updatedAt: '2026-02-19T11:30:00.000Z',
      });
      const comment2 = makeComment({
        id: 'c2',
        body: makeRawHiampBody(),
        issue: { id: 'issue-2', identifier: 'ENG-2' },
        updatedAt: '2026-02-19T11:45:00.000Z',
      });

      (linearClient.listComments as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          success: true,
          data: {
            nodes: [comment1],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            nodes: [comment2],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        });

      const poller = makePoller();
      const result = await poller.pollOnce();

      expect(result.commentsFound).toBe(2);
      expect(result.informMessagesDelivered).toBe(1); // comment1 mentions Stefan
      expect(result.hiampMessagesRouted).toBe(1); // comment2 is HIAMP
    });
  });

  // -----------------------------------------------------------------------
  // Polling interval scheduling
  // -----------------------------------------------------------------------

  describe('polling interval', () => {
    it('should schedule polls at the configured interval', async () => {
      const onPollComplete = vi.fn();
      const poller = makePoller({
        pollIntervalMinutes: 1,
        onPollComplete,
      });

      await poller.start();

      // First poll ran immediately
      expect(onPollComplete).toHaveBeenCalledTimes(1);

      // Advance 1 minute
      await vi.advanceTimersByTimeAsync(60_000);

      expect(onPollComplete).toHaveBeenCalledTimes(2);

      // Advance another minute
      await vi.advanceTimersByTimeAsync(60_000);

      expect(onPollComplete).toHaveBeenCalledTimes(3);

      await poller.stop();
    });

    it('should stop scheduling after stop() is called', async () => {
      const onPollComplete = vi.fn();
      const poller = makePoller({
        pollIntervalMinutes: 1,
        onPollComplete,
      });

      await poller.start();
      expect(onPollComplete).toHaveBeenCalledTimes(1);

      await poller.stop();

      // Advance past interval
      await vi.advanceTimersByTimeAsync(120_000);

      // Should not have polled again
      expect(onPollComplete).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // State getter
  // -----------------------------------------------------------------------

  describe('getState', () => {
    it('should return a copy of the state', async () => {
      const poller = makePoller();
      poller.watchIssue('issue-1');

      const state = poller.getState();
      state.watchedIssueIds.push('modified');

      // Original should not be modified
      expect(poller.getWatchedIssueIds()).toEqual(['issue-1']);
    });
  });
});
