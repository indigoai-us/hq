// Router — delivers agent replies to the correct channel + chat.
// Called after processMessage() receives an IpcResponse.

import { get as getChannel } from './channels/registry.js';
import { getMessageById } from './db.js';
import type { IpcResponse, Message } from './types.js';
import type { ChannelReply } from './channels/types.js';

/**
 * Route an agent reply back to the originating channel.
 *
 * @param response - IPC response from the agent container
 * @param originalMessage - The Message row from SQLite (must have channel + chat_id)
 */
export async function routeReply(response: IpcResponse, originalMessage: Message): Promise<void> {
  if (!response.success || !response.reply) {
    // Nothing to route — either failed or no reply content
    return;
  }

  const channel = getChannel(originalMessage.channel);
  if (!channel) {
    console.warn(
      `[router] No channel registered for "${originalMessage.channel}" — cannot deliver reply for message ${originalMessage.id}`
    );
    return;
  }

  const reply: ChannelReply = {
    chatId: originalMessage.chat_id,
    channel: originalMessage.channel,
    content: response.reply,
    replyToMessageId: originalMessage.id,
  };

  try {
    await channel.sendMessage(reply);
    console.log(
      `[router] Delivered reply for message ${originalMessage.id} via ${originalMessage.channel} to ${originalMessage.chat_id}`
    );
  } catch (err) {
    console.error(
      `[router] Failed to deliver reply for message ${originalMessage.id} via ${originalMessage.channel}:`,
      err
    );
  }
}

/**
 * Convenience overload: look up the message by ID and route the reply.
 */
export async function routeReplyById(response: IpcResponse, messageId: number): Promise<void> {
  const msg = await getMessageById(messageId);
  if (!msg) {
    console.warn(`[router] Cannot route reply — message ${messageId} not found`);
    return;
  }
  await routeReply(response, msg);
}
