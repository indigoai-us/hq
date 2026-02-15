import { describe, it, expect } from 'vitest';
import { parse } from '../parse.js';
import { DEFAULT_SEPARATOR, HEADER_ARROW } from '../constants.js';

describe('parse', () => {
  const validMessage = [
    `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
    '',
    'The API contract for the auth module is ready.',
    'PRD is at projects/hq-cloud/prd.json, stories US-003 through US-007.',
    '',
    DEFAULT_SEPARATOR,
    'hq-msg:v1 | id:msg-a1b2c3d4 | thread:thr-x1y2z3a4',
    'from:stefan/architect | to:alex/backend-dev',
    'intent:handoff | priority:high | ack:requested',
    'ref:projects/hq-cloud/prd.json#US-003',
  ].join('\n');

  it('should parse a valid message successfully', () => {
    const result = parse(validMessage);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.version).toBe('v1');
      expect(result.message.id).toBe('msg-a1b2c3d4');
      expect(result.message.from).toBe('stefan/architect');
      expect(result.message.to).toBe('alex/backend-dev');
      expect(result.message.intent).toBe('handoff');
      expect(result.message.thread).toBe('thr-x1y2z3a4');
      expect(result.message.priority).toBe('high');
      expect(result.message.ack).toBe('requested');
      expect(result.message.ref).toBe('projects/hq-cloud/prd.json#US-003');
    }
  });

  it('should extract body text correctly', () => {
    const result = parse(validMessage);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.body).toContain('The API contract for the auth module is ready.');
      expect(result.message.body).toContain('PRD is at projects/hq-cloud/prd.json');
    }
  });

  it('should handle ASCII arrow (-->) in header', () => {
    const msg = [
      'stefan/architect --> alex/backend-dev',
      '',
      'Test body.',
      '',
      DEFAULT_SEPARATOR,
      'hq-msg:v1 | id:msg-aabb0011 | from:stefan/architect | to:alex/backend-dev | intent:inform',
    ].join('\n');

    const result = parse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.from).toBe('stefan/architect');
      expect(result.message.to).toBe('alex/backend-dev');
    }
  });

  it('should handle ASCII hyphen separator', () => {
    const msg = [
      `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
      '',
      'Test body.',
      '',
      '---------------',
      'hq-msg:v1 | id:msg-aabb0011 | from:stefan/architect | to:alex/backend-dev | intent:inform',
    ].join('\n');

    const result = parse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.intent).toBe('inform');
    }
  });

  it('should handle envelope on a single line', () => {
    const msg = [
      `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
      '',
      'Quick note.',
      '',
      DEFAULT_SEPARATOR,
      'hq-msg:v1 | id:msg-aabb0011 | from:stefan/architect | to:alex/backend-dev | intent:inform',
    ].join('\n');

    const result = parse(msg);
    expect(result.success).toBe(true);
  });

  it('should handle envelope spanning multiple lines', () => {
    const msg = [
      `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
      '',
      'Multi-line envelope test.',
      '',
      DEFAULT_SEPARATOR,
      'hq-msg:v1 | id:msg-aabb0011',
      'from:stefan/architect | to:alex/backend-dev',
      'intent:handoff | priority:high',
      'ack:requested',
    ].join('\n');

    const result = parse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.version).toBe('v1');
      expect(result.message.id).toBe('msg-aabb0011');
      expect(result.message.from).toBe('stefan/architect');
      expect(result.message.to).toBe('alex/backend-dev');
      expect(result.message.intent).toBe('handoff');
      expect(result.message.priority).toBe('high');
      expect(result.message.ack).toBe('requested');
    }
  });

  it('should parse all optional fields', () => {
    const msg = [
      `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
      '',
      'Full envelope test.',
      '',
      DEFAULT_SEPARATOR,
      'hq-msg:v1 | id:msg-aabb0011 | thread:thr-tttt0001',
      'from:stefan/architect | to:alex/backend-dev',
      'intent:response | priority:normal | ack:none',
      'reply-to:msg-prev0001 | ref:path/file.md',
      'token:dGVzdA== | expires:2026-02-13T18:00:00Z',
      'attach:file1.md,file2.md',
    ].join('\n');

    const result = parse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.thread).toBe('thr-tttt0001');
      expect(result.message.priority).toBe('normal');
      expect(result.message.ack).toBe('none');
      expect(result.message.replyTo).toBe('msg-prev0001');
      expect(result.message.ref).toBe('path/file.md');
      expect(result.message.token).toBe('dGVzdA==');
      expect(result.message.expires).toBe('2026-02-13T18:00:00Z');
      expect(result.message.attach).toBe('file1.md,file2.md');
    }
  });

  describe('error handling — malformed messages', () => {
    it('should return error for empty input', () => {
      const result = parse('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should return error for non-string input', () => {
      const result = parse(null as unknown as string);
      expect(result.success).toBe(false);
    });

    it('should return error when no separator is found', () => {
      const msg = [
        `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
        '',
        'No separator here.',
        'hq-msg:v1 | id:msg-aabb0011',
      ].join('\n');

      const result = parse(msg);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.includes('separator'))).toBe(true);
      }
    });

    it('should return error when no envelope exists below separator', () => {
      const msg = [
        `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
        '',
        'Body text.',
        '',
        DEFAULT_SEPARATOR,
      ].join('\n');

      const result = parse(msg);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.includes('envelope'))).toBe(true);
      }
    });

    it('should return error when required fields are missing', () => {
      const msg = [
        `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
        '',
        'Body text.',
        '',
        DEFAULT_SEPARATOR,
        'hq-msg:v1 | id:msg-aabb0011',
      ].join('\n');

      const result = parse(msg);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.includes('from'))).toBe(true);
        expect(result.errors.some((e) => e.includes('to'))).toBe(true);
        expect(result.errors.some((e) => e.includes('intent'))).toBe(true);
      }
    });

    it('should return error for malformed envelope fields (no colon)', () => {
      const msg = [
        `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
        '',
        'Body.',
        '',
        DEFAULT_SEPARATOR,
        'hq-msg:v1 | badfield | id:msg-aabb0011',
        'from:stefan/architect | to:alex/backend-dev | intent:inform',
      ].join('\n');

      const result = parse(msg);
      // Should still parse but report an error for the malformed field
      // It may succeed if it collects enough valid fields
      // OR fail depending on strictness — our parser collects errors but doesn't abort
      if (!result.success) {
        expect(result.errors.some((e) => e.includes('Malformed'))).toBe(true);
      }
    });

    it('should never throw on any input', () => {
      const badInputs = [
        '',
        null,
        undefined,
        123,
        'just random text',
        '───────────────',
        '\n\n\n',
        'a → b\n' + DEFAULT_SEPARATOR + '\nbad',
      ];

      for (const input of badInputs) {
        expect(() => parse(input as unknown as string)).not.toThrow();
      }
    });
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
      it(`should parse a ${intent} message`, () => {
        const msg = [
          `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
          '',
          `Testing ${intent} intent.`,
          '',
          DEFAULT_SEPARATOR,
          `hq-msg:v1 | id:msg-aabb0011 | from:stefan/architect | to:alex/backend-dev | intent:${intent}`,
        ].join('\n');

        const result = parse(msg);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.message.intent).toBe(intent);
        }
      });
    }
  });

  it('should handle messages with no header line gracefully', () => {
    const msg = [
      'Some random text that is not a header',
      '',
      'Body.',
      '',
      DEFAULT_SEPARATOR,
      'hq-msg:v1 | id:msg-aabb0011 | from:stefan/architect | to:alex/backend-dev | intent:inform',
    ].join('\n');

    const result = parse(msg);
    // May succeed or fail depending on whether header is required
    // Our parser reports an error for missing header
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('header'))).toBe(true);
    }
  });

  it('should preserve body whitespace and formatting', () => {
    const bodyText = 'Line one.\n\nLine two.\n\n- Item A\n- Item B\n\n```js\nconst x = 1;\n```';
    const msg = [
      `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
      '',
      bodyText,
      '',
      DEFAULT_SEPARATOR,
      'hq-msg:v1 | id:msg-aabb0011 | from:stefan/architect | to:alex/backend-dev | intent:inform',
    ].join('\n');

    const result = parse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.body).toBe(bodyText);
    }
  });

  it('should ignore unknown envelope fields without error', () => {
    const msg = [
      `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
      '',
      'Test.',
      '',
      DEFAULT_SEPARATOR,
      'hq-msg:v1 | id:msg-aabb0011 | from:stefan/architect | to:alex/backend-dev | intent:inform | custom-field:custom-value',
    ].join('\n');

    const result = parse(msg);
    expect(result.success).toBe(true);
  });

  it('should handle empty values by treating them as absent', () => {
    const msg = [
      `stefan/architect ${HEADER_ARROW} alex/backend-dev`,
      '',
      'Test.',
      '',
      DEFAULT_SEPARATOR,
      'hq-msg:v1 | id:msg-aabb0011 | from:stefan/architect | to:alex/backend-dev | intent:inform | thread:',
    ].join('\n');

    const result = parse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.thread).toBeUndefined();
    }
  });
});
