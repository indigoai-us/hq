/**
 * Chat message role
 */
export type MessageRole = 'worker' | 'user' | 'system';

/**
 * Chat message stored in the chat history
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Worker this message belongs to */
  workerId: string;
  /** Message role (worker, user, system) */
  role: MessageRole;
  /** Message content */
  content: string;
  /** When the message was created */
  timestamp: Date;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a new chat message
 */
export interface CreateChatMessageInput {
  /** Worker ID */
  workerId: string;
  /** Message role */
  role: MessageRole;
  /** Message content */
  content: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Pagination options for chat history
 */
export interface ChatPaginationOptions {
  /** Maximum number of messages to return (default: 50) */
  limit?: number;
  /** Cursor for pagination (message ID to start before) */
  before?: string;
  /** Cursor for pagination (message ID to start after) */
  after?: string;
}

/**
 * Paginated chat response
 */
export interface PaginatedChatResponse {
  /** Messages in the current page */
  messages: ChatMessage[];
  /** Total number of messages for this worker */
  total: number;
  /** Whether there are more messages before the first returned */
  hasMore: boolean;
  /** Cursor to use for next page (before) */
  nextCursor: string | null;
  /** Cursor to use for previous page (after) */
  prevCursor: string | null;
}

/**
 * Callback invoked when a new chat message is created
 */
export type ChatMessageCallback = (message: ChatMessage) => void;

/**
 * Chat store interface
 */
export interface ChatStore {
  /** Create a new chat message */
  create(input: CreateChatMessageInput): ChatMessage;
  /** Get a message by ID */
  get(id: string): ChatMessage | undefined;
  /** Get paginated messages for a worker */
  getByWorker(workerId: string, options?: ChatPaginationOptions): PaginatedChatResponse;
  /** Get all messages for a worker (for internal use) */
  getAllByWorker(workerId: string): ChatMessage[];
  /** Delete a message */
  delete(id: string): boolean;
  /** Delete all messages for a worker */
  deleteByWorker(workerId: string): number;
  /** Clear all messages (for testing) */
  clear(): void;
  /** Get total message count */
  count: number;
}
