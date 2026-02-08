/**
 * Tests for Claude CLI Wrapper with Event Streaming
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ClaudeCliWrapper,
  classifyOutputLine,
  createCallbackEventSender,
  createHttpEventSender,
  createCliWrapperFromEnv,
  type CliWrapperConfig,
  type CliEvent,
  type CliWrapperLogger,
  type EventSender,
} from '../claude-cli-wrapper.js';

// ────────────────────────────────────────────────────────────────
// classifyOutputLine
// ────────────────────────────────────────────────────────────────

describe('classifyOutputLine', () => {
  describe('tool use detection', () => {
    it('detects "Using tool:" pattern', () => {
      const result = classifyOutputLine('Using tool: Read');
      expect(result.type).toBe('tool_use');
      expect(result.detail.tool).toBe('Read');
    });

    it('detects "Tool:" pattern', () => {
      const result = classifyOutputLine('Tool: Bash');
      expect(result.type).toBe('tool_use');
      expect(result.detail.tool).toBe('Bash');
    });

    it('is case insensitive for tool use', () => {
      const result = classifyOutputLine('using tool: Write');
      expect(result.type).toBe('tool_use');
      expect(result.detail.tool).toBe('Write');
    });
  });

  describe('thinking detection', () => {
    it('detects "Thinking" keyword', () => {
      const result = classifyOutputLine('Thinking about this problem...');
      expect(result.type).toBe('thinking');
      expect(result.detail.text).toBe('Thinking about this problem...');
    });

    it('detects "..." prefix', () => {
      const result = classifyOutputLine('... processing');
      expect(result.type).toBe('thinking');
    });
  });

  describe('question detection', () => {
    it('detects "Question" keyword', () => {
      const result = classifyOutputLine('Question: What branch should I use?');
      expect(result.type).toBe('question');
      expect(result.detail.text).toBe('Question: What branch should I use?');
    });

    it('detects "Input required" pattern', () => {
      const result = classifyOutputLine('Input required: enter API key');
      expect(result.type).toBe('question');
    });

    it('detects "Select an option" pattern', () => {
      const result = classifyOutputLine('Select an option from the list');
      expect(result.type).toBe('question');
    });

    it('detects "Do you want to" pattern', () => {
      const result = classifyOutputLine('Do you want to continue?');
      expect(result.type).toBe('question');
    });
  });

  describe('error detection', () => {
    it('detects "Error" prefix', () => {
      const result = classifyOutputLine('Error: file not found');
      expect(result.type).toBe('error');
      expect(result.detail.message).toBe('Error: file not found');
    });

    it('detects "ERROR" prefix', () => {
      const result = classifyOutputLine('ERROR something went wrong');
      expect(result.type).toBe('error');
    });

    it('detects "FATAL" prefix', () => {
      const result = classifyOutputLine('FATAL: out of memory');
      expect(result.type).toBe('error');
    });

    it('detects "Traceback" prefix', () => {
      const result = classifyOutputLine('Traceback (most recent call last):');
      expect(result.type).toBe('error');
    });
  });

  describe('status update detection', () => {
    it('detects "[STATUS]" pattern', () => {
      const result = classifyOutputLine('[STATUS] running');
      expect(result.type).toBe('status');
      expect(result.detail.status).toBe('running');
    });

    it('trims status value', () => {
      const result = classifyOutputLine('[STATUS]   compiling   ');
      expect(result.type).toBe('status');
      expect(result.detail.status).toBe('compiling');
    });
  });

  describe('JSON line detection', () => {
    it('detects valid JSON with type field', () => {
      const result = classifyOutputLine('{"type":"heartbeat","data":123}');
      expect(result.type).toBe('heartbeat');
      expect(result.detail.data).toBe(123);
    });

    it('treats JSON without type as output', () => {
      const result = classifyOutputLine('{"key":"value","count":5}');
      expect(result.type).toBe('output');
      expect(result.detail.json).toEqual({ key: 'value', count: 5 });
    });

    it('falls through on invalid JSON', () => {
      const result = classifyOutputLine('{not valid json}');
      expect(result.type).toBe('output');
    });
  });

  describe('default output', () => {
    it('classifies ordinary text as output', () => {
      const result = classifyOutputLine('Hello, this is regular text');
      expect(result.type).toBe('output');
      expect(result.detail.text).toBe('Hello, this is regular text');
    });
  });
});

// ────────────────────────────────────────────────────────────────
// createCallbackEventSender
// ────────────────────────────────────────────────────────────────

describe('createCallbackEventSender', () => {
  it('calls the callback on send', async () => {
    const callback = vi.fn();
    const sender = createCallbackEventSender(callback);

    const event: CliEvent = {
      type: 'status',
      timestamp: new Date().toISOString(),
      workerId: 'test-worker',
      payload: { status: 'running' },
    };

    await sender.send(event);
    expect(callback).toHaveBeenCalledWith(event);
  });

  it('calls onClose when closing', async () => {
    const onClose = vi.fn();
    const sender = createCallbackEventSender(vi.fn(), onClose);

    await sender.close();
    expect(onClose).toHaveBeenCalled();
  });

  it('handles close without onClose callback', async () => {
    const sender = createCallbackEventSender(vi.fn());
    // Should not throw
    await sender.close();
  });
});

// ────────────────────────────────────────────────────────────────
// createHttpEventSender
// ────────────────────────────────────────────────────────────────

describe('createHttpEventSender', () => {
  let mockLogger: CliWrapperLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
  });

  it('sends event via HTTP POST', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const sender = createHttpEventSender({
      apiUrl: 'https://api.hq.test',
      apiKey: 'test-key',
      workerId: 'w-123',
      logger: mockLogger,
    });

    const event: CliEvent = {
      type: 'tool_use',
      timestamp: '2026-02-07T12:00:00Z',
      workerId: 'w-123',
      payload: { tool: 'Read' },
    };

    await sender.send(event);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.hq.test/api/workers/w-123/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        }),
        body: JSON.stringify(event),
      })
    );

    vi.unstubAllGlobals();
  });

  it('logs error on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', mockFetch);

    const sender = createHttpEventSender({
      apiUrl: 'https://api.hq.test',
      apiKey: 'test-key',
      workerId: 'w-123',
      logger: mockLogger,
    });

    const event: CliEvent = {
      type: 'error',
      timestamp: '2026-02-07T12:00:00Z',
      workerId: 'w-123',
      payload: { message: 'test error' },
    };

    await sender.send(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('500')
    );

    vi.unstubAllGlobals();
  });

  it('logs error on fetch failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const sender = createHttpEventSender({
      apiUrl: 'https://api.hq.test',
      apiKey: 'test-key',
      workerId: 'w-123',
      logger: mockLogger,
    });

    const event: CliEvent = {
      type: 'status',
      timestamp: '2026-02-07T12:00:00Z',
      workerId: 'w-123',
      payload: {},
    };

    await sender.send(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Network error')
    );

    vi.unstubAllGlobals();
  });

  it('does not send events after close', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const sender = createHttpEventSender({
      apiUrl: 'https://api.hq.test',
      apiKey: 'test-key',
      workerId: 'w-123',
      logger: mockLogger,
    });

    sender.close();

    const event: CliEvent = {
      type: 'status',
      timestamp: '2026-02-07T12:00:00Z',
      workerId: 'w-123',
      payload: {},
    };

    await sender.send(event);

    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// ────────────────────────────────────────────────────────────────
// ClaudeCliWrapper
// ────────────────────────────────────────────────────────────────

describe('ClaudeCliWrapper', () => {
  const baseConfig: CliWrapperConfig = {
    workerId: 'test-worker',
    skill: 'implement-endpoint',
    parameters: '{"repo": "/path/to/repo"}',
    cwd: '/hq',
    timeoutMs: 5000,
  };

  let mockLogger: CliWrapperLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
  });

  describe('constructor', () => {
    it('creates wrapper with config', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      expect(wrapper).toBeDefined();
      expect(wrapper.isRunning).toBe(false);
    });

    it('applies defaults for optional config', () => {
      const wrapper = new ClaudeCliWrapper({
        workerId: 'w1',
        skill: 'skill',
        parameters: '{}',
      }, mockLogger);
      expect(wrapper).toBeDefined();
    });
  });

  describe('buildCliArgs', () => {
    it('builds correct CLI arguments', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      const args = wrapper.buildCliArgs();

      expect(args).toEqual([
        'run',
        '--worker', 'test-worker',
        '--skill', 'implement-endpoint',
        '--params', '{"repo": "/path/to/repo"}',
      ]);
    });
  });

  describe('buildProcessEnv', () => {
    it('includes worker environment variables', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      const env = wrapper.buildProcessEnv();

      expect(env['WORKER_ID']).toBe('test-worker');
      expect(env['WORKER_SKILL']).toBe('implement-endpoint');
      expect(env['WORKER_PARAMS']).toBe('{"repo": "/path/to/repo"}');
    });

    it('includes custom environment variables', () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        env: { CUSTOM_VAR: 'value' },
      }, mockLogger);
      const env = wrapper.buildProcessEnv();

      expect(env['CUSTOM_VAR']).toBe('value');
    });

    it('inherits process.env', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      const env = wrapper.buildProcessEnv();

      // Should contain PATH from process.env
      expect(env['PATH']).toBeDefined();
    });
  });

  describe('setEventSender', () => {
    it('accepts an event sender', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      const sender: EventSender = {
        send: vi.fn(),
        close: vi.fn(),
      };
      // Should not throw
      wrapper.setEventSender(sender);
    });
  });

  describe('setQuestionCallback', () => {
    it('accepts a question callback', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      const callback = vi.fn().mockResolvedValue('yes');
      // Should not throw
      wrapper.setQuestionCallback(callback);
    });
  });

  describe('execute', () => {
    it('throws if already running', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        // Use a command that will run for a while
        cliBinary: 'node',
      }, mockLogger);

      // Override buildCliArgs to use node -e with a sleep
      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue(['-e', 'setTimeout(() => {}, 10000)']);

      // Start execution
      const promise1 = wrapper.execute();

      // Wait a tick for the process to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Try to execute again while running
      await expect(wrapper.execute()).rejects.toThrow('already running');

      // Kill the process to clean up
      wrapper.kill();
      await promise1;
    });

    it('executes a simple command and returns result', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'node',
      }, mockLogger);

      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue(['-e', 'console.log("hello world"); process.exit(0)']);

      const result = await wrapper.execute();

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello world');
      expect(result.timedOut).toBe(false);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('captures exit code on failure', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'node',
      }, mockLogger);

      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue(['-e', 'process.exit(42)']);

      const result = await wrapper.execute();

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
    });

    it('captures stderr output', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'node',
      }, mockLogger);

      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue(['-e', 'console.error("Error: something failed"); process.exit(1)']);

      const result = await wrapper.execute();

      expect(result.stderr).toContain('Error: something failed');
      expect(result.success).toBe(false);
    });

    it('emits events for classified output lines', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'node',
      }, mockLogger);

      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue([
        '-e',
        'console.log("Using tool: Read"); console.log("[STATUS] compiling"); process.exit(0)',
      ]);

      const events: CliEvent[] = [];
      wrapper.on('event', (event: CliEvent) => {
        events.push(event);
      });

      await wrapper.execute();

      const toolEvents = events.filter((e) => e.type === 'tool_use');
      expect(toolEvents.length).toBeGreaterThanOrEqual(1);
      expect(toolEvents[0]!.payload.tool).toBe('Read');

      const statusEvents = events.filter(
        (e) => e.type === 'status' && e.payload.status === 'compiling'
      );
      expect(statusEvents.length).toBe(1);
    });

    it('streams events to event sender', async () => {
      const sendFn = vi.fn();
      const closeFn = vi.fn();
      const sender: EventSender = { send: sendFn, close: closeFn };

      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'node',
      }, mockLogger);
      wrapper.setEventSender(sender);

      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue([
        '-e',
        'console.log("Using tool: Bash"); process.exit(0)',
      ]);

      await wrapper.execute();

      // Should have sent at least the starting status event and exit event
      expect(sendFn).toHaveBeenCalled();

      const sentEvents = sendFn.mock.calls.map(
        (call: [CliEvent]) => call[0]
      );
      const startEvent = sentEvents.find(
        (e: CliEvent) => e.type === 'status' && e.payload.status === 'starting'
      );
      expect(startEvent).toBeDefined();

      const exitEvent = sentEvents.find((e: CliEvent) => e.type === 'exit');
      expect(exitEvent).toBeDefined();
      expect(exitEvent!.payload.success).toBe(true);

      // close should be called during cleanup
      expect(closeFn).toHaveBeenCalled();
    });

    it('handles timeout', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'node',
        timeoutMs: 500, // Short timeout
      }, mockLogger);

      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue([
        '-e',
        'setTimeout(() => {}, 30000)', // Sleep for 30 seconds
      ]);

      const result = await wrapper.execute();

      expect(result.timedOut).toBe(true);
      expect(result.success).toBe(false);
    }, 10000);

    it('records all events in result', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'node',
      }, mockLogger);

      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue([
        '-e',
        'console.log("Using tool: Read"); console.log("Output text"); process.exit(0)',
      ]);

      const result = await wrapper.execute();

      // Should have at least: starting status, tool_use, output, exit
      expect(result.events.length).toBeGreaterThanOrEqual(3);

      // Every event should have required fields
      for (const event of result.events) {
        expect(event.type).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.workerId).toBe('test-worker');
        expect(event.payload).toBeDefined();
      }
    });

    it('handles spawn error for missing binary', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'nonexistent-binary-that-does-not-exist-12345',
      }, mockLogger);

      await expect(wrapper.execute()).rejects.toThrow();
    });
  });

  describe('sendAnswer', () => {
    it('returns false when process is not running', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      expect(wrapper.sendAnswer('yes')).toBe(false);
    });
  });

  describe('kill', () => {
    it('does not throw when no process is running', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      // Should not throw
      wrapper.kill();
    });
  });

  describe('isRunning', () => {
    it('returns false initially', () => {
      const wrapper = new ClaudeCliWrapper(baseConfig, mockLogger);
      expect(wrapper.isRunning).toBe(false);
    });

    it('returns false after execution completes', async () => {
      const wrapper = new ClaudeCliWrapper({
        ...baseConfig,
        cliBinary: 'node',
      }, mockLogger);

      vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue(['-e', 'process.exit(0)']);

      await wrapper.execute();
      expect(wrapper.isRunning).toBe(false);
    });
  });
});

// ────────────────────────────────────────────────────────────────
// createCliWrapperFromEnv
// ────────────────────────────────────────────────────────────────

describe('createCliWrapperFromEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates wrapper with environment variables', () => {
    process.env['CLAUDE_CLI_PATH'] = '/usr/local/bin/claude';
    process.env['WORKER_ID'] = 'env-worker';
    process.env['WORKER_SKILL'] = 'env-skill';
    process.env['WORKER_PARAMS'] = '{"key":"value"}';
    process.env['HQ_ROOT'] = '/custom/hq';

    const wrapper = createCliWrapperFromEnv();

    expect(wrapper).toBeDefined();
    expect(wrapper.isRunning).toBe(false);

    const args = wrapper.buildCliArgs();
    expect(args).toContain('--worker');
    expect(args).toContain('env-worker');
    expect(args).toContain('--skill');
    expect(args).toContain('env-skill');
  });

  it('uses defaults when env vars not set', () => {
    delete process.env['CLAUDE_CLI_PATH'];
    delete process.env['WORKER_ID'];
    delete process.env['WORKER_SKILL'];
    delete process.env['WORKER_PARAMS'];
    delete process.env['HQ_ROOT'];

    const wrapper = createCliWrapperFromEnv();

    expect(wrapper).toBeDefined();

    const args = wrapper.buildCliArgs();
    expect(args).toContain('unknown');
    expect(args).toContain('default');
  });

  it('applies overrides over env vars', () => {
    process.env['WORKER_ID'] = 'env-worker';

    const wrapper = createCliWrapperFromEnv({
      workerId: 'override-worker',
      skill: 'override-skill',
      parameters: '{}',
    });

    const args = wrapper.buildCliArgs();
    expect(args).toContain('override-worker');
    expect(args).toContain('override-skill');
  });

  it('accepts custom logger', () => {
    const logger: CliWrapperLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const wrapper = createCliWrapperFromEnv(undefined, logger);
    expect(wrapper).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────
// Event lifecycle integration
// ────────────────────────────────────────────────────────────────

describe('CLI wrapper event lifecycle', () => {
  it('emits starting and exit events for successful execution', async () => {
    const wrapper = new ClaudeCliWrapper({
      workerId: 'lifecycle-test',
      skill: 'test',
      parameters: '{}',
      cliBinary: 'node',
      timeoutMs: 5000,
    });

    vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue(['-e', 'process.exit(0)']);

    const result = await wrapper.execute();

    const eventTypes = result.events.map((e) => e.type);

    // Must have starting status and exit
    expect(eventTypes[0]).toBe('status');
    expect(result.events[0]!.payload.status).toBe('starting');

    expect(eventTypes[eventTypes.length - 1]).toBe('exit');
    const exitEvent = result.events[result.events.length - 1]!;
    expect(exitEvent.payload.success).toBe(true);
    expect(exitEvent.payload.exitCode).toBe(0);
  });

  it('emits exit event with failure for non-zero exit', async () => {
    const wrapper = new ClaudeCliWrapper({
      workerId: 'lifecycle-test',
      skill: 'test',
      parameters: '{}',
      cliBinary: 'node',
      timeoutMs: 5000,
    });

    vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue(['-e', 'process.exit(1)']);

    const result = await wrapper.execute();

    const exitEvent = result.events.find((e) => e.type === 'exit');
    expect(exitEvent).toBeDefined();
    expect(exitEvent!.payload.success).toBe(false);
    expect(exitEvent!.payload.exitCode).toBe(1);
  });

  it('includes workerId on all events', async () => {
    const wrapper = new ClaudeCliWrapper({
      workerId: 'tagged-worker',
      skill: 'test',
      parameters: '{}',
      cliBinary: 'node',
      timeoutMs: 5000,
    });

    vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue([
      '-e',
      'console.log("Using tool: Read"); process.exit(0)',
    ]);

    const result = await wrapper.execute();

    for (const event of result.events) {
      expect(event.workerId).toBe('tagged-worker');
    }
  });

  it('includes ISO timestamps on all events', async () => {
    const wrapper = new ClaudeCliWrapper({
      workerId: 'timestamp-test',
      skill: 'test',
      parameters: '{}',
      cliBinary: 'node',
      timeoutMs: 5000,
    });

    vi.spyOn(wrapper, 'buildCliArgs').mockReturnValue(['-e', 'process.exit(0)']);

    const result = await wrapper.execute();

    for (const event of result.events) {
      // ISO 8601 format check
      const parsed = new Date(event.timestamp);
      expect(parsed.toISOString()).toBe(event.timestamp);
    }
  });
});
