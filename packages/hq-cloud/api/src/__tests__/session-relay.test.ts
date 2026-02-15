import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));

// Mock MongoDB session operations
const mockSessions = new Map<string, Record<string, unknown>>();
const mockMessages: Record<string, unknown>[] = [];

vi.mock('../data/sessions.js', () => ({
  createSession: vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
    const session = {
      sessionId: input.sessionId,
      userId: input.userId,
      status: 'starting',
      ecsTaskArn: null,
      initialPrompt: input.initialPrompt ?? null,
      workerContext: input.workerContext ?? null,
      messageCount: 0,
      capabilities: null,
      resultStats: null,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      stoppedAt: null,
      error: null,
    };
    mockSessions.set(session.sessionId as string, session);
    return session;
  }),
  getSession: vi.fn().mockImplementation(async (sessionId: string) => {
    return mockSessions.get(sessionId) ?? null;
  }),
  listUserSessions: vi.fn().mockImplementation(async (userId: string) => {
    return Array.from(mockSessions.values()).filter((s) => s.userId === userId);
  }),
  updateSessionStatus: vi.fn().mockImplementation(async (sessionId: string, status: string, extra?: Record<string, unknown>) => {
    const session = mockSessions.get(sessionId);
    if (!session) return null;
    session.status = status;
    if (extra?.ecsTaskArn) session.ecsTaskArn = extra.ecsTaskArn;
    if (extra?.error) session.error = extra.error;
    if (extra?.capabilities) session.capabilities = extra.capabilities;
    if (extra?.resultStats) session.resultStats = extra.resultStats;
    if (status === 'stopped' || status === 'errored') session.stoppedAt = new Date();
    return session;
  }),
  canCreateSession: vi.fn().mockResolvedValue(true),
  countActiveSessions: vi.fn().mockResolvedValue(0),
  findIdleSessions: vi.fn().mockResolvedValue([]),
  recordSessionActivity: vi.fn(),
  ensureSessionIndexes: vi.fn(),
}));

vi.mock('../data/session-messages.js', () => ({
  storeMessage: vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
    const msg = {
      sessionId: input.sessionId,
      sequence: mockMessages.length + 1,
      timestamp: new Date(),
      type: input.type,
      content: input.content,
      metadata: input.metadata ?? {},
    };
    mockMessages.push(msg);
    return msg;
  }),
  getSessionMessages: vi.fn().mockImplementation(async (sessionId: string) => {
    return mockMessages.filter((m) => m.sessionId === sessionId);
  }),
  getLatestMessages: vi.fn().mockResolvedValue([]),
  ensureSessionMessageIndexes: vi.fn(),
}));

// Import after mocks
import {
  getOrCreateRelay,
  getRelay,
  removeRelay,
  handleClaudeCodeConnection,
  addBrowserToSession,
  handleBrowserMessage,
  resetRelays,
  sendToClaudeCode,
  sendControlResponse,
  sendControlCancelRequest,
  sendInterrupt,
  sendSetPermissionMode,
  sendSetModel,
  sendUpdateEnvironmentVariables,
  MessageBuffer,
} from '../ws/session-relay.js';
import { updateSessionStatus, recordSessionActivity } from '../data/sessions.js';
import { storeMessage } from '../data/session-messages.js';

// --- Mock WebSocket ---

const OPEN = 1;
const CLOSED = 3;

class MockWebSocket extends EventEmitter {
  readyState: number = OPEN;
  OPEN = OPEN;
  CLOSED = CLOSED;
  sentMessages: string[] = [];
  closeCode: number | null = null;
  closeReason: string | null = null;

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code ?? null;
    this.closeReason = reason ?? null;
    this.readyState = CLOSED;
    this.emit('close', code, Buffer.from(reason ?? ''));
  }

  terminate(): void {
    this.readyState = CLOSED;
    this.emit('close', 1006, Buffer.from(''));
  }

  /**
   * Simulate receiving a message from the remote end.
   */
  simulateMessage(data: string | Record<string, unknown>): void {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    this.emit('message', Buffer.from(str));
  }

  /**
   * Simulate receiving an NDJSON message (newline-delimited).
   */
  simulateNdjson(...messages: Record<string, unknown>[]): void {
    const ndjson = messages.map((m) => JSON.stringify(m)).join('\n');
    this.emit('message', Buffer.from(ndjson));
  }
}

// --- Helper Functions ---

function createMockSocket(): MockWebSocket {
  return new MockWebSocket();
}

/**
 * Parse a sent message, unwrapping the ServerEvent envelope if present.
 * Messages sent to browsers are wrapped as { type, payload, timestamp }.
 */
function unwrapBrowserMessage(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.payload && typeof parsed.payload === 'object' && parsed.timestamp) {
    return parsed.payload as Record<string, unknown>;
  }
  return parsed;
}

function getLastSentMessage(socket: MockWebSocket): Record<string, unknown> {
  const last = socket.sentMessages[socket.sentMessages.length - 1];
  if (!last) throw new Error('No messages sent');
  return unwrapBrowserMessage(last);
}

function getAllSentMessages(socket: MockWebSocket): Record<string, unknown>[] {
  return socket.sentMessages.map((s) => unwrapBrowserMessage(s));
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
}

// --- Tests ---

describe('Session Relay', () => {
  beforeEach(() => {
    resetRelays();
    mockSessions.clear();
    mockMessages.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetRelays();
  });

  // --- Relay Registry ---

  describe('relay registry', () => {
    it('should create a new relay', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      expect(relay.sessionId).toBe('session-1');
      expect(relay.userId).toBe('user-1');
      expect(relay.claudeSocket).toBeNull();
      expect(relay.initialized).toBe(false);
      expect(relay.messageBuffer.size).toBe(0);
    });

    it('should return existing relay for same sessionId', () => {
      const relay1 = getOrCreateRelay('session-1', 'user-1');
      const relay2 = getOrCreateRelay('session-1', 'user-1');
      expect(relay1).toBe(relay2);
    });

    it('should create relay with initial prompt and worker context', () => {
      const relay = getOrCreateRelay('session-1', 'user-1', {
        initialPrompt: 'Hello',
        workerContext: 'dev-team/backend',
      });
      expect(relay.initialPrompt).toBe('Hello');
      expect(relay.workerContext).toBe('dev-team/backend');
    });

    it('should get relay by sessionId', () => {
      getOrCreateRelay('session-1', 'user-1');
      const relay = getRelay('session-1');
      expect(relay).toBeDefined();
      expect(relay?.sessionId).toBe('session-1');
    });

    it('should return undefined for nonexistent relay', () => {
      const relay = getRelay('nonexistent');
      expect(relay).toBeUndefined();
    });

    it('should remove relay and close connections', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      const browserSocket = createMockSocket();

      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;
      relay.browserSockets.add(browserSocket as unknown as import('ws').WebSocket);

      removeRelay('session-1');

      expect(getRelay('session-1')).toBeUndefined();
      expect(claudeSocket.closeCode).toBe(1000);
      // Browser should receive stopped status
      const browserMsg = getLastSentMessage(browserSocket);
      expect(browserMsg?.type).toBe('session_status');
      expect(browserMsg?.status).toBe('stopped');
    });
  });

  // --- Claude Code Connection ---

  describe('Claude Code connection', () => {
    it('should reject connection for unknown session', () => {
      const socket = createMockSocket();
      handleClaudeCodeConnection('unknown', socket as unknown as import('ws').WebSocket);
      expect(socket.closeCode).toBe(4004);
    });

    it('should accept connection for existing relay', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();

      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      expect(relay.claudeSocket).toBe(socket);
    });

    it('should replace existing Claude Code connection', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();

      handleClaudeCodeConnection('session-1', socket1 as unknown as import('ws').WebSocket);
      handleClaudeCodeConnection('session-1', socket2 as unknown as import('ws').WebSocket);

      expect(relay.claudeSocket).toBe(socket2);
      expect(socket1.closeCode).toBe(1000);
    });

    it('should broadcast initializing startup phase to browsers on connect', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_status');
      expect(msg?.status).toBe('starting');
      expect(msg?.startupPhase).toBe('initializing');
      expect(msg?.startupTimestamp).toBeTypeOf('number');
    });

    it('should broadcast failed phase when connection closes during startup', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      // Clear messages from connect
      browser.sentMessages.length = 0;

      // Simulate close (still in startup — startupPhase is 'initializing')
      socket.emit('close');
      await tick();

      expect(relay.claudeSocket).toBeNull();
      expect(updateSessionStatus).toHaveBeenCalledWith('session-1', 'errored', {
        error: 'Container disconnected during startup',
      });

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_status');
      expect(msg?.status).toBe('errored');
      expect(msg?.startupPhase).toBe('failed');
    });

    it('should broadcast stopped status when connection closes after startup complete', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      // Complete startup by sending system/init
      socket.simulateNdjson({
        type: 'system',
        subtype: 'init',
        cwd: '/project',
        session_id: 'cc-1',
        model: 'claude-sonnet-4-20250514',
        tools: [],
        mcp_servers: [],
        permission_mode: 'default',
        claude_code_version: '1.0.0',
      });
      await tick();

      // Clear messages from init
      browser.sentMessages.length = 0;
      vi.clearAllMocks();

      // Simulate close after startup is complete
      socket.emit('close');
      await tick();

      expect(relay.claudeSocket).toBeNull();
      expect(updateSessionStatus).toHaveBeenCalledWith('session-1', 'stopped');

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_status');
      expect(msg?.status).toBe('stopped');
    });
  });

  // --- Container -> Server Message Types ---

  describe('container -> server: system/init', () => {
    it('should handle system/init and store capabilities', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      socket.simulateNdjson({
        type: 'system',
        subtype: 'init',
        cwd: '/home/user/project',
        session_id: 'cc-session-123',
        model: 'claude-sonnet-4-20250514',
        tools: [{ name: 'Read', type: 'builtin' }, { name: 'Write', type: 'builtin' }],
        mcp_servers: [{ name: 'filesystem' }],
        permission_mode: 'default',
        claude_code_version: '1.0.0',
      });

      await tick();

      expect(relay.initialized).toBe(true);
      expect(relay.capabilities).toBeDefined();
      expect(relay.capabilities?.model).toBe('claude-sonnet-4-20250514');
      expect(relay.capabilities?.cwd).toBe('/home/user/project');
      expect(relay.capabilities?.tools).toHaveLength(2);
      expect(relay.capabilities?.mcpServers).toHaveLength(1);

      expect(updateSessionStatus).toHaveBeenCalledWith(
        'session-1',
        'active',
        expect.objectContaining({
          capabilities: expect.objectContaining({
            model: 'claude-sonnet-4-20250514',
            cwd: '/home/user/project',
          }),
        })
      );
    });

    it('should send initial prompt after system/init in full NDJSON format', async () => {
      getOrCreateRelay('session-1', 'user-1', { initialPrompt: 'Build a REST API' });
      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      socket.simulateNdjson({
        type: 'system',
        subtype: 'init',
        cwd: '/home/user',
        session_id: 'cc-123',
        model: 'claude-sonnet-4-20250514',
        tools: [],
        mcp_servers: [],
        permission_mode: 'default',
        claude_code_version: '1.0.0',
      });

      await tick();

      // Check that a user message was sent to Claude Code in full NDJSON format
      const sentMsgs = socket.sentMessages;
      const userMsg = sentMsgs.find((s) => {
        const parsed = JSON.parse(s) as Record<string, unknown>;
        return parsed.type === 'user';
      });
      expect(userMsg).toBeDefined();
      const parsed = JSON.parse(userMsg!) as Record<string, unknown>;
      // Should use full message wrapper format
      expect(parsed.message).toEqual({
        role: 'user',
        content: 'Build a REST API',
      });
      expect(parsed.parent_tool_use_id).toBeNull();
      expect(parsed.session_id).toBe('session-1');

      // Check stored in messages
      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'user',
          content: 'Build a REST API',
        })
      );
    });

    it('should broadcast capabilities to browsers after init', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      // Clear connect messages
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'system',
        subtype: 'init',
        cwd: '/project',
        session_id: 'cc-1',
        model: 'claude-sonnet-4-20250514',
        tools: [],
        mcp_servers: [],
        permission_mode: 'default',
        claude_code_version: '1.0.0',
      });

      await tick();

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_status');
      expect(msg?.status).toBe('active');
      expect(msg?.capabilities).toBeDefined();
    });
  });

  describe('container -> server: assistant', () => {
    it('should store and relay assistant message with string content', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'assistant',
        content: 'Hello! I can help you with that.',
        stop_reason: 'end_turn',
      });

      await tick();

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'assistant',
          content: 'Hello! I can help you with that.',
        })
      );
      expect(recordSessionActivity).toHaveBeenCalledWith('session-1');

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_message');
      expect(msg?.messageType).toBe('assistant');
      expect(msg?.content).toBe('Hello! I can help you with that.');
    });

    it('should handle assistant message with array content', async () => {
      getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      socket.simulateNdjson({
        type: 'assistant',
        content: [
          { type: 'text', text: 'Some text' },
          { type: 'tool_use', name: 'Read', input: { path: '/file.ts' } },
        ],
      });

      await tick();

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'assistant',
        })
      );
    });
  });

  describe('container -> server: stream_event', () => {
    it('should relay stream events to browsers', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'stream_event',
        delta: { text: 'Hello' },
        index: 0,
      });

      await tick();

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_stream');
      expect(msg?.sessionId).toBe('session-1');
      expect(msg?.event).toBeDefined();
    });
  });

  describe('container -> server: control_request/can_use_tool', () => {
    it('should store and relay permission request with decision_reason', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'control_request',
        request_id: 'req-001',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          tool_use_id: 'tool-123',
          input: { command: 'ls -la' },
          decision_reason: 'Tool requires permission in default mode',
        },
      });

      await tick();

      // Should be stored as pending
      expect(relay.pendingPermissions.has('req-001')).toBe(true);

      // Should store message with decision_reason
      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'permission_request',
          metadata: expect.objectContaining({
            requestId: 'req-001',
            toolName: 'Bash',
            toolUseId: 'tool-123',
            decisionReason: 'Tool requires permission in default mode',
          }),
        })
      );

      // Should relay to browser with decision_reason
      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_permission_request');
      expect(msg?.requestId).toBe('req-001');
      expect(msg?.toolName).toBe('Bash');
      expect(msg?.decisionReason).toBe('Tool requires permission in default mode');
    });
  });

  describe('container -> server: control_request/hook_callback', () => {
    it('should store and relay hook_callback', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'control_request',
        request_id: 'req-002',
        request: {
          subtype: 'hook_callback',
          hook_name: 'pre_tool_use',
          data: { toolName: 'Write' },
        },
      });

      await tick();

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system',
          metadata: expect.objectContaining({
            requestId: 'req-002',
          }),
        })
      );

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_control');
      expect(msg?.subtype).toBe('hook_callback');
    });
  });

  describe('container -> server: tool_progress', () => {
    it('should relay tool progress to browsers', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'tool_progress',
        tool_use_id: 'tool-123',
        elapsed_ms: 5000,
      });

      await tick();

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_tool_progress');
      expect(msg?.sessionId).toBe('session-1');
    });
  });

  describe('container -> server: result', () => {
    it('should store result stats and update session on success', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'result',
        result: 'Task completed successfully',
        result_type: 'success',
        duration_ms: 12500,
        cost_usd: 0.0234,
        usage: {
          input_tokens: 1500,
          output_tokens: 800,
          total_tokens: 2300,
        },
      });

      await tick();

      // Should update session as active (not stopped) with stats
      expect(updateSessionStatus).toHaveBeenCalledWith(
        'session-1',
        'active',
        expect.objectContaining({
          resultStats: expect.objectContaining({
            duration: 12500,
            cost: 0.0234,
            inputTokens: 1500,
            outputTokens: 800,
            totalTokens: 2300,
            resultType: 'success',
          }),
        })
      );

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_result');
      expect(msg?.resultStats).toBeDefined();
    });

    it('should set session to errored on error result', async () => {
      getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      socket.simulateNdjson({
        type: 'result',
        result_type: 'error_during_execution',
        error: 'API rate limit exceeded',
        duration_ms: 3000,
        cost_usd: 0.01,
        usage: { input_tokens: 500, output_tokens: 0, total_tokens: 500 },
      });

      await tick();

      expect(updateSessionStatus).toHaveBeenCalledWith(
        'session-1',
        'errored',
        expect.objectContaining({
          error: 'API rate limit exceeded',
          resultStats: expect.objectContaining({
            resultType: 'error_during_execution',
          }),
        })
      );
    });

    it('should handle error_max_turns result', async () => {
      getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      socket.simulateNdjson({
        type: 'result',
        result_type: 'error_max_turns',
        duration_ms: 60000,
      });

      await tick();

      expect(updateSessionStatus).toHaveBeenCalledWith(
        'session-1',
        'errored',
        expect.objectContaining({
          error: 'error_max_turns',
        })
      );
    });
  });

  describe('container -> server: keep_alive', () => {
    it('should handle keep_alive without error', async () => {
      getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      // Should not throw
      socket.simulateNdjson({ type: 'keep_alive' });
      await tick();

      // No message stored, no crash
      expect(storeMessage).not.toHaveBeenCalled();
    });
  });

  describe('container -> server: auth_status', () => {
    it('should relay auth_status to browsers', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'auth_status',
        authenticated: true,
        provider: 'anthropic',
      });

      await tick();

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_auth_status');
      expect(msg?.sessionId).toBe('session-1');
    });
  });

  describe('container -> server: tool_use_summary', () => {
    it('should store and relay tool_use_summary', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'tool_use_summary',
        tools_used: ['Read', 'Write', 'Bash'],
        total_calls: 5,
      });

      await tick();

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_use',
        })
      );

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_tool_use_summary');
    });
  });

  describe('container -> server: unknown message types', () => {
    it('should forward unknown message types as session_raw', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'some_new_type',
        data: 'custom',
      });

      await tick();

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_raw');
      expect(msg?.message).toBeDefined();
    });
  });

  describe('NDJSON parser', () => {
    it('should handle multiple messages in a single NDJSON payload', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser.sentMessages.length = 0;

      // Send two messages in one NDJSON payload
      socket.simulateNdjson(
        { type: 'stream_event', delta: { text: 'Hello' } },
        { type: 'stream_event', delta: { text: ' World' } }
      );

      await tick();

      const msgs = getAllSentMessages(browser);
      expect(msgs.length).toBe(2);
      expect(msgs[0]!.type).toBe('session_stream');
      expect(msgs[1]!.type).toBe('session_stream');
    });

    it('should skip malformed JSON lines', async () => {
      getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);

      // Simulate raw message with bad + good lines
      socket.emit('message', Buffer.from('not-json\n{"type":"keep_alive"}\n'));
      await tick();

      // Should not crash
    });
  });

  // --- Server -> Container Message Sending ---

  describe('server -> container: sendToClaudeCode', () => {
    it('should send NDJSON to Claude Code socket', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      const result = sendToClaudeCode(relay, { type: 'keep_alive' });

      expect(result).toBe(true);
      expect(socket.sentMessages[0]).toBe('{"type":"keep_alive"}\n');
    });

    it('should return false when no Claude Code socket', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');

      const result = sendToClaudeCode(relay, { type: 'keep_alive' });

      expect(result).toBe(false);
    });

    it('should return false when socket is closed', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      socket.readyState = CLOSED;
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      const result = sendToClaudeCode(relay, { type: 'keep_alive' });

      expect(result).toBe(false);
    });
  });

  describe('server -> container: sendControlResponse', () => {
    it('should send allow response', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      sendControlResponse(relay, 'req-001', 'allow', { command: 'ls' });

      const sent = JSON.parse(socket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('control_response');
      const resp = (sent as { response: { response: { behavior: string; updatedInput: Record<string, unknown> } } }).response;
      expect(resp.response.behavior).toBe('allow');
      expect(resp.response.updatedInput).toEqual({ command: 'ls' });
    });

    it('should send deny response', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      sendControlResponse(relay, 'req-002', 'deny', undefined, 'Not allowed');

      const sent = JSON.parse(socket.sentMessages[0]!.trim()) as Record<string, unknown>;
      const resp = (sent as { response: { response: { behavior: string; message: string } } }).response;
      expect(resp.response.behavior).toBe('deny');
      expect(resp.response.message).toBe('Not allowed');
    });
  });

  describe('server -> container: sendControlCancelRequest', () => {
    it('should send control_cancel_request', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      sendControlCancelRequest(relay, 'req-001');

      const sent = JSON.parse(socket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('control_cancel_request');
      expect(sent.request_id).toBe('req-001');
    });
  });

  describe('server -> container: sendInterrupt', () => {
    it('should send interrupt', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      sendInterrupt(relay);

      const sent = JSON.parse(socket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('interrupt');
    });
  });

  describe('server -> container: sendSetPermissionMode', () => {
    it('should send set_permission_mode', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      sendSetPermissionMode(relay, 'bypassPermissions');

      const sent = JSON.parse(socket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('set_permission_mode');
      expect(sent.permission_mode).toBe('bypassPermissions');
    });
  });

  describe('server -> container: sendSetModel', () => {
    it('should send set_model', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      sendSetModel(relay, 'claude-opus-4-20250514');

      const sent = JSON.parse(socket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('set_model');
      expect(sent.model).toBe('claude-opus-4-20250514');
    });
  });

  describe('server -> container: sendUpdateEnvironmentVariables', () => {
    it('should send update_environment_variables', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const socket = createMockSocket();
      relay.claudeSocket = socket as unknown as import('ws').WebSocket;

      sendUpdateEnvironmentVariables(relay, { NODE_ENV: 'production', DEBUG: 'true' });

      const sent = JSON.parse(socket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('update_environment_variables');
      expect(sent.environment_variables).toEqual({ NODE_ENV: 'production', DEBUG: 'true' });
    });
  });

  // --- Browser -> Server Message Handling ---

  describe('browser -> server: session_user_message', () => {
    it('should forward user message to Claude Code in full NDJSON format', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'session-1',
          content: 'Hello Claude',
        }))
      );

      // Should send to Claude Code in full NDJSON user message format
      const sent = JSON.parse(claudeSocket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('user');
      // Must include message wrapper with role and content
      expect(sent.message).toEqual({
        role: 'user',
        content: 'Hello Claude',
      });
      // Must include parent_tool_use_id as null
      expect(sent.parent_tool_use_id).toBeNull();
      // Must include session_id
      expect(sent.session_id).toBe('session-1');

      // Should store message
      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'user',
          content: 'Hello Claude',
        })
      );
    });

    it('should accept message from session owner (userId matches)', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'session-1',
          content: 'Hello from owner',
        })),
        'user-1' // Matches relay owner
      );

      // Should send to Claude Code (ownership accepted)
      expect(claudeSocket.sentMessages.length).toBe(1);
      const sent = JSON.parse(claudeSocket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('user');
    });

    it('should echo user message back to all browsers', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browser1 = createMockSocket();
      const browser2 = createMockSocket();
      relay.browserSockets.add(browser1 as unknown as import('ws').WebSocket);
      relay.browserSockets.add(browser2 as unknown as import('ws').WebSocket);

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'session-1',
          content: 'Broadcast test',
        })),
        'user-1'
      );

      // Both browsers should receive the echo
      const msg1 = getLastSentMessage(browser1);
      const msg2 = getLastSentMessage(browser2);
      expect(msg1?.type).toBe('session_message');
      expect(msg1?.messageType).toBe('user');
      expect(msg1?.content).toBe('Broadcast test');
      expect(msg2?.type).toBe('session_message');
      expect(msg2?.content).toBe('Broadcast test');
    });

    it('should not forward if content is empty', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'session-1',
          content: '',
        })),
        'user-1'
      );

      // Should NOT send to Claude Code
      expect(claudeSocket.sentMessages.length).toBe(0);
      expect(storeMessage).not.toHaveBeenCalled();
    });

    it('should not forward if claude socket is not connected', async () => {
      getOrCreateRelay('session-1', 'user-1');
      // No claudeSocket set

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'session-1',
          content: 'Hello',
        })),
        'user-1'
      );

      expect(storeMessage).not.toHaveBeenCalled();
    });
  });

  describe('browser -> server: session_permission_response', () => {
    it('should forward allow to Claude Code with correct control_response format', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      // Add a pending permission
      relay.pendingPermissions.set('req-001', {
        type: 'control_request',
        request_id: 'req-001',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          input: { command: 'ls' },
        },
      });

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_permission_response',
          sessionId: 'session-1',
          requestId: 'req-001',
          behavior: 'allow',
        })),
        'user-1'
      );

      // Pending should be cleared
      expect(relay.pendingPermissions.has('req-001')).toBe(false);

      // Should send control_response to Claude Code in correct format
      const sent = JSON.parse(claudeSocket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('control_response');
      // Verify full control_response structure
      const response = sent.response as {
        subtype: string;
        request_id: string;
        response: { behavior: string; updatedInput?: Record<string, unknown> };
      };
      expect(response.subtype).toBe('success');
      expect(response.request_id).toBe('req-001');
      expect(response.response.behavior).toBe('allow');
      // Allow should pass through the input as updatedInput
      expect(response.response.updatedInput).toEqual({ command: 'ls' });

      // Should store permission response message
      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'permission_response',
          content: 'allow: Bash',
          metadata: expect.objectContaining({
            requestId: 'req-001',
            behavior: 'allow',
            toolName: 'Bash',
          }),
        })
      );
    });

    it('should forward deny to Claude Code with correct control_response format', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      relay.pendingPermissions.set('req-002', {
        type: 'control_request',
        request_id: 'req-002',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Write',
          input: { path: '/etc/passwd' },
        },
      });

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_permission_response',
          sessionId: 'session-1',
          requestId: 'req-002',
          behavior: 'deny',
        })),
        'user-1'
      );

      // Pending should be cleared
      expect(relay.pendingPermissions.has('req-002')).toBe(false);

      // Should send control_response with deny behavior
      const sent = JSON.parse(claudeSocket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('control_response');
      const response = sent.response as {
        subtype: string;
        request_id: string;
        response: { behavior: string; updatedInput?: Record<string, unknown> };
      };
      expect(response.subtype).toBe('success');
      expect(response.request_id).toBe('req-002');
      expect(response.response.behavior).toBe('deny');
      // Deny should NOT include updatedInput
      expect(response.response.updatedInput).toBeUndefined();
    });

    it('should ignore response for non-pending request', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      // No pending permission set for req-999
      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_permission_response',
          sessionId: 'session-1',
          requestId: 'req-999',
          behavior: 'allow',
        })),
        'user-1'
      );

      // Should NOT send anything to Claude Code
      expect(claudeSocket.sentMessages.length).toBe(0);
    });

    it('should broadcast permission_resolved to all browsers', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browser1 = createMockSocket();
      const browser2 = createMockSocket();
      relay.browserSockets.add(browser1 as unknown as import('ws').WebSocket);
      relay.browserSockets.add(browser2 as unknown as import('ws').WebSocket);

      relay.pendingPermissions.set('req-001', {
        type: 'control_request',
        request_id: 'req-001',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          input: { command: 'ls' },
        },
      });

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_permission_response',
          sessionId: 'session-1',
          requestId: 'req-001',
          behavior: 'allow',
        })),
        'user-1'
      );

      // Both browsers should receive permission_resolved
      const msg1 = getLastSentMessage(browser1);
      const msg2 = getLastSentMessage(browser2);
      expect(msg1?.type).toBe('session_permission_resolved');
      expect(msg1?.requestId).toBe('req-001');
      expect(msg1?.behavior).toBe('allow');
      expect(msg2?.type).toBe('session_permission_resolved');
    });
  });

  describe('browser -> server: session_interrupt', () => {
    it('should send user message (not raw interrupt) to Claude Code', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_interrupt',
          sessionId: 'session-1',
        })),
        'user-1'
      );

      // Should send as user message (not 'interrupt' which crashes Claude Code)
      const sent = JSON.parse(claudeSocket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('user');

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system',
          content: 'User interrupted session',
        })
      );
    });

    it('should broadcast session_message to browsers', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browser = createMockSocket();
      relay.browserSockets.add(browser as unknown as import('ws').WebSocket);

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_interrupt',
          sessionId: 'session-1',
        })),
        'user-1'
      );

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_message');
      expect(msg?.content).toContain('Interrupt requested');
    });
  });

  describe('browser -> server: session_set_permission_mode', () => {
    it('should send set_permission_mode to Claude Code', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_set_permission_mode',
          sessionId: 'session-1',
          mode: 'bypassPermissions',
        }))
      );

      const sent = JSON.parse(claudeSocket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('set_permission_mode');
      expect(sent.permission_mode).toBe('bypassPermissions');
    });
  });

  describe('browser -> server: session_set_model', () => {
    it('should send set_model to Claude Code', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_set_model',
          sessionId: 'session-1',
          model: 'claude-opus-4-20250514',
        }))
      );

      const sent = JSON.parse(claudeSocket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('set_model');
      expect(sent.model).toBe('claude-opus-4-20250514');
    });
  });

  describe('browser -> server: session_update_env', () => {
    it('should send update_environment_variables to Claude Code', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_update_env',
          sessionId: 'session-1',
          variables: { API_KEY: 'secret123' },
        }))
      );

      const sent = JSON.parse(claudeSocket.sentMessages[0]!.trim()) as Record<string, unknown>;
      expect(sent.type).toBe('update_environment_variables');
      expect(sent.environment_variables).toEqual({ API_KEY: 'secret123' });
    });
  });

  // --- Session Ownership Validation ---

  describe('session ownership validation', () => {
    it('should reject user message from non-owner', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'session-1',
          content: 'Unauthorized message',
        })),
        'attacker-user' // Different userId than relay owner
      );

      // Should NOT send to Claude Code
      expect(claudeSocket.sentMessages.length).toBe(0);
      // Should NOT store message
      expect(storeMessage).not.toHaveBeenCalled();
    });

    it('should reject permission response from non-owner', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      relay.pendingPermissions.set('req-001', {
        type: 'control_request',
        request_id: 'req-001',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          input: { command: 'rm -rf /' },
        },
      });

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_permission_response',
          sessionId: 'session-1',
          requestId: 'req-001',
          behavior: 'allow',
        })),
        'attacker-user'
      );

      // Should NOT send control_response
      expect(claudeSocket.sentMessages.length).toBe(0);
      // Pending should NOT be cleared
      expect(relay.pendingPermissions.has('req-001')).toBe(true);
    });

    it('should reject interrupt from non-owner', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_interrupt',
          sessionId: 'session-1',
        })),
        'attacker-user'
      );

      // Should NOT send interrupt
      expect(claudeSocket.sentMessages.length).toBe(0);
      expect(storeMessage).not.toHaveBeenCalled();
    });

    it('should reject set_permission_mode from non-owner', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_set_permission_mode',
          sessionId: 'session-1',
          mode: 'bypassPermissions',
        })),
        'attacker-user'
      );

      expect(claudeSocket.sentMessages.length).toBe(0);
      expect(storeMessage).not.toHaveBeenCalled();
    });

    it('should reject set_model from non-owner', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_set_model',
          sessionId: 'session-1',
          model: 'claude-opus-4-20250514',
        })),
        'attacker-user'
      );

      expect(claudeSocket.sentMessages.length).toBe(0);
      expect(storeMessage).not.toHaveBeenCalled();
    });

    it('should reject update_env from non-owner', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_update_env',
          sessionId: 'session-1',
          variables: { MALICIOUS_VAR: 'evil' },
        })),
        'attacker-user'
      );

      expect(claudeSocket.sentMessages.length).toBe(0);
      expect(storeMessage).not.toHaveBeenCalled();
    });

    it('should allow message when userId is not provided (backward compat)', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'session-1',
          content: 'Hello without userId',
        }))
        // No userId parameter
      );

      // Should still send (backward compatibility)
      expect(claudeSocket.sentMessages.length).toBe(1);
    });

    it('should silently ignore message for nonexistent relay', async () => {
      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'nonexistent-session',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'nonexistent-session',
          content: 'Hello',
        })),
        'user-1'
      );

      expect(storeMessage).not.toHaveBeenCalled();
    });
  });

  // --- Message Storage Verification ---

  describe('message storage for all browser->container types', () => {
    it('should store user message in hq_session_messages', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_user_message',
          sessionId: 'session-1',
          content: 'Store this message',
        })),
        'user-1'
      );

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'user',
          content: 'Store this message',
        })
      );
      expect(recordSessionActivity).toHaveBeenCalledWith('session-1');
    });

    it('should store permission response in hq_session_messages', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;
      relay.pendingPermissions.set('req-store', {
        type: 'control_request',
        request_id: 'req-store',
        request: { subtype: 'can_use_tool', tool_name: 'Read', input: { path: '/' } },
      });

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_permission_response',
          sessionId: 'session-1',
          requestId: 'req-store',
          behavior: 'deny',
        })),
        'user-1'
      );

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'permission_response',
          content: 'deny: Read',
        })
      );
    });

    it('should store interrupt in hq_session_messages', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_interrupt',
          sessionId: 'session-1',
        })),
        'user-1'
      );

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'system',
          content: 'User interrupted session',
        })
      );
    });

    it('should store permission mode change in hq_session_messages', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_set_permission_mode',
          sessionId: 'session-1',
          mode: 'plan',
        })),
        'user-1'
      );

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'system',
          content: 'Permission mode set to: plan',
          metadata: expect.objectContaining({ mode: 'plan' }),
        })
      );
    });

    it('should store model change in hq_session_messages', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_set_model',
          sessionId: 'session-1',
          model: 'claude-haiku-4-20250514',
        })),
        'user-1'
      );

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'system',
          content: 'Model set to: claude-haiku-4-20250514',
          metadata: expect.objectContaining({ model: 'claude-haiku-4-20250514' }),
        })
      );
    });

    it('should store env variable update in hq_session_messages', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;

      const browserSocket = createMockSocket();

      await handleBrowserMessage(
        'session-1',
        browserSocket as unknown as import('ws').WebSocket,
        Buffer.from(JSON.stringify({
          type: 'session_update_env',
          sessionId: 'session-1',
          variables: { NODE_ENV: 'test', API_URL: 'http://localhost' },
        })),
        'user-1'
      );

      expect(storeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          type: 'system',
          content: expect.stringContaining('Environment variables updated'),
          metadata: expect.objectContaining({ variableKeys: ['NODE_ENV', 'API_URL'] }),
        })
      );
    });
  });

  // --- Message Buffer ---

  describe('MessageBuffer', () => {
    it('should store messages up to capacity', () => {
      const buffer = new MessageBuffer(5);

      for (let i = 0; i < 5; i++) {
        buffer.push({ index: i });
      }

      expect(buffer.size).toBe(5);
      const all = buffer.getAll();
      expect(all).toHaveLength(5);
      expect((all[0]!.data as { index: number }).index).toBe(0);
      expect((all[4]!.data as { index: number }).index).toBe(4);
    });

    it('should evict oldest when over capacity', () => {
      const buffer = new MessageBuffer(3);

      for (let i = 0; i < 5; i++) {
        buffer.push({ index: i });
      }

      expect(buffer.size).toBe(3);
      const all = buffer.getAll();
      expect(all).toHaveLength(3);
      // Should contain messages 2, 3, 4 (oldest 0, 1 evicted)
      expect((all[0]!.data as { index: number }).index).toBe(2);
      expect((all[2]!.data as { index: number }).index).toBe(4);
    });

    it('should replay messages after a given ID', () => {
      const buffer = new MessageBuffer(10);

      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(buffer.push({ index: i }));
      }

      // Get messages after id[1] (should return indices 2, 3, 4)
      const after = buffer.getAfter(ids[1]!);
      expect(after).toHaveLength(3);
      expect((after[0]!.data as { index: number }).index).toBe(2);
      expect((after[2]!.data as { index: number }).index).toBe(4);
    });

    it('should return empty array when ID not found', () => {
      const buffer = new MessageBuffer(3);
      buffer.push({ index: 0 });

      const after = buffer.getAfter('nonexistent-id');
      expect(after).toHaveLength(0);
    });

    it('should return empty array for last message ID', () => {
      const buffer = new MessageBuffer(10);
      let lastId = '';
      for (let i = 0; i < 3; i++) {
        lastId = buffer.push({ index: i });
      }

      const after = buffer.getAfter(lastId);
      expect(after).toHaveLength(0);
    });

    it('should handle empty buffer', () => {
      const buffer = new MessageBuffer(10);
      expect(buffer.size).toBe(0);
      expect(buffer.getAll()).toHaveLength(0);
      expect(buffer.getAfter('anything')).toHaveLength(0);
    });
  });

  // --- Browser Reconnection Replay ---

  describe('browser reconnection replay', () => {
    it('should replay buffered messages on subscribe with lastMessageId', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      handleClaudeCodeConnection('session-1', claudeSocket as unknown as import('ws').WebSocket);

      // Generate some messages
      claudeSocket.simulateNdjson(
        { type: 'stream_event', delta: { text: 'A' } },
        { type: 'stream_event', delta: { text: 'B' } },
        { type: 'stream_event', delta: { text: 'C' } }
      );
      await tick();

      // Get the first message ID from the buffer
      const allBuffered = relay.messageBuffer.getAll();
      expect(allBuffered.length).toBeGreaterThanOrEqual(3);
      const firstId = allBuffered[0]!.id;

      // Now a new browser connects with lastMessageId
      const browser = createMockSocket();
      addBrowserToSession('session-1', browser as unknown as import('ws').WebSocket, firstId);

      // Browser should receive: status message + replayed messages after firstId
      const msgs = getAllSentMessages(browser);
      // First message is the status
      expect(msgs[0]!.type).toBe('session_status');
      // Replayed messages should be marked as _buffered
      const replayed = msgs.filter((m) => m._buffered === true);
      expect(replayed.length).toBeGreaterThanOrEqual(2); // B and C (after A)
    });
  });

  // --- Multi-browser Broadcast ---

  describe('multi-browser broadcast', () => {
    it('should broadcast to all connected browsers', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser1 = createMockSocket();
      const browser2 = createMockSocket();

      relay.browserSockets.add(browser1 as unknown as import('ws').WebSocket);
      relay.browserSockets.add(browser2 as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser1.sentMessages.length = 0;
      browser2.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'assistant',
        content: 'Hello everyone',
      });

      await tick();

      const msg1 = getLastSentMessage(browser1);
      const msg2 = getLastSentMessage(browser2);
      expect(msg1?.type).toBe('session_message');
      expect(msg2?.type).toBe('session_message');
      expect(msg1?.content).toBe('Hello everyone');
      expect(msg2?.content).toBe('Hello everyone');
    });

    it('should not send to closed browser sockets', async () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const browser1 = createMockSocket();
      const browser2 = createMockSocket();
      browser2.readyState = CLOSED;

      relay.browserSockets.add(browser1 as unknown as import('ws').WebSocket);
      relay.browserSockets.add(browser2 as unknown as import('ws').WebSocket);

      const socket = createMockSocket();
      handleClaudeCodeConnection('session-1', socket as unknown as import('ws').WebSocket);
      browser1.sentMessages.length = 0;
      browser2.sentMessages.length = 0;

      socket.simulateNdjson({
        type: 'assistant',
        content: 'Hello',
      });

      await tick();

      // browser1 should receive, browser2 should not
      expect(browser1.sentMessages.length).toBeGreaterThan(0);
      expect(browser2.sentMessages.length).toBe(0);
    });
  });

  // --- addBrowserToSession ---

  describe('addBrowserToSession', () => {
    it('should send current status with capabilities and pending permissions', () => {
      const relay = getOrCreateRelay('session-1', 'user-1');
      const claudeSocket = createMockSocket();
      relay.claudeSocket = claudeSocket as unknown as import('ws').WebSocket;
      relay.initialized = true;
      relay.startupPhase = null; // Startup complete
      relay.startupTimestamp = null;
      relay.capabilities = {
        cwd: '/project',
        model: 'claude-sonnet-4-20250514',
        tools: [{ name: 'Read' }],
        mcpServers: [],
        permissionMode: 'default',
        claudeCodeVersion: '1.0.0',
      };
      relay.pendingPermissions.set('req-001', {
        type: 'control_request',
        request_id: 'req-001',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Write',
          input: { path: '/file.ts' },
          decision_reason: 'Needs permission',
        },
      });

      const browser = createMockSocket();
      const added = addBrowserToSession('session-1', browser as unknown as import('ws').WebSocket);

      expect(added).toBe(true);

      const msg = getLastSentMessage(browser);
      expect(msg?.type).toBe('session_status');
      expect(msg?.status).toBe('active');
      expect(msg?.initialized).toBe(true);
      expect(msg?.capabilities).toBeDefined();
      expect((msg?.pendingPermissions as unknown[])).toHaveLength(1);
    });

    it('should return false for nonexistent session', () => {
      const browser = createMockSocket();
      const added = addBrowserToSession('nonexistent', browser as unknown as import('ws').WebSocket);
      expect(added).toBe(false);
    });
  });
});
