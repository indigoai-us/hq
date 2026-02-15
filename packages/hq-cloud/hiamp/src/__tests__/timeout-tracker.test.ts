import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { TimeoutTracker } from '../timeout-tracker.js';

/** Generate a unique temp directory for each test */
function makeTempDir(): string {
  return join(tmpdir(), `hiamp-timeout-test-${randomBytes(4).toString('hex')}`);
}

describe('TimeoutTracker', () => {
  describe('track and resolve', () => {
    it('tracks a message awaiting ack', () => {
      const tracker = new TimeoutTracker();
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev', 'thr-abc12345');

      expect(tracker.isPending('msg-a1b2c3d4')).toBe(true);
      expect(tracker.size).toBe(1);
    });

    it('resolves a tracked message', () => {
      const tracker = new TimeoutTracker();
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      const result = tracker.resolve('msg-a1b2c3d4');
      expect(result).toBe(true);
      expect(tracker.isPending('msg-a1b2c3d4')).toBe(false);
      expect(tracker.size).toBe(0);
    });

    it('returns false when resolving untracked message', () => {
      const tracker = new TimeoutTracker();
      const result = tracker.resolve('msg-nonexist');
      expect(result).toBe(false);
    });

    it('stores entry with correct fields', () => {
      const tracker = new TimeoutTracker({ defaultTimeoutMs: 60000 });
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev', 'thr-abc12345');

      const entry = tracker.get('msg-a1b2c3d4');
      expect(entry).toBeDefined();
      expect(entry!.messageId).toBe('msg-a1b2c3d4');
      expect(entry!.target).toBe('alex/backend-dev');
      expect(entry!.threadId).toBe('thr-abc12345');
      expect(entry!.timeoutMs).toBe(60000);
      expect(entry!.retries).toBe(0);
      expect(entry!.sentAt).toBeDefined();
      expect(entry!.expiresAt).toBeDefined();
    });

    it('uses custom timeout when provided', () => {
      const tracker = new TimeoutTracker({ defaultTimeoutMs: 300000 });
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev', undefined, 10000);

      const entry = tracker.get('msg-a1b2c3d4');
      expect(entry!.timeoutMs).toBe(10000);
    });

    it('tracks multiple messages independently', () => {
      const tracker = new TimeoutTracker();
      tracker.track('msg-aaa11111', 'alex/backend-dev');
      tracker.track('msg-bbb22222', 'bob/frontend-dev');

      expect(tracker.size).toBe(2);
      expect(tracker.isPending('msg-aaa11111')).toBe(true);
      expect(tracker.isPending('msg-bbb22222')).toBe(true);

      tracker.resolve('msg-aaa11111');
      expect(tracker.size).toBe(1);
      expect(tracker.isPending('msg-aaa11111')).toBe(false);
      expect(tracker.isPending('msg-bbb22222')).toBe(true);
    });
  });

  describe('checkTimeouts', () => {
    it('returns empty array when nothing has timed out', () => {
      const tracker = new TimeoutTracker({ defaultTimeoutMs: 300000 });
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      const timedOut = tracker.checkTimeouts();
      expect(timedOut).toHaveLength(0);
    });

    it('detects timed-out messages', () => {
      const tracker = new TimeoutTracker({ defaultTimeoutMs: 100 });
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      // Manually set a past expiry
      const entry = tracker.get('msg-a1b2c3d4')!;
      entry.expiresAt = new Date(Date.now() - 1000).toISOString();

      const timedOut = tracker.checkTimeouts();
      expect(timedOut).toHaveLength(1);
      expect(timedOut[0]!.entry.messageId).toBe('msg-a1b2c3d4');
      expect(timedOut[0]!.overdueMs).toBeGreaterThan(0);
    });

    it('only returns timed-out entries, not pending ones', () => {
      const tracker = new TimeoutTracker({ defaultTimeoutMs: 300000 });
      tracker.track('msg-aaa11111', 'alex/backend-dev');
      tracker.track('msg-bbb22222', 'bob/frontend-dev');

      // Only expire one
      const entry = tracker.get('msg-aaa11111')!;
      entry.expiresAt = new Date(Date.now() - 1000).toISOString();

      const timedOut = tracker.checkTimeouts();
      expect(timedOut).toHaveLength(1);
      expect(timedOut[0]!.entry.messageId).toBe('msg-aaa11111');
    });

    it('works with configurable timeout window', () => {
      // 5-minute default
      const tracker = new TimeoutTracker({ defaultTimeoutMs: 5 * 60 * 1000 });
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      // Not timed out yet (within 5 min window)
      expect(tracker.checkTimeouts()).toHaveLength(0);

      // Simulate timeout
      const entry = tracker.get('msg-a1b2c3d4')!;
      entry.expiresAt = new Date(Date.now() - 1).toISOString();
      expect(tracker.checkTimeouts()).toHaveLength(1);
    });
  });

  describe('retries', () => {
    it('records a retry and resets timeout', () => {
      const tracker = new TimeoutTracker({ defaultTimeoutMs: 60000 });
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      // Expire it
      const entry = tracker.get('msg-a1b2c3d4')!;
      entry.expiresAt = new Date(Date.now() - 1000).toISOString();

      expect(tracker.checkTimeouts()).toHaveLength(1);

      // Record retry
      const result = tracker.recordRetry('msg-a1b2c3d4');
      expect(result).toBe(true);

      // Should no longer be timed out
      expect(tracker.checkTimeouts()).toHaveLength(0);

      // Retry count incremented
      expect(tracker.get('msg-a1b2c3d4')!.retries).toBe(1);
    });

    it('returns false for retry on untracked message', () => {
      const tracker = new TimeoutTracker();
      expect(tracker.recordRetry('msg-nonexist')).toBe(false);
    });

    it('detects when max retries exceeded', () => {
      const tracker = new TimeoutTracker({ maxRetries: 1 });
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      expect(tracker.hasExceededRetries('msg-a1b2c3d4')).toBe(false);

      tracker.recordRetry('msg-a1b2c3d4');
      expect(tracker.hasExceededRetries('msg-a1b2c3d4')).toBe(true);
    });

    it('returns false for exceededRetries on untracked message', () => {
      const tracker = new TimeoutTracker();
      expect(tracker.hasExceededRetries('msg-nonexist')).toBe(false);
    });
  });

  describe('getAllPending', () => {
    it('returns all pending entries', () => {
      const tracker = new TimeoutTracker();
      tracker.track('msg-aaa11111', 'alex/backend-dev');
      tracker.track('msg-bbb22222', 'bob/frontend-dev');

      const pending = tracker.getAllPending();
      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.messageId)).toContain('msg-aaa11111');
      expect(pending.map((p) => p.messageId)).toContain('msg-bbb22222');
    });

    it('returns empty array when no pending entries', () => {
      const tracker = new TimeoutTracker();
      expect(tracker.getAllPending()).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('removes a tracked entry', () => {
      const tracker = new TimeoutTracker();
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      expect(tracker.remove('msg-a1b2c3d4')).toBe(true);
      expect(tracker.isPending('msg-a1b2c3d4')).toBe(false);
    });

    it('returns false for untracked entry', () => {
      const tracker = new TimeoutTracker();
      expect(tracker.remove('msg-nonexist')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const tracker = new TimeoutTracker();
      tracker.track('msg-aaa11111', 'alex/backend-dev');
      tracker.track('msg-bbb22222', 'bob/frontend-dev');

      tracker.clear();
      expect(tracker.size).toBe(0);
      expect(tracker.getAllPending()).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = makeTempDir();
      await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('persists tracking state to disk', async () => {
      const persistPath = join(tempDir, 'pending-acks.json');
      const tracker = new TimeoutTracker({ persistPath });

      tracker.track('msg-a1b2c3d4', 'alex/backend-dev', 'thr-abc12345');
      tracker.track('msg-e5f6a7b8', 'bob/frontend-dev');

      await tracker.persist();

      const content = JSON.parse(await readFile(persistPath, 'utf-8'));
      expect(content.entries).toHaveLength(2);
      expect(content.persistedAt).toBeDefined();
    });

    it('restores tracking state from disk', async () => {
      const persistPath = join(tempDir, 'pending-acks.json');

      // Persist
      const tracker1 = new TimeoutTracker({
        persistPath,
        defaultTimeoutMs: 300000,
      });
      tracker1.track('msg-a1b2c3d4', 'alex/backend-dev', 'thr-abc12345');
      await tracker1.persist();

      // Restore
      const tracker2 = new TimeoutTracker({ persistPath });
      const restored = await tracker2.restore();

      expect(restored).toBe(1);
      expect(tracker2.isPending('msg-a1b2c3d4')).toBe(true);
      expect(tracker2.get('msg-a1b2c3d4')!.target).toBe('alex/backend-dev');
    });

    it('skips expired entries on restore', async () => {
      const persistPath = join(tempDir, 'pending-acks.json');

      // Persist with short timeout
      const tracker1 = new TimeoutTracker({
        persistPath,
        defaultTimeoutMs: 1, // 1ms timeout -- will expire instantly
      });
      tracker1.track('msg-expired1', 'alex/backend-dev');
      // Wait for it to actually expire
      await new Promise((r) => setTimeout(r, 10));
      await tracker1.persist();

      // Restore
      const tracker2 = new TimeoutTracker({ persistPath });
      const restored = await tracker2.restore();

      expect(restored).toBe(0);
      expect(tracker2.isPending('msg-expired1')).toBe(false);
    });

    it('handles missing persist file gracefully', async () => {
      const persistPath = join(tempDir, 'nonexistent.json');
      const tracker = new TimeoutTracker({ persistPath });
      const restored = await tracker.restore();
      expect(restored).toBe(0);
    });

    it('does nothing on persist/restore without persistPath', async () => {
      const tracker = new TimeoutTracker();
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      // These should not throw
      await tracker.persist();
      const restored = await tracker.restore();
      expect(restored).toBe(0);
    });
  });

  describe('default timeout is 5 minutes', () => {
    it('uses 300000ms as default timeout', () => {
      const tracker = new TimeoutTracker();
      tracker.track('msg-a1b2c3d4', 'alex/backend-dev');

      const entry = tracker.get('msg-a1b2c3d4')!;
      expect(entry.timeoutMs).toBe(300000); // 5 * 60 * 1000
    });
  });
});
