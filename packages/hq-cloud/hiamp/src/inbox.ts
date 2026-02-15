/**
 * HIAMP Inbox
 *
 * Manages the file-based inbox for incoming HIAMP messages.
 * Each worker has an inbox directory at workspace/inbox/{worker-id}/
 * where received messages are written as JSON files.
 *
 * For `share` intent messages with attachments, files are staged
 * to workspace/inbox/{worker-id}/shared/{sender-owner}/.
 *
 * @module inbox
 */

import { mkdir, writeFile, readdir, readFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { HiampMessage } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An inbox message entry as written to disk */
export interface InboxEntry {
  /** The parsed HIAMP message envelope and body */
  message: HiampMessage;

  /** The raw message text as received from Slack */
  rawText: string;

  /** ISO 8601 timestamp when the message was received */
  receivedAt: string;

  /** Slack channel ID where the message was received */
  channelId: string;

  /** Slack user/bot ID of the sender */
  slackUserId?: string;

  /** Slack message timestamp */
  slackTs?: string;

  /** Slack thread timestamp (if threaded) */
  slackThreadTs?: string;

  /** Whether this message has been read/processed */
  read: boolean;
}

/** Result of writing to inbox */
export interface InboxWriteResult {
  success: boolean;
  filePath?: string;
  sharedFilePaths?: string[];
  error?: string;
}

/** Inline file attachment extracted from a share message body */
export interface InlineAttachment {
  /** The filename as declared after the paperclip emoji */
  filename: string;

  /** The file content */
  content: string;
}

// ---------------------------------------------------------------------------
// Inbox class
// ---------------------------------------------------------------------------

/**
 * Manages the file-based inbox for HIAMP messages.
 *
 * @example
 * ```ts
 * const inbox = new Inbox('/path/to/hq');
 * await inbox.deliver(parsedMessage, rawText, 'C0CHANNEL', 'U0USER');
 * const messages = await inbox.readInbox('backend-dev');
 * await inbox.markRead('backend-dev', 'msg-a1b2c3d4');
 * ```
 */
export class Inbox {
  private readonly hqRoot: string;
  private readonly inboxBasePath: string;

  /**
   * @param hqRoot - The root directory of the HQ instance.
   * @param inboxPath - The inbox directory relative to hqRoot. Defaults to 'workspace/inbox'.
   */
  constructor(hqRoot: string, inboxPath: string = 'workspace/inbox') {
    this.hqRoot = hqRoot;
    this.inboxBasePath = join(hqRoot, inboxPath);
  }

  /**
   * Deliver a parsed HIAMP message to the target worker's inbox.
   *
   * Writes the message as a JSON file to workspace/inbox/{worker-id}/{message-id}.json.
   * For `share` intent messages, also extracts and stages inline file attachments.
   *
   * @param message - The parsed HIAMP message.
   * @param rawText - The raw message text from Slack.
   * @param channelId - The Slack channel ID.
   * @param slackUserId - The Slack user/bot ID of the sender.
   * @param slackTs - The Slack message timestamp.
   * @param slackThreadTs - The Slack thread timestamp (if threaded).
   * @returns An InboxWriteResult indicating success or failure.
   */
  async deliver(
    message: HiampMessage,
    rawText: string,
    channelId: string,
    slackUserId?: string,
    slackTs?: string,
    slackThreadTs?: string,
  ): Promise<InboxWriteResult> {
    try {
      // Extract worker-id from the 'to' address
      const workerId = this.extractWorkerId(message.to);
      if (!workerId) {
        return {
          success: false,
          error: `Cannot extract worker-id from address: ${message.to}`,
        };
      }

      // Ensure inbox directory exists
      const workerInboxDir = join(this.inboxBasePath, workerId);
      await mkdir(workerInboxDir, { recursive: true });

      // Build the inbox entry
      const entry: InboxEntry = {
        message,
        rawText,
        receivedAt: new Date().toISOString(),
        channelId,
        slackUserId,
        slackTs,
        slackThreadTs,
        read: false,
      };

      // Write the message file
      const filePath = join(workerInboxDir, `${message.id}.json`);
      await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');

      // Handle share intent: extract and stage inline attachments
      const sharedFilePaths: string[] = [];
      if (message.intent === 'share' && message.attach) {
        const senderOwner = message.from.split('/')[0];
        if (senderOwner) {
          const inlineFiles = extractInlineAttachments(rawText);
          if (inlineFiles.length > 0) {
            const sharedDir = join(workerInboxDir, 'shared', senderOwner);
            await mkdir(sharedDir, { recursive: true });

            for (const file of inlineFiles) {
              // Use just the filename part (not full path) for safety
              const safeName = file.filename.replace(/[/\\]/g, '_');
              const sharedPath = join(sharedDir, safeName);
              await writeFile(sharedPath, file.content, 'utf-8');
              sharedFilePaths.push(sharedPath);
            }
          }
        }
      }

      return {
        success: true,
        filePath,
        sharedFilePaths: sharedFilePaths.length > 0 ? sharedFilePaths : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to deliver message: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Read all messages in a worker's inbox.
   *
   * @param workerId - The worker ID.
   * @returns An array of InboxEntry objects, sorted by receivedAt (oldest first).
   */
  async readInbox(workerId: string): Promise<InboxEntry[]> {
    const workerInboxDir = join(this.inboxBasePath, workerId);

    let files: string[];
    try {
      files = await readdir(workerInboxDir);
    } catch {
      // Directory doesn't exist = empty inbox
      return [];
    }

    const entries: InboxEntry[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await readFile(join(workerInboxDir, file), 'utf-8');
        const entry = JSON.parse(content) as InboxEntry;
        entries.push(entry);
      } catch {
        // Skip malformed files
        continue;
      }
    }

    // Sort by receivedAt ascending
    entries.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

    return entries;
  }

  /**
   * Read only unread messages in a worker's inbox.
   *
   * @param workerId - The worker ID.
   * @returns An array of unread InboxEntry objects, sorted by receivedAt.
   */
  async readUnread(workerId: string): Promise<InboxEntry[]> {
    const all = await this.readInbox(workerId);
    return all.filter((e) => !e.read);
  }

  /**
   * Mark a specific message as read.
   *
   * @param workerId - The worker ID.
   * @param messageId - The HIAMP message ID.
   * @returns true if the message was found and marked, false otherwise.
   */
  async markRead(workerId: string, messageId: string): Promise<boolean> {
    const workerInboxDir = join(this.inboxBasePath, workerId);
    const filePath = join(workerInboxDir, `${messageId}.json`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(content) as InboxEntry;
      entry.read = true;
      await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a specific message from a worker's inbox.
   *
   * @param workerId - The worker ID.
   * @param messageId - The HIAMP message ID.
   * @returns true if the message was deleted, false otherwise.
   */
  async deleteMessage(workerId: string, messageId: string): Promise<boolean> {
    const workerInboxDir = join(this.inboxBasePath, workerId);
    const filePath = join(workerInboxDir, `${messageId}.json`);

    try {
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all messages from a worker's inbox.
   *
   * @param workerId - The worker ID.
   */
  async clearInbox(workerId: string): Promise<void> {
    const workerInboxDir = join(this.inboxBasePath, workerId);
    try {
      await rm(workerInboxDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }

  /**
   * Extract worker-id from a HIAMP address (owner/worker-id).
   */
  private extractWorkerId(address: string): string | null {
    const parts = address.split('/');
    if (parts.length !== 2 || !parts[1]) return null;
    return parts[1];
  }
}

// ---------------------------------------------------------------------------
// Inline attachment extraction
// ---------------------------------------------------------------------------

/**
 * Extract inline file attachments from a HIAMP message body.
 *
 * Inline attachments follow the format:
 * ```
 * \ud83d\udcce {filename}
 * ```{language}
 * {content}
 * ```
 * ```
 *
 * @param rawText - The raw message text.
 * @returns An array of extracted inline attachments.
 */
export function extractInlineAttachments(rawText: string): InlineAttachment[] {
  const attachments: InlineAttachment[] = [];

  // Match the paperclip pattern followed by a code block
  // \ud83d\udcce (U+1F4CE PAPERCLIP) followed by filename, then a code block
  const paperclipRegex = /\u{1F4CE}\s+(.+)\n```[^\n]*\n([\s\S]*?)```/gu;

  let match: RegExpExecArray | null;
  while ((match = paperclipRegex.exec(rawText)) !== null) {
    const filename = match[1]!.trim();
    const content = match[2]!;

    if (filename && content) {
      attachments.push({ filename, content });
    }
  }

  return attachments;
}
