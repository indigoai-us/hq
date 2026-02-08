import { describe, it, expect } from 'vitest';
import { EventQueue } from '../daemon/event-queue.js';
import type { FileEvent } from '../daemon/types.js';

function makeEvent(relativePath: string, type: FileEvent['type'] = 'change'): FileEvent {
  return {
    type,
    absolutePath: `/hq/${relativePath}`,
    relativePath,
    timestamp: Date.now(),
  };
}

describe('EventQueue', () => {
  it('should start empty', () => {
    const queue = new EventQueue();
    expect(queue.size).toBe(0);
  });

  it('should accept pushed events', () => {
    const queue = new EventQueue();
    queue.push(makeEvent('file.txt'));

    expect(queue.size).toBe(1);
  });

  it('should drain all events and clear the queue', () => {
    const queue = new EventQueue();
    queue.push(makeEvent('a.txt'));
    queue.push(makeEvent('b.txt'));
    queue.push(makeEvent('c.txt'));

    const drained = queue.drain();

    expect(drained).toHaveLength(3);
    expect(queue.size).toBe(0);
  });

  it('should deduplicate events by relative path', () => {
    const queue = new EventQueue();
    const event1 = makeEvent('file.txt', 'add');
    const event2 = makeEvent('file.txt', 'change');

    queue.push(event1);
    queue.push(event2);

    expect(queue.size).toBe(1);

    const drained = queue.drain();
    expect(drained).toHaveLength(1);
    // Latest event wins
    expect(drained[0]?.type).toBe('change');
  });

  it('should keep events for different paths separate', () => {
    const queue = new EventQueue();
    queue.push(makeEvent('a.txt'));
    queue.push(makeEvent('b.txt'));

    expect(queue.size).toBe(2);
  });

  it('should peek without removing events', () => {
    const queue = new EventQueue();
    queue.push(makeEvent('file.txt'));

    const peeked = queue.peek();
    expect(peeked).toHaveLength(1);
    expect(queue.size).toBe(1);
  });

  it('should clear all events', () => {
    const queue = new EventQueue();
    queue.push(makeEvent('a.txt'));
    queue.push(makeEvent('b.txt'));

    queue.clear();

    expect(queue.size).toBe(0);
  });

  it('should report has() correctly', () => {
    const queue = new EventQueue();
    queue.push(makeEvent('exists.txt'));

    expect(queue.has('exists.txt')).toBe(true);
    expect(queue.has('missing.txt')).toBe(false);
  });

  it('should return empty array when draining an empty queue', () => {
    const queue = new EventQueue();
    const drained = queue.drain();

    expect(drained).toHaveLength(0);
  });

  it('should handle replace after delete for same path', () => {
    const queue = new EventQueue();
    queue.push(makeEvent('file.txt', 'unlink'));
    queue.push(makeEvent('file.txt', 'add'));

    const drained = queue.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.type).toBe('add');
  });

  it('should handle large number of unique events', () => {
    const queue = new EventQueue();
    for (let i = 0; i < 1000; i++) {
      queue.push(makeEvent(`file-${String(i)}.txt`));
    }

    expect(queue.size).toBe(1000);

    const drained = queue.drain();
    expect(drained).toHaveLength(1000);
    expect(queue.size).toBe(0);
  });

  it('should maintain correct size after mixed operations', () => {
    const queue = new EventQueue();
    queue.push(makeEvent('a.txt'));
    queue.push(makeEvent('b.txt'));
    queue.push(makeEvent('a.txt', 'unlink'));  // Replaces a.txt event

    expect(queue.size).toBe(2);

    queue.drain();
    expect(queue.size).toBe(0);

    queue.push(makeEvent('c.txt'));
    expect(queue.size).toBe(1);
  });
});
