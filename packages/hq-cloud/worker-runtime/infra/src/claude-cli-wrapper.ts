/**
 * Claude CLI Wrapper with Event Streaming
 *
 * Wraps the Claude CLI process to:
 * 1. Invoke Claude CLI with worker configuration
 * 2. Parse output for status events (tool use, thinking, errors, questions)
 * 3. Stream events to the HQ API via WebSocket
 * 4. Capture questions/prompts and forward to API for user response
 * 5. Handle CLI exit codes and report final status
 *
 * @module claude-cli-wrapper
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/**
 * Event types emitted by the Claude CLI wrapper
 */
export type CliEventType =
  | 'status'
  | 'output'
  | 'tool_use'
  | 'thinking'
  | 'question'
  | 'error'
  | 'exit'
  | 'heartbeat';

/**
 * A single event emitted from the CLI wrapper
 */
export interface CliEvent {
  /** Event type */
  type: CliEventType;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Worker ID that produced this event */
  workerId: string;
  /** Event payload */
  payload: Record<string, unknown>;
}

/**
 * Configuration for the Claude CLI invocation
 */
export interface CliWrapperConfig {
  /** Path to the Claude CLI binary (default: "claude") */
  cliBinary?: string;
  /** Worker ID for tagging events */
  workerId: string;
  /** Skill name to execute */
  skill: string;
  /** Skill parameters as a JSON string */
  parameters: string;
  /** Working directory for the CLI process */
  cwd?: string;
  /** Additional environment variables for the CLI process */
  env?: Record<string, string>;
  /** Maximum execution time in ms (default: 1200000 = 20 min) */
  timeoutMs?: number;
}

/**
 * Status of the CLI wrapper after execution
 */
export interface CliWrapperResult {
  /** Whether the CLI exited successfully (code 0) */
  success: boolean;
  /** CLI exit code */
  exitCode: number;
  /** Collected stdout */
  stdout: string;
  /** Collected stderr */
  stderr: string;
  /** All events emitted during execution */
  events: CliEvent[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether execution was terminated by timeout */
  timedOut: boolean;
}

/**
 * Callback for receiving streamed events
 */
export type EventStreamCallback = (event: CliEvent) => void | Promise<void>;

/**
 * Callback for answering questions from the CLI
 * Returns the answer string to pipe to stdin
 */
export type QuestionAnswerCallback = (
  question: string,
  options: string[]
) => Promise<string>;

/**
 * Logger interface for the CLI wrapper
 */
export interface CliWrapperLogger {
  info(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/**
 * Default logger that writes to console
 */
const DEFAULT_CLI_LOGGER: CliWrapperLogger = {
  // eslint-disable-next-line no-console
  info: (msg: string) => console.log(`[CLI-Wrapper] ${msg}`),
  error: (msg: string) => console.error(`[CLI-Wrapper] ${msg}`),
  // eslint-disable-next-line no-console
  debug: (msg: string) => console.log(`[CLI-Wrapper:debug] ${msg}`),
};

// ────────────────────────────────────────────────────────────────
// Output line parsers
// ────────────────────────────────────────────────────────────────

/** Regex patterns for detecting event types in CLI output */
const PATTERNS = {
  /** Tool use indicator, e.g. "Using tool: Read" or "Tool: Bash" */
  toolUse: /^(?:Using tool|Tool):\s+(.+)/i,
  /** Thinking indicator */
  thinking: /^(?:Thinking|\.{3})/i,
  /** Question / prompt for user input */
  question: /^(?:Question|Input required|Select an option|Do you want to)(.*)$/i,
  /** Option line inside a question block, e.g. "1. Yes" */
  option: /^\s*(\d+)\.\s+(.+)$/,
  /** Error output */
  errorLine: /^(?:Error|ERROR|FATAL|Traceback)[\s:]/i,
  /** Status update, e.g. "[STATUS] running" */
  statusUpdate: /^\[STATUS\]\s+(.+)/i,
  /** JSON object on a line by itself (structured output) */
  jsonLine: /^\s*\{.*\}\s*$/,
} as const;

/**
 * Classify a single output line into an event type
 */
export function classifyOutputLine(line: string): {
  type: CliEventType;
  detail: Record<string, unknown>;
} {
  // Try structured JSON first
  if (PATTERNS.jsonLine.test(line)) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && 'type' in (parsed as Record<string, unknown>)) {
        return {
          type: (parsed as Record<string, unknown>)['type'] as CliEventType,
          detail: parsed as Record<string, unknown>,
        };
      }
      return { type: 'output', detail: { json: parsed } };
    } catch {
      // Not valid JSON, fall through
    }
  }

  if (PATTERNS.toolUse.test(line)) {
    const match = PATTERNS.toolUse.exec(line);
    return { type: 'tool_use', detail: { tool: match?.[1]?.trim() ?? 'unknown' } };
  }

  if (PATTERNS.thinking.test(line)) {
    return { type: 'thinking', detail: { text: line } };
  }

  if (PATTERNS.question.test(line)) {
    return { type: 'question', detail: { text: line, options: [] } };
  }

  if (PATTERNS.errorLine.test(line)) {
    return { type: 'error', detail: { message: line } };
  }

  if (PATTERNS.statusUpdate.test(line)) {
    const match = PATTERNS.statusUpdate.exec(line);
    return { type: 'status', detail: { status: match?.[1]?.trim() ?? 'unknown' } };
  }

  return { type: 'output', detail: { text: line } };
}

// ────────────────────────────────────────────────────────────────
// WebSocket event sender
// ────────────────────────────────────────────────────────────────

/**
 * Interface for sending events to the HQ API
 */
export interface EventSender {
  /** Send an event to the API */
  send(event: CliEvent): void | Promise<void>;
  /** Close the connection */
  close(): void | Promise<void>;
}

/**
 * Create an EventSender that calls a callback for each event.
 * In production this wraps a WebSocket; for testing you can pass any function.
 */
export function createCallbackEventSender(
  callback: EventStreamCallback,
  onClose?: () => void | Promise<void>
): EventSender {
  return {
    send: callback,
    close: async (): Promise<void> => {
      if (onClose) {
        await onClose();
      }
    },
  };
}

/**
 * Create an EventSender that POSTs events to the HQ API over HTTP.
 * Falls back to HTTP when WebSocket is not available.
 */
export function createHttpEventSender(config: {
  apiUrl: string;
  apiKey: string;
  workerId: string;
  logger?: CliWrapperLogger;
}): EventSender {
  const logger = config.logger ?? DEFAULT_CLI_LOGGER;
  let closed = false;

  return {
    async send(event: CliEvent): Promise<void> {
      if (closed) return;
      try {
        const response = await fetch(
          `${config.apiUrl}/api/workers/${config.workerId}/events`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(event),
          }
        );
        if (!response.ok) {
          logger.error(`Failed to send event (HTTP ${String(response.status)})`);
        }
      } catch (err) {
        logger.error(`Event send error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    close(): void {
      closed = true;
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Claude CLI Wrapper
// ────────────────────────────────────────────────────────────────

/**
 * Claude CLI Wrapper
 *
 * Spawns the Claude CLI as a child process, parses output,
 * streams events, handles questions, and manages the lifecycle.
 */
export class ClaudeCliWrapper extends EventEmitter {
  private readonly config: Required<CliWrapperConfig>;
  private readonly logger: CliWrapperLogger;
  private process: ChildProcess | null = null;
  private eventSender: EventSender | null = null;
  private questionCallback: QuestionAnswerCallback | null = null;
  private events: CliEvent[] = [];
  private stdout = '';
  private stderr = '';
  private running = false;
  private timedOut = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private questionBuffer: string[] = [];
  private inQuestionBlock = false;

  constructor(
    config: CliWrapperConfig,
    logger?: CliWrapperLogger
  ) {
    super();
    this.config = {
      cliBinary: config.cliBinary ?? 'claude',
      workerId: config.workerId,
      skill: config.skill,
      parameters: config.parameters,
      cwd: config.cwd ?? process.cwd(),
      env: config.env ?? {},
      timeoutMs: config.timeoutMs ?? 1_200_000,
    };
    this.logger = logger ?? DEFAULT_CLI_LOGGER;
  }

  /**
   * Attach an event sender for streaming events to the API
   */
  setEventSender(sender: EventSender): void {
    this.eventSender = sender;
  }

  /**
   * Attach a callback for answering questions from the CLI
   */
  setQuestionCallback(callback: QuestionAnswerCallback): void {
    this.questionCallback = callback;
  }

  /**
   * Build the CLI arguments for invocation
   */
  buildCliArgs(): string[] {
    return [
      'run',
      '--worker', this.config.workerId,
      '--skill', this.config.skill,
      '--params', this.config.parameters,
    ];
  }

  /**
   * Build the environment variables for the child process
   */
  buildProcessEnv(): Record<string, string | undefined> {
    return {
      ...process.env,
      ...this.config.env,
      WORKER_ID: this.config.workerId,
      WORKER_SKILL: this.config.skill,
      WORKER_PARAMS: this.config.parameters,
    };
  }

  /**
   * Execute the Claude CLI and return results.
   *
   * This is the main entry point. It spawns the process,
   * parses output, streams events, and waits for completion.
   */
  async execute(): Promise<CliWrapperResult> {
    if (this.running) {
      throw new Error('CLI wrapper is already running');
    }

    this.running = true;
    const startTime = Date.now();

    // Emit initial status event
    this.emitEvent('status', { status: 'starting', skill: this.config.skill });

    try {
      const exitCode = await this.spawnAndWait();

      const durationMs = Date.now() - startTime;

      // Emit final status
      this.emitEvent('exit', {
        exitCode,
        durationMs,
        timedOut: this.timedOut,
        success: exitCode === 0,
      });

      return {
        success: exitCode === 0,
        exitCode,
        stdout: this.stdout,
        stderr: this.stderr,
        events: [...this.events],
        durationMs,
        timedOut: this.timedOut,
      };
    } finally {
      this.running = false;
      this.cleanup();
    }
  }

  /**
   * Spawn the CLI process and wait for it to exit.
   * Returns the exit code.
   */
  private spawnAndWait(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const args = this.buildCliArgs();
      const env = this.buildProcessEnv();

      this.logger.info(`Spawning: ${this.config.cliBinary} ${args.join(' ')}`);

      this.process = spawn(this.config.cliBinary, args, {
        cwd: this.config.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up timeout
      this.timeoutTimer = setTimeout(() => {
        this.timedOut = true;
        this.logger.error(`CLI execution timed out after ${String(this.config.timeoutMs)}ms`);
        this.emitEvent('error', { message: 'Execution timed out', timeoutMs: this.config.timeoutMs });
        if (this.process && !this.process.killed) {
          this.process.kill('SIGTERM');
          // Force kill after 5s if still alive
          setTimeout(() => {
            if (this.process && !this.process.killed) {
              this.process.kill('SIGKILL');
            }
          }, 5000);
        }
      }, this.config.timeoutMs);

      // Handle stdout
      let stdoutBuffer = '';
      this.process.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.stdout += text;
        stdoutBuffer += text;

        // Process complete lines
        const lines = stdoutBuffer.split('\n');
        // Keep the last incomplete line in the buffer
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim()) {
            this.processOutputLine(line);
          }
        }
      });

      // Handle stderr
      let stderrBuffer = '';
      this.process.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        this.stderr += text;
        stderrBuffer += text;

        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim()) {
            this.emitEvent('error', { message: line, stream: 'stderr' });
          }
        }
      });

      // Handle process exit
      this.process.on('close', (code) => {
        // Process any remaining buffered output
        if (stdoutBuffer.trim()) {
          this.processOutputLine(stdoutBuffer);
        }
        if (stderrBuffer.trim()) {
          this.emitEvent('error', { message: stderrBuffer, stream: 'stderr' });
        }

        resolve(code ?? 1);
      });

      // Handle spawn errors
      this.process.on('error', (err) => {
        this.emitEvent('error', { message: `Spawn error: ${err.message}` });
        reject(err);
      });
    });
  }

  /**
   * Process a single line of stdout output.
   * Classifies the line and emits the appropriate event.
   */
  private processOutputLine(line: string): void {
    const classified = classifyOutputLine(line);

    // Handle question blocks
    if (classified.type === 'question') {
      this.inQuestionBlock = true;
      this.questionBuffer = [line];
      return;
    }

    // If we're in a question block, collect option lines
    if (this.inQuestionBlock) {
      if (PATTERNS.option.test(line)) {
        this.questionBuffer.push(line);
        return;
      } else {
        // Question block ended, flush it
        void this.flushQuestionBlock();
        this.inQuestionBlock = false;
      }
    }

    this.emitEvent(classified.type, classified.detail);
  }

  /**
   * Flush a collected question block and optionally answer it
   */
  private async flushQuestionBlock(): Promise<void> {
    const questionText = this.questionBuffer[0] ?? '';
    const options: string[] = [];

    for (let i = 1; i < this.questionBuffer.length; i++) {
      const optLine = this.questionBuffer[i];
      if (optLine) {
        const match = PATTERNS.option.exec(optLine);
        if (match?.[2]) {
          options.push(match[2]);
        }
      }
    }

    // Emit question event
    this.emitEvent('question', {
      text: questionText,
      options,
      waitingForAnswer: true,
    });

    // If we have a question callback, get the answer and pipe it to stdin
    if (this.questionCallback && this.process?.stdin?.writable) {
      try {
        const answer = await this.questionCallback(questionText, options);
        this.process.stdin.write(answer + '\n');
        this.emitEvent('status', { status: 'question_answered', answer });
      } catch (err) {
        this.logger.error(
          `Question callback error: ${err instanceof Error ? err.message : String(err)}`
        );
        this.emitEvent('error', {
          message: `Failed to get answer: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      this.logger.info('Question detected but no answer callback set - CLI may block');
    }

    this.questionBuffer = [];
  }

  /**
   * Create a CliEvent, record it, and stream it
   */
  private emitEvent(type: CliEventType, payload: Record<string, unknown>): void {
    const event: CliEvent = {
      type,
      timestamp: new Date().toISOString(),
      workerId: this.config.workerId,
      payload,
    };

    this.events.push(event);
    this.emit('event', event);

    // Stream to API if sender is attached
    if (this.eventSender) {
      // Fire-and-forget; errors are logged inside the sender
      void Promise.resolve(this.eventSender.send(event)).catch((err: unknown) => {
        this.logger.error(
          `Event sender error: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  }

  /**
   * Send an answer to the CLI's stdin (for external callers)
   */
  sendAnswer(answer: string): boolean {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(answer + '\n');
      this.emitEvent('status', { status: 'answer_sent', answer });
      return true;
    }
    return false;
  }

  /**
   * Kill the running CLI process
   */
  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.process && !this.process.killed) {
      this.logger.info(`Killing CLI process with ${signal}`);
      this.process.kill(signal);
    }
  }

  /**
   * Whether the wrapper is currently executing
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Clean up timers and close event sender
   */
  private cleanup(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.eventSender) {
      void Promise.resolve(this.eventSender.close()).catch(() => {
        // ignore close errors
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Factory helpers
// ────────────────────────────────────────────────────────────────

/**
 * Create a CLI wrapper from environment variables
 * (the typical path inside a running container)
 */
export function createCliWrapperFromEnv(
  overrides?: Partial<CliWrapperConfig>,
  logger?: CliWrapperLogger
): ClaudeCliWrapper {
  const config: CliWrapperConfig = {
    cliBinary: overrides?.cliBinary ?? process.env['CLAUDE_CLI_PATH'] ?? 'claude',
    workerId: overrides?.workerId ?? process.env['WORKER_ID'] ?? 'unknown',
    skill: overrides?.skill ?? process.env['WORKER_SKILL'] ?? 'default',
    parameters: overrides?.parameters ?? process.env['WORKER_PARAMS'] ?? '{}',
    cwd: overrides?.cwd ?? process.env['HQ_ROOT'] ?? '/hq',
    env: overrides?.env,
    timeoutMs: overrides?.timeoutMs,
  };

  return new ClaudeCliWrapper(config, logger);
}

/**
 * Convenience: create, wire up HTTP event sender, and execute
 */
export async function executeWithHttpStreaming(
  config: CliWrapperConfig,
  apiConfig: { apiUrl: string; apiKey: string },
  questionCallback?: QuestionAnswerCallback,
  logger?: CliWrapperLogger
): Promise<CliWrapperResult> {
  const wrapper = new ClaudeCliWrapper(config, logger);

  const sender = createHttpEventSender({
    apiUrl: apiConfig.apiUrl,
    apiKey: apiConfig.apiKey,
    workerId: config.workerId,
    logger,
  });
  wrapper.setEventSender(sender);

  if (questionCallback) {
    wrapper.setQuestionCallback(questionCallback);
  }

  return wrapper.execute();
}
