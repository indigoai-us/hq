import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { AckHandler } from '../ack-handler.js';
import { ThreadManager } from '../thread-manager.js';
import { parse } from '../parse.js';
import type { HiampMessage } from '../types.js';
import type { SlackSender, SendResult, SendSuccess } from '../slack-sender.js';

/** Generate a unique temp directory for each test */
function makeTempDir(): string {
  return join(tmpdir(), `hiamp-ack-test-${randomBytes(4).toString('hex')}`);
}

/** Build a minimal HiampMessage for testing */
function makeMessage(overrides?: Partial<HiampMessage>): HiampMessage {
  return {
    version: 'v1',
    id: 'msg-a1b2c3d4',
    from: 'alex/backend-dev',
    to: 'stefan/architect',
    intent: 'handoff',
    body: 'The API contract is ready.',
    thread: 'thr-abc12345',
    ack: 'requested',
    ...overrides,
  };
}

/** Create a mock SlackSender */
function createMockSender(): SlackSender {
  const successResult: SendSuccess = {
    success: true,
    ts: '12345.6789',
    channelId: 'C0CHAN',
    messageText: 'ack message text',
    thread: 'thr-abc12345',
  };

  return {
    send: vi.fn().mockResolvedValue(successResult),
    sendReply: vi.fn().mockResolvedValue(successResult),
  } as unknown as SlackSender;
}

describe('AckHandler', () => {
  let tempDir: string;
  let mockSender: SlackSender;
  let handler: AckHandler;
  let threadManager: ThreadManager;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
    mockSender = createMockSender();
    threadManager = new ThreadManager(tempDir, 'threads');
    handler = new AckHandler({
      localOwner: 'stefan',
      sender: mockSender,
      threadManager,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('handleIncoming', () => {
    it('sends auto-ack when ack:requested', async () => {
      const message = makeMessage();
      const result = await handler.handleIncoming(message, 'C0CHAN', '12345.6789');

      expect(result.sent).toBe(true);
      expect(result.type).toBe('ack');
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toMatch(/^msg-/);
    });

    it('uses sendReply when slackThreadTs is provided', async () => {
      const message = makeMessage();
      await handler.handleIncoming(message, 'C0CHAN', '12345.6789');

      expect(mockSender.sendReply).toHaveBeenCalledTimes(1);
      const callArgs = (mockSender.sendReply as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(callArgs.intent).toBe('acknowledge');
      expect(callArgs.replyTo).toBe('msg-a1b2c3d4');
      expect(callArgs.thread).toBe('thr-abc12345');
      expect(callArgs.threadTs).toBe('12345.6789');
      expect(callArgs.from).toBe('stefan/architect');
      expect(callArgs.to).toBe('alex/backend-dev');
    });

    it('uses send when no slackThreadTs', async () => {
      const message = makeMessage();
      await handler.handleIncoming(message, 'C0CHAN');

      expect(mockSender.send).toHaveBeenCalledTimes(1);
      const callArgs = (mockSender.send as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(callArgs.intent).toBe('acknowledge');
      expect(callArgs.from).toBe('stefan/architect');
      expect(callArgs.to).toBe('alex/backend-dev');
      expect(callArgs.thread).toBe('thr-abc12345');
    });

    it('does not ack when ack:none', async () => {
      const message = makeMessage({ ack: 'none' });
      const result = await handler.handleIncoming(message, 'C0CHAN');

      expect(result.sent).toBe(false);
      expect(result.type).toBe('none');
      expect(result.reason).toContain('No ack needed');
    });

    it('does not ack when ack:optional', async () => {
      const message = makeMessage({ ack: 'optional' });
      const result = await handler.handleIncoming(message, 'C0CHAN');

      expect(result.sent).toBe(false);
      expect(result.type).toBe('none');
    });

    it('does not ack when ack is undefined', async () => {
      const message = makeMessage({ ack: undefined });
      const result = await handler.handleIncoming(message, 'C0CHAN');

      expect(result.sent).toBe(false);
      expect(result.type).toBe('none');
    });

    it('does not ack an acknowledge intent (prevents loop)', async () => {
      const message = makeMessage({ intent: 'acknowledge', ack: 'requested' });
      const result = await handler.handleIncoming(message, 'C0CHAN');

      expect(result.sent).toBe(false);
      expect(result.type).toBe('none');
      expect(result.reason).toContain('acknowledge');
    });

    it('does not ack an error intent (prevents loop)', async () => {
      const message = makeMessage({ intent: 'error', ack: 'requested' });
      const result = await handler.handleIncoming(message, 'C0CHAN');

      expect(result.sent).toBe(false);
      expect(result.type).toBe('none');
      expect(result.reason).toContain('error');
    });

    it('logs ack to ThreadManager when available', async () => {
      const message = makeMessage();
      // First add the original message to the thread
      await threadManager.addMessage('thr-abc12345', message);

      await handler.handleIncoming(message, 'C0CHAN', '12345.6789');

      const thread = await threadManager.getThread('thr-abc12345');
      expect(thread).not.toBeNull();
      // Thread should have 2 messages: the original + the ack
      expect(thread!.messages.length).toBeGreaterThanOrEqual(2);

      // Find the ack message
      const ackMsg = thread!.messages.find((m) => m.intent === 'acknowledge');
      expect(ackMsg).toBeDefined();
      expect(ackMsg!.from).toBe('stefan/architect');
      expect(ackMsg!.to).toBe('alex/backend-dev');
    });

    it('handles send failure gracefully', async () => {
      const failSender = {
        send: vi.fn().mockResolvedValue({
          success: false,
          error: 'Slack API error',
          code: 'SLACK_API_ERROR',
        }),
        sendReply: vi.fn().mockResolvedValue({
          success: false,
          error: 'Slack API error',
          code: 'SLACK_API_ERROR',
        }),
      } as unknown as SlackSender;

      const failHandler = new AckHandler({
        localOwner: 'stefan',
        sender: failSender,
      });

      const message = makeMessage();
      const result = await failHandler.handleIncoming(message, 'C0CHAN');

      expect(result.sent).toBe(false);
      expect(result.type).toBe('ack');
      expect(result.sendResult).toBeDefined();
      expect(result.sendResult!.success).toBe(false);
    });

    it('derives from address from the to field of the incoming message', async () => {
      const message = makeMessage({
        to: 'stefan/qa-tester',
      });

      await handler.handleIncoming(message, 'C0CHAN');

      const callArgs = (mockSender.send as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(callArgs.from).toBe('stefan/qa-tester');
    });
  });

  describe('sendNack', () => {
    it('sends a nack with reason', async () => {
      const message = makeMessage();
      const result = await handler.sendNack({
        originalMessage: message,
        reason: 'ERR_BUSY: Cannot process this now. Try later.',
        channelId: 'C0CHAN',
        slackThreadTs: '12345.6789',
      });

      expect(result.sent).toBe(true);
      expect(result.type).toBe('nack');
      expect(result.messageId).toMatch(/^msg-/);

      const callArgs = (mockSender.sendReply as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(callArgs.intent).toBe('error');
      expect(callArgs.body).toContain('ERR_BUSY');
      expect(callArgs.replyTo).toBe('msg-a1b2c3d4');
    });

    it('sends nack without thread_ts', async () => {
      const message = makeMessage({ thread: undefined });
      const result = await handler.sendNack({
        originalMessage: message,
        reason: 'ERR_UNKNOWN_RECIPIENT: Worker not found.',
        channelId: 'C0CHAN',
      });

      expect(result.sent).toBe(true);
      expect(result.type).toBe('nack');
      expect(mockSender.send).toHaveBeenCalled();
    });

    it('logs nack to ThreadManager', async () => {
      const message = makeMessage();
      await threadManager.addMessage('thr-abc12345', message);

      await handler.sendNack({
        originalMessage: message,
        reason: 'ERR_BUSY: Cannot process.',
        channelId: 'C0CHAN',
      });

      const thread = await threadManager.getThread('thr-abc12345');
      const errorMsg = thread!.messages.find((m) => m.intent === 'error');
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.body).toContain('ERR_BUSY');
    });

    it('allows from address override', async () => {
      const message = makeMessage();
      await handler.sendNack({
        originalMessage: message,
        reason: 'Rejected.',
        channelId: 'C0CHAN',
        from: 'stefan/system',
      });

      const callArgs = (mockSender.send as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(callArgs.from).toBe('stefan/system');
    });
  });

  describe('composeAck', () => {
    it('composes a valid ack message string', () => {
      const message = makeMessage();
      const ackText = handler.composeAck(message);

      // Parse the composed ack
      const parseResult = parse(ackText);
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.message.intent).toBe('acknowledge');
        expect(parseResult.message.from).toBe('stefan/architect');
        expect(parseResult.message.to).toBe('alex/backend-dev');
        expect(parseResult.message.replyTo).toBe('msg-a1b2c3d4');
        expect(parseResult.message.thread).toBe('thr-abc12345');
        expect(parseResult.message.ack).toBe('none');
        expect(parseResult.message.body).toContain('Acknowledged');
      }
    });
  });

  describe('composeNack', () => {
    it('composes a valid nack (error) message string', () => {
      const message = makeMessage();
      const nackText = handler.composeNack(message, 'ERR_BUSY: Worker is overloaded.');

      const parseResult = parse(nackText);
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.message.intent).toBe('error');
        expect(parseResult.message.from).toBe('stefan/architect');
        expect(parseResult.message.to).toBe('alex/backend-dev');
        expect(parseResult.message.replyTo).toBe('msg-a1b2c3d4');
        expect(parseResult.message.body).toContain('ERR_BUSY');
      }
    });
  });

  describe('round-trip: send with ack:requested -> receive -> auto-ack -> sender sees ack', () => {
    it('completes a full ack round-trip', async () => {
      // Step 1: Original message with ack:requested
      const originalMessage = makeMessage({
        id: 'msg-orig0001',
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'Here is the handoff.',
        thread: 'thr-roundtrp',
        ack: 'requested',
      });

      // Log original to thread
      await threadManager.addMessage('thr-roundtrp', originalMessage);

      // Step 2: Receiver's AckHandler processes the incoming message
      const receiverHandler = new AckHandler({
        localOwner: 'alex',
        sender: mockSender,
        threadManager,
      });

      const ackResult = await receiverHandler.handleIncoming(originalMessage, 'C0CHAN', '12345.6789');
      expect(ackResult.sent).toBe(true);
      expect(ackResult.type).toBe('ack');

      // Step 3: Verify the ack was sent with correct fields
      const sendCall = (mockSender.sendReply as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(sendCall.intent).toBe('acknowledge');
      expect(sendCall.from).toBe('alex/backend-dev');
      expect(sendCall.to).toBe('stefan/architect');
      expect(sendCall.replyTo).toBe('msg-orig0001');
      expect(sendCall.thread).toBe('thr-roundtrp');

      // Step 4: Verify thread now has both messages
      const thread = await threadManager.getThread('thr-roundtrp');
      expect(thread).not.toBeNull();
      expect(thread!.messages).toHaveLength(2);
      expect(thread!.messages[0]!.intent).toBe('handoff');
      expect(thread!.messages[1]!.intent).toBe('acknowledge');
      expect(thread!.messages[1]!.replyTo).toBe('msg-orig0001');
    });
  });
});
