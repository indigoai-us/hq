import { describe, it, expect } from 'vitest';
import { compose } from '../compose.js';
import { parse } from '../parse.js';
import { validate } from '../validate.js';
import { generateMessageId, generateThreadId } from '../ids.js';
import type { ComposeInput, HiampMessage } from '../types.js';

describe('round-trip: compose then parse', () => {
  it('should round-trip a minimal message', () => {
    const input: ComposeInput = {
      id: 'msg-a1b2c3d4',
      from: 'stefan/architect',
      to: 'alex/backend-dev',
      intent: 'handoff',
      body: 'The API contract is ready.',
    };

    const raw = compose(input);
    const result = parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.version).toBe('v1');
      expect(result.message.id).toBe('msg-a1b2c3d4');
      expect(result.message.from).toBe('stefan/architect');
      expect(result.message.to).toBe('alex/backend-dev');
      expect(result.message.intent).toBe('handoff');
      expect(result.message.body).toBe('The API contract is ready.');
    }
  });

  it('should round-trip a message with all optional fields', () => {
    const input: ComposeInput = {
      id: 'msg-aabb0011',
      from: 'stefan/architect',
      to: 'alex/backend-dev',
      intent: 'response',
      body: 'Here is the full response with all the details.',
      thread: 'thr-tttt0001',
      priority: 'high',
      ack: 'requested',
      ref: 'projects/hq-cloud/prd.json#US-003',
      replyTo: 'msg-prev0001',
      expires: '2026-02-13T18:00:00Z',
      attach: 'file1.md,file2.md',
      token: 'dGVzdC10b2tlbg==',
    };

    const raw = compose(input);
    const result = parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.version).toBe('v1');
      expect(result.message.id).toBe('msg-aabb0011');
      expect(result.message.from).toBe('stefan/architect');
      expect(result.message.to).toBe('alex/backend-dev');
      expect(result.message.intent).toBe('response');
      expect(result.message.body).toBe('Here is the full response with all the details.');
      expect(result.message.thread).toBe('thr-tttt0001');
      expect(result.message.priority).toBe('high');
      expect(result.message.ack).toBe('requested');
      expect(result.message.ref).toBe('projects/hq-cloud/prd.json#US-003');
      expect(result.message.replyTo).toBe('msg-prev0001');
      expect(result.message.expires).toBe('2026-02-13T18:00:00Z');
      expect(result.message.attach).toBe('file1.md,file2.md');
      expect(result.message.token).toBe('dGVzdC10b2tlbg==');
    }
  });

  it('should produce a valid message after round-trip', () => {
    const input: ComposeInput = {
      id: generateMessageId(),
      from: 'stefan/architect',
      to: 'alex/backend-dev',
      intent: 'handoff',
      body: 'Work handoff.',
      thread: generateThreadId(),
      priority: 'normal',
      ack: 'requested',
    };

    const raw = compose(input);
    const result = parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      const validation = validate(result.message);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    }
  });

  describe('all 8 intent types round-trip', () => {
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
      it(`should round-trip a ${intent} message`, () => {
        const input: ComposeInput = {
          id: 'msg-aabb0011',
          from: 'stefan/architect',
          to: 'alex/backend-dev',
          intent,
          body: `Testing ${intent} round-trip.`,
        };

        const raw = compose(input);
        const result = parse(raw);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.message.intent).toBe(intent);
          expect(result.message.body).toBe(`Testing ${intent} round-trip.`);

          const validation = validate(result.message);
          expect(validation.valid).toBe(true);
        }
      });
    }
  });

  it('should round-trip multiline body with markdown', () => {
    const body = [
      'The API contract for the auth module is ready.',
      'PRD is at projects/hq-cloud/prd.json, stories US-003 through US-007.',
      '',
      'Key decisions:',
      '- Clerk for auth (JWT verification middleware)',
      '- MongoDB for session storage',
      '- WebSocket for real-time relay',
      '',
      'Can your backend-dev pick this up?',
    ].join('\n');

    const input: ComposeInput = {
      id: 'msg-a1b2c3d4',
      from: 'stefan/architect',
      to: 'alex/backend-dev',
      intent: 'handoff',
      body,
      thread: 'thr-auth0001',
      priority: 'high',
      ack: 'requested',
      ref: 'projects/hq-cloud/prd.json#US-003',
    };

    const raw = compose(input);
    const result = parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.body).toBe(body);
    }
  });

  it('should round-trip message from spec example 14.1', () => {
    const input: ComposeInput = {
      id: 'msg-a1b2c3d4',
      from: 'stefan/architect',
      to: 'alex/backend-dev',
      intent: 'handoff',
      body: [
        'The API contract for the auth module is ready.',
        'PRD is at projects/hq-cloud/prd.json, stories US-003 through US-007.',
        '',
        'Key decisions:',
        '- Clerk for auth (JWT verification middleware)',
        '- MongoDB for session storage',
        '- WebSocket for real-time relay',
        '',
        'Can your backend-dev pick this up? Priority is high -- we need the endpoints',
        'before the frontend team can start integration.',
      ].join('\n'),
      thread: 'thr-auth0001',
      priority: 'high',
      ack: 'requested',
      ref: 'projects/hq-cloud/prd.json#US-003',
    };

    const raw = compose(input);
    const result = parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      const msg = result.message;
      expect(msg.from).toBe('stefan/architect');
      expect(msg.to).toBe('alex/backend-dev');
      expect(msg.intent).toBe('handoff');
      expect(msg.thread).toBe('thr-auth0001');
      expect(msg.priority).toBe('high');
      expect(msg.ack).toBe('requested');
      expect(msg.ref).toBe('projects/hq-cloud/prd.json#US-003');

      // Validate the round-tripped message
      const validation = validate(msg);
      expect(validation.valid).toBe(true);
    }
  });

  it('should handle compose(parse(msg)) equivalence for spec example', () => {
    // Start with a composed message
    const original: ComposeInput = {
      id: 'msg-e5f6a7b8',
      from: 'alex/backend-dev',
      to: 'stefan/architect',
      intent: 'acknowledge',
      body: 'Got it. Picking up auth module implementation now.',
      thread: 'thr-auth0001',
      replyTo: 'msg-a1b2c3d4',
      ack: 'none',
    };

    const raw1 = compose(original);
    const parsed = parse(raw1);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Re-compose from the parsed message
      const recomposed: ComposeInput = {
        id: parsed.message.id,
        from: parsed.message.from,
        to: parsed.message.to,
        intent: parsed.message.intent,
        body: parsed.message.body,
        version: parsed.message.version,
        thread: parsed.message.thread,
        priority: parsed.message.priority,
        ack: parsed.message.ack,
        ref: parsed.message.ref,
        token: parsed.message.token,
        replyTo: parsed.message.replyTo,
        expires: parsed.message.expires,
        attach: parsed.message.attach,
      };

      const raw2 = compose(recomposed);
      const parsed2 = parse(raw2);

      expect(parsed2.success).toBe(true);
      if (parsed2.success) {
        // The two parsed messages should be structurally equivalent
        expect(parsed2.message.id).toBe(parsed.message.id);
        expect(parsed2.message.from).toBe(parsed.message.from);
        expect(parsed2.message.to).toBe(parsed.message.to);
        expect(parsed2.message.intent).toBe(parsed.message.intent);
        expect(parsed2.message.body).toBe(parsed.message.body);
        expect(parsed2.message.thread).toBe(parsed.message.thread);
        expect(parsed2.message.replyTo).toBe(parsed.message.replyTo);
        expect(parsed2.message.ack).toBe(parsed.message.ack);
      }
    }
  });

  it('should round-trip an error message', () => {
    const input: ComposeInput = {
      id: 'msg-err00001',
      from: 'alex/backend-dev',
      to: 'stefan/architect',
      intent: 'error',
      body: 'ERR_UNKNOWN_RECIPIENT: Worker "infra-ops" does not exist.',
      thread: 'thr-stag0001',
      replyTo: 'msg-req00001',
      ack: 'none',
    };

    const raw = compose(input);
    const result = parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.intent).toBe('error');
      expect(result.message.body).toContain('ERR_UNKNOWN_RECIPIENT');
      expect(result.message.replyTo).toBe('msg-req00001');
    }
  });

  it('should round-trip a share message with attach field', () => {
    const input: ComposeInput = {
      id: 'msg-share001',
      from: 'stefan/knowledge-curator',
      to: 'alex/qa-tester',
      intent: 'share',
      body: 'Sharing our testing knowledge doc.',
      thread: 'thr-test0001',
      ack: 'requested',
      attach: 'knowledge/testing/e2e-learnings.md',
    };

    const raw = compose(input);
    const result = parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.intent).toBe('share');
      expect(result.message.attach).toBe('knowledge/testing/e2e-learnings.md');
    }
  });
});
