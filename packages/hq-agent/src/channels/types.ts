// Channel abstraction types for hq-cloud

export interface ChannelMessage {
  messageId: number;       // SQLite message ID after insert
  groupId: string;         // derived from chatId (use chatId as group for 1:1)
  chatId: string;          // channel-specific chat identifier
  channel: string;         // 'telegram' | 'slack'
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
}

export interface ChannelReply {
  chatId: string;
  channel: string;
  content: string;
  threadTs?: string;        // Slack thread_ts for reply-in-thread
  replyToMessageId?: number; // SQLite message ID being replied to
}

export interface Channel {
  name: string;
  init(): Promise<void>;
  onMessage(handler: (msg: ChannelMessage) => Promise<void>): void;
  sendMessage(reply: ChannelReply): Promise<void>;
  shutdown(): Promise<void>;
}
