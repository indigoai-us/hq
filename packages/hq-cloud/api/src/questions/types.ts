/**
 * Question status enum
 */
export type QuestionStatus = 'pending' | 'answered';

/**
 * Question option for multiple-choice questions
 */
export interface QuestionOption {
  /** Option identifier */
  id: string;
  /** Option display text */
  text: string;
  /** Optional metadata for the option */
  metadata?: Record<string, unknown>;
}

/**
 * Question submitted by a worker
 */
export interface Question {
  /** Unique question identifier */
  id: string;
  /** Worker that submitted the question */
  workerId: string;
  /** Question text */
  text: string;
  /** Optional answer options (for multiple-choice) */
  options: QuestionOption[];
  /** Question status */
  status: QuestionStatus;
  /** When the question was created */
  createdAt: Date;
  /** When the question was answered (null if not answered) */
  answeredAt: Date | null;
  /** The answer provided (null if not answered) */
  answer: string | null;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a new question
 */
export interface CreateQuestionInput {
  /** Worker ID submitting the question */
  workerId: string;
  /** Question text */
  text: string;
  /** Optional answer options */
  options?: QuestionOption[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for answering a question
 */
export interface AnswerQuestionInput {
  /** The answer text or option ID */
  answer: string;
}

/**
 * Callback invoked when a question is answered
 */
export type QuestionAnsweredCallback = (question: Question) => void;

/**
 * Question store interface
 */
export interface QuestionStore {
  /** Create a new question */
  create(input: CreateQuestionInput): Question;
  /** Get a question by ID */
  get(id: string): Question | undefined;
  /** Get questions for a worker */
  getByWorker(workerId: string): Question[];
  /** Get pending questions for a worker */
  getPendingByWorker(workerId: string): Question[];
  /** Answer a question */
  answer(id: string, answer: string): Question | undefined;
  /** Delete a question */
  delete(id: string): boolean;
  /** Clear all questions (for testing) */
  clear(): void;
  /** Get total question count */
  count: number;
}
