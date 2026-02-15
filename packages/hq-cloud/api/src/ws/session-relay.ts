/**
 * Session Relay
 *
 * Manages bidirectional WebSocket relay between browser clients and
 * Claude Code containers. Each session has one Claude Code connection
 * (from the container) and potentially many browser connections (viewers).
 *
 * Claude Code protocol (NDJSON over WS):
 *   Container -> API: system/init, assistant, result, stream_event, control_request
 *                     (can_use_tool, hook_callback), tool_progress, keep_alive,
 *                     auth_status, tool_use_summary
 *   API -> Container: user, control_response, control_cancel_request, keep_alive,
 *                     initialize, interrupt, set_permission_mode, set_model,
 *                     update_environment_variables
 *
 * Browser protocol (JSON over WS):
 *   Browser -> API: session_subscribe, session_user_message, session_permission_response,
 *                   session_interrupt, session_set_permission_mode, session_set_model,
 *                   session_update_env
 *   API -> Browser: session_message, session_permission_request, session_status,
 *                   session_stream, session_tool_progress, session_result,
 *                   session_control, session_raw, session_permission_resolved,
 *                   session_auth_status, session_tool_use_summary
 */

import type { WebSocket, RawData } from 'ws';
import type { FastifyBaseLogger as Logger } from 'fastify';
import { updateSessionStatus, recordSessionActivity } from '../data/sessions.js';
import type { SessionCapabilities, SessionResultStats } from '../data/sessions.js';
import { storeMessage } from '../data/session-messages.js';
import { clearConnectionTimeout } from '../sessions/connection-timeout.js';

// --- Claude Code Protocol Types ---

export interface ClaudeCodeMessage {
  type: string;
  [key: string]: unknown;
}

export interface SystemInitMessage {
  type: 'system';
  subtype: 'init';
  cwd: string;
  session_id: string;
  model: string;
  /** Tools can be string[] (newer) or {name,type}[] (older) */
  tools: Array<string | { name: string; type?: string }>;
  mcp_servers: Array<{ name: string; status?: string }>;
  /** camelCase in newer versions, snake_case in older */
  permissionMode?: string;
  permission_mode?: string;
  claude_code_version?: string;
  slash_commands?: string[];
}

export interface ControlRequest {
  type: 'control_request';
  request_id: string;
  request: {
    subtype: string;
    tool_name?: string;
    tool_use_id?: string;
    input?: Record<string, unknown>;
    decision_reason?: string;
    [key: string]: unknown;
  };
}

export interface ControlResponse {
  type: 'control_response';
  response: {
    subtype: string;
    request_id: string;
    response: {
      behavior: 'allow' | 'deny';
      updatedInput?: Record<string, unknown>;
      message?: string;
    };
  };
}

export interface ResultMessage {
  type: 'result';
  result?: string;
  result_type?: string;
  subtype?: string;
  duration_ms?: number;
  duration_api_ms?: number;
  cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
}

// --- Browser Protocol Types ---

interface BrowserMessage {
  type: string;
  [key: string]: unknown;
}

// --- Circular Message Buffer ---

export interface BufferedMessage {
  id: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * Circular buffer for message replay on reconnection.
 * Fixed capacity of 1000 messages. Oldest messages are evicted when full.
 */
export class MessageBuffer {
  private buffer: BufferedMessage[];
  private writeIndex: number;
  private count: number;
  readonly capacity: number;

  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.writeIndex = 0;
    this.count = 0;
  }

  /**
   * Add a message to the buffer. Returns the assigned message ID.
   */
  push(data: Record<string, unknown>): string {
    const id = crypto.randomUUID();
    const entry: BufferedMessage = {
      id,
      timestamp: Date.now(),
      data,
    };
    this.buffer[this.writeIndex] = entry;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
    return id;
  }

  /**
   * Get all messages after the given message ID (for replay).
   * Returns an empty array if the ID is not found (buffer has rotated past it).
   */
  getAfter(messageId: string): BufferedMessage[] {
    if (this.count === 0) return [];

    // Find the message with the given ID
    const startIdx = this.findIndex(messageId);
    if (startIdx === -1) return [];

    // Return all messages after this one
    const result: BufferedMessage[] = [];
    let idx = (startIdx + 1) % this.capacity;
    const endIdx = this.writeIndex;

    while (idx !== endIdx) {
      const entry = this.buffer[idx];
      if (entry) {
        result.push(entry);
      }
      idx = (idx + 1) % this.capacity;
    }

    return result;
  }

  /**
   * Get all buffered messages in order.
   */
  getAll(): BufferedMessage[] {
    if (this.count === 0) return [];

    const result: BufferedMessage[] = [];
    const startIdx = this.count < this.capacity
      ? 0
      : this.writeIndex;

    for (let i = 0; i < this.count; i++) {
      const idx = (startIdx + i) % this.capacity;
      if (this.buffer[idx]) {
        result.push(this.buffer[idx]);
      }
    }

    return result;
  }

  /**
   * Get the number of messages currently in the buffer.
   */
  get size(): number {
    return this.count;
  }

  private findIndex(messageId: string): number {
    const startIdx = this.count < this.capacity
      ? 0
      : this.writeIndex;

    for (let i = 0; i < this.count; i++) {
      const idx = (startIdx + i) % this.capacity;
      if (this.buffer[idx]?.id === messageId) {
        return idx;
      }
    }

    return -1;
  }
}

// --- Startup Phase Tracking ---

export type StartupPhase = 'launching' | 'connecting' | 'initializing' | 'ready' | 'failed';

// --- Session Relay Registry ---

export interface SessionRelay {
  sessionId: string;
  userId: string;
  /** The Claude Code container's WebSocket */
  claudeSocket: WebSocket | null;
  /** All browser clients watching this session */
  browserSockets: Set<WebSocket>;
  /** Pending permission requests waiting for browser response */
  pendingPermissions: Map<string, ControlRequest>;
  /** Whether Claude Code has sent system/init */
  initialized: boolean;
  /** Initial prompt to send after init */
  initialPrompt: string | null;
  /** Worker context for initialize control message */
  workerContext: string | null;
  /** Session capabilities from system/init */
  capabilities: SessionCapabilities | null;
  /** Circular message buffer for reconnection replay */
  messageBuffer: MessageBuffer;
  /** Keep-alive interval timer */
  keepAliveTimer: ReturnType<typeof setInterval> | null;
  /** Current startup phase (ephemeral, not persisted) */
  startupPhase: StartupPhase | null;
  /** Timestamp when the current startup phase began */
  startupTimestamp: number | null;
}

const relays = new Map<string, SessionRelay>();

let logger: Logger | null = null;

export function setRelayLogger(l: Logger): void {
  logger = l;
}

function log(level: 'info' | 'warn' | 'error', obj: Record<string, unknown>, msg: string): void {
  if (logger) {
    logger[level](obj, msg);
  }
}

/**
 * Create or get a relay for a session.
 */
export function getOrCreateRelay(
  sessionId: string,
  userId: string,
  options?: { initialPrompt?: string; workerContext?: string }
): SessionRelay {
  let relay = relays.get(sessionId);
  if (!relay) {
    relay = {
      sessionId,
      userId,
      claudeSocket: null,
      browserSockets: new Set(),
      pendingPermissions: new Map(),
      initialized: false,
      initialPrompt: options?.initialPrompt ?? null,
      workerContext: options?.workerContext ?? null,
      capabilities: null,
      messageBuffer: new MessageBuffer(1000),
      keepAliveTimer: null,
      startupPhase: 'launching',
      startupTimestamp: Date.now(),
    };
    relays.set(sessionId, relay);
  }
  return relay;
}

/**
 * Get an existing relay.
 */
export function getRelay(sessionId: string): SessionRelay | undefined {
  return relays.get(sessionId);
}

/**
 * Remove a relay (on session stop).
 */
export function removeRelay(sessionId: string): void {
  const relay = relays.get(sessionId);
  if (relay) {
    // Clear keep-alive timer
    if (relay.keepAliveTimer) {
      clearInterval(relay.keepAliveTimer);
      relay.keepAliveTimer = null;
    }

    // Close Claude Code connection
    if (relay.claudeSocket && relay.claudeSocket.readyState === relay.claudeSocket.OPEN) {
      relay.claudeSocket.close(1000, 'Session stopped');
    }
    // Close all browser connections for this session
    for (const browser of relay.browserSockets) {
      if (browser.readyState === browser.OPEN) {
        browser.send(wrapForBrowser({ type: 'session_status', sessionId, status: 'stopped' }));
      }
    }
    relays.delete(sessionId);
  }
}

// --- Startup Phase Broadcasting ---

/**
 * Update the relay's startup phase and broadcast to all browsers.
 * Extra fields (e.g. error) are merged into the status message.
 */
export function broadcastStartupPhase(
  relay: SessionRelay,
  phase: StartupPhase,
  extra?: Record<string, unknown>
): void {
  relay.startupPhase = phase;
  relay.startupTimestamp = Date.now();

  const msg = {
    type: 'session_status',
    sessionId: relay.sessionId,
    status: phase === 'ready' ? 'active' : phase === 'failed' ? 'errored' : 'starting',
    startupPhase: phase,
    startupTimestamp: relay.startupTimestamp,
    ...extra,
  };
  relay.messageBuffer.push(msg);
  broadcastToBrowsers(relay, msg);

  log('info', { sessionId: relay.sessionId, phase, ...extra }, `Startup phase: ${phase}`);
}

// --- Claude Code Connection Handling ---

/**
 * Handle a new Claude Code container connecting to /ws/relay/{sessionId}.
 * Called from the WebSocket plugin.
 */
export function handleClaudeCodeConnection(
  sessionId: string,
  socket: WebSocket
): void {
  const relay = relays.get(sessionId);
  if (!relay) {
    log('warn', { sessionId }, 'Claude Code connected but no relay exists');
    socket.close(4004, 'Session not found');
    return;
  }

  if (relay.claudeSocket) {
    log('warn', { sessionId }, 'Claude Code reconnecting -- closing old connection');
    relay.claudeSocket.close(1000, 'Replaced by new connection');
  }

  relay.claudeSocket = socket;
  log('info', { sessionId }, 'Claude Code container connected');

  // Broadcast initializing phase — container connected, waiting for system/init
  broadcastStartupPhase(relay, 'initializing');

  // Send initial prompt immediately — Claude Code expects to receive a user message
  // BEFORE sending system/init. Without this, both sides deadlock waiting for each other.
  if (relay.initialPrompt && socket.readyState === socket.OPEN) {
    const promptContent = relay.initialPrompt;
    relay.initialPrompt = null;

    log('info', { sessionId }, 'Sent initial prompt to Claude Code');
    sendUserMessage(relay, promptContent);

    void storeMessage({
      sessionId: relay.sessionId,
      type: 'user',
      content: promptContent,
    }).catch(() => {});
  }

  // Start keep-alive timer (send keep_alive every 30s)
  if (relay.keepAliveTimer) {
    clearInterval(relay.keepAliveTimer);
  }
  relay.keepAliveTimer = setInterval(() => {
    sendToClaudeCode(relay, { type: 'keep_alive' });
  }, 30000);

  socket.on('message', (data: RawData) => {
    void handleClaudeCodeMessage(relay, data);
  });

  socket.on('close', (code: number, reason: Buffer) => {
    log('info', { sessionId, closeCode: code, closeReason: reason?.toString() ?? '', initialized: relay.initialized, startupPhase: relay.startupPhase }, 'Claude Code container disconnected');
    const wasInStartup = relay.startupPhase !== null && relay.startupPhase !== 'ready';
    relay.claudeSocket = null;

    // Clear keep-alive timer
    if (relay.keepAliveTimer) {
      clearInterval(relay.keepAliveTimer);
      relay.keepAliveTimer = null;
    }

    if (wasInStartup) {
      // Container disconnected during startup — treat as failure
      void updateSessionStatus(sessionId, 'errored', {
        error: 'Container disconnected during startup',
      }).catch(() => {});

      broadcastStartupPhase(relay, 'failed', {
        error: 'Container disconnected during startup',
      });
    } else {
      // Normal disconnect after startup
      void updateSessionStatus(sessionId, 'stopped').catch(() => {});

      broadcastToBrowsers(relay, {
        type: 'session_status',
        sessionId,
        status: 'stopped',
      });
    }
  });

  socket.on('error', (err) => {
    log('error', { sessionId, error: err.message }, 'Claude Code socket error');
  });
}

/**
 * Process a message from Claude Code and relay to browsers.
 */
async function handleClaudeCodeMessage(relay: SessionRelay, data: RawData): Promise<void> {
  const str = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);

  // Debug: log every raw message from container
  log('info', { sessionId: relay.sessionId, rawLength: str.length, raw: str.slice(0, 500) }, 'Claude Code raw message');

  // Claude Code sends NDJSON -- may contain multiple lines
  const lines = str.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    let msg: ClaudeCodeMessage;
    try {
      msg = JSON.parse(line) as ClaudeCodeMessage;
    } catch {
      continue;
    }

    // Determine message type, handling system subtypes
    const msgType = msg.type === 'system' && msg.subtype
      ? `system/${msg.subtype}`
      : msg.type;

    switch (msgType) {
      case 'system/init': {
        relay.initialized = true;

        // Clear connection timeout — container has connected successfully
        clearConnectionTimeout(relay.sessionId);

        // Extract and store capabilities (handle both old and new field names)
        const initMsg = msg as unknown as SystemInitMessage;
        const rawTools = Array.isArray(initMsg.tools) ? initMsg.tools : [];
        // Normalize tools: newer versions send string[], older send {name,type}[]
        const normalizedTools = rawTools.map((t) =>
          typeof t === 'string' ? { name: t } : t
        );
        const capabilities: SessionCapabilities = {
          cwd: initMsg.cwd ?? '',
          model: initMsg.model ?? '',
          tools: normalizedTools,
          mcpServers: Array.isArray(initMsg.mcp_servers) ? initMsg.mcp_servers : [],
          permissionMode: initMsg.permissionMode ?? initMsg.permission_mode ?? 'default',
          claudeCodeVersion: initMsg.claude_code_version ?? '',
        };
        relay.capabilities = capabilities;

        // Update session status and capabilities in MongoDB
        await updateSessionStatus(relay.sessionId, 'active', { capabilities });
        log('info', { sessionId: relay.sessionId, model: capabilities.model }, 'Claude Code initialized');

        // Note: initial prompt was already sent in handleClaudeCodeConnection
        // (Claude Code requires the user message BEFORE it sends system/init)

        // Mark startup complete
        relay.startupPhase = 'ready';
        relay.startupTimestamp = Date.now();

        const statusBroadcast = {
          type: 'session_status',
          sessionId: relay.sessionId,
          status: 'active',
          startupPhase: 'ready' as const,
          startupTimestamp: relay.startupTimestamp,
          capabilities,
        };
        relay.messageBuffer.push(statusBroadcast);
        broadcastToBrowsers(relay, statusBroadcast);

        // Clear startup phase — session is now fully active
        relay.startupPhase = null;
        relay.startupTimestamp = null;
        break;
      }

      case 'assistant': {
        // Full assistant response
        const content = typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);

        await storeMessage({
          sessionId: relay.sessionId,
          type: 'assistant',
          content,
          metadata: { raw: msg },
        });
        await recordSessionActivity(relay.sessionId);

        const assistantBroadcast = {
          type: 'session_message',
          sessionId: relay.sessionId,
          messageType: 'assistant',
          content,
          raw: msg,
        };
        relay.messageBuffer.push(assistantBroadcast);
        broadcastToBrowsers(relay, assistantBroadcast);
        break;
      }

      case 'stream_event': {
        // Token-by-token streaming -- forward directly to browsers
        const streamBroadcast = {
          type: 'session_stream',
          sessionId: relay.sessionId,
          event: msg,
        };
        // Stream events are high-frequency; buffer but at cost of capacity
        relay.messageBuffer.push(streamBroadcast);
        broadcastToBrowsers(relay, streamBroadcast);
        break;
      }

      case 'control_request': {
        const controlReq = msg as unknown as ControlRequest;
        const subtype = controlReq.request?.subtype;

        if (subtype === 'can_use_tool') {
          // Permission request -- store and forward to browser
          relay.pendingPermissions.set(controlReq.request_id, controlReq);

          const toolName = controlReq.request?.tool_name ?? 'unknown';
          const toolUseId = controlReq.request?.tool_use_id;
          const input = controlReq.request?.input ?? {};
          const decisionReason = controlReq.request?.decision_reason;

          await storeMessage({
            sessionId: relay.sessionId,
            type: 'permission_request',
            content: `${toolName}: ${JSON.stringify(input)}`,
            metadata: {
              requestId: controlReq.request_id,
              toolName,
              toolUseId,
              input,
              decisionReason,
            },
          });

          const permBroadcast = {
            type: 'session_permission_request',
            sessionId: relay.sessionId,
            requestId: controlReq.request_id,
            toolName,
            toolUseId,
            input,
            decisionReason,
          };
          relay.messageBuffer.push(permBroadcast);
          broadcastToBrowsers(relay, permBroadcast);

          log('info', {
            sessionId: relay.sessionId,
            requestId: controlReq.request_id,
            toolName,
            decisionReason,
          }, 'Permission request from Claude Code');
        } else if (subtype === 'hook_callback') {
          // Hook callback -- store and forward
          await storeMessage({
            sessionId: relay.sessionId,
            type: 'system',
            content: `hook_callback: ${JSON.stringify(controlReq.request)}`,
            metadata: { requestId: controlReq.request_id, raw: controlReq },
          });

          const hookBroadcast = {
            type: 'session_control',
            sessionId: relay.sessionId,
            subtype: 'hook_callback',
            requestId: controlReq.request_id,
            request: controlReq.request,
          };
          relay.messageBuffer.push(hookBroadcast);
          broadcastToBrowsers(relay, hookBroadcast);

          log('info', {
            sessionId: relay.sessionId,
            requestId: controlReq.request_id,
          }, 'Hook callback from Claude Code');
        } else {
          // Other control requests -- forward as-is
          const controlBroadcast = {
            type: 'session_control',
            sessionId: relay.sessionId,
            subtype,
            request: msg,
          };
          relay.messageBuffer.push(controlBroadcast);
          broadcastToBrowsers(relay, controlBroadcast);
        }
        break;
      }

      case 'tool_progress': {
        // Heartbeat during tool execution -- forward to browsers
        const progressBroadcast = {
          type: 'session_tool_progress',
          sessionId: relay.sessionId,
          progress: msg,
        };
        relay.messageBuffer.push(progressBroadcast);
        broadcastToBrowsers(relay, progressBroadcast);
        break;
      }

      case 'result': {
        // Turn completed -- extract stats
        const resultMsg = msg as unknown as ResultMessage;
        const resultType = resultMsg.result_type ?? resultMsg.subtype ?? 'unknown';
        const isError = resultType.startsWith('error');

        // Build result stats
        const resultStats: SessionResultStats = {
          duration: resultMsg.duration_ms ?? 0,
          cost: resultMsg.cost_usd ?? 0,
          inputTokens: resultMsg.usage?.input_tokens ?? 0,
          outputTokens: resultMsg.usage?.output_tokens ?? 0,
          totalTokens: resultMsg.usage?.total_tokens ?? 0,
          resultType,
        };

        await storeMessage({
          sessionId: relay.sessionId,
          type: 'system',
          content: `Turn completed: ${resultType}`,
          metadata: { raw: msg, resultStats },
        });

        // Update session status based on result type
        if (isError) {
          await updateSessionStatus(relay.sessionId, 'errored', {
            error: resultMsg.error ?? resultType,
            resultStats,
          });
        } else {
          // Session stays active (Claude Code can receive more prompts)
          // but store stats for the completed turn
          await updateSessionStatus(relay.sessionId, 'active', { resultStats });
        }

        const resultBroadcast = {
          type: 'session_result',
          sessionId: relay.sessionId,
          result: msg,
          resultStats,
        };
        relay.messageBuffer.push(resultBroadcast);
        broadcastToBrowsers(relay, resultBroadcast);
        break;
      }

      case 'keep_alive': {
        // Container keep-alive -- no action needed, just acknowledge
        log('info', { sessionId: relay.sessionId }, 'Keep-alive from container');
        break;
      }

      case 'auth_status': {
        // Authentication status update from container
        const authBroadcast = {
          type: 'session_auth_status',
          sessionId: relay.sessionId,
          authStatus: msg,
        };
        relay.messageBuffer.push(authBroadcast);
        broadcastToBrowsers(relay, authBroadcast);

        log('info', { sessionId: relay.sessionId }, 'Auth status from container');
        break;
      }

      case 'tool_use_summary': {
        // Summary of tool uses in a turn
        await storeMessage({
          sessionId: relay.sessionId,
          type: 'tool_use',
          content: JSON.stringify(msg),
          metadata: { raw: msg },
        });

        const summaryBroadcast = {
          type: 'session_tool_use_summary',
          sessionId: relay.sessionId,
          summary: msg,
        };
        relay.messageBuffer.push(summaryBroadcast);
        broadcastToBrowsers(relay, summaryBroadcast);
        break;
      }

      default: {
        // Forward unknown message types
        const rawBroadcast = {
          type: 'session_raw',
          sessionId: relay.sessionId,
          message: msg,
        };
        relay.messageBuffer.push(rawBroadcast);
        broadcastToBrowsers(relay, rawBroadcast);
      }
    }
  }
}

// --- Server -> Container Message Sending ---

/**
 * Send an NDJSON message to the Claude Code container.
 */
export function sendToClaudeCode(relay: SessionRelay, message: Record<string, unknown>): boolean {
  if (!relay.claudeSocket || relay.claudeSocket.readyState !== relay.claudeSocket.OPEN) {
    return false;
  }
  relay.claudeSocket.send(JSON.stringify(message) + '\n');
  return true;
}

/**
 * Send a user message to the Claude Code container.
 * Uses the full NDJSON user message format:
 *   {type:'user', message:{role:'user', content:...}, parent_tool_use_id:null, session_id:...}
 */
export function sendUserMessage(relay: SessionRelay, content: string): boolean {
  return sendToClaudeCode(relay, {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    parent_tool_use_id: null,
    session_id: relay.sessionId,
  });
}

/**
 * Send a control_response to the Claude Code container.
 */
export function sendControlResponse(
  relay: SessionRelay,
  requestId: string,
  behavior: 'allow' | 'deny',
  updatedInput?: Record<string, unknown>,
  message?: string
): boolean {
  const response: ControlResponse = {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: {
        behavior,
        updatedInput,
        message,
      },
    },
  };
  return sendToClaudeCode(relay, response as unknown as Record<string, unknown>);
}

/**
 * Send a control_cancel_request to the Claude Code container.
 * Cancels a pending control request (e.g., permission prompt timed out).
 */
export function sendControlCancelRequest(relay: SessionRelay, requestId: string): boolean {
  return sendToClaudeCode(relay, {
    type: 'control_cancel_request',
    request_id: requestId,
  });
}

/**
 * Send an interrupt signal to the Claude Code container.
 * Stops the current generation/tool execution.
 */
export function sendInterrupt(relay: SessionRelay): boolean {
  return sendToClaudeCode(relay, {
    type: 'interrupt',
  });
}

/**
 * Send an initialize message to the Claude Code container.
 * Used to configure the session after connection.
 */
export function sendInitialize(
  relay: SessionRelay,
  options: {
    permissionMode?: string;
    model?: string;
    environmentVariables?: Record<string, string>;
  }
): boolean {
  return sendToClaudeCode(relay, {
    type: 'initialize',
    ...options,
  });
}

/**
 * Set the permission mode on the Claude Code container.
 */
export function sendSetPermissionMode(relay: SessionRelay, mode: string): boolean {
  return sendToClaudeCode(relay, {
    type: 'set_permission_mode',
    permission_mode: mode,
  });
}

/**
 * Set the model on the Claude Code container.
 */
export function sendSetModel(relay: SessionRelay, model: string): boolean {
  return sendToClaudeCode(relay, {
    type: 'set_model',
    model,
  });
}

/**
 * Update environment variables on the Claude Code container.
 */
export function sendUpdateEnvironmentVariables(
  relay: SessionRelay,
  variables: Record<string, string>
): boolean {
  return sendToClaudeCode(relay, {
    type: 'update_environment_variables',
    environment_variables: variables,
  });
}

// --- Browser Connection Handling ---

/**
 * Add a browser client to a session relay.
 * Optionally replay messages after a given message ID (for reconnection).
 */
export function addBrowserToSession(
  sessionId: string,
  socket: WebSocket,
  lastMessageId?: string
): boolean {
  const relay = relays.get(sessionId);
  if (!relay) return false;

  relay.browserSockets.add(socket);
  log('info', { sessionId, browsers: relay.browserSockets.size }, 'Browser joined session');

  // Determine current status — use 'starting' if still in a startup phase
  const isInStartup = relay.startupPhase && relay.startupPhase !== 'ready' && relay.startupPhase !== 'failed';
  const currentStatus = isInStartup
    ? 'starting'
    : relay.startupPhase === 'failed'
      ? 'errored'
      : relay.claudeSocket ? 'active' : 'waiting';

  // Send current session status
  const statusMsg = {
    type: 'session_status',
    sessionId,
    status: currentStatus,
    initialized: relay.initialized,
    capabilities: relay.capabilities,
    pendingPermissions: Array.from(relay.pendingPermissions.entries()).map(
      ([id, req]) => ({
        requestId: id,
        toolName: req.request?.tool_name,
        input: req.request?.input,
        decisionReason: req.request?.decision_reason,
      })
    ),
    ...(relay.startupPhase ? {
      startupPhase: relay.startupPhase,
      startupTimestamp: relay.startupTimestamp,
    } : {}),
  };
  if (socket.readyState === socket.OPEN) {
    socket.send(wrapForBrowser(statusMsg));
  }

  // Replay buffered messages if lastMessageId is provided (reconnection)
  if (lastMessageId) {
    const missed = relay.messageBuffer.getAfter(lastMessageId);
    for (const buffered of missed) {
      if (socket.readyState === socket.OPEN) {
        socket.send(wrapForBrowser({
          ...buffered.data,
          _buffered: true,
          _messageId: buffered.id,
        }));
      }
    }
    log('info', {
      sessionId,
      lastMessageId,
      replayed: missed.length,
    }, 'Replayed buffered messages');
  }

  socket.on('close', () => {
    relay.browserSockets.delete(socket);
    log('info', { sessionId, browsers: relay.browserSockets.size }, 'Browser left session');
  });

  return true;
}

/**
 * Handle a message from a browser client.
 * Validates session ownership: userId must match the relay's owner.
 */
export async function handleBrowserMessage(
  sessionId: string,
  _socket: WebSocket,
  data: RawData,
  userId?: string
): Promise<void> {
  const relay = relays.get(sessionId);
  if (!relay) return;

  // Session ownership validation: if userId is provided, it must match
  if (userId && relay.userId !== userId) {
    log('warn', { sessionId, userId, relayUserId: relay.userId }, 'Session ownership mismatch -- rejecting message');
    return;
  }

  let msg: BrowserMessage;
  try {
    const str = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    msg = JSON.parse(str) as BrowserMessage;
  } catch {
    return;
  }

  switch (msg.type) {
    case 'session_user_message': {
      // User sending a message to Claude Code
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (!content || !relay.claudeSocket) return;

      // Forward to Claude Code as NDJSON with full message wrapper
      sendUserMessage(relay, content);

      await storeMessage({
        sessionId,
        type: 'user',
        content,
      });
      await recordSessionActivity(sessionId);

      // Echo back to all browsers (including sender)
      const userBroadcast = {
        type: 'session_message',
        sessionId,
        messageType: 'user',
        content,
      };
      relay.messageBuffer.push(userBroadcast);
      broadcastToBrowsers(relay, userBroadcast);
      break;
    }

    case 'session_permission_response': {
      // User responding to a permission prompt (Allow/Deny)
      const requestId = msg.requestId as string;
      const behavior = msg.behavior as 'allow' | 'deny';
      if (!requestId || !behavior || !relay.claudeSocket) return;

      const pendingReq = relay.pendingPermissions.get(requestId);
      if (!pendingReq) return;

      // Send control_response to Claude Code
      sendControlResponse(
        relay,
        requestId,
        behavior,
        behavior === 'allow' ? pendingReq.request?.input as Record<string, unknown> : undefined
      );
      relay.pendingPermissions.delete(requestId);

      await storeMessage({
        sessionId,
        type: 'permission_response',
        content: `${behavior}: ${pendingReq.request?.tool_name}`,
        metadata: { requestId, behavior, toolName: pendingReq.request?.tool_name },
      });

      // Notify all browsers
      const resolvedBroadcast = {
        type: 'session_permission_resolved',
        sessionId,
        requestId,
        behavior,
      };
      relay.messageBuffer.push(resolvedBroadcast);
      broadcastToBrowsers(relay, resolvedBroadcast);

      log('info', { sessionId, requestId, behavior }, 'Permission response sent to Claude Code');
      break;
    }

    case 'session_interrupt': {
      // User requesting interrupt of current generation.
      // NOTE: Claude Code's --sdk-url WebSocket protocol only accepts 'user' and 'control'
      // message types. Sending { type: 'interrupt' } crashes the Claude process.
      // Proper interrupt requires SIGINT to the Claude process inside the container.
      // For now, we send a user message asking Claude to stop, which is the safest
      // approach that won't crash the session.
      if (!relay.claudeSocket) return;

      sendUserMessage(relay, '/stop — User requested interrupt. Please stop what you are currently doing and await further instructions.');

      await storeMessage({
        sessionId,
        type: 'system',
        content: 'User interrupted session',
      });

      broadcastToBrowsers(relay, {
        type: 'session_message',
        sessionId,
        messageType: 'system',
        content: 'Interrupt requested — asking Claude to stop.',
      });

      log('info', { sessionId }, 'User interrupted session (via user message — SIGINT not yet supported)');
      break;
    }

    case 'session_set_permission_mode': {
      // User changing permission mode
      const mode = msg.mode as string;
      if (!mode || !relay.claudeSocket) return;

      sendSetPermissionMode(relay, mode);

      await storeMessage({
        sessionId,
        type: 'system',
        content: `Permission mode set to: ${mode}`,
        metadata: { mode },
      });

      log('info', { sessionId, mode }, 'Permission mode updated');
      break;
    }

    case 'session_set_model': {
      // User changing model
      const model = msg.model as string;
      if (!model || !relay.claudeSocket) return;

      sendSetModel(relay, model);

      await storeMessage({
        sessionId,
        type: 'system',
        content: `Model set to: ${model}`,
        metadata: { model },
      });

      log('info', { sessionId, model }, 'Model updated');
      break;
    }

    case 'session_update_env': {
      // User updating environment variables
      const variables = msg.variables as Record<string, string>;
      if (!variables || !relay.claudeSocket) return;

      sendUpdateEnvironmentVariables(relay, variables);

      await storeMessage({
        sessionId,
        type: 'system',
        content: `Environment variables updated: ${Object.keys(variables).join(', ')}`,
        metadata: { variableKeys: Object.keys(variables) },
      });

      log('info', { sessionId, keys: Object.keys(variables) }, 'Environment variables updated');
      break;
    }

    default:
      log('warn', { sessionId, type: msg.type }, 'Unknown browser message type');
  }
}

// --- Helpers ---

/**
 * Wrap a relay message in the ServerEvent envelope expected by the browser client.
 * The client's WebSocketService expects: { type, payload, timestamp }
 */
function wrapForBrowser(message: Record<string, unknown>): string {
  return JSON.stringify({
    type: message.type,
    payload: message,
    timestamp: new Date().toISOString(),
  });
}

function broadcastToBrowsers(relay: SessionRelay, message: Record<string, unknown>): void {
  const str = wrapForBrowser(message);
  for (const browser of relay.browserSockets) {
    if (browser.readyState === browser.OPEN) {
      browser.send(str);
    }
  }
}

/**
 * Get all active relays (for monitoring/cleanup).
 */
export function getAllRelays(): Map<string, SessionRelay> {
  return relays;
}

/**
 * Reset all relays (for testing).
 */
export function resetRelays(): void {
  for (const relay of relays.values()) {
    if (relay.keepAliveTimer) {
      clearInterval(relay.keepAliveTimer);
    }
  }
  relays.clear();
}
