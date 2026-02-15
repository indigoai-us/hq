import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { ThreadManager } from '../thread-manager.js';
import type { HiampMessage } from '../types.js';

/** Generate a unique temp directory for each test */
function makeTempDir(): string {
  return join(tmpdir(), `hiamp-thread-test-${randomBytes(4).toString('hex')}`);
}

/** Build a minimal HiampMessage for testing */
function makeMessage(overrides?: Partial<HiampMessage>): HiampMessage {
  return {
    version: 'v1',
    id: 'msg-a1b2c3d4',
    from: 'stefan/architect',
    to: 'alex/backend-dev',
    intent: 'handoff',
    body: 'The API contract is ready.',
    thread: 'thr-abc12345',
    ack: 'requested',
    ...overrides,
  };
}

describe('ThreadManager', () => {
  let tempDir: string;
  let tm: ThreadManager;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
    tm = new ThreadManager(tempDir, 'threads');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('addMessage', () => {
    it('creates a new thread on first message', async () => {
      const message = makeMessage();
      const thread = await tm.addMessage('thr-abc12345', message);

      expect(thread.threadId).toBe('thr-abc12345');
      expect(thread.status).toBe('open');
      expect(thread.participants).toContain('stefan/architect');
      expect(thread.participants).toContain('alex/backend-dev');
      expect(thread.messages).toHaveLength(1);
      expect(thread.messages[0]!.messageId).toBe('msg-a1b2c3d4');
      expect(thread.messages[0]!.intent).toBe('handoff');
      expect(thread.createdAt).toBeDefined();
      expect(thread.updatedAt).toBeDefined();
    });

    it('appends messages to an existing thread', async () => {
      const msg1 = makeMessage();
      await tm.addMessage('thr-abc12345', msg1);

      const msg2 = makeMessage({
        id: 'msg-e5f6a7b8',
        from: 'alex/backend-dev',
        to: 'stefan/architect',
        intent: 'acknowledge',
        body: 'Got it. Picking up now.',
        replyTo: 'msg-a1b2c3d4',
      });

      const thread = await tm.addMessage('thr-abc12345', msg2);

      expect(thread.messages).toHaveLength(2);
      expect(thread.messages[1]!.messageId).toBe('msg-e5f6a7b8');
      expect(thread.messages[1]!.intent).toBe('acknowledge');
      expect(thread.messages[1]!.replyTo).toBe('msg-a1b2c3d4');
    });

    it('does not duplicate participants', async () => {
      const msg1 = makeMessage();
      await tm.addMessage('thr-abc12345', msg1);

      const msg2 = makeMessage({
        id: 'msg-e5f6a7b8',
        from: 'alex/backend-dev',
        to: 'stefan/architect',
        intent: 'acknowledge',
        body: 'Got it.',
      });

      const thread = await tm.addMessage('thr-abc12345', msg2);
      expect(thread.participants).toHaveLength(2);
      expect(thread.participants).toContain('stefan/architect');
      expect(thread.participants).toContain('alex/backend-dev');
    });

    it('persists thread state to disk', async () => {
      const message = makeMessage();
      await tm.addMessage('thr-abc12345', message);

      // Verify file exists
      const filePath = join(tempDir, 'threads', 'thr-abc12345.json');
      const content = JSON.parse(await readFile(filePath, 'utf-8'));
      expect(content.threadId).toBe('thr-abc12345');
      expect(content.messages).toHaveLength(1);
    });

    it('records Slack thread_ts on first message', async () => {
      const message = makeMessage();
      const thread = await tm.addMessage('thr-abc12345', message, '12345.6789');

      expect(thread.slackThreadTs).toBe('12345.6789');
    });

    it('does not overwrite existing slackThreadTs', async () => {
      const msg1 = makeMessage();
      await tm.addMessage('thr-abc12345', msg1, '12345.6789');

      const msg2 = makeMessage({ id: 'msg-e5f6a7b8' });
      const thread = await tm.addMessage('thr-abc12345', msg2, '99999.0000');

      expect(thread.slackThreadTs).toBe('12345.6789');
    });

    it('reopens idle threads on new message', async () => {
      const msg1 = makeMessage();
      await tm.addMessage('thr-abc12345', msg1);
      await tm.markIdle('thr-abc12345');

      const msg2 = makeMessage({
        id: 'msg-e5f6a7b8',
        intent: 'query',
        body: 'Follow-up question.',
      });

      const thread = await tm.addMessage('thr-abc12345', msg2);
      expect(thread.status).toBe('open');
    });
  });

  describe('getThread', () => {
    it('returns the thread state', async () => {
      const message = makeMessage();
      await tm.addMessage('thr-abc12345', message);

      const thread = await tm.getThread('thr-abc12345');
      expect(thread).not.toBeNull();
      expect(thread!.threadId).toBe('thr-abc12345');
      expect(thread!.messages).toHaveLength(1);
    });

    it('returns null for nonexistent thread', async () => {
      const thread = await tm.getThread('thr-nonexist');
      expect(thread).toBeNull();
    });

    it('returns full conversation history', async () => {
      // Simulate a 3-message conversation
      await tm.addMessage(
        'thr-abc12345',
        makeMessage(),
      );
      await tm.addMessage(
        'thr-abc12345',
        makeMessage({
          id: 'msg-e5f6a7b8',
          from: 'alex/backend-dev',
          to: 'stefan/architect',
          intent: 'acknowledge',
          body: 'Got it.',
          replyTo: 'msg-a1b2c3d4',
        }),
      );
      await tm.addMessage(
        'thr-abc12345',
        makeMessage({
          id: 'msg-c9d0e1f2',
          from: 'alex/backend-dev',
          to: 'stefan/architect',
          intent: 'response',
          body: 'Work is done. PR #42.',
          replyTo: 'msg-a1b2c3d4',
        }),
      );

      const thread = await tm.getThread('thr-abc12345');
      expect(thread!.messages).toHaveLength(3);
      expect(thread!.messages[0]!.intent).toBe('handoff');
      expect(thread!.messages[1]!.intent).toBe('acknowledge');
      expect(thread!.messages[2]!.intent).toBe('response');
    });
  });

  describe('listThreads', () => {
    it('returns all threads', async () => {
      await tm.addMessage(
        'thr-thread01',
        makeMessage({ thread: 'thr-thread01' }),
      );
      await tm.addMessage(
        'thr-thread02',
        makeMessage({ id: 'msg-b2b2b2b2', thread: 'thr-thread02' }),
      );

      const threads = await tm.listThreads();
      expect(threads).toHaveLength(2);
    });

    it('filters by participant', async () => {
      await tm.addMessage(
        'thr-thread01',
        makeMessage({ from: 'stefan/architect', to: 'alex/backend-dev', thread: 'thr-thread01' }),
      );
      await tm.addMessage(
        'thr-thread02',
        makeMessage({
          id: 'msg-b2b2b2b2',
          from: 'stefan/architect',
          to: 'bob/frontend-dev',
          thread: 'thr-thread02',
        }),
      );

      const threads = await tm.listThreads({ participant: 'alex/backend-dev' });
      expect(threads).toHaveLength(1);
      expect(threads[0]!.threadId).toBe('thr-thread01');
    });

    it('filters by status', async () => {
      await tm.addMessage(
        'thr-thread01',
        makeMessage({ thread: 'thr-thread01' }),
      );
      await tm.addMessage(
        'thr-thread02',
        makeMessage({ id: 'msg-b2b2b2b2', thread: 'thr-thread02' }),
      );
      await tm.closeThread('thr-thread02');

      const openThreads = await tm.listThreads({ status: 'open' });
      expect(openThreads).toHaveLength(1);
      expect(openThreads[0]!.threadId).toBe('thr-thread01');
    });

    it('returns empty array when no threads directory', async () => {
      const emptyTm = new ThreadManager(join(tempDir, 'nonexistent'), 'threads');
      const threads = await emptyTm.listThreads();
      expect(threads).toEqual([]);
    });

    it('sorts by updatedAt descending', async () => {
      await tm.addMessage(
        'thr-thread01',
        makeMessage({ thread: 'thr-thread01' }),
      );
      // Small delay for different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await tm.addMessage(
        'thr-thread02',
        makeMessage({ id: 'msg-b2b2b2b2', thread: 'thr-thread02' }),
      );

      const threads = await tm.listThreads();
      // Most recent first
      expect(threads[0]!.threadId).toBe('thr-thread02');
      expect(threads[1]!.threadId).toBe('thr-thread01');
    });
  });

  describe('closeThread', () => {
    it('marks a thread as closed', async () => {
      await tm.addMessage('thr-abc12345', makeMessage());

      const result = await tm.closeThread('thr-abc12345');
      expect(result).toBe(true);

      const thread = await tm.getThread('thr-abc12345');
      expect(thread!.status).toBe('closed');
    });

    it('returns false for nonexistent thread', async () => {
      const result = await tm.closeThread('thr-nonexist');
      expect(result).toBe(false);
    });
  });

  describe('markIdle', () => {
    it('marks a thread as idle', async () => {
      await tm.addMessage('thr-abc12345', makeMessage());

      const result = await tm.markIdle('thr-abc12345');
      expect(result).toBe(true);

      const thread = await tm.getThread('thr-abc12345');
      expect(thread!.status).toBe('idle');
    });

    it('returns false for nonexistent thread', async () => {
      const result = await tm.markIdle('thr-nonexist');
      expect(result).toBe(false);
    });
  });

  describe('persistence across instances', () => {
    it('loads thread state from a fresh instance', async () => {
      // Write with first instance
      await tm.addMessage('thr-abc12345', makeMessage());

      // Read with fresh instance pointing to same dir
      const tm2 = new ThreadManager(tempDir, 'threads');
      const thread = await tm2.getThread('thr-abc12345');
      expect(thread).not.toBeNull();
      expect(thread!.threadId).toBe('thr-abc12345');
      expect(thread!.messages).toHaveLength(1);
    });
  });
});
