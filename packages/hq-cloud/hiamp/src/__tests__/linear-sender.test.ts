import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearSender, formatForLinear } from '../linear-sender.js';
import type { HiampConfig } from '../config-loader.js';
import type { LinearClient, LinearComment } from '../linear-client.js';
import type { LinearChannelResolver, LinearResolveResult } from '../linear-channel-resolver.js';
// Transport types used indirectly via LinearSender's API
import { DEFAULT_SEPARATOR } from '../constants.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal HiampConfig for testing */
function makeConfig(overrides?: Partial<HiampConfig>): HiampConfig {
  return {
    transport: 'slack' as const,
    identity: {
      owner: 'stefan',
      instanceId: 'stefan-hq-primary',
    },
    peers: [
      {
        owner: 'alex',
        slackBotId: 'U0ALEX1234',
        trustLevel: 'channel-scoped',
        workers: [
          { id: 'backend-dev', description: 'API endpoints' },
          { id: 'qa-tester', description: 'Testing' },
        ],
      },
      {
        owner: 'maria',
        slackBotId: 'U0MARIA5678',
        trustLevel: 'token-verified',
        workers: [{ id: 'designer' }],
      },
    ],
    slack: {
      botToken: 'xoxb-test-token',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated',
      channels: {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
      },
      eventMode: 'socket',
    },
    workerPermissions: {
      default: 'deny',
      workers: [
        {
          id: 'architect',
          send: true,
          receive: true,
          allowedIntents: [
            'handoff',
            'request',
            'inform',
            'query',
            'response',
            'acknowledge',
            'error',
            'share',
          ],
          allowedPeers: ['*'],
        },
        {
          id: 'backend-dev',
          send: true,
          receive: true,
          allowedIntents: ['handoff', 'request'],
          allowedPeers: ['alex'],
        },
        {
          id: 'qa-tester',
          send: false,
          receive: true,
          allowedIntents: ['query'],
          allowedPeers: ['alex'],
        },
      ],
    },
    ...overrides,
  };
}

/** Sample comment returned by LinearClient.createComment */
const sampleComment: LinearComment = {
  id: 'comment-uuid-1',
  body: 'formatted message',
  user: { id: 'bot-user', name: 'HQ Bot' },
  issue: { id: 'issue-uuid-1', identifier: 'ENG-123' },
  createdAt: '2026-02-19T10:00:00Z',
  updatedAt: '2026-02-19T10:00:00Z',
};

/** Create a mock LinearClient */
function makeMockLinearClient() {
  return {
    createComment: vi.fn().mockResolvedValue({
      success: true,
      data: sampleComment,
    }),
    getIssue: vi.fn(),
    listComments: vi.fn(),
    searchIssues: vi.fn(),
    getTeams: vi.fn(),
    getProjects: vi.fn(),
    getRequestCount: vi.fn().mockReturnValue(0),
    resetRateLimiter: vi.fn(),
  } as unknown as LinearClient;
}

/** Create a mock LinearChannelResolver that succeeds */
function makeMockChannelResolver(
  overrides?: Partial<{ resolve: ReturnType<typeof vi.fn> }>,
) {
  return {
    resolve: overrides?.resolve ?? vi.fn().mockResolvedValue({
      success: true,
      issueId: 'issue-uuid-1',
      issueIdentifier: 'ENG-123',
      strategy: 'explicit',
      teamKey: 'ENG',
    } satisfies LinearResolveResult),
    resolveChannel: vi.fn(),
    clearCache: vi.fn(),
    getCacheSize: vi.fn(),
  } as unknown as LinearChannelResolver;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatForLinear', () => {
  it('wraps envelope in a collapsed details block', () => {
    const header = 'stefan/architect \u2192 alex/backend-dev';
    const body = 'The API contract is ready.';
    const envelope = 'hq-msg:v1 | id:msg-abc12345 | from:stefan/architect | to:alex/backend-dev';
    const raw = `${header}\n\n${body}\n\n${DEFAULT_SEPARATOR}\n${envelope}`;

    const formatted = formatForLinear(raw);

    // Header and body should be visible
    expect(formatted).toContain(header);
    expect(formatted).toContain(body);

    // Envelope should be in a <details> block
    expect(formatted).toContain('<details>');
    expect(formatted).toContain('<summary>HIAMP envelope</summary>');
    expect(formatted).toContain('```');
    expect(formatted).toContain(DEFAULT_SEPARATOR);
    expect(formatted).toContain(envelope);
    expect(formatted).toContain('</details>');
  });

  it('returns message as-is when no separator found', () => {
    const raw = 'Some plain text without separator';
    expect(formatForLinear(raw)).toBe(raw);
  });
});

describe('LinearSender', () => {
  let config: HiampConfig;
  let mockClient: LinearClient;
  let mockResolver: LinearChannelResolver;
  let sender: LinearSender;

  beforeEach(() => {
    config = makeConfig();
    mockClient = makeMockLinearClient();
    mockResolver = makeMockChannelResolver();
    sender = new LinearSender({
      config,
      linearClient: mockClient,
      channelResolver: mockResolver,
    });
  });

  // -------------------------------------------------------------------------
  // send() — basic functionality
  // -------------------------------------------------------------------------

  describe('send', () => {
    it('should send a basic HIAMP message as a Linear comment', async () => {
      const result = await sender.send({
        to: 'alex/backend-dev',
        worker: 'architect',
        intent: 'handoff',
        body: 'The API contract is ready.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.messageId).toBe('comment-uuid-1');
      expect(result.channelId).toBe('issue-uuid-1');
      expect(result.thread).toMatch(/^thr-/);

      // Verify the formatted text contains header, body, and collapsed envelope
      expect(result.messageText).toContain('stefan/architect');
      expect(result.messageText).toContain('alex/backend-dev');
      expect(result.messageText).toContain('The API contract is ready.');
      expect(result.messageText).toContain('<details>');
      expect(result.messageText).toContain('intent:handoff');

      // Verify createComment was called
      expect((mockClient.createComment as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
        issueId: 'issue-uuid-1',
        body: expect.stringContaining('<details>'),
      });
    });

    it('should use explicit "from" address', async () => {
      const result = await sender.send({
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.messageText).toContain('stefan/architect');
    });

    it('should derive "from" from config identity + worker', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.messageText).toContain('stefan/architect');
    });

    it('should fail when neither from nor worker is provided', async () => {
      const result = await sender.send({
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_MESSAGE');
      expect(result.error).toContain('sender address');
    });

    it('should use provided thread ID', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
        thread: 'thr-custom01',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.thread).toBe('thr-custom01');
      expect(result.messageText).toContain('thread:thr-custom01');
    });

    it('should include optional fields in the message', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
        priority: 'high',
        ack: 'requested',
        ref: 'https://example.com/doc',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.messageText).toContain('priority:high');
      expect(result.messageText).toContain('ack:requested');
      expect(result.messageText).toContain('ref:https://example.com/doc');
    });

    it('should use explicit channelId as the issue ID', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test message.',
        channelId: 'explicit-issue-uuid',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('explicit-issue-uuid');

      // Resolver should NOT have been called
      expect((mockResolver.resolve as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // send() — all 8 intent types
  // -------------------------------------------------------------------------

  describe('intent types', () => {
    const allIntents = [
      'handoff',
      'request',
      'inform',
      'acknowledge',
      'query',
      'response',
      'error',
      'share',
    ] as const;

    for (const intent of allIntents) {
      it(`should support intent: ${intent}`, async () => {
        const result = await sender.send({
          worker: 'architect',
          to: 'alex/backend-dev',
          intent,
          body: `Message with intent ${intent}`,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.messageText).toContain(`intent:${intent}`);
      });
    }
  });

  // -------------------------------------------------------------------------
  // send() — threading continuity
  // -------------------------------------------------------------------------

  describe('threading', () => {
    it('should map thread to issue on first send', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'First message.',
        thread: 'thr-thread01',
      });

      expect(result.success).toBe(true);
      expect(sender.getThreadMapping('thr-thread01')).toBe('issue-uuid-1');
    });

    it('should reuse the same issue for subsequent messages in the same thread', async () => {
      // First message resolves via channel resolver
      await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'First message.',
        thread: 'thr-thread01',
      });

      // Reset mock to verify resolver is NOT called again
      (mockResolver.resolve as ReturnType<typeof vi.fn>).mockClear();

      // Second message in same thread
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'inform',
        body: 'Follow-up message.',
        thread: 'thr-thread01',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('issue-uuid-1');

      // Resolver should NOT have been called for the second message
      expect((mockResolver.resolve as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it('should use different issues for different threads', async () => {
      // First thread resolves to issue-uuid-1
      await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Thread 1 message.',
        thread: 'thr-thread01',
      });

      // Set up resolver to return a different issue for the second thread
      (mockResolver.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        issueId: 'issue-uuid-2',
        issueIdentifier: 'ENG-456',
        strategy: 'project-context',
        teamKey: 'ENG',
      });

      // Update mock client to return a different comment ID
      (mockClient.createComment as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: true,
        data: { ...sampleComment, id: 'comment-uuid-2' },
      });

      // Second thread resolves to issue-uuid-2
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'inform',
        body: 'Thread 2 message.',
        thread: 'thr-thread02',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.channelId).toBe('issue-uuid-2');

      expect(sender.getThreadMappingCount()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // sendReply()
  // -------------------------------------------------------------------------

  describe('sendReply', () => {
    it('should send a reply as a comment on the referenced issue', async () => {
      const result = await sender.sendReply({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'response',
        body: 'Here is the response.',
        threadRef: 'issue-uuid-1',
        replyTo: 'msg-original1',
        thread: 'thr-existing1',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.messageText).toContain('reply-to:msg-original1');
      expect(result.messageText).toContain('thread:thr-existing1');
      expect(result.channelId).toBe('issue-uuid-1');

      // Verify createComment was called with the threadRef issue ID
      expect((mockClient.createComment as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
        issueId: 'issue-uuid-1',
        body: expect.any(String),
      });
    });

    it('should record thread-to-issue mapping from sendReply', async () => {
      await sender.sendReply({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'response',
        body: 'Reply.',
        threadRef: 'issue-uuid-5',
        replyTo: 'msg-original1',
        thread: 'thr-reply01',
      });

      expect(sender.getThreadMapping('thr-reply01')).toBe('issue-uuid-5');
    });
  });

  // -------------------------------------------------------------------------
  // Permission checks
  // -------------------------------------------------------------------------

  describe('permission checks', () => {
    it('should deny workers not in permission list (default: deny)', async () => {
      const result = await sender.send({
        worker: 'unknown-worker',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('unknown-worker');
    });

    it('should deny workers with send: false', async () => {
      const result = await sender.send({
        worker: 'qa-tester',
        to: 'alex/backend-dev',
        intent: 'query',
        body: 'Question?',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('send permission');
    });

    it('should deny disallowed intent types', async () => {
      const result = await sender.send({
        worker: 'backend-dev',
        to: 'alex/qa-tester',
        intent: 'share',
        body: 'Sharing knowledge.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('share');
    });

    it('should deny messaging unauthorized peers', async () => {
      const result = await sender.send({
        worker: 'backend-dev',
        to: 'maria/designer',
        intent: 'request',
        body: 'Need design help.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('maria');
    });

    it('should allow wildcard peer access', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'maria/designer',
        intent: 'request',
        body: 'Design review needed.',
      });

      expect(result.success).toBe(true);
    });

    it('should allow workers when default is allow and worker not listed', async () => {
      config.workerPermissions.default = 'allow';
      const allowSender = new LinearSender({
        config,
        linearClient: mockClient,
        channelResolver: mockResolver,
      });

      const result = await allowSender.send({
        worker: 'unlisted-worker',
        to: 'alex/backend-dev',
        intent: 'inform',
        body: 'Hello.',
      });

      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Target address validation
  // -------------------------------------------------------------------------

  describe('target address validation', () => {
    it('should reject unknown peer owner', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'unknown-person/some-worker',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_MESSAGE');
      expect(result.error).toContain('unknown-person');
    });

    it('should reject unknown worker for known peer', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/nonexistent-worker',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_MESSAGE');
      expect(result.error).toContain('nonexistent-worker');
    });

    it('should reject malformed address', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'no-slash-here',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('INVALID_MESSAGE');
    });
  });

  // -------------------------------------------------------------------------
  // Kill switch and disabled
  // -------------------------------------------------------------------------

  describe('kill switch and disabled', () => {
    it('should refuse to send when kill switch is active', async () => {
      config.security = { defaultTrustLevel: 'channel-scoped', killSwitch: true };
      const killSwitchSender = new LinearSender({
        config,
        linearClient: mockClient,
        channelResolver: mockResolver,
      });

      const result = await killSwitchSender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('KILL_SWITCH');
    });

    it('should refuse to send when HIAMP is disabled', async () => {
      config.settings = {
        ackTimeout: 300,
        maxRetries: 1,
        threadIdleTimeout: 86400,
        threadMaxAge: 604800,
        inboxPath: 'workspace/inbox/',
        threadLogPath: 'workspace/threads/hiamp/',
        messageMaxLength: 4000,
        attachmentMaxInlineSize: 4000,
        enabled: false,
      };
      const disabledSender = new LinearSender({
        config,
        linearClient: mockClient,
        channelResolver: mockResolver,
      });

      const result = await disabledSender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('DISABLED');
    });

    it('should check kill switch on sendReply', async () => {
      config.security = { defaultTrustLevel: 'channel-scoped', killSwitch: true };
      const killSwitchSender = new LinearSender({
        config,
        linearClient: mockClient,
        channelResolver: mockResolver,
      });

      const result = await killSwitchSender.sendReply({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'response',
        body: 'Reply.',
        threadRef: 'issue-uuid-1',
        replyTo: 'msg-original1',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('KILL_SWITCH');
    });

    it('should check disabled on sendReply', async () => {
      config.settings = {
        ackTimeout: 300,
        maxRetries: 1,
        threadIdleTimeout: 86400,
        threadMaxAge: 604800,
        inboxPath: 'workspace/inbox/',
        threadLogPath: 'workspace/threads/hiamp/',
        messageMaxLength: 4000,
        attachmentMaxInlineSize: 4000,
        enabled: false,
      };
      const disabledSender = new LinearSender({
        config,
        linearClient: mockClient,
        channelResolver: mockResolver,
      });

      const result = await disabledSender.sendReply({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'response',
        body: 'Reply.',
        threadRef: 'issue-uuid-1',
        replyTo: 'msg-original1',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('DISABLED');
    });
  });

  // -------------------------------------------------------------------------
  // Linear API errors
  // -------------------------------------------------------------------------

  describe('Linear API errors', () => {
    it('should handle createComment failure', async () => {
      (mockClient.createComment as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Issue not found',
        code: 'NOT_FOUND',
      });

      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('TRANSPORT_ERROR');
      expect(result.error).toContain('Issue not found');
    });

    it('should map rate limit errors', async () => {
      (mockClient.createComment as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
      });

      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('RATE_LIMITED');
    });

    it('should map auth errors to PERMISSION_DENIED', async () => {
      (mockClient.createComment as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR',
      });

      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('PERMISSION_DENIED');
    });

    it('should handle createComment throwing an exception', async () => {
      (mockClient.createComment as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error: ECONNREFUSED'),
      );

      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('TRANSPORT_ERROR');
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  // -------------------------------------------------------------------------
  // Channel resolution errors
  // -------------------------------------------------------------------------

  describe('channel resolution', () => {
    it('should fail when channel resolution fails', async () => {
      const failResolver = makeMockChannelResolver({
        resolve: vi.fn().mockResolvedValue({
          success: false,
          error: 'No project mapping found for context "unknown"',
          code: 'NO_CONTEXT_MATCH',
        }),
      });

      const failSender = new LinearSender({
        config,
        linearClient: mockClient,
        channelResolver: failResolver,
      });

      const result = await failSender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
        context: 'unknown',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CHANNEL_RESOLVE_FAILED');
      expect(result.error).toContain('No project mapping');
    });

    it('should pass context to channel resolver', async () => {
      await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Working on hq-cloud.',
        context: 'hq-cloud',
      });

      expect((mockResolver.resolve as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
        targetPeerOwner: 'alex',
        context: 'hq-cloud',
      });
    });

    it('should fall back to ref when context is not provided', async () => {
      await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Test.',
        ref: 'https://example.com/project',
      });

      expect((mockResolver.resolve as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
        targetPeerOwner: 'alex',
        context: 'https://example.com/project',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Message formatting
  // -------------------------------------------------------------------------

  describe('message formatting', () => {
    it('should include collapsed envelope in the Linear comment', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'The API contract is ready.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      // The formatted text should have a <details> block
      expect(result.messageText).toContain('<details>');
      expect(result.messageText).toContain('<summary>HIAMP envelope</summary>');
      expect(result.messageText).toContain('</details>');

      // The header line should be outside the <details> block
      const detailsStart = result.messageText.indexOf('<details>');
      const headerIndex = result.messageText.indexOf('stefan/architect');
      expect(headerIndex).toBeLessThan(detailsStart);
    });

    it('should preserve human-readable body above the collapsed envelope', async () => {
      const result = await sender.send({
        worker: 'architect',
        to: 'alex/backend-dev',
        intent: 'inform',
        body: 'Multi-line\nbody text\nwith formatting.',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const detailsStart = result.messageText.indexOf('<details>');
      const bodyIndex = result.messageText.indexOf('Multi-line\nbody text\nwith formatting.');
      expect(bodyIndex).toBeLessThan(detailsStart);
    });
  });
});
