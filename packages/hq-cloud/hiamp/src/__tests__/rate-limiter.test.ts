import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should execute immediately when channel is free', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 1000 });
    const fn = vi.fn().mockResolvedValue('result');

    const promise = limiter.enqueue('C0TEST', fn);
    // Let the queue process
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should delay messages that come too fast', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 1000 });
    const results: number[] = [];
    let callCount = 0;

    const fn1 = vi.fn().mockImplementation(async () => {
      callCount++;
      results.push(callCount);
      return `result-${callCount}`;
    });

    // Enqueue two messages on the same channel
    const p1 = limiter.enqueue('C0TEST', fn1);
    const p2 = limiter.enqueue('C0TEST', fn1);

    // First should execute immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([1]);

    // Second should be delayed by 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    expect(results).toEqual([1, 2]);

    const r1 = await p1;
    const r2 = await p2;
    expect(r1).toBe('result-1');
    expect(r2).toBe('result-2');
  });

  it('should not delay messages on different channels', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 1000 });
    const fn = vi.fn().mockResolvedValue('ok');

    const p1 = limiter.enqueue('C0CHANNEL1', fn);
    const p2 = limiter.enqueue('C0CHANNEL2', fn);

    // Both should execute without delay since they are on different channels
    await vi.advanceTimersByTimeAsync(0);

    const r1 = await p1;
    const r2 = await p2;

    expect(r1).toBe('ok');
    expect(r2).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should propagate errors from the execute function', async () => {
    vi.useRealTimers();
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const fn = vi.fn().mockRejectedValue(new Error('Slack API error'));

    const promise = limiter.enqueue('C0TEST', fn);

    await expect(promise).rejects.toThrow('Slack API error');
    vi.useFakeTimers();
  });

  it('should report queue length', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 1000 });

    // Create a function that won't resolve immediately
    let resolveFirst: (() => void) | undefined;
    const blockingFn = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => {
        resolveFirst = () => resolve('done');
      }),
    );
    const quickFn = vi.fn().mockResolvedValue('quick');

    // First call starts processing
    const _p1 = limiter.enqueue('C0TEST', blockingFn);
    // Kick off processing
    await vi.advanceTimersByTimeAsync(0);

    // Second and third get queued
    const _p2 = limiter.enqueue('C0TEST', quickFn);
    const _p3 = limiter.enqueue('C0TEST', quickFn);

    // Queue should have the two pending items
    expect(limiter.getQueueLength('C0TEST')).toBe(2);

    // Complete the first
    resolveFirst?.();
    await vi.advanceTimersByTimeAsync(1000);

    expect(limiter.getQueueLength('C0TEST')).toBeLessThanOrEqual(1);
  });

  it('should return 0 queue length for unknown channel', () => {
    const limiter = new RateLimiter();
    expect(limiter.getQueueLength('C0NONEXISTENT')).toBe(0);
  });

  it('should use custom interval', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 500 });
    const results: number[] = [];
    let counter = 0;

    const fn = vi.fn().mockImplementation(async () => {
      counter++;
      results.push(counter);
      return counter;
    });

    const _p1 = limiter.enqueue('C0TEST', fn);
    const _p2 = limiter.enqueue('C0TEST', fn);

    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([1]);

    await vi.advanceTimersByTimeAsync(500);
    expect(results).toEqual([1, 2]);
  });

  it('should reset all state', async () => {
    const limiter = new RateLimiter({ minIntervalMs: 1000 });
    const fn = vi.fn().mockResolvedValue('ok');

    const promise = limiter.enqueue('C0TEST', fn);
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    limiter.reset();
    expect(limiter.getQueueLength('C0TEST')).toBe(0);
  });
});
