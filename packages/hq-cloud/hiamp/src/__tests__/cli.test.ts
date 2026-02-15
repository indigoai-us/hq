import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  parseArgs,
  handleSend,
  handleInbox,
  handleReply,
  handleThread,
  handleShare,
  extractMessageId,
  main,
} from '../cli.js';
import type { CliArgs } from '../cli.js';
import type { InboxEntry } from '../inbox.js';
import type { ThreadState } from '../thread-manager.js';

/** Generate a unique temp directory for each test */
function makeTempDir(): string {
  return join(tmpdir(), `hiamp-cli-test-${randomBytes(4).toString('hex')}`);
}

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('extracts the sub-command', () => {
    const result = parseArgs(['send', '--to', 'alex/backend-dev']);
    expect(result.subcommand).toBe('send');
  });

  it('parses --key value options', () => {
    const result = parseArgs(['send', '--to', 'alex/backend-dev', '--intent', 'handoff']);
    expect(result.options['to']).toBe('alex/backend-dev');
    expect(result.options['intent']).toBe('handoff');
  });

  it('parses --key=value options', () => {
    const result = parseArgs(['send', '--to=alex/backend-dev', '--intent=handoff']);
    expect(result.options['to']).toBe('alex/backend-dev');
    expect(result.options['intent']).toBe('handoff');
  });

  it('parses boolean flags', () => {
    const result = parseArgs(['inbox', '--all', '--worker', 'architect']);
    expect(result.flags.has('all')).toBe(true);
    expect(result.options['worker']).toBe('architect');
  });

  it('returns empty subcommand for empty argv', () => {
    const result = parseArgs([]);
    expect(result.subcommand).toBe('');
    expect(Object.keys(result.options)).toHaveLength(0);
  });

  it('handles mixed --key value and --key=value forms', () => {
    const result = parseArgs(['send', '--to=alex/backend-dev', '--body', 'Hello world']);
    expect(result.options['to']).toBe('alex/backend-dev');
    expect(result.options['body']).toBe('Hello world');
  });
});

// ---------------------------------------------------------------------------
// extractMessageId
// ---------------------------------------------------------------------------

describe('extractMessageId', () => {
  it('extracts message ID from composed HIAMP text', () => {
    const text = 'stefan/architect \u2192 alex/backend-dev\n\nHello\n\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nhq-msg:v1 | id:msg-a1b2c3d4 | from:stefan/architect';
    expect(extractMessageId(text)).toBe('msg-a1b2c3d4');
  });

  it('returns unknown when no message ID found', () => {
    expect(extractMessageId('no envelope here')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// handleSend
// ---------------------------------------------------------------------------

describe('handleSend', () => {
  it('requires --to argument', async () => {
    const args: CliArgs = { subcommand: 'send', options: { intent: 'handoff', body: 'test' }, flags: new Set() };
    const result = await handleSend(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--to is required');
    expect(result.exitCode).toBe(1);
  });

  it('requires --intent argument', async () => {
    const args: CliArgs = { subcommand: 'send', options: { to: 'alex/backend-dev', body: 'test' }, flags: new Set() };
    const result = await handleSend(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--intent is required');
  });

  it('requires --body argument', async () => {
    const args: CliArgs = {
      subcommand: 'send',
      options: { to: 'alex/backend-dev', intent: 'handoff' },
      flags: new Set(),
    };
    const result = await handleSend(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--body is required');
  });

  it('rejects invalid intent type', async () => {
    const args: CliArgs = {
      subcommand: 'send',
      options: { to: 'alex/backend-dev', intent: 'invalid', body: 'test' },
      flags: new Set(),
    };
    const result = await handleSend(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Invalid intent');
    expect(result.output).toContain('invalid');
  });

  it('rejects invalid priority', async () => {
    const args: CliArgs = {
      subcommand: 'send',
      options: { to: 'alex/backend-dev', intent: 'handoff', body: 'test', priority: 'invalid' },
      flags: new Set(),
    };
    const result = await handleSend(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Invalid priority');
  });

  it('rejects invalid ack mode', async () => {
    const args: CliArgs = {
      subcommand: 'send',
      options: { to: 'alex/backend-dev', intent: 'handoff', body: 'test', ack: 'invalid' },
      flags: new Set(),
    };
    const result = await handleSend(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Invalid ack mode');
  });

  it('returns config error when config not found', async () => {
    const args: CliArgs = {
      subcommand: 'send',
      options: { to: 'alex/backend-dev', intent: 'handoff', body: 'test' },
      flags: new Set(),
    };
    // No config file path and no HIAMP_CONFIG_PATH env var
    const oldEnv = process.env['HIAMP_CONFIG_PATH'];
    delete process.env['HIAMP_CONFIG_PATH'];

    const result = await handleSend(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Error loading HIAMP config');

    if (oldEnv !== undefined) {
      process.env['HIAMP_CONFIG_PATH'] = oldEnv;
    }
  });
});

// ---------------------------------------------------------------------------
// handleInbox
// ---------------------------------------------------------------------------

describe('handleInbox', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('shows "no unread messages" for empty inbox', async () => {
    const args: CliArgs = {
      subcommand: 'inbox',
      options: { worker: 'architect', 'hq-root': tempDir },
      flags: new Set(),
    };
    const result = await handleInbox(args);
    expect(result.success).toBe(true);
    expect(result.output).toContain('No unread messages');
    expect(result.exitCode).toBe(0);
  });

  it('shows "no messages" for empty inbox with --all', async () => {
    const args: CliArgs = {
      subcommand: 'inbox',
      options: { worker: 'architect', 'hq-root': tempDir },
      flags: new Set(['all']),
    };
    const result = await handleInbox(args);
    expect(result.success).toBe(true);
    expect(result.output).toContain('No messages');
  });

  it('lists unread messages', async () => {
    // Create an inbox entry
    const inboxDir = join(tempDir, 'workspace', 'inbox', 'architect');
    await mkdir(inboxDir, { recursive: true });

    const entry: InboxEntry = {
      message: {
        version: 'v1',
        id: 'msg-a1b2c3d4',
        from: 'alex/backend-dev',
        to: 'stefan/architect',
        intent: 'handoff',
        body: 'The migration endpoint is ready for review.',
      },
      rawText: 'raw text',
      receivedAt: '2026-02-12T10:30:00Z',
      channelId: 'C0CHAN',
      read: false,
    };

    await writeFile(join(inboxDir, 'msg-a1b2c3d4.json'), JSON.stringify(entry), 'utf-8');

    const args: CliArgs = {
      subcommand: 'inbox',
      options: { worker: 'architect', 'hq-root': tempDir },
      flags: new Set(),
    };
    const result = await handleInbox(args);

    expect(result.success).toBe(true);
    expect(result.output).toContain('1 unread');
    expect(result.output).toContain('alex/backend-dev');
    expect(result.output).toContain('handoff');
    expect(result.output).toContain('The migration endpoint');
    expect(result.output).toContain('message reply');
  });

  it('filters out read messages unless --all is specified', async () => {
    const inboxDir = join(tempDir, 'workspace', 'inbox', 'architect');
    await mkdir(inboxDir, { recursive: true });

    const readEntry: InboxEntry = {
      message: {
        version: 'v1',
        id: 'msg-read0001',
        from: 'alex/backend-dev',
        to: 'stefan/architect',
        intent: 'inform',
        body: 'Already read message.',
      },
      rawText: 'raw',
      receivedAt: '2026-02-12T09:00:00Z',
      channelId: 'C0CHAN',
      read: true,
    };

    const unreadEntry: InboxEntry = {
      message: {
        version: 'v1',
        id: 'msg-unrd0001',
        from: 'maria/designer',
        to: 'stefan/architect',
        intent: 'share',
        body: 'New wireframes attached.',
      },
      rawText: 'raw',
      receivedAt: '2026-02-12T10:00:00Z',
      channelId: 'C0CHAN',
      read: false,
    };

    await writeFile(join(inboxDir, 'msg-read0001.json'), JSON.stringify(readEntry), 'utf-8');
    await writeFile(join(inboxDir, 'msg-unrd0001.json'), JSON.stringify(unreadEntry), 'utf-8');

    // Without --all, only unread
    const argsUnread: CliArgs = {
      subcommand: 'inbox',
      options: { worker: 'architect', 'hq-root': tempDir },
      flags: new Set(),
    };
    const resultUnread = await handleInbox(argsUnread);
    expect(resultUnread.output).toContain('1 unread');
    expect(resultUnread.output).toContain('maria/designer');
    expect(resultUnread.output).not.toContain('Already read');

    // With --all, both
    const argsAll: CliArgs = {
      subcommand: 'inbox',
      options: { worker: 'architect', 'hq-root': tempDir },
      flags: new Set(['all']),
    };
    const resultAll = await handleInbox(argsAll);
    expect(resultAll.output).toContain('2 messages');
    expect(resultAll.output).toContain('alex/backend-dev');
    expect(resultAll.output).toContain('maria/designer');
  });

  it('truncates long message bodies in preview', async () => {
    const inboxDir = join(tempDir, 'workspace', 'inbox', 'architect');
    await mkdir(inboxDir, { recursive: true });

    const entry: InboxEntry = {
      message: {
        version: 'v1',
        id: 'msg-long0001',
        from: 'alex/backend-dev',
        to: 'stefan/architect',
        intent: 'inform',
        body: 'A'.repeat(100),
      },
      rawText: 'raw',
      receivedAt: '2026-02-12T10:00:00Z',
      channelId: 'C0CHAN',
      read: false,
    };

    await writeFile(join(inboxDir, 'msg-long0001.json'), JSON.stringify(entry), 'utf-8');

    const args: CliArgs = {
      subcommand: 'inbox',
      options: { worker: 'architect', 'hq-root': tempDir },
      flags: new Set(),
    };
    const result = await handleInbox(args);
    expect(result.output).toContain('...');
  });
});

// ---------------------------------------------------------------------------
// handleReply
// ---------------------------------------------------------------------------

describe('handleReply', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('requires --message-id argument', async () => {
    const args: CliArgs = {
      subcommand: 'reply',
      options: { body: 'reply text' },
      flags: new Set(),
    };
    const result = await handleReply(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--message-id is required');
  });

  it('requires --body argument', async () => {
    const args: CliArgs = {
      subcommand: 'reply',
      options: { 'message-id': 'msg-a1b2c3d4' },
      flags: new Set(),
    };
    const result = await handleReply(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--body is required');
  });

  it('returns error when message is not found in inbox', async () => {
    const args: CliArgs = {
      subcommand: 'reply',
      options: {
        'message-id': 'msg-notexist',
        body: 'reply text',
        'hq-root': tempDir,
        worker: 'architect',
      },
      flags: new Set(),
    };
    const result = await handleReply(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('not found in inbox');
  });

  it('finds message in inbox and fails on missing config', async () => {
    // Create an inbox entry to find
    const inboxDir = join(tempDir, 'workspace', 'inbox', 'architect');
    await mkdir(inboxDir, { recursive: true });

    const entry: InboxEntry = {
      message: {
        version: 'v1',
        id: 'msg-replytest',
        from: 'alex/backend-dev',
        to: 'stefan/architect',
        intent: 'handoff',
        body: 'Need your review.',
        thread: 'thr-test1234',
      },
      rawText: 'raw text',
      receivedAt: '2026-02-12T10:30:00Z',
      channelId: 'C0CHAN',
      slackTs: '1234567890.123456',
      read: false,
    };

    await writeFile(join(inboxDir, 'msg-replytest.json'), JSON.stringify(entry), 'utf-8');

    // Clear env so config loading fails
    const oldEnv = process.env['HIAMP_CONFIG_PATH'];
    delete process.env['HIAMP_CONFIG_PATH'];

    const args: CliArgs = {
      subcommand: 'reply',
      options: {
        'message-id': 'msg-replytest',
        body: 'On it!',
        'hq-root': tempDir,
        worker: 'architect',
      },
      flags: new Set(),
    };
    const result = await handleReply(args);
    expect(result.success).toBe(false);
    // Should get past the "not found" check and fail on config loading
    expect(result.output).toContain('Error loading HIAMP config');

    if (oldEnv !== undefined) {
      process.env['HIAMP_CONFIG_PATH'] = oldEnv;
    }
  });
});

// ---------------------------------------------------------------------------
// handleThread
// ---------------------------------------------------------------------------

describe('handleThread', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('requires --thread-id argument', async () => {
    const args: CliArgs = {
      subcommand: 'thread',
      options: {},
      flags: new Set(),
    };
    const result = await handleThread(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--thread-id is required');
  });

  it('returns error when thread is not found', async () => {
    const args: CliArgs = {
      subcommand: 'thread',
      options: { 'thread-id': 'thr-notexist', 'hq-root': tempDir },
      flags: new Set(),
    };
    const result = await handleThread(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('not found');
  });

  it('displays thread conversation history', async () => {
    // Create a thread file
    const threadDir = join(tempDir, 'workspace', 'threads', 'hiamp');
    await mkdir(threadDir, { recursive: true });

    const threadState: ThreadState = {
      threadId: 'thr-test1234',
      status: 'open',
      participants: ['stefan/architect', 'alex/backend-dev'],
      messages: [
        {
          messageId: 'msg-first001',
          from: 'alex/backend-dev',
          to: 'stefan/architect',
          intent: 'handoff',
          body: 'The API contract is ready.',
          timestamp: '2026-02-12T10:30:00Z',
        },
        {
          messageId: 'msg-reply001',
          from: 'stefan/architect',
          to: 'alex/backend-dev',
          intent: 'acknowledge',
          body: 'Received. Will review within the hour.',
          replyTo: 'msg-first001',
          timestamp: '2026-02-12T10:35:00Z',
        },
        {
          messageId: 'msg-reply002',
          from: 'stefan/architect',
          to: 'alex/backend-dev',
          intent: 'response',
          body: 'Review complete. Two issues found.',
          replyTo: 'msg-first001',
          timestamp: '2026-02-12T11:20:00Z',
        },
      ],
      createdAt: '2026-02-12T10:30:00Z',
      updatedAt: '2026-02-12T11:20:00Z',
    };

    await writeFile(join(threadDir, 'thr-test1234.json'), JSON.stringify(threadState), 'utf-8');

    const args: CliArgs = {
      subcommand: 'thread',
      options: { 'thread-id': 'thr-test1234', 'hq-root': tempDir },
      flags: new Set(),
    };
    const result = await handleThread(args);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('thr-test1234');
    expect(result.output).toContain('open');
    expect(result.output).toContain('3 messages');
    expect(result.output).toContain('2 participants');
    expect(result.output).toContain('alex/backend-dev -> stefan/architect');
    expect(result.output).toContain('handoff');
    expect(result.output).toContain('The API contract is ready.');
    expect(result.output).toContain('acknowledge');
    expect(result.output).toContain('In reply to: msg-first001');
    expect(result.output).toContain('[3]');
    expect(result.output).toContain('response');
  });
});

// ---------------------------------------------------------------------------
// handleShare
// ---------------------------------------------------------------------------

describe('handleShare', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('requires --to argument', async () => {
    const args: CliArgs = {
      subcommand: 'share',
      options: { files: 'file.md', body: 'test' },
      flags: new Set(),
    };
    const result = await handleShare(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--to is required');
  });

  it('requires --files argument', async () => {
    const args: CliArgs = {
      subcommand: 'share',
      options: { to: 'alex/backend-dev', body: 'test' },
      flags: new Set(),
    };
    const result = await handleShare(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--files is required');
  });

  it('requires --body argument', async () => {
    const args: CliArgs = {
      subcommand: 'share',
      options: { to: 'alex/backend-dev', files: 'file.md' },
      flags: new Set(),
    };
    const result = await handleShare(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--body is required');
  });

  it('returns error when file cannot be read', async () => {
    const args: CliArgs = {
      subcommand: 'share',
      options: {
        to: 'alex/backend-dev',
        files: join(tempDir, 'nonexistent-file.md'),
        body: 'Sharing this.',
      },
      flags: new Set(),
    };
    const result = await handleShare(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Cannot read file');
  });

  it('reads files and fails on missing config (validates file reading works)', async () => {
    // Create a test file to share
    const testFilePath = join(tempDir, 'test-doc.md');
    await writeFile(testFilePath, '# Test Document\n\nSome content here.', 'utf-8');

    // Clear env so config loading fails (but file reading succeeds)
    const oldEnv = process.env['HIAMP_CONFIG_PATH'];
    delete process.env['HIAMP_CONFIG_PATH'];

    const args: CliArgs = {
      subcommand: 'share',
      options: {
        to: 'alex/backend-dev',
        files: testFilePath,
        body: 'Sharing test doc.',
      },
      flags: new Set(),
    };
    const result = await handleShare(args);
    expect(result.success).toBe(false);
    // Should get past file reading and fail on config
    expect(result.output).toContain('Error loading HIAMP config');

    if (oldEnv !== undefined) {
      process.env['HIAMP_CONFIG_PATH'] = oldEnv;
    }
  });
});

// ---------------------------------------------------------------------------
// main (CLI dispatch)
// ---------------------------------------------------------------------------

describe('main', () => {
  it('shows help when no sub-command is provided', async () => {
    const result = await main([]);
    expect(result.success).toBe(true);
    expect(result.output).toContain('HIAMP CLI');
    expect(result.output).toContain('Sub-commands');
    expect(result.output).toContain('send');
    expect(result.output).toContain('inbox');
    expect(result.output).toContain('reply');
    expect(result.output).toContain('thread');
    expect(result.output).toContain('share');
  });

  it('shows help when --help flag is passed', async () => {
    const result = await main(['--help']);
    expect(result.success).toBe(true);
    expect(result.output).toContain('HIAMP CLI');
  });

  it('returns error for unknown sub-command', async () => {
    const result = await main(['unknown-cmd']);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown sub-command');
    expect(result.output).toContain('unknown-cmd');
    expect(result.exitCode).toBe(1);
  });

  it('dispatches to send handler', async () => {
    // Will fail on missing --to, proving dispatch works
    const result = await main(['send', '--intent', 'handoff', '--body', 'test']);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--to is required');
  });

  it('dispatches to inbox handler', async () => {
    const tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
    try {
      const result = await main(['inbox', '--worker', 'architect', '--hq-root', tempDir]);
      expect(result.success).toBe(true);
      expect(result.output).toContain('No unread messages');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('dispatches to reply handler', async () => {
    const result = await main(['reply', '--body', 'test']);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--message-id is required');
  });

  it('dispatches to thread handler', async () => {
    const result = await main(['thread']);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--thread-id is required');
  });

  it('dispatches to share handler', async () => {
    const result = await main(['share', '--files', 'test.md', '--body', 'hi']);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--to is required');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal HiampConfig for tests that need one */
function makeConfig() {
  return {
    identity: {
      owner: 'stefan',
      instanceId: 'stefan-hq-primary',
    },
    peers: [
      {
        owner: 'alex',
        slackBotId: 'U0ALEX1234',
        trustLevel: 'channel-scoped' as const,
        workers: [
          { id: 'backend-dev', description: 'API endpoints' },
          { id: 'qa-tester', description: 'Testing' },
        ],
      },
    ],
    slack: {
      botToken: 'xoxb-test-token',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated' as const,
      channels: {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
      },
      eventMode: 'socket' as const,
    },
    workerPermissions: {
      default: 'allow' as const,
      workers: [],
    },
  };
}
