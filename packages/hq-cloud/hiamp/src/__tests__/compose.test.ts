import { describe, it, expect } from 'vitest';
import { compose } from '../compose.js';
import type { ComposeInput } from '../types.js';
import { HEADER_ARROW, DEFAULT_SEPARATOR, PROTOCOL_VERSION } from '../constants.js';

describe('compose', () => {
  const baseInput: ComposeInput = {
    from: 'stefan/architect',
    to: 'alex/backend-dev',
    intent: 'handoff',
    body: 'The API contract is ready.',
  };

  it('should produce a header line with from → to', () => {
    const result = compose({ ...baseInput, id: 'msg-aabbcc11' });
    const firstLine = result.split('\n')[0];
    expect(firstLine).toBe(`stefan/architect ${HEADER_ARROW} alex/backend-dev`);
  });

  it('should include the body text', () => {
    const result = compose({ ...baseInput, id: 'msg-aabbcc11' });
    expect(result).toContain('The API contract is ready.');
  });

  it('should include the separator line', () => {
    const result = compose({ ...baseInput, id: 'msg-aabbcc11' });
    expect(result).toContain(DEFAULT_SEPARATOR);
  });

  it('should include required envelope fields', () => {
    const result = compose({ ...baseInput, id: 'msg-aabbcc11' });
    expect(result).toContain('hq-msg:v1');
    expect(result).toContain('id:msg-aabbcc11');
    expect(result).toContain('from:stefan/architect');
    expect(result).toContain('to:alex/backend-dev');
    expect(result).toContain('intent:handoff');
  });

  it('should auto-generate an ID if not provided', () => {
    const result = compose(baseInput);
    expect(result).toMatch(/id:msg-[a-f0-9]{8}/);
  });

  it('should use v1 as default version', () => {
    const result = compose({ ...baseInput, id: 'msg-aabbcc11' });
    expect(result).toContain(`hq-msg:${PROTOCOL_VERSION}`);
  });

  it('should include optional fields when provided', () => {
    const result = compose({
      ...baseInput,
      id: 'msg-aabbcc11',
      thread: 'thr-xxyyzz11',
      priority: 'high',
      ack: 'requested',
      ref: 'projects/hq-cloud/prd.json',
      replyTo: 'msg-prev0001',
      expires: '2026-02-13T18:00:00Z',
      attach: 'knowledge/testing.md',
    });

    expect(result).toContain('thread:thr-xxyyzz11');
    expect(result).toContain('priority:high');
    expect(result).toContain('ack:requested');
    expect(result).toContain('ref:projects/hq-cloud/prd.json');
    expect(result).toContain('reply-to:msg-prev0001');
    expect(result).toContain('expires:2026-02-13T18:00:00Z');
    expect(result).toContain('attach:knowledge/testing.md');
  });

  it('should omit optional fields when not provided', () => {
    const result = compose({ ...baseInput, id: 'msg-aabbcc11' });
    expect(result).not.toContain('thread:');
    expect(result).not.toContain('priority:');
    expect(result).not.toContain('ack:');
    expect(result).not.toContain('ref:');
    expect(result).not.toContain('reply-to:');
    expect(result).not.toContain('expires:');
    expect(result).not.toContain('attach:');
    expect(result).not.toContain('token:');
  });

  it('should include token when provided', () => {
    const result = compose({
      ...baseInput,
      id: 'msg-aabbcc11',
      token: 'dGVzdC10b2tlbg==',
    });
    expect(result).toContain('token:dGVzdC10b2tlbg==');
  });

  describe('all 8 intent types', () => {
    const intents = [
      'handoff',
      'request',
      'inform',
      'acknowledge',
      'query',
      'response',
      'error',
      'share',
    ] as const;

    for (const intent of intents) {
      it(`should compose a ${intent} message`, () => {
        const result = compose({
          ...baseInput,
          id: 'msg-aabbcc11',
          intent,
        });
        expect(result).toContain(`intent:${intent}`);
      });
    }
  });

  it('should handle multiline body', () => {
    const result = compose({
      ...baseInput,
      id: 'msg-aabbcc11',
      body: 'Line one.\n\nLine two.\n\n- Item A\n- Item B',
    });
    expect(result).toContain('Line one.\n\nLine two.\n\n- Item A\n- Item B');
  });

  it('should produce correct message structure order', () => {
    const result = compose({ ...baseInput, id: 'msg-aabbcc11' });
    const lines = result.split('\n');

    // First line is header
    expect(lines[0]).toContain(HEADER_ARROW);

    // Second line is blank (between header and body)
    expect(lines[1]).toBe('');

    // Body is present
    const separatorIdx = lines.findIndex((l) => l === DEFAULT_SEPARATOR);
    expect(separatorIdx).toBeGreaterThan(1);

    // Line before separator is blank
    expect(lines[separatorIdx - 1]).toBe('');

    // Envelope is after separator
    expect(lines[separatorIdx + 1]).toContain('hq-msg:v1');
  });
});
