import { describe, it, expect } from 'vitest';
import { generateMessageId, generateThreadId } from '../ids.js';
import { MESSAGE_ID_PATTERN, THREAD_ID_PATTERN } from '../constants.js';

describe('generateMessageId', () => {
  it('should produce an ID matching msg-{6-12 alphanumeric}', () => {
    const id = generateMessageId();
    expect(MESSAGE_ID_PATTERN.test(id)).toBe(true);
  });

  it('should start with "msg-"', () => {
    const id = generateMessageId();
    expect(id.startsWith('msg-')).toBe(true);
  });

  it('should have exactly 12 characters total (msg- + 8 hex)', () => {
    const id = generateMessageId();
    expect(id).toHaveLength(12);
  });

  it('should produce unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateMessageId());
    }
    expect(ids.size).toBe(100);
  });

  it('should only contain lowercase hex characters after prefix', () => {
    const id = generateMessageId();
    const suffix = id.slice(4);
    expect(/^[a-f0-9]+$/.test(suffix)).toBe(true);
  });
});

describe('generateThreadId', () => {
  it('should produce an ID matching thr-{6-12 alphanumeric}', () => {
    const id = generateThreadId();
    expect(THREAD_ID_PATTERN.test(id)).toBe(true);
  });

  it('should start with "thr-"', () => {
    const id = generateThreadId();
    expect(id.startsWith('thr-')).toBe(true);
  });

  it('should have exactly 12 characters total (thr- + 8 hex)', () => {
    const id = generateThreadId();
    expect(id).toHaveLength(12);
  });

  it('should produce unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateThreadId());
    }
    expect(ids.size).toBe(100);
  });
});
