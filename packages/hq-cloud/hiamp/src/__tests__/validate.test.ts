import { describe, it, expect } from 'vitest';
import { validate } from '../validate.js';
import type { HiampMessage } from '../types.js';

describe('validate', () => {
  const validMessage: HiampMessage = {
    version: 'v1',
    id: 'msg-a1b2c3d4',
    from: 'stefan/architect',
    to: 'alex/backend-dev',
    intent: 'handoff',
    body: 'The API contract is ready.',
  };

  it('should pass for a valid minimal message', () => {
    const result = validate(validMessage);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should pass for a valid message with all optional fields', () => {
    const result = validate({
      ...validMessage,
      thread: 'thr-x1y2z3a4',
      priority: 'high',
      ack: 'requested',
      ref: 'projects/hq-cloud/prd.json',
      token: 'dGVzdA==',
      replyTo: 'msg-prev0001',
      expires: '2026-02-13T18:00:00Z',
      attach: 'file1.md,file2.md',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  describe('required fields', () => {
    it('should fail when version is missing', () => {
      const result = validate({ ...validMessage, version: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'version')).toBe(true);
    });

    it('should fail when id is missing', () => {
      const result = validate({ ...validMessage, id: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('should fail when from is missing', () => {
      const result = validate({ ...validMessage, from: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'from')).toBe(true);
    });

    it('should fail when to is missing', () => {
      const result = validate({ ...validMessage, to: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'to')).toBe(true);
    });

    it('should fail when intent is missing', () => {
      const result = validate({ ...validMessage, intent: '' as never });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'intent')).toBe(true);
    });
  });

  describe('version validation', () => {
    it('should fail for unsupported version', () => {
      const result = validate({ ...validMessage, version: 'v2' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'version' && e.message.includes('v2'))).toBe(
        true,
      );
    });
  });

  describe('message ID format', () => {
    it('should fail for ID without msg- prefix', () => {
      const result = validate({ ...validMessage, id: 'a1b2c3d4' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('should fail for ID with too few characters', () => {
      const result = validate({ ...validMessage, id: 'msg-abc' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('should fail for ID with too many characters', () => {
      const result = validate({ ...validMessage, id: 'msg-a1b2c3d4e5f6g' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('should fail for ID with uppercase characters', () => {
      const result = validate({ ...validMessage, id: 'msg-A1B2C3D4' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'id')).toBe(true);
    });
  });

  describe('worker address format', () => {
    it('should fail for address without slash', () => {
      const result = validate({ ...validMessage, from: 'stefanarchitect' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'from')).toBe(true);
    });

    it('should fail for address with uppercase', () => {
      const result = validate({ ...validMessage, from: 'Stefan/Architect' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'from')).toBe(true);
    });

    it('should fail for address with single-char parts', () => {
      const result = validate({ ...validMessage, from: 's/a' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'from')).toBe(true);
    });

    it('should fail for address exceeding max length', () => {
      const longOwner = 'a'.repeat(32);
      const longWorker = 'b'.repeat(32);
      const result = validate({ ...validMessage, to: `${longOwner}/${longWorker}` });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'to' && e.message.includes('too long'))).toBe(
        true,
      );
    });

    it('should accept valid addresses with hyphens', () => {
      const result = validate({
        ...validMessage,
        from: 'my-owner/my-worker-id',
        to: 'your-owner/your-worker',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('intent validation', () => {
    const validIntents = [
      'handoff',
      'request',
      'inform',
      'acknowledge',
      'query',
      'response',
      'error',
      'share',
    ] as const;

    for (const intent of validIntents) {
      it(`should accept "${intent}" as valid intent`, () => {
        const result = validate({ ...validMessage, intent });
        expect(result.valid).toBe(true);
      });
    }

    it('should fail for unknown intent type', () => {
      const result = validate({ ...validMessage, intent: 'unknown' as never });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'intent' && e.message.includes('unknown')),
      ).toBe(true);
    });
  });

  describe('optional field validation', () => {
    it('should fail for invalid thread ID format', () => {
      const result = validate({ ...validMessage, thread: 'bad-thread' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'thread')).toBe(true);
    });

    it('should accept valid thread ID', () => {
      const result = validate({ ...validMessage, thread: 'thr-aabb0011' });
      expect(result.valid).toBe(true);
    });

    it('should fail for invalid priority', () => {
      const result = validate({ ...validMessage, priority: 'critical' as never });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'priority')).toBe(true);
    });

    it('should accept all valid priorities', () => {
      for (const p of ['low', 'normal', 'high', 'urgent'] as const) {
        const result = validate({ ...validMessage, priority: p });
        expect(result.valid).toBe(true);
      }
    });

    it('should fail for invalid ack mode', () => {
      const result = validate({ ...validMessage, ack: 'always' as never });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'ack')).toBe(true);
    });

    it('should accept all valid ack modes', () => {
      for (const a of ['requested', 'optional', 'none'] as const) {
        const result = validate({ ...validMessage, ack: a });
        expect(result.valid).toBe(true);
      }
    });

    it('should fail for invalid replyTo format', () => {
      const result = validate({ ...validMessage, replyTo: 'not-a-msg-id' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'replyTo')).toBe(true);
    });

    it('should fail for invalid expires timestamp', () => {
      const result = validate({ ...validMessage, expires: 'not-a-date' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'expires')).toBe(true);
    });

    it('should accept valid expires timestamp', () => {
      const result = validate({ ...validMessage, expires: '2026-02-13T18:00:00Z' });
      expect(result.valid).toBe(true);
    });
  });

  it('should return multiple errors at once', () => {
    const result = validate({
      version: 'v99',
      id: 'bad',
      from: 'X',
      to: 'Y',
      intent: 'nope' as never,
      body: 'test',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });
});
