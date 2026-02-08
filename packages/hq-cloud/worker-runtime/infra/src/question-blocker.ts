/**
 * Question Blocker and Resume Service
 *
 * Manages the lifecycle of worker questions:
 * 1. When the Claude CLI emits a question event, the worker pauses
 * 2. The question is sent to the HQ API with options (if available)
 * 3. Worker status is updated to "waiting_input"
 * 4. A WebSocket listener waits for answer events
 * 5. When an answer is received, it is piped to Claude stdin and execution resumes
 *
 * @module question-blocker
 */

import { EventEmitter } from 'node:events';
import type { ClaudeCliWrapper } from './claude-cli-wrapper.js';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

/**
 * Worker status values relevant to question blocking
 */
export type WorkerBlockingStatus =
  | 'running'
  | 'waiting_input'
  | 'resuming';

/**
 * A question pending an answer
 */
export interface PendingQuestion {
  /** Unique question ID */
  questionId: string;
  /** The question text from Claude CLI */
  text: string;
  /** Available options (if any) */
  options: string[];
  /** When the question was detected */
  askedAt: string;
  /** When the answer was received (null if still pending) */
  answeredAt: string | null;
  /** The answer provided (null if still pending) */
  answer: string | null;
  /** Worker ID that asked the question */
  workerId: string;
}

/**
 * Answer received from the API/WebSocket
 */
export interface QuestionAnswer {
  /** The question ID being answered */
  questionId: string;
  /** The answer text */
  answer: string;
  /** Who provided the answer (user ID, "system", etc.) */
  answeredBy: string;
  /** ISO 8601 timestamp */
  answeredAt: string;
}

/**
 * Event types emitted by the QuestionBlocker
 */
export type QuestionBlockerEventType =
  | 'question_detected'
  | 'question_sent'
  | 'status_updated'
  | 'answer_received'
  | 'answer_applied'
  | 'timeout'
  | 'error';

/**
 * Event payload for QuestionBlocker events
 */
export interface QuestionBlockerEvent {
  type: QuestionBlockerEventType;
  timestamp: string;
  workerId: string;
  payload: Record<string, unknown>;
}

/**
 * Interface for communicating with the HQ API
 */
export interface QuestionApiClient {
  /**
   * Send a question to the API for user response
   */
  sendQuestion(
    workerId: string,
    question: PendingQuestion
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Update the worker status in the API
   */
  updateWorkerStatus(
    workerId: string,
    status: WorkerBlockingStatus,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }>;
}

/**
 * Interface for receiving answers via WebSocket
 */
export interface AnswerListener {
  /**
   * Subscribe to answer events for a specific question
   * Returns an unsubscribe function
   */
  onAnswer(
    questionId: string,
    callback: (answer: QuestionAnswer) => void
  ): () => void;

  /**
   * Check if the listener is connected
   */
  isConnected(): boolean;
}

/**
 * Logger interface for the QuestionBlocker
 */
export interface QuestionBlockerLogger {
  info(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/**
 * Configuration for the QuestionBlocker
 */
export interface QuestionBlockerConfig {
  /** Worker ID */
  workerId: string;
  /** Maximum time to wait for an answer (ms, default: 300000 = 5 min) */
  answerTimeoutMs?: number;
  /** Interval to poll for answers if WebSocket is unavailable (ms, default: 5000) */
  pollIntervalMs?: number;
  /** Logger instance */
  logger?: QuestionBlockerLogger;
}

// ────────────────────────────────────────────────────────────────
// Default logger
// ────────────────────────────────────────────────────────────────

const DEFAULT_LOGGER: QuestionBlockerLogger = {
  // eslint-disable-next-line no-console
  info: (msg: string) => console.log(`[QuestionBlocker] ${msg}`),
  error: (msg: string) => console.error(`[QuestionBlocker] ${msg}`),
  // eslint-disable-next-line no-console
  debug: (msg: string) => console.log(`[QuestionBlocker:debug] ${msg}`),
};

// ────────────────────────────────────────────────────────────────
// QuestionBlocker Service
// ────────────────────────────────────────────────────────────────

/**
 * Question Blocker Service
 *
 * Orchestrates the question/answer lifecycle between the Claude CLI
 * wrapper, the HQ API, and WebSocket-based answer delivery.
 *
 * Usage:
 * ```ts
 * const blocker = new QuestionBlocker(config);
 * blocker.setApiClient(apiClient);
 * blocker.setAnswerListener(wsListener);
 * blocker.attachToWrapper(cliWrapper);
 * // The wrapper will now pause on questions and resume on answers
 * ```
 */
export class QuestionBlocker extends EventEmitter {
  private readonly config: Required<QuestionBlockerConfig>;
  private readonly logger: QuestionBlockerLogger;
  private apiClient: QuestionApiClient | null = null;
  private answerListener: AnswerListener | null = null;
  private pendingQuestions: Map<string, PendingQuestion> = new Map();
  private questionHistory: PendingQuestion[] = [];
  private currentStatus: WorkerBlockingStatus = 'running';
  private unsubscribers: Map<string, () => void> = new Map();
  private questionCounter = 0;

  constructor(config: QuestionBlockerConfig) {
    super();
    this.config = {
      workerId: config.workerId,
      answerTimeoutMs: config.answerTimeoutMs ?? 300_000,
      pollIntervalMs: config.pollIntervalMs ?? 5_000,
      logger: config.logger ?? DEFAULT_LOGGER,
    };
    this.logger = this.config.logger;
  }

  /**
   * Set the API client for sending questions and updating status
   */
  setApiClient(client: QuestionApiClient): void {
    this.apiClient = client;
  }

  /**
   * Set the answer listener (WebSocket) for receiving answers
   */
  setAnswerListener(listener: AnswerListener): void {
    this.answerListener = listener;
  }

  /**
   * Attach to a ClaudeCliWrapper instance.
   * This wires up the question callback so questions are intercepted
   * and routed through the blocking/resume flow.
   */
  attachToWrapper(wrapper: ClaudeCliWrapper): void {
    // Set the question callback on the wrapper
    // This is called by the wrapper when a question block is flushed
    wrapper.setQuestionCallback(
      async (questionText: string, options: string[]): Promise<string> => {
        return this.handleQuestion(questionText, options);
      }
    );

    this.logger.info(`Attached to CLI wrapper for worker ${this.config.workerId}`);
  }

  /**
   * Handle a question from the CLI wrapper.
   * This is the core blocking method: it sends the question to the API,
   * updates the worker status, waits for an answer, and returns it.
   *
   * The returned string is piped to Claude's stdin by the wrapper.
   */
  async handleQuestion(questionText: string, options: string[]): Promise<string> {
    const questionId = this.generateQuestionId();

    const pendingQuestion: PendingQuestion = {
      questionId,
      text: questionText,
      options,
      askedAt: new Date().toISOString(),
      answeredAt: null,
      answer: null,
      workerId: this.config.workerId,
    };

    this.pendingQuestions.set(questionId, pendingQuestion);

    // Emit question detected event
    this.emitBlockerEvent('question_detected', {
      questionId,
      text: questionText,
      options,
    });

    this.logger.info(`Question detected (${questionId}): ${questionText.substring(0, 80)}...`);

    // Step 1: Update worker status to waiting_input
    await this.updateStatus('waiting_input', {
      currentQuestion: questionId,
      questionText: questionText.substring(0, 200),
    });

    // Step 2: Send the question to the API
    await this.sendQuestionToApi(pendingQuestion);

    // Step 3: Wait for the answer (blocks until answer or timeout)
    try {
      const answer = await this.waitForAnswer(questionId);

      // Step 4: Update the pending question record
      pendingQuestion.answeredAt = new Date().toISOString();
      pendingQuestion.answer = answer;
      this.pendingQuestions.delete(questionId);
      this.questionHistory.push(pendingQuestion);

      // Step 5: Update worker status back to running
      await this.updateStatus('resuming', { answeredQuestion: questionId });

      this.emitBlockerEvent('answer_applied', {
        questionId,
        answer,
      });

      this.logger.info(`Answer applied for ${questionId}, resuming execution`);

      // Brief status update back to running
      await this.updateStatus('running', {});

      return answer;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to get answer for ${questionId}: ${errorMessage}`);

      this.emitBlockerEvent('error', {
        questionId,
        error: errorMessage,
      });

      // Clean up
      this.pendingQuestions.delete(questionId);
      pendingQuestion.answeredAt = new Date().toISOString();
      pendingQuestion.answer = null;
      this.questionHistory.push(pendingQuestion);

      throw err;
    }
  }

  /**
   * Provide an answer externally (e.g., from a direct API call).
   * This is useful when the answer comes through a channel other
   * than the WebSocket listener.
   */
  provideAnswer(questionId: string, answer: string, answeredBy: string = 'external'): boolean {
    const questionAnswer: QuestionAnswer = {
      questionId,
      answer,
      answeredBy,
      answeredAt: new Date().toISOString(),
    };

    // Emit answer_received to unblock waitForAnswer
    this.emit(`answer:${questionId}`, questionAnswer);

    return this.pendingQuestions.has(questionId);
  }

  /**
   * Send a question to the HQ API
   */
  private async sendQuestionToApi(question: PendingQuestion): Promise<void> {
    if (!this.apiClient) {
      this.logger.debug('No API client set, skipping question send to API');
      return;
    }

    try {
      const result = await this.apiClient.sendQuestion(
        this.config.workerId,
        question
      );

      if (result.success) {
        this.emitBlockerEvent('question_sent', {
          questionId: question.questionId,
        });
        this.logger.info(`Question ${question.questionId} sent to API`);
      } else {
        this.logger.error(
          `Failed to send question to API: ${result.error ?? 'unknown error'}`
        );
      }
    } catch (err) {
      this.logger.error(
        `Error sending question to API: ${err instanceof Error ? err.message : String(err)}`
      );
      // Don't throw - we still want to wait for the answer
    }
  }

  /**
   * Update the worker status in the API
   */
  private async updateStatus(
    status: WorkerBlockingStatus,
    metadata: Record<string, unknown>
  ): Promise<void> {
    this.currentStatus = status;

    this.emitBlockerEvent('status_updated', { status, ...metadata });

    if (!this.apiClient) {
      this.logger.debug(`No API client set, status updated locally to: ${status}`);
      return;
    }

    try {
      const result = await this.apiClient.updateWorkerStatus(
        this.config.workerId,
        status,
        metadata
      );

      if (!result.success) {
        this.logger.error(
          `Failed to update worker status to ${status}: ${result.error ?? 'unknown'}`
        );
      }
    } catch (err) {
      this.logger.error(
        `Error updating worker status: ${err instanceof Error ? err.message : String(err)}`
      );
      // Don't throw - status update failure is non-fatal
    }
  }

  /**
   * Wait for an answer to a specific question.
   * Uses WebSocket listener if available, falls back to event-based waiting.
   * Times out after answerTimeoutMs.
   */
  private waitForAnswer(questionId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let resolved = false;

      // Set up timeout
      const timeoutTimer = setTimeout(() => {
        if (resolved) return;
        resolved = true;

        // Clean up listener
        const unsub = this.unsubscribers.get(questionId);
        if (unsub) {
          unsub();
          this.unsubscribers.delete(questionId);
        }

        this.emitBlockerEvent('timeout', {
          questionId,
          timeoutMs: this.config.answerTimeoutMs,
        });

        reject(new Error(`Answer timeout after ${this.config.answerTimeoutMs}ms for question ${questionId}`));
      }, this.config.answerTimeoutMs);

      // Handler for when answer arrives
      const onAnswerReceived = (answer: QuestionAnswer): void => {
        if (resolved) return;
        resolved = true;

        clearTimeout(timeoutTimer);

        // Clean up listener
        const unsub = this.unsubscribers.get(questionId);
        if (unsub) {
          unsub();
          this.unsubscribers.delete(questionId);
        }

        this.emitBlockerEvent('answer_received', {
          questionId,
          answer: answer.answer,
          answeredBy: answer.answeredBy,
        });

        this.logger.info(
          `Answer received for ${questionId} from ${answer.answeredBy}`
        );

        resolve(answer.answer);
      };

      // Subscribe via WebSocket listener if available
      if (this.answerListener?.isConnected()) {
        const unsubscribe = this.answerListener.onAnswer(
          questionId,
          onAnswerReceived
        );
        this.unsubscribers.set(questionId, unsubscribe);
      }

      // Also listen for direct provideAnswer calls via EventEmitter
      this.once(`answer:${questionId}`, (answer: QuestionAnswer) => {
        onAnswerReceived(answer);
      });
    });
  }

  /**
   * Generate a unique question ID
   */
  private generateQuestionId(): string {
    this.questionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.questionCounter.toString(36).padStart(3, '0');
    return `q-${this.config.workerId}-${timestamp}-${counter}`;
  }

  /**
   * Emit a QuestionBlocker event
   */
  private emitBlockerEvent(
    type: QuestionBlockerEventType,
    payload: Record<string, unknown>
  ): void {
    const event: QuestionBlockerEvent = {
      type,
      timestamp: new Date().toISOString(),
      workerId: this.config.workerId,
      payload,
    };

    this.emit('blocker_event', event);
  }

  // ────────────────────────────────────────────────────────────────
  // Accessors
  // ────────────────────────────────────────────────────────────────

  /**
   * Get the current worker blocking status
   */
  get status(): WorkerBlockingStatus {
    return this.currentStatus;
  }

  /**
   * Get all pending questions
   */
  get pending(): PendingQuestion[] {
    return Array.from(this.pendingQuestions.values());
  }

  /**
   * Get the question history (answered questions)
   */
  get history(): PendingQuestion[] {
    return [...this.questionHistory];
  }

  /**
   * Get the count of pending questions
   */
  get pendingCount(): number {
    return this.pendingQuestions.size;
  }

  /**
   * Clean up all listeners and timers
   */
  dispose(): void {
    // Unsubscribe all WebSocket listeners
    for (const [questionId, unsub] of this.unsubscribers) {
      unsub();
      this.unsubscribers.delete(questionId);
    }

    // Remove all EventEmitter listeners
    this.removeAllListeners();

    this.apiClient = null;
    this.answerListener = null;

    this.logger.info('QuestionBlocker disposed');
  }
}

// ────────────────────────────────────────────────────────────────
// HTTP API Client Factory
// ────────────────────────────────────────────────────────────────

/**
 * Create a QuestionApiClient that communicates with the HQ API over HTTP
 */
export function createHttpQuestionApiClient(config: {
  apiUrl: string;
  apiKey: string;
  logger?: QuestionBlockerLogger;
}): QuestionApiClient {
  const logger = config.logger ?? DEFAULT_LOGGER;

  return {
    async sendQuestion(
      workerId: string,
      question: PendingQuestion
    ): Promise<{ success: boolean; error?: string }> {
      try {
        const response = await fetch(
          `${config.apiUrl}/api/workers/${workerId}/questions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              questionId: question.questionId,
              text: question.text,
              options: question.options,
              askedAt: question.askedAt,
            }),
          }
        );

        if (response.ok) {
          return { success: true };
        }

        return {
          success: false,
          error: `HTTP ${String(response.status)}: ${response.statusText}`,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`sendQuestion failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    },

    async updateWorkerStatus(
      workerId: string,
      status: WorkerBlockingStatus,
      metadata?: Record<string, unknown>
    ): Promise<{ success: boolean; error?: string }> {
      try {
        const response = await fetch(
          `${config.apiUrl}/api/workers/${workerId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              status,
              metadata,
            }),
          }
        );

        if (response.ok) {
          return { success: true };
        }

        return {
          success: false,
          error: `HTTP ${String(response.status)}: ${response.statusText}`,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`updateWorkerStatus failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    },
  };
}

// ────────────────────────────────────────────────────────────────
// WebSocket Answer Listener Factory
// ────────────────────────────────────────────────────────────────

/**
 * Create an AnswerListener from a WebSocket-like message source.
 *
 * This expects messages in the format:
 * ```json
 * {
 *   "type": "question_answered",
 *   "payload": {
 *     "questionId": "q-...",
 *     "answer": "yes",
 *     "answeredBy": "user-123"
 *   }
 * }
 * ```
 */
export function createWebSocketAnswerListener(config: {
  /** Function to subscribe to incoming messages */
  onMessage: (callback: (data: string) => void) => () => void;
  /** Function to check if the connection is active */
  checkConnected: () => boolean;
  logger?: QuestionBlockerLogger;
}): AnswerListener {
  const logger = config.logger ?? DEFAULT_LOGGER;

  // Map of questionId -> list of callbacks
  const callbacks = new Map<string, Array<(answer: QuestionAnswer) => void>>();

  // Subscribe to messages (listener stays active for the lifetime of this object)
  config.onMessage((data: string) => {
    try {
      const message: unknown = JSON.parse(data);

      if (
        message &&
        typeof message === 'object' &&
        'type' in (message as Record<string, unknown>) &&
        (message as Record<string, unknown>)['type'] === 'question_answered' &&
        'payload' in (message as Record<string, unknown>)
      ) {
        const payload = (message as Record<string, unknown>)['payload'] as Record<string, unknown>;
        const questionId = payload['questionId'] as string;
        const answer = payload['answer'] as string;
        const answeredBy = (payload['answeredBy'] as string) ?? 'unknown';

        if (questionId && answer !== undefined) {
          const questionAnswer: QuestionAnswer = {
            questionId,
            answer,
            answeredBy,
            answeredAt: new Date().toISOString(),
          };

          const questionCallbacks = callbacks.get(questionId);
          if (questionCallbacks) {
            for (const cb of questionCallbacks) {
              cb(questionAnswer);
            }
            // Clean up after delivering
            callbacks.delete(questionId);
          }
        }
      }
    } catch {
      logger.debug('Failed to parse WebSocket message for answer listener');
    }
  });

  return {
    onAnswer(
      questionId: string,
      callback: (answer: QuestionAnswer) => void
    ): () => void {
      const existing = callbacks.get(questionId) ?? [];
      existing.push(callback);
      callbacks.set(questionId, existing);

      return (): void => {
        const cbs = callbacks.get(questionId);
        if (cbs) {
          const idx = cbs.indexOf(callback);
          if (idx !== -1) {
            cbs.splice(idx, 1);
          }
          if (cbs.length === 0) {
            callbacks.delete(questionId);
          }
        }
      };
    },

    isConnected(): boolean {
      return config.checkConnected();
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Convenience factory
// ────────────────────────────────────────────────────────────────

/**
 * Create a fully wired QuestionBlocker from environment variables.
 * Typical usage inside a running worker container.
 */
export function createQuestionBlockerFromEnv(
  cliWrapper: ClaudeCliWrapper,
  answerListener?: AnswerListener,
  logger?: QuestionBlockerLogger
): QuestionBlocker {
  const workerId = process.env['WORKER_ID'] ?? 'unknown';
  const apiUrl = process.env['HQ_API_URL'] ?? 'http://localhost:3000';
  const apiKey = process.env['HQ_API_KEY'] ?? '';

  const blocker = new QuestionBlocker({
    workerId,
    logger,
  });

  // Wire up API client
  const apiClient = createHttpQuestionApiClient({
    apiUrl,
    apiKey,
    logger,
  });
  blocker.setApiClient(apiClient);

  // Wire up answer listener if provided
  if (answerListener) {
    blocker.setAnswerListener(answerListener);
  }

  // Attach to the CLI wrapper
  blocker.attachToWrapper(cliWrapper);

  return blocker;
}
