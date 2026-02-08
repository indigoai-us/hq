import type {
  Question,
  QuestionStore,
  CreateQuestionInput,
  QuestionAnsweredCallback,
} from './types.js';

/**
 * Generate a unique question ID
 */
function generateQuestionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `q_${timestamp}_${random}`;
}

// Array of registered answer callbacks
const answerCallbacks: QuestionAnsweredCallback[] = [];

/**
 * Register a callback for when a question is answered
 */
export function onQuestionAnswered(callback: QuestionAnsweredCallback): () => void {
  answerCallbacks.push(callback);
  return () => {
    const index = answerCallbacks.indexOf(callback);
    if (index > -1) {
      answerCallbacks.splice(index, 1);
    }
  };
}

/**
 * Notify all callbacks that a question was answered
 */
function notifyAnswer(question: Question): void {
  for (const callback of answerCallbacks) {
    try {
      callback(question);
    } catch {
      // Ignore callback errors
    }
  }
}

/**
 * In-memory question store.
 * Implements QuestionStore interface for easy swapping to DynamoDB/Postgres later.
 */
class InMemoryQuestionStore implements QuestionStore {
  private questions: Map<string, Question> = new Map();

  /**
   * Create a new question
   */
  create(input: CreateQuestionInput): Question {
    const id = generateQuestionId();
    const now = new Date();

    const question: Question = {
      id,
      workerId: input.workerId,
      text: input.text,
      options: input.options ?? [],
      status: 'pending',
      createdAt: now,
      answeredAt: null,
      answer: null,
      metadata: input.metadata,
    };

    this.questions.set(id, question);
    return question;
  }

  /**
   * Get a question by ID
   */
  get(id: string): Question | undefined {
    return this.questions.get(id);
  }

  /**
   * Get all questions for a worker
   */
  getByWorker(workerId: string): Question[] {
    return Array.from(this.questions.values())
      .filter((q) => q.workerId === workerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get pending questions for a worker
   */
  getPendingByWorker(workerId: string): Question[] {
    return Array.from(this.questions.values())
      .filter((q) => q.workerId === workerId && q.status === 'pending')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Answer a question
   */
  answer(id: string, answer: string): Question | undefined {
    const question = this.questions.get(id);
    if (!question) {
      return undefined;
    }

    if (question.status === 'answered') {
      // Already answered - return as-is
      return question;
    }

    question.status = 'answered';
    question.answer = answer;
    question.answeredAt = new Date();

    // Notify callbacks that the question was answered
    notifyAnswer(question);

    return question;
  }

  /**
   * Delete a question
   */
  delete(id: string): boolean {
    return this.questions.delete(id);
  }

  /**
   * Clear all questions
   */
  clear(): void {
    this.questions.clear();
  }

  /**
   * Get total question count
   */
  get count(): number {
    return this.questions.size;
  }
}

// Singleton instance
let store: InMemoryQuestionStore | null = null;

/**
 * Get the question store singleton
 */
export function getQuestionStore(): QuestionStore {
  if (!store) {
    store = new InMemoryQuestionStore();
  }
  return store;
}

/**
 * Reset the store (for testing)
 */
export function resetQuestionStore(): void {
  if (store) {
    store.clear();
  }
  store = null;
  // Clear all callbacks
  answerCallbacks.length = 0;
}
