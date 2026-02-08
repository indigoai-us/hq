import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../index.js';
import { resetWorkerStore } from '../workers/index.js';
import { resetQuestionStore, onQuestionAnswered } from '../questions/index.js';
import { resetApiKeyStore } from '../auth/index.js';
import { resetRateLimiter } from '../auth/rate-limiter.js';
import { resetConnectionRegistry } from '../ws/index.js';
import type { FastifyInstance } from 'fastify';

interface QuestionResponse {
  id: string;
  workerId: string;
  text: string;
  options: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>;
  status: 'pending' | 'answered';
  createdAt: string;
  answeredAt: string | null;
  answer: string | null;
  metadata?: Record<string, unknown>;
}

interface QuestionsListResponse {
  count: number;
  questions: QuestionResponse[];
}

interface WorkerResponse {
  id: string;
  name: string;
  status: string;
  containerId: string | null;
  registeredAt: string;
  lastHeartbeat: string | null;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

interface ApiKeyResponse {
  key: string;
  prefix: string;
  name: string;
  rateLimit: number;
  createdAt: string;
  message: string;
}

describe('Question/Answer Routing', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let apiKey: string;

  beforeEach(async () => {
    resetWorkerStore();
    resetQuestionStore();
    resetApiKeyStore();
    resetRateLimiter();
    resetConnectionRegistry();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    // Generate an API key for authenticated requests
    const response = await fetch(`${baseUrl}/api/auth/keys/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Key' }),
    });
    const data = (await response.json()) as ApiKeyResponse;
    apiKey = data.key;

    // Create a test worker
    await fetch(`${baseUrl}/api/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        id: 'test-worker',
        name: 'Test Worker',
        status: 'running',
      }),
    });
  });

  afterEach(async () => {
    await app.close();
    resetWorkerStore();
    resetQuestionStore();
    resetApiKeyStore();
    resetRateLimiter();
    resetConnectionRegistry();
  });

  describe('Submit Question', () => {
    it('should submit a question from a worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'What should I do next?',
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as QuestionResponse;
      expect(data.id).toBeDefined();
      expect(data.workerId).toBe('test-worker');
      expect(data.text).toBe('What should I do next?');
      expect(data.options).toEqual([]);
      expect(data.status).toBe('pending');
      expect(data.answeredAt).toBeNull();
      expect(data.answer).toBeNull();
    });

    it('should submit a question with options', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Which approach should I use?',
          options: [
            { id: 'a', text: 'Approach A' },
            { id: 'b', text: 'Approach B' },
            { id: 'c', text: 'Approach C' },
          ],
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as QuestionResponse;
      expect(data.options).toHaveLength(3);
      expect(data.options[0]?.id).toBe('a');
      expect(data.options[0]?.text).toBe('Approach A');
    });

    it('should update worker status to waiting_input', async () => {
      await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Need input',
        }),
      });

      const workerResponse = await fetch(`${baseUrl}/api/workers/test-worker`, {
        headers: { 'x-api-key': apiKey },
      });
      const worker = (await workerResponse.json()) as WorkerResponse;
      expect(worker.status).toBe('waiting_input');
    });

    it('should reject question for non-existent worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/non-existent/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Test question',
        }),
      });

      expect(response.status).toBe(404);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Not Found');
    });

    it('should reject empty question text', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: '',
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Bad Request');
    });

    it('should reject duplicate option IDs', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Test',
          options: [
            { id: 'a', text: 'First' },
            { id: 'a', text: 'Duplicate' },
          ],
        }),
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('Duplicate option ID');
    });
  });

  describe('Answer Question', () => {
    let questionId: string;

    beforeEach(async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'What should I do?',
        }),
      });
      const data = (await response.json()) as QuestionResponse;
      questionId = data.id;
    });

    it('should answer a question', async () => {
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            answer: 'Please continue with the current approach',
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as QuestionResponse;
      expect(data.status).toBe('answered');
      expect(data.answer).toBe('Please continue with the current approach');
      expect(data.answeredAt).not.toBeNull();
    });

    it('should update worker status back to running after answering', async () => {
      await fetch(`${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          answer: 'Done',
        }),
      });

      const workerResponse = await fetch(`${baseUrl}/api/workers/test-worker`, {
        headers: { 'x-api-key': apiKey },
      });
      const worker = (await workerResponse.json()) as WorkerResponse;
      expect(worker.status).toBe('running');
    });

    it('should keep waiting_input if more questions pending', async () => {
      // Create a second question
      await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Another question',
        }),
      });

      // Answer the first question
      await fetch(`${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          answer: 'Done',
        }),
      });

      const workerResponse = await fetch(`${baseUrl}/api/workers/test-worker`, {
        headers: { 'x-api-key': apiKey },
      });
      const worker = (await workerResponse.json()) as WorkerResponse;
      expect(worker.status).toBe('waiting_input');
    });

    it('should trigger answer callback', async () => {
      let callbackAnswer: string | null = null;
      let callbackQuestionId: string | null = null;

      // Register callback before answering
      const unsubscribe = onQuestionAnswered((q) => {
        callbackQuestionId = q.id;
        callbackAnswer = q.answer;
      });

      await fetch(`${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          answer: 'Test answer',
        }),
      });

      unsubscribe();

      expect(callbackQuestionId).toBe(questionId);
      expect(callbackAnswer).toBe('Test answer');
    });

    it('should reject answering already answered question', async () => {
      // Answer first
      await fetch(`${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          answer: 'First answer',
        }),
      });

      // Try to answer again
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            answer: 'Second answer',
          }),
        }
      );

      expect(response.status).toBe(409);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toBe('Conflict');
    });

    it('should reject non-existent question', async () => {
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions/non-existent/answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            answer: 'Test',
          }),
        }
      );

      expect(response.status).toBe(404);
    });

    it('should reject empty answer', async () => {
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            answer: '',
          }),
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Answer with Options', () => {
    let questionId: string;

    beforeEach(async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Choose an option',
          options: [
            { id: 'opt-a', text: 'Option A' },
            { id: 'opt-b', text: 'Option B' },
          ],
        }),
      });
      const data = (await response.json()) as QuestionResponse;
      questionId = data.id;
    });

    it('should accept valid option ID as answer', async () => {
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            answer: 'opt-a',
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as QuestionResponse;
      expect(data.answer).toBe('opt-a');
    });

    it('should reject invalid option ID as answer', async () => {
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions/${questionId}/answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            answer: 'invalid-option',
          }),
        }
      );

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('must be one of the option IDs');
    });
  });

  describe('List Questions', () => {
    beforeEach(async () => {
      // Create multiple questions
      for (const text of ['Question 1', 'Question 2', 'Question 3']) {
        await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({ text }),
        });
      }
    });

    it('should list all questions for a worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as QuestionsListResponse;
      expect(data.count).toBe(3);
      expect(data.questions).toHaveLength(3);
    });

    it('should filter by pending status', async () => {
      // Answer one question
      const listResponse = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        headers: { 'x-api-key': apiKey },
      });
      const list = (await listResponse.json()) as QuestionsListResponse;
      const firstQuestion = list.questions[0];
      expect(firstQuestion).toBeDefined();
      const firstQuestionId = firstQuestion!.id;

      await fetch(
        `${baseUrl}/api/workers/test-worker/questions/${firstQuestionId}/answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({ answer: 'Done' }),
        }
      );

      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions?status=pending`,
        {
          headers: { 'x-api-key': apiKey },
        }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as QuestionsListResponse;
      expect(data.count).toBe(2);
      expect(data.questions.every((q) => q.status === 'pending')).toBe(true);
    });

    it('should filter by answered status', async () => {
      // Answer one question
      const listResponse = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        headers: { 'x-api-key': apiKey },
      });
      const list = (await listResponse.json()) as QuestionsListResponse;
      const firstQuestion = list.questions[0];
      expect(firstQuestion).toBeDefined();
      const firstQuestionId = firstQuestion!.id;

      await fetch(
        `${baseUrl}/api/workers/test-worker/questions/${firstQuestionId}/answer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({ answer: 'Done' }),
        }
      );

      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions?status=answered`,
        {
          headers: { 'x-api-key': apiKey },
        }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as QuestionsListResponse;
      expect(data.count).toBe(1);
      expect(data.questions.every((q) => q.status === 'answered')).toBe(true);
    });

    it('should return 404 for non-existent worker', async () => {
      const response = await fetch(`${baseUrl}/api/workers/non-existent/questions`, {
        headers: { 'x-api-key': apiKey },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Get Specific Question', () => {
    let questionId: string;

    beforeEach(async () => {
      const response = await fetch(`${baseUrl}/api/workers/test-worker/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Test question',
        }),
      });
      const data = (await response.json()) as QuestionResponse;
      questionId = data.id;
    });

    it('should get a specific question', async () => {
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions/${questionId}`,
        {
          headers: { 'x-api-key': apiKey },
        }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as QuestionResponse;
      expect(data.id).toBe(questionId);
      expect(data.text).toBe('Test question');
    });

    it('should return 404 for non-existent question', async () => {
      const response = await fetch(
        `${baseUrl}/api/workers/test-worker/questions/non-existent`,
        {
          headers: { 'x-api-key': apiKey },
        }
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 for question belonging to different worker', async () => {
      // Create another worker
      await fetch(`${baseUrl}/api/workers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          id: 'other-worker',
          name: 'Other Worker',
        }),
      });

      // Try to get question through wrong worker
      const response = await fetch(
        `${baseUrl}/api/workers/other-worker/questions/${questionId}`,
        {
          headers: { 'x-api-key': apiKey },
        }
      );

      expect(response.status).toBe(404);
    });
  });
});
