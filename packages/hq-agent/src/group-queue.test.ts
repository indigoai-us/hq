import { describe, it, expect, vi } from 'vitest';
import { GroupQueue } from './group-queue.js';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe('GroupQueue', () => {
  it('runs a single job', async () => {
    const q = new GroupQueue(3);
    const executed: number[] = [];

    q.enqueue({
      groupId: 'g1',
      messageId: 1,
      run: async () => {
        executed.push(1);
      },
    });

    await q.drain();
    expect(executed).toEqual([1]);
  });

  it('serializes jobs within the same group', async () => {
    const q = new GroupQueue(3);
    const order: number[] = [];

    q.enqueue({
      groupId: 'g1',
      messageId: 1,
      run: async () => {
        await delay(30);
        order.push(1);
      },
    });

    q.enqueue({
      groupId: 'g1',
      messageId: 2,
      run: async () => {
        order.push(2);
      },
    });

    await q.drain();
    // Job 2 must run after job 1 within the same group
    expect(order).toEqual([1, 2]);
  });

  it('runs jobs from different groups concurrently', async () => {
    const q = new GroupQueue(3);
    const started: number[] = [];

    let resolve1!: () => void;
    let resolve2!: () => void;

    const p1 = new Promise<void>((r) => {
      resolve1 = r;
    });
    const p2 = new Promise<void>((r) => {
      resolve2 = r;
    });

    q.enqueue({
      groupId: 'g1',
      messageId: 1,
      run: async () => {
        started.push(1);
        await p1;
      },
    });

    q.enqueue({
      groupId: 'g2',
      messageId: 2,
      run: async () => {
        started.push(2);
        await p2;
      },
    });

    // Give microtasks a moment to start both jobs
    await delay(10);

    expect(started).toContain(1);
    expect(started).toContain(2);
    expect(q.active).toBe(2);

    resolve1();
    resolve2();
    await q.drain();
  });

  it('respects MAX_CONCURRENT_CONTAINERS global cap', async () => {
    const q = new GroupQueue(2); // only 2 concurrent
    let maxSeen = 0;

    // Pre-create all promise/resolver pairs so we control them from outside
    const pairs: Array<{ resolve: () => void; promise: Promise<void> }> = [];
    for (let i = 0; i < 4; i++) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => { resolve = r; });
      pairs.push({ resolve, promise });
    }

    for (let i = 0; i < 4; i++) {
      q.enqueue({
        groupId: `g${i}`,
        messageId: i,
        run: async () => {
          maxSeen = Math.max(maxSeen, q.active);
          await pairs[i].promise;
        },
      });
    }

    // Allow first batch to start
    await delay(10);
    expect(q.active).toBe(2);

    // Resolve all
    pairs.forEach((p) => p.resolve());
    await q.drain();

    expect(maxSeen).toBeLessThanOrEqual(2);
  }, 15000);

  it('active count is 0 before any jobs', () => {
    const q = new GroupQueue(3);
    expect(q.active).toBe(0);
    expect(q.pending).toBe(0);
    expect(q.depth).toBe(0);
  });

  it('pending count decrements as jobs run', async () => {
    const q = new GroupQueue(1); // only 1 at a time globally

    let resolve1!: () => void;
    const p1 = new Promise<void>((r) => { resolve1 = r; });

    q.enqueue({
      groupId: 'g1',
      messageId: 1,
      run: async () => { await p1; },
    });

    q.enqueue({
      groupId: 'g2',
      messageId: 2,
      run: async () => {},
    });

    await delay(10);

    // 1 running (g1), 1 pending (g2)
    expect(q.active).toBe(1);
    expect(q.pending).toBe(1);

    resolve1();
    await q.drain();

    expect(q.active).toBe(0);
    expect(q.pending).toBe(0);
  });

  it('handles job failure without blocking next job in group', async () => {
    const q = new GroupQueue(3);
    const results: string[] = [];

    q.enqueue({
      groupId: 'g1',
      messageId: 1,
      run: async () => {
        results.push('fail');
        throw new Error('job failed');
      },
    });

    q.enqueue({
      groupId: 'g1',
      messageId: 2,
      run: async () => {
        results.push('ok');
      },
    });

    await q.drain();
    expect(results).toEqual(['fail', 'ok']);
  });

  it('drain resolves when nothing is queued', async () => {
    const q = new GroupQueue(3);
    await expect(q.drain()).resolves.toBeUndefined();
  });

  it('depth equals active + pending', async () => {
    const q = new GroupQueue(1);

    // Pre-create resolver pairs
    const pairs: Array<{ resolve: () => void; promise: Promise<void> }> = [];
    for (let i = 0; i < 3; i++) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => { resolve = r; });
      pairs.push({ resolve, promise });
    }

    for (let i = 0; i < 3; i++) {
      q.enqueue({
        groupId: `g${i}`,
        messageId: i,
        run: async () => {
          await pairs[i].promise;
        },
      });
    }

    await delay(10);
    expect(q.depth).toBe(q.active + q.pending);

    pairs.forEach((p) => p.resolve());
    await q.drain();
  }, 15000);
});
