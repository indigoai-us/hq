import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb, insertMessage, getPendingMessages, updateMessageStatus, getMessageById, upsertChat, getChatById, insertSession, getSessionById, updateSession, insertScheduledTask, getPendingScheduledTasks, getQueueDepth } from './db.js';

function setupTestDb() {
  // Use in-memory SQLite for tests
  return initDb(':memory:');
}

describe('db', () => {
  beforeEach(() => {
    setupTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  describe('messages', () => {
    it('inserts a message and retrieves it by id', async () => {
      const id = await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Hello world',
        status: 'pending',
      });

      expect(id).toBeGreaterThan(0);

      const msg = await getMessageById(id);
      expect(msg).not.toBeNull();
      expect(msg!.content).toBe('Hello world');
      expect(msg!.status).toBe('pending');
      expect(msg!.group_id).toBe('group-1');
    });

    it('getPendingMessages returns only pending messages', async () => {
      await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Msg 1',
        status: 'pending',
      });

      const id2 = await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Msg 2',
        status: 'pending',
      });

      await updateMessageStatus(id2, 'done');

      const pending = await getPendingMessages();
      expect(pending).toHaveLength(1);
      expect(pending[0].content).toBe('Msg 1');
    });

    it('updateMessageStatus changes status and sets processed_at', async () => {
      const id = await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Test',
        status: 'pending',
      });

      await updateMessageStatus(id, 'processing', { container_id: 'ctr-abc' });

      const msg = await getMessageById(id);
      expect(msg!.status).toBe('processing');
      expect(msg!.container_id).toBe('ctr-abc');
      expect(msg!.processed_at).not.toBeNull();
    });

    it('updateMessageStatus sets error on failure', async () => {
      const id = await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Test',
        status: 'pending',
      });

      await updateMessageStatus(id, 'failed', { error: 'Container timed out' });

      const msg = await getMessageById(id);
      expect(msg!.status).toBe('failed');
      expect(msg!.error).toBe('Container timed out');
    });

    it('getPendingMessages respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await insertMessage({
          group_id: 'group-1',
          chat_id: 'chat-1',
          channel: 'telegram',
          sender_id: 'user-1',
          sender_name: 'Alice',
          content: `Msg ${i}`,
          status: 'pending',
        });
      }

      const pending = await getPendingMessages(3);
      expect(pending).toHaveLength(3);
    });

    it('getMessageById returns null for non-existent id', async () => {
      const msg = await getMessageById(99999);
      expect(msg).toBeNull();
    });
  });

  describe('chats', () => {
    it('upserts and retrieves a chat', async () => {
      const now = Date.now();
      await upsertChat({
        id: 'chat-1',
        channel: 'telegram',
        group_id: 'group-1',
        title: 'Test Chat',
        created_at: now,
        last_message_at: now,
      });

      const chat = await getChatById('chat-1');
      expect(chat).not.toBeNull();
      expect(chat!.title).toBe('Test Chat');
    });

    it('upsert updates last_message_at on conflict', async () => {
      const now = Date.now();
      await upsertChat({
        id: 'chat-1',
        channel: 'telegram',
        group_id: 'group-1',
        title: 'Test Chat',
        created_at: now,
        last_message_at: now,
      });

      const later = now + 5000;
      await upsertChat({
        id: 'chat-1',
        channel: 'telegram',
        group_id: 'group-1',
        title: null,
        created_at: now,
        last_message_at: later,
      });

      const chat = await getChatById('chat-1');
      expect(chat!.last_message_at).toBe(later);
      // Original title preserved when new title is null
      expect(chat!.title).toBe('Test Chat');
    });

    it('getChatById returns null for unknown id', async () => {
      const chat = await getChatById('unknown');
      expect(chat).toBeNull();
    });
  });

  describe('sessions', () => {
    it('inserts and retrieves a session', async () => {
      await insertSession({
        id: 'session-1',
        group_id: 'group-1',
        chat_id: 'chat-1',
        container_id: null,
        status: 'active',
        started_at: Date.now(),
      });

      const session = await getSessionById('session-1');
      expect(session).not.toBeNull();
      expect(session!.status).toBe('active');
      expect(session!.message_count).toBe(0);
    });

    it('updateSession changes status and ended_at', async () => {
      const now = Date.now();
      await insertSession({
        id: 'session-1',
        group_id: 'group-1',
        chat_id: 'chat-1',
        container_id: null,
        status: 'active',
        started_at: now,
      });

      await updateSession('session-1', { status: 'terminated', ended_at: now + 1000 });

      const session = await getSessionById('session-1');
      expect(session!.status).toBe('terminated');
      expect(session!.ended_at).toBe(now + 1000);
    });

    it('updateSession with no fields is a no-op', async () => {
      await insertSession({
        id: 'session-1',
        group_id: 'group-1',
        chat_id: 'chat-1',
        container_id: null,
        status: 'active',
        started_at: Date.now(),
      });

      // Should not throw
      await expect(updateSession('session-1', {})).resolves.toBeUndefined();
    });
  });

  describe('scheduled_tasks', () => {
    it('inserts a scheduled task', async () => {
      const id = await insertScheduledTask({
        group_id: 'group-1',
        task_type: 'reminder',
        payload: JSON.stringify({ msg: 'hello' }),
        status: 'pending',
        scheduled_at: Date.now() - 1000, // in the past → ready
      });

      expect(id).toBeGreaterThan(0);
    });

    it('getPendingScheduledTasks returns tasks due now', async () => {
      const past = Date.now() - 1000;
      const future = Date.now() + 60000;

      await insertScheduledTask({
        group_id: 'group-1',
        task_type: 'reminder',
        payload: '{}',
        status: 'pending',
        scheduled_at: past,
      });

      await insertScheduledTask({
        group_id: 'group-1',
        task_type: 'reminder',
        payload: '{}',
        status: 'pending',
        scheduled_at: future,
      });

      const tasks = await getPendingScheduledTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].scheduled_at).toBe(past);
    });
  });

  describe('getQueueDepth', () => {
    it('counts pending and processing messages', async () => {
      const id1 = await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Pending',
        status: 'pending',
      });

      const id2 = await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Processing',
        status: 'pending',
      });

      await updateMessageStatus(id2, 'processing');
      await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Done',
        status: 'pending',
      });

      const id3 = await insertMessage({
        group_id: 'group-1',
        chat_id: 'chat-1',
        channel: 'telegram',
        sender_id: 'user-1',
        sender_name: 'Alice',
        content: 'Done2',
        status: 'pending',
      });
      await updateMessageStatus(id3, 'done');

      // id1 (pending) + id2 (processing) = 2; the third inserted is pending = 3 total pending+processing
      const depth = getQueueDepth();
      expect(depth).toBe(3);

      void id1; // suppress unused warning
    });

    it('returns 0 when queue is empty', () => {
      expect(getQueueDepth()).toBe(0);
    });
  });
});
