import { describe, it, expect } from 'vitest';
import { detectHiampMessage } from '../message-detector.js';
import type { SlackMessageEvent } from '../message-detector.js';
import { DEFAULT_SEPARATOR, HEADER_ARROW } from '../constants.js';

/** Build a minimal HIAMP message text for testing */
function makeHiampText(overrides?: { header?: string; body?: string; separator?: string; envelope?: string }): string {
  const header = overrides?.header ?? `stefan/architect ${HEADER_ARROW} alex/backend-dev`;
  const body = overrides?.body ?? 'The API contract is ready.';
  const separator = overrides?.separator ?? DEFAULT_SEPARATOR;
  const envelope = overrides?.envelope ?? 'hq-msg:v1 | id:msg-a1b2c3d4 | from:stefan/architect | to:alex/backend-dev | intent:handoff';

  return `${header}\n\n${body}\n\n${separator}\n${envelope}`;
}

/** Build a minimal Slack message event */
function makeEvent(overrides?: Partial<SlackMessageEvent>): SlackMessageEvent {
  return {
    text: makeHiampText(),
    user: 'U0OTHER',
    channel: 'C0HQAGENTS',
    ts: '1234567890.123456',
    ...overrides,
  };
}

describe('message-detector', () => {
  describe('detectHiampMessage', () => {
    it('detects a valid HIAMP message', () => {
      const result = detectHiampMessage(makeEvent());
      expect(result.isHiamp).toBe(true);
      expect(result.reason).toContain('HIAMP separator and header');
    });

    it('detects HIAMP with ASCII fallback separator (hyphens)', () => {
      const text = makeHiampText({ separator: '-------------------' });
      const result = detectHiampMessage(makeEvent({ text }));
      expect(result.isHiamp).toBe(true);
    });

    it('detects HIAMP with ASCII fallback arrow (-->)', () => {
      const text = makeHiampText({ header: 'stefan/architect --> alex/backend-dev' });
      const result = detectHiampMessage(makeEvent({ text }));
      expect(result.isHiamp).toBe(true);
    });

    it('rejects messages with no text', () => {
      const result = detectHiampMessage(makeEvent({ text: undefined }));
      expect(result.isHiamp).toBe(false);
      expect(result.reason).toContain('No text content');
    });

    it('rejects messages with empty text', () => {
      const result = detectHiampMessage(makeEvent({ text: '' }));
      expect(result.isHiamp).toBe(false);
      expect(result.reason).toContain('No text content');
    });

    it('rejects messages with whitespace-only text', () => {
      const result = detectHiampMessage(makeEvent({ text: '   \n\n  ' }));
      expect(result.isHiamp).toBe(false);
      expect(result.reason).toContain('No text content');
    });

    it('rejects regular Slack messages without separator', () => {
      const result = detectHiampMessage(makeEvent({ text: 'Hey team, the deploy is done!' }));
      expect(result.isHiamp).toBe(false);
      expect(result.reason).toContain('No HIAMP separator');
    });

    it('rejects messages with separator but no header', () => {
      const text = `Just some text\n\n${DEFAULT_SEPARATOR}\nsome:field`;
      const result = detectHiampMessage(makeEvent({ text }));
      expect(result.isHiamp).toBe(false);
      expect(result.reason).toContain('No HIAMP header');
    });

    it('rejects messages with fewer than 15 separator chars', () => {
      const text = makeHiampText({ separator: '----------' }); // only 10
      const result = detectHiampMessage(makeEvent({ text }));
      expect(result.isHiamp).toBe(false);
      expect(result.reason).toContain('No HIAMP separator');
    });

    it('filters out messages from local bot (echo prevention)', () => {
      const result = detectHiampMessage(makeEvent({ user: 'U0MYBOT' }), 'U0MYBOT');
      expect(result.isHiamp).toBe(false);
      expect(result.reason).toContain('echo prevention');
    });

    it('filters out messages by bot_id match', () => {
      const result = detectHiampMessage(makeEvent({ bot_id: 'U0MYBOT' }), 'U0MYBOT');
      expect(result.isHiamp).toBe(false);
      expect(result.reason).toContain('echo prevention');
    });

    it('does not filter messages from other bots', () => {
      const result = detectHiampMessage(
        makeEvent({ user: 'U0OTHERBOT' }),
        'U0MYBOT',
      );
      expect(result.isHiamp).toBe(true);
    });

    it('filters out ignored subtypes', () => {
      const subtypes = [
        'message_changed',
        'message_deleted',
        'channel_join',
        'channel_leave',
        'channel_topic',
        'channel_purpose',
        'pinned_item',
      ];

      for (const subtype of subtypes) {
        const result = detectHiampMessage(makeEvent({ subtype }));
        expect(result.isHiamp).toBe(false);
        expect(result.reason).toContain('Ignored message subtype');
      }
    });

    it('accepts bot_message subtype (not in ignore list)', () => {
      const result = detectHiampMessage(makeEvent({ subtype: 'bot_message' }));
      expect(result.isHiamp).toBe(true);
    });

    it('works without localBotId (no echo filtering)', () => {
      // Should still detect HIAMP based on content
      const result = detectHiampMessage(makeEvent());
      expect(result.isHiamp).toBe(true);
    });

    it('handles messages with extra whitespace around separator', () => {
      const text = makeHiampText({ separator: `  ${DEFAULT_SEPARATOR}  ` });
      const result = detectHiampMessage(makeEvent({ text }));
      expect(result.isHiamp).toBe(true);
    });
  });
});
