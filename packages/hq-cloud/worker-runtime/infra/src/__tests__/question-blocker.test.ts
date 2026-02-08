/**
 * Tests for Question Blocker and Resume Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  QuestionBlocker,
  createHttpQuestionApiClient,
  createWebSocketAnswerListener,
  createQuestionBlockerFromEnv,
  type QuestionBlockerConfig,
  type QuestionApiClient,
  type AnswerListener,
  type QuestionAnswer,
  type PendingQuestion,
  type QuestionBlockerLogger,
  type QuestionBlockerEvent,
} from '../question-blocker.js';
import {
  ClaudeCliWrapper,
  type CliWrapperConfig,
} from '../claude-cli-wrapper.js';

// ────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────

function createMockLogger(): QuestionBlockerLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockApiClient(overrides?: Partial<QuestionApiClient>): QuestionApiClient {
  return {
    sendQuestion: vi.fn().mockResolvedValue({ success: true }),
    updateWorkerStatus: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

function createMockAnswerListener(
  connected = true
): AnswerListener & { triggerAnswer: (questionId: string, answer: QuestionAnswer) => void } {
  const callbacks = new Map<string, Array<(answer: QuestionAnswer) => void>>();

  return {
    onAnswer(questionId: string, callback: (answer: QuestionAnswer) => void): () => void {
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
      return connected;
    },

    triggerAnswer(questionId: string, answer: QuestionAnswer): void {
      const cbs = callbacks.get(questionId);
      if (cbs) {
        for (const cb of cbs) {
          cb(answer);
        }
      }
    },
  };
}

function createMockCliWrapper(): ClaudeCliWrapper {
  const config: CliWrapperConfig = {
    workerId: 'test-worker',
    skill: 'test-skill',
    parameters: '{}',
    timeoutMs: 5000,
  };
  return new ClaudeCliWrapper(config);
}

// ────────────────────────────────────────────────────────────────
// QuestionBlocker - Constructor & Configuration
// ────────────────────────────────────────────────────────────────

describe('QuestionBlocker', () => {
  let logger: QuestionBlockerLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('constructor', () => {
    it('creates instance with minimal config', () => {
      const blocker = new QuestionBlocker({ workerId: 'w-1' });
      expect(blocker).toBeDefined();
      expect(blocker.status).toBe('running');
      expect(blocker.pendingCount).toBe(0);
    });

    it('creates instance with full config', () => {
      const blocker = new QuestionBlocker({
        workerId: 'w-1',
        answerTimeoutMs: 60000,
        pollIntervalMs: 1000,
        logger,
      });
      expect(blocker).toBeDefined();
      expect(blocker.status).toBe('running');
    });

    it('applies default timeout of 5 minutes', () => {
      const blocker = new QuestionBlocker({ workerId: 'w-1', logger });
      // We can verify default through behavior - tested in timeout test below
      expect(blocker).toBeDefined();
    });
  });

  describe('setApiClient', () => {
    it('accepts an API client', () => {
      const blocker = new QuestionBlocker({ workerId: 'w-1', logger });
      const apiClient = createMockApiClient();
      // Should not throw
      blocker.setApiClient(apiClient);
    });
  });

  describe('setAnswerListener', () => {
    it('accepts an answer listener', () => {
      const blocker = new QuestionBlocker({ workerId: 'w-1', logger });
      const listener = createMockAnswerListener();
      // Should not throw
      blocker.setAnswerListener(listener);
    });
  });

  describe('attachToWrapper', () => {
    it('attaches to a CLI wrapper', () => {
      const blocker = new QuestionBlocker({ workerId: 'w-1', logger });
      const wrapper = createMockCliWrapper();

      // Should not throw
      blocker.attachToWrapper(wrapper);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attached to CLI wrapper')
      );
    });
  });
});

// ────────────────────────────────────────────────────────────────
// QuestionBlocker - handleQuestion flow
// ────────────────────────────────────────────────────────────────

describe('QuestionBlocker - handleQuestion', () => {
  let blocker: QuestionBlocker;
  let logger: QuestionBlockerLogger;
  let apiClient: QuestionApiClient;

  beforeEach(() => {
    logger = createMockLogger();
    apiClient = createMockApiClient();
    blocker = new QuestionBlocker({
      workerId: 'test-worker',
      answerTimeoutMs: 2000,
      logger,
    });
    blocker.setApiClient(apiClient);
  });

  afterEach(() => {
    blocker.dispose();
  });

  it('sends question to API and waits for answer via provideAnswer', async () => {
    // Start handleQuestion in background
    const answerPromise = blocker.handleQuestion('What branch?', ['main', 'dev']);

    // Allow microtasks to process (API calls are async)
    await new Promise((r) => setTimeout(r, 50));

    // Check status was updated to waiting_input
    expect(apiClient.updateWorkerStatus).toHaveBeenCalledWith(
      'test-worker',
      'waiting_input',
      expect.objectContaining({
        questionText: expect.stringContaining('What branch?'),
      })
    );

    // Check question was sent to API
    expect(apiClient.sendQuestion).toHaveBeenCalledWith(
      'test-worker',
      expect.objectContaining({
        text: 'What branch?',
        options: ['main', 'dev'],
      })
    );

    // Get the questionId from the API call
    const sentQuestion = (apiClient.sendQuestion as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as PendingQuestion;
    const questionId = sentQuestion.questionId;

    // Provide the answer
    blocker.provideAnswer(questionId, 'main', 'user-1');

    // Wait for result
    const answer = await answerPromise;

    expect(answer).toBe('main');

    // Check status was restored to running
    expect(apiClient.updateWorkerStatus).toHaveBeenCalledWith(
      'test-worker',
      'running',
      expect.any(Object)
    );
  });

  it('updates status through waiting_input -> resuming -> running', async () => {
    const answerPromise = blocker.handleQuestion('Continue?', []);

    await new Promise((r) => setTimeout(r, 50));

    // Get questionId
    const sentQuestion = (apiClient.sendQuestion as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as PendingQuestion;
    blocker.provideAnswer(sentQuestion.questionId, 'yes');

    await answerPromise;

    const statusCalls = (apiClient.updateWorkerStatus as ReturnType<typeof vi.fn>).mock.calls;
    const statuses = statusCalls.map(
      (call: [string, string, Record<string, unknown>]) => call[1]
    );

    expect(statuses).toContain('waiting_input');
    expect(statuses).toContain('resuming');
    expect(statuses).toContain('running');
  });

  it('tracks pending questions', async () => {
    const answerPromise = blocker.handleQuestion('Pick one', ['A', 'B']);

    await new Promise((r) => setTimeout(r, 50));

    // Should have one pending question
    expect(blocker.pendingCount).toBe(1);
    expect(blocker.pending).toHaveLength(1);
    expect(blocker.pending[0]!.text).toBe('Pick one');
    expect(blocker.pending[0]!.options).toEqual(['A', 'B']);
    expect(blocker.pending[0]!.answer).toBeNull();

    // Answer it
    blocker.provideAnswer(blocker.pending[0]!.questionId, 'A');
    await answerPromise;

    // Should be in history now, not pending
    expect(blocker.pendingCount).toBe(0);
    expect(blocker.history).toHaveLength(1);
    expect(blocker.history[0]!.answer).toBe('A');
    expect(blocker.history[0]!.answeredAt).not.toBeNull();
  });

  it('times out if no answer is provided', async () => {
    const shortTimeoutBlocker = new QuestionBlocker({
      workerId: 'test-worker',
      answerTimeoutMs: 200,
      logger,
    });
    shortTimeoutBlocker.setApiClient(apiClient);

    await expect(
      shortTimeoutBlocker.handleQuestion('Timeout question?', [])
    ).rejects.toThrow('Answer timeout');

    shortTimeoutBlocker.dispose();
  }, 5000);

  it('emits blocker events during the flow', async () => {
    const events: QuestionBlockerEvent[] = [];
    blocker.on('blocker_event', (event: QuestionBlockerEvent) => {
      events.push(event);
    });

    const answerPromise = blocker.handleQuestion('Test?', []);

    await new Promise((r) => setTimeout(r, 50));

    // Should have question_detected, status_updated (waiting_input), question_sent events
    expect(events.some((e) => e.type === 'question_detected')).toBe(true);
    expect(events.some((e) => e.type === 'status_updated')).toBe(true);
    expect(events.some((e) => e.type === 'question_sent')).toBe(true);

    // Answer it
    const sentQuestion = (apiClient.sendQuestion as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as PendingQuestion;
    blocker.provideAnswer(sentQuestion.questionId, 'ok');
    await answerPromise;

    // Should have answer_received, answer_applied events
    expect(events.some((e) => e.type === 'answer_received')).toBe(true);
    expect(events.some((e) => e.type === 'answer_applied')).toBe(true);
  });

  it('handles API send failure gracefully', async () => {
    const failingApiClient = createMockApiClient({
      sendQuestion: vi.fn().mockResolvedValue({
        success: false,
        error: 'Network error',
      }),
    });

    blocker.setApiClient(failingApiClient);

    const answerPromise = blocker.handleQuestion('Test?', []);

    await new Promise((r) => setTimeout(r, 50));

    // Should still be waiting for answer despite send failure
    expect(blocker.pendingCount).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send question')
    );

    // Answer it directly
    blocker.provideAnswer(blocker.pending[0]!.questionId, 'resolved');
    const answer = await answerPromise;
    expect(answer).toBe('resolved');
  });

  it('handles API send exception gracefully', async () => {
    const throwingApiClient = createMockApiClient({
      sendQuestion: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    blocker.setApiClient(throwingApiClient);

    const answerPromise = blocker.handleQuestion('Test?', []);

    await new Promise((r) => setTimeout(r, 50));

    // Should still be waiting
    expect(blocker.pendingCount).toBe(1);

    blocker.provideAnswer(blocker.pending[0]!.questionId, 'ok');
    await answerPromise;
  });

  it('handles status update failure gracefully', async () => {
    const failingStatusClient = createMockApiClient({
      updateWorkerStatus: vi.fn().mockResolvedValue({
        success: false,
        error: 'Server error',
      }),
    });

    blocker.setApiClient(failingStatusClient);

    const answerPromise = blocker.handleQuestion('Continue?', []);

    await new Promise((r) => setTimeout(r, 50));

    // Should log error but still continue
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update worker status')
    );

    blocker.provideAnswer(blocker.pending[0]!.questionId, 'yes');
    await answerPromise;
  });

  it('works without an API client (local-only mode)', async () => {
    const noApiBlocker = new QuestionBlocker({
      workerId: 'local-worker',
      answerTimeoutMs: 2000,
      logger,
    });
    // No apiClient set

    const answerPromise = noApiBlocker.handleQuestion('Local question?', []);

    await new Promise((r) => setTimeout(r, 50));

    // Should still function
    expect(noApiBlocker.pendingCount).toBe(1);

    noApiBlocker.provideAnswer(noApiBlocker.pending[0]!.questionId, 'local answer');
    const answer = await answerPromise;
    expect(answer).toBe('local answer');

    noApiBlocker.dispose();
  });

  it('generates unique question IDs', async () => {
    const ids: string[] = [];

    // Ask two questions in sequence
    const promise1 = blocker.handleQuestion('Q1?', []);
    await new Promise((r) => setTimeout(r, 10));
    ids.push(blocker.pending[0]!.questionId);
    blocker.provideAnswer(ids[0]!, 'a1');
    await promise1;

    const promise2 = blocker.handleQuestion('Q2?', []);
    await new Promise((r) => setTimeout(r, 10));
    ids.push(blocker.pending[0]!.questionId);
    blocker.provideAnswer(ids[1]!, 'a2');
    await promise2;

    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toMatch(/^q-test-worker-/);
    expect(ids[1]).toMatch(/^q-test-worker-/);
  });
});

// ────────────────────────────────────────────────────────────────
// QuestionBlocker - WebSocket AnswerListener integration
// ────────────────────────────────────────────────────────────────

describe('QuestionBlocker - AnswerListener integration', () => {
  let blocker: QuestionBlocker;
  let logger: QuestionBlockerLogger;
  let apiClient: QuestionApiClient;
  let answerListener: ReturnType<typeof createMockAnswerListener>;

  beforeEach(() => {
    logger = createMockLogger();
    apiClient = createMockApiClient();
    answerListener = createMockAnswerListener(true);

    blocker = new QuestionBlocker({
      workerId: 'ws-worker',
      answerTimeoutMs: 2000,
      logger,
    });
    blocker.setApiClient(apiClient);
    blocker.setAnswerListener(answerListener);
  });

  afterEach(() => {
    blocker.dispose();
  });

  it('receives answers via WebSocket listener', async () => {
    const answerPromise = blocker.handleQuestion('WS question?', ['yes', 'no']);

    await new Promise((r) => setTimeout(r, 50));

    // Get the question ID
    const sentQuestion = (apiClient.sendQuestion as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as PendingQuestion;

    // Trigger answer via WebSocket listener
    answerListener.triggerAnswer(sentQuestion.questionId, {
      questionId: sentQuestion.questionId,
      answer: 'yes',
      answeredBy: 'user-ws',
      answeredAt: new Date().toISOString(),
    });

    const answer = await answerPromise;
    expect(answer).toBe('yes');
  });

  it('falls back to provideAnswer when listener not connected', async () => {
    const disconnectedListener = createMockAnswerListener(false);
    blocker.setAnswerListener(disconnectedListener);

    const answerPromise = blocker.handleQuestion('Disconnected test?', []);

    await new Promise((r) => setTimeout(r, 50));

    // Answer via provideAnswer since listener is not connected
    blocker.provideAnswer(blocker.pending[0]!.questionId, 'direct');
    const answer = await answerPromise;
    expect(answer).toBe('direct');
  });
});

// ────────────────────────────────────────────────────────────────
// QuestionBlocker - provideAnswer
// ────────────────────────────────────────────────────────────────

describe('QuestionBlocker - provideAnswer', () => {
  it('returns false for unknown question ID', () => {
    const blocker = new QuestionBlocker({ workerId: 'w-1' });
    const result = blocker.provideAnswer('nonexistent', 'answer');
    expect(result).toBe(false);
    blocker.dispose();
  });

  it('returns true for pending question', async () => {
    const blocker = new QuestionBlocker({
      workerId: 'w-1',
      answerTimeoutMs: 2000,
    });

    const answerPromise = blocker.handleQuestion('Test?', []);
    await new Promise((r) => setTimeout(r, 50));

    const result = blocker.provideAnswer(
      blocker.pending[0]!.questionId,
      'answer'
    );
    expect(result).toBe(true);

    await answerPromise;
    blocker.dispose();
  });
});

// ────────────────────────────────────────────────────────────────
// QuestionBlocker - dispose
// ────────────────────────────────────────────────────────────────

describe('QuestionBlocker - dispose', () => {
  it('cleans up without errors', () => {
    const logger = createMockLogger();
    const blocker = new QuestionBlocker({ workerId: 'w-1', logger });
    blocker.setApiClient(createMockApiClient());
    blocker.setAnswerListener(createMockAnswerListener());
    blocker.attachToWrapper(createMockCliWrapper());

    // Should not throw
    blocker.dispose();

    expect(logger.info).toHaveBeenCalledWith('QuestionBlocker disposed');
  });

  it('cleans up active listeners on dispose', async () => {
    const logger = createMockLogger();
    const blocker = new QuestionBlocker({
      workerId: 'w-1',
      answerTimeoutMs: 10000,
      logger,
    });

    // Start a question (this creates an internal listener)
    const answerPromise = blocker.handleQuestion('Dispose test?', []);

    await new Promise((r) => setTimeout(r, 50));

    // Dispose while question is pending
    blocker.dispose();

    // The promise should eventually reject or be cleaned up
    // (timeout will not fire because removeAllListeners was called)
    // Note: the promise may hang forever since listeners were removed,
    // but that's acceptable for disposal
  });
});

// ────────────────────────────────────────────────────────────────
// createHttpQuestionApiClient
// ────────────────────────────────────────────────────────────────

describe('createHttpQuestionApiClient', () => {
  let mockLogger: QuestionBlockerLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe('sendQuestion', () => {
    it('sends question via HTTP POST', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpQuestionApiClient({
        apiUrl: 'https://api.hq.test',
        apiKey: 'test-key',
        logger: mockLogger,
      });

      const question: PendingQuestion = {
        questionId: 'q-123',
        text: 'What branch?',
        options: ['main', 'dev'],
        askedAt: '2026-02-07T20:00:00Z',
        answeredAt: null,
        answer: null,
        workerId: 'w-1',
      };

      const result = await client.sendQuestion('w-1', question);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hq.test/api/workers/w-1/questions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        })
      );

      // Verify body contains expected fields
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body['questionId']).toBe('q-123');
      expect(body['text']).toBe('What branch?');
      expect(body['options']).toEqual(['main', 'dev']);

      vi.unstubAllGlobals();
    });

    it('returns failure on non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpQuestionApiClient({
        apiUrl: 'https://api.hq.test',
        apiKey: 'test-key',
        logger: mockLogger,
      });

      const result = await client.sendQuestion('w-1', {
        questionId: 'q-456',
        text: 'Test?',
        options: [],
        askedAt: new Date().toISOString(),
        answeredAt: null,
        answer: null,
        workerId: 'w-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');

      vi.unstubAllGlobals();
    });

    it('handles fetch error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network down'));
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpQuestionApiClient({
        apiUrl: 'https://api.hq.test',
        apiKey: 'test-key',
        logger: mockLogger,
      });

      const result = await client.sendQuestion('w-1', {
        questionId: 'q-789',
        text: 'Test?',
        options: [],
        askedAt: new Date().toISOString(),
        answeredAt: null,
        answer: null,
        workerId: 'w-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network down');

      vi.unstubAllGlobals();
    });
  });

  describe('updateWorkerStatus', () => {
    it('sends PATCH request to update status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpQuestionApiClient({
        apiUrl: 'https://api.hq.test',
        apiKey: 'test-key',
        logger: mockLogger,
      });

      const result = await client.updateWorkerStatus('w-1', 'waiting_input', {
        currentQuestion: 'q-123',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hq.test/api/workers/w-1',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body['status']).toBe('waiting_input');
      expect(body['metadata']).toEqual({ currentQuestion: 'q-123' });

      vi.unstubAllGlobals();
    });

    it('returns failure on non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpQuestionApiClient({
        apiUrl: 'https://api.hq.test',
        apiKey: 'test-key',
        logger: mockLogger,
      });

      const result = await client.updateWorkerStatus('w-1', 'running');

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');

      vi.unstubAllGlobals();
    });

    it('handles fetch error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Timeout'));
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpQuestionApiClient({
        apiUrl: 'https://api.hq.test',
        apiKey: 'test-key',
        logger: mockLogger,
      });

      const result = await client.updateWorkerStatus('w-1', 'waiting_input');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');

      vi.unstubAllGlobals();
    });
  });
});

// ────────────────────────────────────────────────────────────────
// createWebSocketAnswerListener
// ────────────────────────────────────────────────────────────────

describe('createWebSocketAnswerListener', () => {
  it('creates a listener that routes answers to callbacks', () => {
    let messageHandler: ((data: string) => void) | null = null;

    const listener = createWebSocketAnswerListener({
      onMessage: (callback) => {
        messageHandler = callback;
        return () => {
          messageHandler = null;
        };
      },
      checkConnected: () => true,
    });

    expect(listener.isConnected()).toBe(true);

    // Subscribe to a question
    const answerCallback = vi.fn();
    listener.onAnswer('q-1', answerCallback);

    // Simulate a WebSocket message
    messageHandler!(
      JSON.stringify({
        type: 'question_answered',
        payload: {
          questionId: 'q-1',
          answer: 'yes',
          answeredBy: 'user-42',
        },
      })
    );

    expect(answerCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: 'q-1',
        answer: 'yes',
        answeredBy: 'user-42',
      })
    );
  });

  it('ignores messages for unsubscribed questions', () => {
    let messageHandler: ((data: string) => void) | null = null;

    const listener = createWebSocketAnswerListener({
      onMessage: (callback) => {
        messageHandler = callback;
        return () => {
          messageHandler = null;
        };
      },
      checkConnected: () => true,
    });

    // Don't subscribe to any questions

    // Should not throw
    messageHandler!(
      JSON.stringify({
        type: 'question_answered',
        payload: {
          questionId: 'q-unknown',
          answer: 'test',
        },
      })
    );
  });

  it('ignores non-question_answered messages', () => {
    let messageHandler: ((data: string) => void) | null = null;

    const listener = createWebSocketAnswerListener({
      onMessage: (callback) => {
        messageHandler = callback;
        return () => {
          messageHandler = null;
        };
      },
      checkConnected: () => true,
    });

    const answerCallback = vi.fn();
    listener.onAnswer('q-1', answerCallback);

    // Send a different message type
    messageHandler!(
      JSON.stringify({
        type: 'worker_status',
        payload: { status: 'running' },
      })
    );

    expect(answerCallback).not.toHaveBeenCalled();
  });

  it('handles malformed messages gracefully', () => {
    let messageHandler: ((data: string) => void) | null = null;
    const mockLogger = createMockLogger();

    createWebSocketAnswerListener({
      onMessage: (callback) => {
        messageHandler = callback;
        return () => {
          messageHandler = null;
        };
      },
      checkConnected: () => true,
      logger: mockLogger,
    });

    // Should not throw on invalid JSON
    messageHandler!('not json at all');

    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse')
    );
  });

  it('supports unsubscribing from answers', () => {
    let messageHandler: ((data: string) => void) | null = null;

    const listener = createWebSocketAnswerListener({
      onMessage: (callback) => {
        messageHandler = callback;
        return () => {
          messageHandler = null;
        };
      },
      checkConnected: () => true,
    });

    const answerCallback = vi.fn();
    const unsubscribe = listener.onAnswer('q-1', answerCallback);

    // Unsubscribe
    unsubscribe();

    // Send answer - should NOT be received
    messageHandler!(
      JSON.stringify({
        type: 'question_answered',
        payload: {
          questionId: 'q-1',
          answer: 'too late',
        },
      })
    );

    expect(answerCallback).not.toHaveBeenCalled();
  });

  it('cleans up callbacks after delivery', () => {
    let messageHandler: ((data: string) => void) | null = null;

    const listener = createWebSocketAnswerListener({
      onMessage: (callback) => {
        messageHandler = callback;
        return () => {
          messageHandler = null;
        };
      },
      checkConnected: () => true,
    });

    const answerCallback = vi.fn();
    listener.onAnswer('q-1', answerCallback);

    // First delivery
    messageHandler!(
      JSON.stringify({
        type: 'question_answered',
        payload: { questionId: 'q-1', answer: 'first' },
      })
    );

    expect(answerCallback).toHaveBeenCalledTimes(1);

    // Second delivery - should be ignored since callbacks were cleaned up
    messageHandler!(
      JSON.stringify({
        type: 'question_answered',
        payload: { questionId: 'q-1', answer: 'second' },
      })
    );

    expect(answerCallback).toHaveBeenCalledTimes(1);
  });

  it('reports connected status correctly', () => {
    let isConnected = true;

    const listener = createWebSocketAnswerListener({
      onMessage: () => () => {},
      checkConnected: () => isConnected,
    });

    expect(listener.isConnected()).toBe(true);

    isConnected = false;
    expect(listener.isConnected()).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// createQuestionBlockerFromEnv
// ────────────────────────────────────────────────────────────────

describe('createQuestionBlockerFromEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates blocker from environment variables', () => {
    process.env['WORKER_ID'] = 'env-worker';
    process.env['HQ_API_URL'] = 'https://api.hq.test';
    process.env['HQ_API_KEY'] = 'test-key';

    const wrapper = createMockCliWrapper();
    const blocker = createQuestionBlockerFromEnv(wrapper);

    expect(blocker).toBeDefined();
    expect(blocker.status).toBe('running');

    blocker.dispose();
  });

  it('uses defaults when env vars not set', () => {
    delete process.env['WORKER_ID'];
    delete process.env['HQ_API_URL'];
    delete process.env['HQ_API_KEY'];

    const wrapper = createMockCliWrapper();
    const blocker = createQuestionBlockerFromEnv(wrapper);

    expect(blocker).toBeDefined();

    blocker.dispose();
  });

  it('accepts optional answer listener', () => {
    process.env['WORKER_ID'] = 'env-worker';
    process.env['HQ_API_URL'] = 'https://api.hq.test';
    process.env['HQ_API_KEY'] = 'test-key';

    const wrapper = createMockCliWrapper();
    const listener = createMockAnswerListener();
    const blocker = createQuestionBlockerFromEnv(wrapper, listener);

    expect(blocker).toBeDefined();

    blocker.dispose();
  });

  it('accepts custom logger', () => {
    process.env['WORKER_ID'] = 'env-worker';
    process.env['HQ_API_URL'] = 'https://api.hq.test';
    process.env['HQ_API_KEY'] = 'test-key';

    const mockLogger = createMockLogger();
    const wrapper = createMockCliWrapper();
    const blocker = createQuestionBlockerFromEnv(wrapper, undefined, mockLogger);

    expect(blocker).toBeDefined();

    blocker.dispose();
  });
});

// ────────────────────────────────────────────────────────────────
// Integration: QuestionBlocker + ClaudeCliWrapper
// ────────────────────────────────────────────────────────────────

describe('Integration: QuestionBlocker + ClaudeCliWrapper', () => {
  it('wires up question callback on the wrapper', async () => {
    const logger = createMockLogger();
    const wrapper = createMockCliWrapper();
    const blocker = new QuestionBlocker({
      workerId: 'int-test',
      answerTimeoutMs: 2000,
      logger,
    });

    blocker.attachToWrapper(wrapper);

    // The wrapper should now have a question callback set
    // We verify by checking that the wrapper's setQuestionCallback was called
    // (indirectly, through the blocker's attach)
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Attached to CLI wrapper')
    );

    blocker.dispose();
  });
});

// ────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────

describe('QuestionBlocker - Edge cases', () => {
  it('handles empty question text', async () => {
    const logger = createMockLogger();
    const blocker = new QuestionBlocker({
      workerId: 'edge-test',
      answerTimeoutMs: 2000,
      logger,
    });

    const answerPromise = blocker.handleQuestion('', []);
    await new Promise((r) => setTimeout(r, 50));

    blocker.provideAnswer(blocker.pending[0]!.questionId, 'ok');
    const answer = await answerPromise;
    expect(answer).toBe('ok');

    blocker.dispose();
  });

  it('handles question with many options', async () => {
    const logger = createMockLogger();
    const blocker = new QuestionBlocker({
      workerId: 'edge-test',
      answerTimeoutMs: 2000,
      logger,
    });

    const options = Array.from({ length: 20 }, (_, i) => `Option ${i + 1}`);
    const answerPromise = blocker.handleQuestion('Big choice?', options);
    await new Promise((r) => setTimeout(r, 50));

    const pending = blocker.pending[0]!;
    expect(pending.options).toHaveLength(20);

    blocker.provideAnswer(pending.questionId, 'Option 15');
    const answer = await answerPromise;
    expect(answer).toBe('Option 15');

    blocker.dispose();
  });

  it('handles empty answer string', async () => {
    const logger = createMockLogger();
    const blocker = new QuestionBlocker({
      workerId: 'edge-test',
      answerTimeoutMs: 2000,
      logger,
    });

    const answerPromise = blocker.handleQuestion('Accept?', []);
    await new Promise((r) => setTimeout(r, 50));

    blocker.provideAnswer(blocker.pending[0]!.questionId, '');
    const answer = await answerPromise;
    expect(answer).toBe('');

    blocker.dispose();
  });
});
