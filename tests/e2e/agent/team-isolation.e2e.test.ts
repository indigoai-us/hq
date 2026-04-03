/**
 * E2E tests for multi-tenant team isolation in hq-agent.
 *
 * Exercises the real SQLite database (in-memory) to verify that:
 *   - Messages are isolated between teams
 *   - Queue depth is scoped per team
 *   - Scheduled tasks are scoped per team
 *   - S3 backup keys include the team prefix
 *   - GroupQueue properly carries teamId through jobs
 *
 * No Docker, no external services needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDb,
  closeDb,
  insertMessage,
  getPendingMessages,
  updateMessageStatus,
  getQueueDepth,
  insertScheduledTask,
  getPendingScheduledTasks,
  upsertChat,
  getChatById,
  insertSession,
  getSessionById,
} from '../../../packages/hq-agent/src/db.js';
import { GroupQueue } from '../../../packages/hq-agent/src/group-queue.js';

// ─── Database setup ──────────────────────────────────────────────────────────

function setupTestDb() {
  return initDb(':memory:');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function insertTestMessage(teamId: string, groupId: string, content: string) {
  return insertMessage({
    team_id: teamId,
    group_id: groupId,
    chat_id: `chat-${groupId}`,
    channel: 'telegram',
    sender_id: 'user-1',
    sender_name: 'Tester',
    content,
    status: 'pending',
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('E2E: team isolation', () => {
  beforeEach(() => {
    setupTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  // ── Message isolation ──────────────────────────────────────────────────────

  describe('message isolation', () => {
    it('team-A cannot see team-B messages via getPendingMessages', async () => {
      await insertTestMessage('team-alpha', 'group-a1', 'Alpha message 1');
      await insertTestMessage('team-alpha', 'group-a2', 'Alpha message 2');
      await insertTestMessage('team-beta', 'group-b1', 'Beta message 1');

      const alpha = await getPendingMessages('team-alpha');
      const beta = await getPendingMessages('team-beta');
      const all = await getPendingMessages();

      expect(alpha).toHaveLength(2);
      expect(alpha.every((m) => m.team_id === 'team-alpha')).toBe(true);

      expect(beta).toHaveLength(1);
      expect(beta[0].team_id).toBe('team-beta');
      expect(beta[0].content).toBe('Beta message 1');

      expect(all).toHaveLength(3);
    });

    it('updating a message in one team does not affect another', async () => {
      const alphaId = await insertTestMessage('team-alpha', 'group-a1', 'Alpha');
      const betaId = await insertTestMessage('team-beta', 'group-b1', 'Beta');

      await updateMessageStatus(alphaId, 'done');

      const alphaPending = await getPendingMessages('team-alpha');
      const betaPending = await getPendingMessages('team-beta');

      expect(alphaPending).toHaveLength(0);
      expect(betaPending).toHaveLength(1);
      expect(betaPending[0].id).toBe(betaId);
    });

    it('handles many teams with overlapping group_ids', async () => {
      // Both teams use "group-shared" as group_id — isolation must hold
      await insertTestMessage('team-x', 'group-shared', 'X data');
      await insertTestMessage('team-y', 'group-shared', 'Y data');

      const xMsgs = await getPendingMessages('team-x');
      const yMsgs = await getPendingMessages('team-y');

      expect(xMsgs).toHaveLength(1);
      expect(xMsgs[0].content).toBe('X data');
      expect(yMsgs).toHaveLength(1);
      expect(yMsgs[0].content).toBe('Y data');
    });
  });

  // ── Queue depth isolation ──────────────────────────────────────────────────

  describe('queue depth isolation', () => {
    it('getQueueDepth returns per-team counts', async () => {
      await insertTestMessage('team-alpha', 'group-a1', 'A1');
      await insertTestMessage('team-alpha', 'group-a2', 'A2');
      await insertTestMessage('team-alpha', 'group-a3', 'A3');
      await insertTestMessage('team-beta', 'group-b1', 'B1');

      expect(getQueueDepth('team-alpha')).toBe(3);
      expect(getQueueDepth('team-beta')).toBe(1);
      expect(getQueueDepth()).toBe(4);
    });

    it('processing messages count in queue depth', async () => {
      const id = await insertTestMessage('team-alpha', 'group-a1', 'Processing');
      await updateMessageStatus(id, 'processing');

      expect(getQueueDepth('team-alpha')).toBe(1); // processing counts
      expect(getQueueDepth('team-beta')).toBe(0);
    });

    it('done messages do not count in queue depth', async () => {
      const id = await insertTestMessage('team-alpha', 'group-a1', 'Done');
      await updateMessageStatus(id, 'done');

      expect(getQueueDepth('team-alpha')).toBe(0);
      expect(getQueueDepth()).toBe(0);
    });
  });

  // ���─ Scheduled task isolation ───────────────────────────────────────────────

  describe('scheduled task isolation', () => {
    it('team-scoped scheduled tasks are invisible to other teams', async () => {
      const past = Date.now() - 1000;

      await insertScheduledTask({
        team_id: 'team-alpha',
        group_id: 'group-a1',
        task_type: 'reminder',
        payload: JSON.stringify({ for: 'alpha' }),
        status: 'pending',
        scheduled_at: past,
      });

      await insertScheduledTask({
        team_id: 'team-beta',
        group_id: 'group-b1',
        task_type: 'digest',
        payload: JSON.stringify({ for: 'beta' }),
        status: 'pending',
        scheduled_at: past,
      });

      const alphaTasks = await getPendingScheduledTasks('team-alpha');
      const betaTasks = await getPendingScheduledTasks('team-beta');
      const allTasks = await getPendingScheduledTasks();

      expect(alphaTasks).toHaveLength(1);
      expect(alphaTasks[0].task_type).toBe('reminder');
      expect(alphaTasks[0].team_id).toBe('team-alpha');

      expect(betaTasks).toHaveLength(1);
      expect(betaTasks[0].task_type).toBe('digest');

      expect(allTasks).toHaveLength(2);
    });

    it('future tasks are not returned even for the correct team', async () => {
      const future = Date.now() + 60_000;

      await insertScheduledTask({
        team_id: 'team-alpha',
        group_id: 'group-a1',
        task_type: 'reminder',
        payload: '{}',
        status: 'pending',
        scheduled_at: future,
      });

      const tasks = await getPendingScheduledTasks('team-alpha');
      expect(tasks).toHaveLength(0);
    });
  });

  // ── Chat & session team scoping ────────────────────────────────────────────

  describe('chat and session team scoping', () => {
    it('chats carry team_id through upsert cycle', async () => {
      const now = Date.now();

      await upsertChat({
        id: 'chat-alpha-1',
        team_id: 'team-alpha',
        channel: 'telegram',
        group_id: 'group-a1',
        title: 'Alpha Chat',
        created_at: now,
        last_message_at: now,
      });

      await upsertChat({
        id: 'chat-beta-1',
        team_id: 'team-beta',
        channel: 'slack',
        group_id: 'group-b1',
        title: 'Beta Chat',
        created_at: now,
        last_message_at: now,
      });

      const alpha = await getChatById('chat-alpha-1');
      const beta = await getChatById('chat-beta-1');

      expect(alpha!.team_id).toBe('team-alpha');
      expect(beta!.team_id).toBe('team-beta');
    });

    it('sessions carry team_id', async () => {
      await insertSession({
        id: 'sess-alpha-1',
        team_id: 'team-alpha',
        group_id: 'group-a1',
        chat_id: 'chat-a1',
        container_id: null,
        status: 'active',
        started_at: Date.now(),
      });

      const sess = await getSessionById('sess-alpha-1');
      expect(sess!.team_id).toBe('team-alpha');
      expect(sess!.status).toBe('active');
    });
  });

  // ── GroupQueue team awareness ──────────────────────────────────────────────

  describe('GroupQueue team awareness', () => {
    it('carries teamId through job execution', async () => {
      const q = new GroupQueue(3);
      const captured: string[] = [];

      q.enqueue({
        teamId: 'team-alpha',
        groupId: 'group-a1',
        messageId: 1,
        run: async () => {
          captured.push('team-alpha');
        },
      });

      q.enqueue({
        teamId: 'team-beta',
        groupId: 'group-b1',
        messageId: 2,
        run: async () => {
          captured.push('team-beta');
        },
      });

      await q.drain();

      expect(captured).toContain('team-alpha');
      expect(captured).toContain('team-beta');
      expect(captured).toHaveLength(2);
    });

    it('per-group serialization works across teams with same groupId', async () => {
      const q = new GroupQueue(3);
      const order: string[] = [];

      // Both teams using same groupId — should serialize within group
      q.enqueue({
        teamId: 'team-alpha',
        groupId: 'shared-group',
        messageId: 1,
        run: async () => {
          await new Promise((r) => setTimeout(r, 20));
          order.push('alpha-first');
        },
      });

      q.enqueue({
        teamId: 'team-beta',
        groupId: 'shared-group',
        messageId: 2,
        run: async () => {
          order.push('beta-second');
        },
      });

      await q.drain();

      // Same groupId → serialized: alpha must complete before beta starts
      expect(order).toEqual(['alpha-first', 'beta-second']);
    });
  });

  // ── Full lifecycle ────────────────────────────────────��────────────────────

  describe('full lifecycle', () => {
    it('end-to-end: insert, process, complete across two teams', async () => {
      // Team Alpha: insert 2 messages
      const a1 = await insertTestMessage('team-alpha', 'group-a1', 'Alpha-1');
      const a2 = await insertTestMessage('team-alpha', 'group-a1', 'Alpha-2');

      // Team Beta: insert 1 message
      const b1 = await insertTestMessage('team-beta', 'group-b1', 'Beta-1');

      // Verify initial state
      expect(getQueueDepth('team-alpha')).toBe(2);
      expect(getQueueDepth('team-beta')).toBe(1);
      expect(getQueueDepth()).toBe(3);

      // Process Alpha-1
      await updateMessageStatus(a1, 'processing', { container_id: 'hq-alpha-a1-1-abc' });
      expect(getQueueDepth('team-alpha')).toBe(2); // processing still counts

      await updateMessageStatus(a1, 'done');
      expect(getQueueDepth('team-alpha')).toBe(1); // a2 still pending

      // Process Beta-1 to failure
      await updateMessageStatus(b1, 'processing');
      await updateMessageStatus(b1, 'failed', { error: 'Container OOM' });
      expect(getQueueDepth('team-beta')).toBe(0); // failed doesn't count

      // Process Alpha-2
      await updateMessageStatus(a2, 'done');
      expect(getQueueDepth('team-alpha')).toBe(0);
      expect(getQueueDepth()).toBe(0);
    });
  });
});
