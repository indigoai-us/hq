import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { Inbox, extractInlineAttachments } from '../inbox.js';
import type { HiampMessage } from '../types.js';

/** Generate a unique temp directory for each test */
function makeTempDir(): string {
  return join(tmpdir(), `hiamp-inbox-test-${randomBytes(4).toString('hex')}`);
}

/** Build a minimal HiampMessage for testing */
function makeMessage(overrides?: Partial<HiampMessage>): HiampMessage {
  return {
    version: 'v1',
    id: 'msg-a1b2c3d4',
    from: 'alex/backend-dev',
    to: 'stefan/architect',
    intent: 'handoff',
    body: 'The API contract is ready.',
    ...overrides,
  };
}

describe('inbox', () => {
  let tempDir: string;
  let inbox: Inbox;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
    inbox = new Inbox(tempDir, 'inbox');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('deliver', () => {
    it('writes a message to the worker inbox directory', async () => {
      const message = makeMessage();
      const result = await inbox.deliver(message, 'raw text', 'C0CHAN', 'U0USER', '12345.6789');

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('architect');
      expect(result.filePath).toContain('msg-a1b2c3d4.json');

      // Verify the file exists and has correct content
      const content = JSON.parse(await readFile(result.filePath!, 'utf-8'));
      expect(content.message.id).toBe('msg-a1b2c3d4');
      expect(content.message.from).toBe('alex/backend-dev');
      expect(content.rawText).toBe('raw text');
      expect(content.channelId).toBe('C0CHAN');
      expect(content.slackUserId).toBe('U0USER');
      expect(content.read).toBe(false);
      expect(content.receivedAt).toBeDefined();
    });

    it('creates inbox directory if it does not exist', async () => {
      const message = makeMessage({ to: 'stefan/qa-tester' });
      const result = await inbox.deliver(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(true);
      const files = await readdir(join(tempDir, 'inbox', 'qa-tester'));
      expect(files.length).toBe(1);
    });

    it('handles share intent with inline attachments', async () => {
      const rawText = [
        'alex/knowledge-curator \u2192 stefan/qa-tester',
        '',
        'Sharing test patterns.',
        '',
        '\ud83d\udcce knowledge/testing/patterns.md',
        '```markdown',
        '# Test Patterns',
        '',
        '## Auth Testing',
        '- Use clerk.setup() in global setup',
        '```',
        '',
        '\u2500'.repeat(15),
        'hq-msg:v1 | id:msg-share01',
        'from:alex/knowledge-curator | to:stefan/qa-tester',
        'intent:share | attach:knowledge/testing/patterns.md',
      ].join('\n');

      const message = makeMessage({
        id: 'msg-share01',
        from: 'alex/knowledge-curator',
        to: 'stefan/qa-tester',
        intent: 'share',
        attach: 'knowledge/testing/patterns.md',
      });

      const result = await inbox.deliver(message, rawText, 'C0CHAN');

      expect(result.success).toBe(true);
      expect(result.sharedFilePaths).toBeDefined();
      expect(result.sharedFilePaths!.length).toBe(1);

      // The shared file should be in shared/{sender-owner}/ directory
      const sharedContent = await readFile(result.sharedFilePaths![0]!, 'utf-8');
      expect(sharedContent).toContain('# Test Patterns');
    });

    it('returns error for invalid to address', async () => {
      const message = makeMessage({ to: 'invalid-address' });
      const result = await inbox.deliver(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot extract worker-id');
    });

    it('handles messages without optional Slack fields', async () => {
      const message = makeMessage();
      const result = await inbox.deliver(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(true);
      const content = JSON.parse(await readFile(result.filePath!, 'utf-8'));
      expect(content.slackUserId).toBeUndefined();
      expect(content.slackTs).toBeUndefined();
    });
  });

  describe('readInbox', () => {
    it('returns empty array for worker with no inbox', async () => {
      const entries = await inbox.readInbox('nonexistent-worker');
      expect(entries).toEqual([]);
    });

    it('returns all messages for a worker, sorted by receivedAt', async () => {
      const msg1 = makeMessage({ id: 'msg-aaa11111' });
      const msg2 = makeMessage({ id: 'msg-bbb22222' });

      await inbox.deliver(msg1, 'raw1', 'C0CHAN');
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await inbox.deliver(msg2, 'raw2', 'C0CHAN');

      const entries = await inbox.readInbox('architect');
      expect(entries.length).toBe(2);
      expect(entries[0]!.message.id).toBe('msg-aaa11111');
      expect(entries[1]!.message.id).toBe('msg-bbb22222');
    });

    it('skips non-JSON files in inbox directory', async () => {
      const msg = makeMessage();
      await inbox.deliver(msg, 'raw', 'C0CHAN');

      // Create a non-JSON file
      const { writeFile: wf } = await import('node:fs/promises');
      await wf(join(tempDir, 'inbox', 'architect', 'notes.txt'), 'some notes');

      const entries = await inbox.readInbox('architect');
      expect(entries.length).toBe(1);
    });
  });

  describe('readUnread', () => {
    it('returns only unread messages', async () => {
      const msg1 = makeMessage({ id: 'msg-aaa11111' });
      const msg2 = makeMessage({ id: 'msg-bbb22222' });

      await inbox.deliver(msg1, 'raw1', 'C0CHAN');
      await inbox.deliver(msg2, 'raw2', 'C0CHAN');

      // Mark first as read
      await inbox.markRead('architect', 'msg-aaa11111');

      const unread = await inbox.readUnread('architect');
      expect(unread.length).toBe(1);
      expect(unread[0]!.message.id).toBe('msg-bbb22222');
    });
  });

  describe('markRead', () => {
    it('marks a message as read', async () => {
      const msg = makeMessage();
      await inbox.deliver(msg, 'raw', 'C0CHAN');

      const result = await inbox.markRead('architect', 'msg-a1b2c3d4');
      expect(result).toBe(true);

      // Verify the file was updated
      const entries = await inbox.readInbox('architect');
      expect(entries[0]!.read).toBe(true);
    });

    it('returns false for nonexistent message', async () => {
      const result = await inbox.markRead('architect', 'msg-nonexist');
      expect(result).toBe(false);
    });
  });

  describe('deleteMessage', () => {
    it('deletes a message from inbox', async () => {
      const msg = makeMessage();
      await inbox.deliver(msg, 'raw', 'C0CHAN');

      const deleted = await inbox.deleteMessage('architect', 'msg-a1b2c3d4');
      expect(deleted).toBe(true);

      const entries = await inbox.readInbox('architect');
      expect(entries.length).toBe(0);
    });

    it('returns false for nonexistent message', async () => {
      const result = await inbox.deleteMessage('architect', 'msg-nonexist');
      expect(result).toBe(false);
    });
  });

  describe('clearInbox', () => {
    it('removes all messages from a worker inbox', async () => {
      await inbox.deliver(makeMessage({ id: 'msg-aaa11111' }), 'r1', 'C');
      await inbox.deliver(makeMessage({ id: 'msg-bbb22222' }), 'r2', 'C');

      await inbox.clearInbox('architect');

      const entries = await inbox.readInbox('architect');
      expect(entries.length).toBe(0);
    });

    it('does not throw for nonexistent inbox', async () => {
      // Should not throw
      await inbox.clearInbox('nonexistent');
    });
  });
});

describe('extractInlineAttachments', () => {
  it('extracts a single inline attachment', () => {
    const text = [
      'Sharing a file.',
      '',
      '\ud83d\udcce knowledge/testing/patterns.md',
      '```markdown',
      '# Test Patterns',
      '',
      '## Auth',
      '- Use clerk.setup()',
      '```',
    ].join('\n');

    const attachments = extractInlineAttachments(text);
    expect(attachments.length).toBe(1);
    expect(attachments[0]!.filename).toBe('knowledge/testing/patterns.md');
    expect(attachments[0]!.content).toContain('# Test Patterns');
    expect(attachments[0]!.content).toContain('## Auth');
  });

  it('extracts multiple inline attachments', () => {
    const text = [
      'Sharing files.',
      '',
      '\ud83d\udcce file1.md',
      '```markdown',
      'Content 1',
      '```',
      '',
      '\ud83d\udcce file2.json',
      '```json',
      '{"key": "value"}',
      '```',
    ].join('\n');

    const attachments = extractInlineAttachments(text);
    expect(attachments.length).toBe(2);
    expect(attachments[0]!.filename).toBe('file1.md');
    expect(attachments[1]!.filename).toBe('file2.json');
  });

  it('returns empty array when no attachments', () => {
    const text = 'Just a regular message without attachments.';
    const attachments = extractInlineAttachments(text);
    expect(attachments.length).toBe(0);
  });

  it('handles code blocks without the paperclip marker', () => {
    const text = [
      'Here is some code:',
      '```typescript',
      'const x = 1;',
      '```',
    ].join('\n');

    const attachments = extractInlineAttachments(text);
    expect(attachments.length).toBe(0);
  });
});
