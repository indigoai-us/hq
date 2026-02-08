import type {
  ChatMessage,
  ChatStore,
  CreateChatMessageInput,
  ChatPaginationOptions,
  PaginatedChatResponse,
  ChatMessageCallback,
} from './types.js';

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `msg_${timestamp}_${random}`;
}

// Array of registered message callbacks
const messageCallbacks: ChatMessageCallback[] = [];

/**
 * Register a callback for when a new chat message is created
 */
export function onChatMessage(callback: ChatMessageCallback): () => void {
  messageCallbacks.push(callback);
  return () => {
    const index = messageCallbacks.indexOf(callback);
    if (index > -1) {
      messageCallbacks.splice(index, 1);
    }
  };
}

/**
 * Notify all callbacks that a message was created
 */
function notifyMessage(message: ChatMessage): void {
  for (const callback of messageCallbacks) {
    try {
      callback(message);
    } catch {
      // Ignore callback errors
    }
  }
}

/** Default pagination limit */
const DEFAULT_LIMIT = 50;
/** Maximum pagination limit */
const MAX_LIMIT = 100;

/**
 * In-memory chat store.
 * Implements ChatStore interface for easy swapping to DynamoDB/Postgres later.
 */
class InMemoryChatStore implements ChatStore {
  // Map of workerId -> messages array (ordered by timestamp, oldest first)
  private messagesByWorker: Map<string, ChatMessage[]> = new Map();
  // Map of messageId -> message (for quick lookups)
  private messagesById: Map<string, ChatMessage> = new Map();
  // Total message count
  private _count = 0;

  /**
   * Create a new chat message
   */
  create(input: CreateChatMessageInput): ChatMessage {
    const id = generateMessageId();
    const now = new Date();

    const message: ChatMessage = {
      id,
      workerId: input.workerId,
      role: input.role,
      content: input.content,
      timestamp: now,
      metadata: input.metadata,
    };

    // Add to worker's message list
    let workerMessages = this.messagesByWorker.get(input.workerId);
    if (!workerMessages) {
      workerMessages = [];
      this.messagesByWorker.set(input.workerId, workerMessages);
    }
    workerMessages.push(message);

    // Add to lookup map
    this.messagesById.set(id, message);
    this._count++;

    // Notify callbacks
    notifyMessage(message);

    return message;
  }

  /**
   * Get a message by ID
   */
  get(id: string): ChatMessage | undefined {
    return this.messagesById.get(id);
  }

  /**
   * Get all messages for a worker (for internal use)
   */
  getAllByWorker(workerId: string): ChatMessage[] {
    return this.messagesByWorker.get(workerId) ?? [];
  }

  /**
   * Get paginated messages for a worker
   * Returns messages in reverse chronological order (newest first)
   */
  getByWorker(workerId: string, options?: ChatPaginationOptions): PaginatedChatResponse {
    const allMessages = this.messagesByWorker.get(workerId) ?? [];
    const total = allMessages.length;

    if (total === 0) {
      return {
        messages: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
        prevCursor: null,
      };
    }

    // Determine limit
    let limit = options?.limit ?? DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }
    if (limit < 1) {
      limit = 1;
    }

    // Work with messages in reverse order (newest first)
    const reversedMessages = [...allMessages].reverse();

    let startIndex = 0;
    let endIndex = limit;

    // Handle cursor-based pagination
    if (options?.before) {
      // Find messages before the specified message ID
      const beforeIndex = reversedMessages.findIndex((m) => m.id === options.before);
      if (beforeIndex !== -1) {
        startIndex = beforeIndex + 1;
        endIndex = startIndex + limit;
      }
    } else if (options?.after) {
      // Find messages after the specified message ID (going backwards in our reversed list)
      const afterIndex = reversedMessages.findIndex((m) => m.id === options.after);
      if (afterIndex !== -1) {
        // Go backwards from the 'after' message
        endIndex = afterIndex;
        startIndex = Math.max(0, endIndex - limit);
      }
    }

    // Slice the messages
    const messages = reversedMessages.slice(startIndex, endIndex);
    const hasMore = endIndex < reversedMessages.length;

    // Determine cursors
    const lastMessage = messages[messages.length - 1];
    const firstMessage = messages[0];
    const nextCursor = hasMore && lastMessage ? lastMessage.id : null;
    const prevCursor = startIndex > 0 && firstMessage ? firstMessage.id : null;

    return {
      messages,
      total,
      hasMore,
      nextCursor,
      prevCursor,
    };
  }

  /**
   * Delete a message
   */
  delete(id: string): boolean {
    const message = this.messagesById.get(id);
    if (!message) {
      return false;
    }

    // Remove from worker's message list
    const workerMessages = this.messagesByWorker.get(message.workerId);
    if (workerMessages) {
      const index = workerMessages.findIndex((m) => m.id === id);
      if (index !== -1) {
        workerMessages.splice(index, 1);
      }
      if (workerMessages.length === 0) {
        this.messagesByWorker.delete(message.workerId);
      }
    }

    // Remove from lookup map
    this.messagesById.delete(id);
    this._count--;

    return true;
  }

  /**
   * Delete all messages for a worker
   */
  deleteByWorker(workerId: string): number {
    const workerMessages = this.messagesByWorker.get(workerId);
    if (!workerMessages) {
      return 0;
    }

    const count = workerMessages.length;

    // Remove all messages from lookup map
    for (const message of workerMessages) {
      this.messagesById.delete(message.id);
    }

    // Remove worker's message list
    this.messagesByWorker.delete(workerId);
    this._count -= count;

    return count;
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messagesByWorker.clear();
    this.messagesById.clear();
    this._count = 0;
  }

  /**
   * Get total message count
   */
  get count(): number {
    return this._count;
  }
}

// Singleton instance
let store: InMemoryChatStore | null = null;

/**
 * Get the chat store singleton
 */
export function getChatStore(): ChatStore {
  if (!store) {
    store = new InMemoryChatStore();
  }
  return store;
}

/**
 * Reset the store (for testing)
 */
export function resetChatStore(): void {
  if (store) {
    store.clear();
  }
  store = null;
  // Clear all callbacks
  messageCallbacks.length = 0;
}
