import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { getQuestionStore } from '../questions/index.js';
import { getWorkerStore } from '../workers/index.js';
import { broadcastWorkerQuestion } from '../ws/index.js';
import { sendQuestionPushNotification, notifyPushSent } from '../push/index.js';
import type { Question, QuestionOption, CreateQuestionInput } from '../questions/index.js';

interface WorkerParams {
  id: string;
}

interface QuestionParams {
  id: string;
  qid: string;
}

interface QuestionOptionBody {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

interface CreateQuestionBody {
  text: string;
  options?: QuestionOptionBody[];
  metadata?: Record<string, unknown>;
}

interface AnswerQuestionBody {
  answer: string;
}

interface QuestionOptionResponse {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

interface QuestionResponse {
  id: string;
  workerId: string;
  text: string;
  options: QuestionOptionResponse[];
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

function optionToResponse(option: QuestionOption): QuestionOptionResponse {
  return {
    id: option.id,
    text: option.text,
    metadata: option.metadata,
  };
}

function questionToResponse(question: Question): QuestionResponse {
  return {
    id: question.id,
    workerId: question.workerId,
    text: question.text,
    options: question.options.map(optionToResponse),
    status: question.status,
    createdAt: question.createdAt.toISOString(),
    answeredAt: question.answeredAt?.toISOString() ?? null,
    answer: question.answer,
    metadata: question.metadata,
  };
}

function isValidQuestionText(text: unknown): text is string {
  return typeof text === 'string' && text.length >= 1 && text.length <= 4096;
}

function isValidAnswer(answer: unknown): answer is string {
  return typeof answer === 'string' && answer.length >= 1 && answer.length <= 4096;
}

function isValidOption(option: unknown): option is QuestionOption {
  if (typeof option !== 'object' || option === null) {
    return false;
  }
  const opt = option as Record<string, unknown>;
  return (
    typeof opt.id === 'string' &&
    opt.id.length >= 1 &&
    opt.id.length <= 128 &&
    typeof opt.text === 'string' &&
    opt.text.length >= 1 &&
    opt.text.length <= 1024
  );
}

export const questionRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  const questionStore = getQuestionStore();
  const workerStore = getWorkerStore();

  // Submit a question from a worker
  // POST /api/workers/:id/questions
  fastify.post<{ Params: WorkerParams; Body: CreateQuestionBody }>(
    '/workers/:id/questions',
    (request, reply) => {
      const { id: workerId } = request.params;
      const { text, options, metadata } = request.body;

      // Check if worker exists
      if (!workerStore.exists(workerId)) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Worker '${workerId}' not found`,
        });
      }

      // Validate question text
      if (!isValidQuestionText(text)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Question text is required and must be 1-4096 characters',
        });
      }

      // Validate options if provided
      const validatedOptions: QuestionOption[] = [];
      if (options !== undefined) {
        if (!Array.isArray(options)) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Options must be an array',
          });
        }

        if (options.length > 20) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Maximum 20 options allowed',
          });
        }

        const seenIds = new Set<string>();
        for (const option of options) {
          if (!isValidOption(option)) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: 'Each option must have id (1-128 chars) and text (1-1024 chars)',
            });
          }

          if (seenIds.has(option.id)) {
            return reply.status(400).send({
              error: 'Bad Request',
              message: `Duplicate option ID: ${option.id}`,
            });
          }
          seenIds.add(option.id);

          validatedOptions.push({
            id: option.id,
            text: option.text,
            metadata: option.metadata,
          });
        }
      }

      const input: CreateQuestionInput = {
        workerId,
        text,
        options: validatedOptions,
        metadata,
      };

      const question = questionStore.create(input);

      // Update worker status to waiting_input
      workerStore.update(workerId, { status: 'waiting_input' });

      // Broadcast the new question to subscribed WebSocket clients
      broadcastWorkerQuestion(question);

      // Send push notifications to devices without active WebSocket connections
      // This runs async - we don't wait for it to complete before responding
      sendQuestionPushNotification(question)
        .then((stats) => {
          if (stats.sent > 0 || stats.failed > 0) {
            fastify.log.info(
              { questionId: question.id, ...stats },
              'Push notifications sent for question'
            );
            notifyPushSent({ questionId: question.id, ...stats });
          }
        })
        .catch((err) => {
          fastify.log.error(
            { questionId: question.id, error: err },
            'Failed to send push notifications'
          );
        });

      return reply.status(201).send(questionToResponse(question));
    }
  );

  // List questions for a worker
  // GET /api/workers/:id/questions
  fastify.get<{ Params: WorkerParams; Querystring: { status?: string } }>(
    '/workers/:id/questions',
    (request, reply) => {
      const { id: workerId } = request.params;
      const { status } = request.query;

      // Check if worker exists
      if (!workerStore.exists(workerId)) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Worker '${workerId}' not found`,
        });
      }

      let questions: Question[];
      if (status === 'pending') {
        questions = questionStore.getPendingByWorker(workerId);
      } else if (status === 'answered') {
        questions = questionStore
          .getByWorker(workerId)
          .filter((q) => q.status === 'answered');
      } else if (status !== undefined) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid status. Must be one of: pending, answered',
        });
      } else {
        questions = questionStore.getByWorker(workerId);
      }

      const response: QuestionsListResponse = {
        count: questions.length,
        questions: questions.map(questionToResponse),
      };

      return reply.send(response);
    }
  );

  // Get a specific question
  // GET /api/workers/:id/questions/:qid
  fastify.get<{ Params: QuestionParams }>('/workers/:id/questions/:qid', (request, reply) => {
    const { id: workerId, qid } = request.params;

    // Check if worker exists
    if (!workerStore.exists(workerId)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Worker '${workerId}' not found`,
      });
    }

    const question = questionStore.get(qid);
    if (!question) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Question '${qid}' not found`,
      });
    }

    // Verify question belongs to this worker
    if (question.workerId !== workerId) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Question '${qid}' not found for worker '${workerId}'`,
      });
    }

    return reply.send(questionToResponse(question));
  });

  // Answer a question
  // POST /api/workers/:id/questions/:qid/answer
  fastify.post<{ Params: QuestionParams; Body: AnswerQuestionBody }>(
    '/workers/:id/questions/:qid/answer',
    (request, reply) => {
      const { id: workerId, qid } = request.params;
      const { answer } = request.body;

      // Check if worker exists
      if (!workerStore.exists(workerId)) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Worker '${workerId}' not found`,
        });
      }

      // Validate answer
      if (!isValidAnswer(answer)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Answer is required and must be 1-4096 characters',
        });
      }

      const question = questionStore.get(qid);
      if (!question) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Question '${qid}' not found`,
        });
      }

      // Verify question belongs to this worker
      if (question.workerId !== workerId) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Question '${qid}' not found for worker '${workerId}'`,
        });
      }

      // Check if already answered
      if (question.status === 'answered') {
        return reply.status(409).send({
          error: 'Conflict',
          message: `Question '${qid}' has already been answered`,
        });
      }

      // If options are provided, validate answer is one of them
      if (question.options.length > 0) {
        const validOptionIds = question.options.map((o) => o.id);
        if (!validOptionIds.includes(answer)) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Answer must be one of the option IDs: ${validOptionIds.join(', ')}`,
          });
        }
      }

      // Answer the question - this triggers the onQuestionAnswered callback
      // which routes the answer back to the worker container
      const answeredQuestion = questionStore.answer(qid, answer);
      if (!answeredQuestion) {
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to answer question',
        });
      }

      // Check if worker has more pending questions
      const pendingQuestions = questionStore.getPendingByWorker(workerId);
      if (pendingQuestions.length === 0) {
        // No more pending questions, update worker status back to running
        workerStore.update(workerId, { status: 'running' });
      }

      return reply.send(questionToResponse(answeredQuestion));
    }
  );

  done();
};
