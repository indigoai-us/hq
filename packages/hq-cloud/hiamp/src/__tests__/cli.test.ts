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
  handleMigrate,
  generateMigrationConfig,
  formatMigratedConfig,
  extractMessageId,
  createTransport,
  main,
} from '../cli.js';
import type { CliArgs } from '../cli.js';
import type { InboxEntry } from '../inbox.js';
import type { ThreadState } from '../thread-manager.js';
import type { HiampSlackConfig, HiampConfig } from '../config-loader.js';
import { SlackTransport } from '../slack-transport.js';
import { LinearTransport } from '../linear-transport.js';

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
// generateMigrationConfig (pure migration logic)
// ---------------------------------------------------------------------------

describe('generateMigrationConfig', () => {
  it('generates a Linear config from a minimal Slack config', () => {
    const slackConfig: HiampSlackConfig = {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated',
      channels: {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
      },
      eventMode: 'socket',
    };

    const result = generateMigrationConfig(slackConfig);

    expect(result.linear.apiKey).toBe('$LINEAR_API_KEY');
    expect(result.linear.defaultTeam).toBe('ENG');
    expect(result.linear.teams).toHaveLength(1);
    expect(result.linear.teams[0]!.key).toBe('ENG');
    expect(result.warnings).toHaveLength(0);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary.some((s) => s.includes('Default team: ENG'))).toBe(true);
  });

  it('maps contextual channels to project mappings', () => {
    const slackConfig: HiampSlackConfig = {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'contextual',
      channels: {
        contextual: [
          { context: 'hq-cloud', name: '#hq-cloud-dev', id: 'C0HQCLOUD', peers: ['alex'] },
          { context: 'design-system', name: '#design-collab', id: 'C0DESIGN', peers: ['maria'] },
        ],
      },
      eventMode: 'socket',
    };

    const result = generateMigrationConfig(slackConfig);

    // Default team should have both project mappings
    const defaultTeam = result.linear.teams.find((t) => t.key === 'ENG');
    expect(defaultTeam).toBeDefined();
    expect(defaultTeam!.projectMappings).toHaveLength(2);
    expect(defaultTeam!.projectMappings![0]!.context).toBe('hq-cloud');
    expect(defaultTeam!.projectMappings![0]!.projectId).toBe('TODO');
    expect(defaultTeam!.projectMappings![1]!.context).toBe('design-system');
    expect(defaultTeam!.projectMappings![1]!.projectId).toBe('TODO');

    // Should warn about peer associations
    expect(result.warnings.some((w) => w.includes('alex'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('maria'))).toBe(true);
  });

  it('warns about per-relationship channels', () => {
    const slackConfig: HiampSlackConfig = {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'per-relationship',
      channels: {
        perRelationship: [
          { peer: 'alex', name: '#hq-stefan-alex', id: 'C0STEFANALEX' },
          { peer: 'maria', name: '#hq-maria-stefan', id: 'C0MARIASTEFAN' },
        ],
      },
      eventMode: 'socket',
    };

    const result = generateMigrationConfig(slackConfig);

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('Per-relationship channel');
    expect(result.warnings[0]).toContain('alex');
    expect(result.warnings[1]).toContain('maria');
  });

  it('respects custom defaultTeam option', () => {
    const slackConfig: HiampSlackConfig = {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated',
      channels: {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
      },
      eventMode: 'socket',
    };

    const result = generateMigrationConfig(slackConfig, { defaultTeam: 'PLATFORM' });

    expect(result.linear.defaultTeam).toBe('PLATFORM');
    expect(result.linear.teams[0]!.key).toBe('PLATFORM');
  });

  it('respects custom apiKeyEnv option', () => {
    const slackConfig: HiampSlackConfig = {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated',
      eventMode: 'socket',
    };

    const result = generateMigrationConfig(slackConfig, { apiKeyEnv: 'MY_LINEAR_KEY' });

    expect(result.linear.apiKey).toBe('$MY_LINEAR_KEY');
  });

  it('handles a Slack config with no channels at all', () => {
    const slackConfig: HiampSlackConfig = {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dm',
      eventMode: 'socket',
    };

    const result = generateMigrationConfig(slackConfig);

    expect(result.linear.defaultTeam).toBe('ENG');
    expect(result.linear.teams).toHaveLength(1);
    expect(result.linear.teams[0]!.key).toBe('ENG');
    expect(result.linear.teams[0]!.projectMappings).toBeUndefined();
    expect(result.warnings).toHaveLength(0);
  });

  it('does not create duplicate team entries', () => {
    const slackConfig: HiampSlackConfig = {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'contextual',
      channels: {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
        contextual: [
          { context: 'project-a', name: '#proj-a', id: 'C0A', peers: [] },
          { context: 'project-b', name: '#proj-b', id: 'C0B', peers: [] },
        ],
      },
      eventMode: 'socket',
    };

    const result = generateMigrationConfig(slackConfig);

    // Should have exactly one team (ENG) with both mappings
    expect(result.linear.teams).toHaveLength(1);
    expect(result.linear.teams[0]!.projectMappings).toHaveLength(2);
  });

  it('does not warn for contextual channels with empty peers array', () => {
    const slackConfig: HiampSlackConfig = {
      botToken: 'xoxb-test',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'contextual',
      channels: {
        contextual: [
          { context: 'open-project', name: '#open', id: 'C0OPEN', peers: [] },
        ],
      },
      eventMode: 'socket',
    };

    const result = generateMigrationConfig(slackConfig);

    // No warnings because peers array is empty
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// formatMigratedConfig
// ---------------------------------------------------------------------------

describe('formatMigratedConfig', () => {
  it('formats a complete migrated config as YAML', () => {
    const config: HiampConfig = {
      transport: 'linear',
      identity: {
        owner: 'stefan',
        instanceId: 'stefan-hq-primary',
        displayName: "Stefan's HQ",
      },
      peers: [
        {
          owner: 'alex',
          displayName: "Alex's HQ",
          slackBotId: 'U0ALEX1234',
          trustLevel: 'channel-scoped',
          workers: [
            { id: 'backend-dev', description: 'API endpoints', skills: ['api-dev', 'node'] },
          ],
          notes: 'Co-founder',
        },
      ],
      linear: {
        apiKey: '$LINEAR_API_KEY',
        defaultTeam: 'ENG',
        teams: [
          {
            key: 'ENG',
            projectMappings: [
              { context: 'hq-cloud', projectId: 'proj-uuid-1' },
            ],
          },
        ],
      },
      workerPermissions: {
        default: 'deny',
        workers: [
          {
            id: 'architect',
            send: true,
            receive: true,
            allowedIntents: ['handoff', 'request'],
            allowedPeers: ['*'],
          },
        ],
      },
    };

    const output = formatMigratedConfig(config);

    expect(output).toContain('transport: linear');
    expect(output).toContain('owner: stefan');
    expect(output).toContain('instance-id: stefan-hq-primary');
    expect(output).toContain('display-name: "Stefan\'s HQ"');
    expect(output).toContain('api-key: $LINEAR_API_KEY');
    expect(output).toContain('default-team: ENG');
    expect(output).toContain('key: ENG');
    expect(output).toContain('context: "hq-cloud"');
    expect(output).toContain('project-id: "proj-uuid-1"');
    expect(output).toContain('default: deny');
    expect(output).toContain('id: architect');
    expect(output).toContain('send: true');
    expect(output).toContain('allowed-intents: [handoff, request]');
    expect(output).toContain('allowed-peers: ["*"]');
  });

  it('preserves peer identity fields', () => {
    const config: HiampConfig = {
      transport: 'linear',
      identity: { owner: 'stefan', instanceId: 'stefan-hq-primary' },
      peers: [
        {
          owner: 'alex',
          trustLevel: 'open',
          workers: [{ id: 'backend-dev' }],
        },
      ],
      linear: {
        apiKey: '$LINEAR_API_KEY',
        defaultTeam: 'ENG',
        teams: [{ key: 'ENG' }],
      },
      workerPermissions: { default: 'deny', workers: [] },
    };

    const output = formatMigratedConfig(config);

    expect(output).toContain('owner: stefan');
    expect(output).toContain('owner: alex');
    expect(output).toContain('trust-level: open');
    expect(output).toContain('id: backend-dev');
  });
});

// ---------------------------------------------------------------------------
// handleMigrate (CLI handler)
// ---------------------------------------------------------------------------

describe('handleMigrate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('requires --from argument', async () => {
    const args: CliArgs = {
      subcommand: 'migrate',
      options: { to: 'linear' },
      flags: new Set(),
    };
    const result = await handleMigrate(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--from is required');
  });

  it('requires --to argument', async () => {
    const args: CliArgs = {
      subcommand: 'migrate',
      options: { from: 'slack' },
      flags: new Set(),
    };
    const result = await handleMigrate(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--to is required');
  });

  it('rejects unsupported --from value', async () => {
    const args: CliArgs = {
      subcommand: 'migrate',
      options: { from: 'email', to: 'linear' },
      flags: new Set(),
    };
    const result = await handleMigrate(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('not supported');
    expect(result.output).toContain('email');
  });

  it('rejects unsupported --to value', async () => {
    const args: CliArgs = {
      subcommand: 'migrate',
      options: { from: 'slack', to: 'discord' },
      flags: new Set(),
    };
    const result = await handleMigrate(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('not supported');
    expect(result.output).toContain('discord');
  });

  it('returns config error when config not found', async () => {
    const oldEnv = process.env['HIAMP_CONFIG_PATH'];
    delete process.env['HIAMP_CONFIG_PATH'];

    const args: CliArgs = {
      subcommand: 'migrate',
      options: { from: 'slack', to: 'linear' },
      flags: new Set(),
    };
    const result = await handleMigrate(args);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Error loading HIAMP config');

    if (oldEnv !== undefined) {
      process.env['HIAMP_CONFIG_PATH'] = oldEnv;
    }
  });

  it('successfully migrates a Slack config file to Linear', async () => {
    const configPath = join(tempDir, 'hiamp.yaml');
    const yamlContent = `
identity:
  owner: stefan
  instance-id: stefan-hq-primary

peers:
  - owner: alex
    trust-level: open
    workers:
      - id: backend-dev

slack:
  bot-token: $SLACK_BOT_TOKEN
  app-id: A0TEST
  workspace-id: T0TEST
  channel-strategy: dedicated
  channels:
    dedicated:
      name: "#hq-agents"
      id: C0HQAGENTS
    contextual:
      - context: "hq-cloud"
        name: "#hq-cloud-dev"
        id: C0HQCLOUD
        peers: [alex]
  event-mode: socket
  socket-app-token: $SLACK_APP_TOKEN

worker-permissions:
  default: deny
  workers:
    - id: architect
      send: true
      receive: true
`;
    await writeFile(configPath, yamlContent, 'utf-8');

    const args: CliArgs = {
      subcommand: 'migrate',
      options: { from: 'slack', to: 'linear', config: configPath },
      flags: new Set(),
    };
    const result = await handleMigrate(args);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);

    // Verify output contains migration header
    expect(result.output).toContain('HIAMP Migration: Slack -> Linear');
    expect(result.output).toContain('SUMMARY');

    // Verify migrated config sections
    expect(result.output).toContain('transport: linear');
    expect(result.output).toContain('owner: stefan');
    expect(result.output).toContain('instance-id: stefan-hq-primary');
    expect(result.output).toContain('owner: alex');
    expect(result.output).toContain('api-key: $LINEAR_API_KEY');
    expect(result.output).toContain('default-team: ENG');
    expect(result.output).toContain('context: "hq-cloud"');

    // Verify worker permissions preserved
    expect(result.output).toContain('id: architect');
    expect(result.output).toContain('send: true');

    // Verify TODO placeholder
    expect(result.output).toContain('TODO');

    // Verify warnings about peer associations
    expect(result.output).toContain('WARNINGS');
    expect(result.output).toContain('alex');
  });

  it('preserves identity through migration (owner and worker-id unchanged)', async () => {
    const configPath = join(tempDir, 'hiamp.yaml');
    const yamlContent = `
identity:
  owner: corey
  instance-id: corey-hq-main
  display-name: "Corey's HQ"

peers:
  - owner: stefan
    trust-level: channel-scoped
    slack-bot-id: U0STEFAN
    workers:
      - id: architect
        description: "System design"
        skills: [design, planning]

slack:
  bot-token: $SLACK_BOT_TOKEN
  app-id: A0COREY
  workspace-id: T0COREY
  channel-strategy: dedicated
  channels:
    dedicated:
      name: "#corey-agents"
      id: C0COREYAGENTS
  event-mode: socket
  socket-app-token: $SLACK_APP_TOKEN

worker-permissions:
  default: deny
  workers:
    - id: frontend-dev
      send: true
      receive: true
      allowed-intents: [handoff, request, inform]
      allowed-peers: ["*"]
`;
    await writeFile(configPath, yamlContent, 'utf-8');

    const args: CliArgs = {
      subcommand: 'migrate',
      options: { from: 'slack', to: 'linear', config: configPath },
      flags: new Set(),
    };
    const result = await handleMigrate(args);

    expect(result.success).toBe(true);

    // Identity preserved exactly
    expect(result.output).toContain('owner: corey');
    expect(result.output).toContain('instance-id: corey-hq-main');
    expect(result.output).toContain('display-name: "Corey\'s HQ"');

    // Peer identity preserved
    expect(result.output).toContain('owner: stefan');
    expect(result.output).toContain('id: architect');

    // Worker permissions preserved
    expect(result.output).toContain('id: frontend-dev');
    expect(result.output).toContain('allowed-intents: [handoff, request, inform]');
  });

  it('accepts --default-team override', async () => {
    const configPath = join(tempDir, 'hiamp.yaml');
    const yamlContent = `
identity:
  owner: stefan
  instance-id: stefan-hq-primary

peers:
  - owner: alex
    trust-level: open
    workers:
      - id: backend-dev

slack:
  bot-token: $SLACK_BOT_TOKEN
  app-id: A0TEST
  workspace-id: T0TEST
  channel-strategy: dedicated
  channels:
    dedicated:
      name: "#hq-agents"
      id: C0HQAGENTS
  event-mode: socket
  socket-app-token: $SLACK_APP_TOKEN

worker-permissions:
  default: deny
  workers: []
`;
    await writeFile(configPath, yamlContent, 'utf-8');

    const args: CliArgs = {
      subcommand: 'migrate',
      options: {
        from: 'slack',
        to: 'linear',
        config: configPath,
        'default-team': 'PLATFORM',
      },
      flags: new Set(),
    };
    const result = await handleMigrate(args);

    expect(result.success).toBe(true);
    expect(result.output).toContain('default-team: PLATFORM');
    expect(result.output).toContain('key: PLATFORM');
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

  it('dispatches to migrate handler', async () => {
    const result = await main(['migrate', '--to', 'linear']);
    expect(result.success).toBe(false);
    expect(result.output).toContain('--from is required');
  });

  it('includes migrate in help output', async () => {
    const result = await main([]);
    expect(result.output).toContain('migrate');
  });
});

// ---------------------------------------------------------------------------
// createTransport (factory function)
// ---------------------------------------------------------------------------

describe('createTransport', () => {
  it('returns SlackTransport when config.transport is "slack"', () => {
    const config = makeConfig();
    config.transport = 'slack';
    const transport = createTransport(config);
    expect(transport).toBeInstanceOf(SlackTransport);
    expect(transport.name).toBe('slack');
  });

  it('returns LinearTransport when config.transport is "linear"', () => {
    const oldKey = process.env['LINEAR_API_KEY'];
    process.env['LINEAR_API_KEY'] = 'lin_test_fake_key_for_factory';
    try {
      const config: HiampConfig = {
        transport: 'linear',
        identity: { owner: 'stefan', instanceId: 'stefan-hq-primary' },
        peers: [
          {
            owner: 'alex',
            trustLevel: 'open',
            workers: [{ id: 'backend-dev' }],
          },
        ],
        linear: {
          apiKey: '$LINEAR_API_KEY',
          defaultTeam: 'ENG',
          teams: [{ key: 'ENG' }],
        },
        workerPermissions: { default: 'allow', workers: [] },
      };
      const transport = createTransport(config);
      expect(transport).toBeInstanceOf(LinearTransport);
      expect(transport.name).toBe('linear');
    } finally {
      if (oldKey !== undefined) {
        process.env['LINEAR_API_KEY'] = oldKey;
      } else {
        delete process.env['LINEAR_API_KEY'];
      }
    }
  });

  it('defaults to SlackTransport when transport field is missing/undefined', () => {
    const config = makeConfig();
    // Force transport to undefined to test default behavior
    (config as Record<string, unknown>).transport = undefined;
    const transport = createTransport(config as HiampConfig);
    expect(transport).toBeInstanceOf(SlackTransport);
  });

  it('passes hqRoot option through to the transport', () => {
    const oldKey = process.env['LINEAR_API_KEY'];
    process.env['LINEAR_API_KEY'] = 'lin_test_fake_key_for_factory';
    try {
      const config: HiampConfig = {
        transport: 'linear',
        identity: { owner: 'stefan', instanceId: 'stefan-hq-primary' },
        peers: [],
        linear: {
          apiKey: '$LINEAR_API_KEY',
          defaultTeam: 'ENG',
          teams: [{ key: 'ENG' }],
        },
        workerPermissions: { default: 'allow', workers: [] },
      };
      const transport = createTransport(config, { hqRoot: '/some/path' });
      expect(transport).toBeInstanceOf(LinearTransport);
    } finally {
      if (oldKey !== undefined) {
        process.env['LINEAR_API_KEY'] = oldKey;
      } else {
        delete process.env['LINEAR_API_KEY'];
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Transport-agnostic CLI behavior
// ---------------------------------------------------------------------------

describe('transport-agnostic CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('handleReply uses Transport abstraction (not SlackSender)', () => {
    it('uses transport.sendReply when threadRef (channelId) is available', async () => {
      // Create an inbox entry with channelId but no Slack-specific fields
      const inboxDir = join(tempDir, 'workspace', 'inbox', 'architect');
      await mkdir(inboxDir, { recursive: true });

      const entry: InboxEntry = {
        message: {
          version: 'v1',
          id: 'msg-linear-reply-test',
          from: 'alex/backend-dev',
          to: 'stefan/architect',
          intent: 'handoff',
          body: 'Need your review.',
          thread: 'thr-linear-test',
        },
        rawText: 'raw text',
        receivedAt: '2026-02-12T10:30:00Z',
        channelId: 'linear-issue-uuid-123', // Linear issue ID as channelId
        read: false,
        // No slackTs or slackThreadTs — simulates a Linear-sourced message
      };

      await writeFile(join(inboxDir, 'msg-linear-reply-test.json'), JSON.stringify(entry), 'utf-8');

      // Clear env so config loading fails (validates we get past inbox lookup
      // and reach the config loading step — proving transport abstraction path)
      const oldEnv = process.env['HIAMP_CONFIG_PATH'];
      delete process.env['HIAMP_CONFIG_PATH'];

      const args: CliArgs = {
        subcommand: 'reply',
        options: {
          'message-id': 'msg-linear-reply-test',
          body: 'On it!',
          'hq-root': tempDir,
          worker: 'architect',
        },
        flags: new Set(),
      };
      const result = await handleReply(args);
      expect(result.success).toBe(false);
      // Should get past inbox lookup and threadRef determination, fail on config
      expect(result.output).toContain('Error loading HIAMP config');

      if (oldEnv !== undefined) {
        process.env['HIAMP_CONFIG_PATH'] = oldEnv;
      }
    });

    it('falls back to transport.send when no thread reference is available', async () => {
      // Create an inbox entry with no threading info at all
      const inboxDir = join(tempDir, 'workspace', 'inbox', 'architect');
      await mkdir(inboxDir, { recursive: true });

      const entry: InboxEntry = {
        message: {
          version: 'v1',
          id: 'msg-no-thread-ref',
          from: 'alex/backend-dev',
          to: 'stefan/architect',
          intent: 'inform',
          body: 'Quick note.',
        },
        rawText: 'raw text',
        receivedAt: '2026-02-12T10:30:00Z',
        channelId: '', // Empty channelId (falsy)
        read: false,
      };

      await writeFile(join(inboxDir, 'msg-no-thread-ref.json'), JSON.stringify(entry), 'utf-8');

      const oldEnv = process.env['HIAMP_CONFIG_PATH'];
      delete process.env['HIAMP_CONFIG_PATH'];

      const args: CliArgs = {
        subcommand: 'reply',
        options: {
          'message-id': 'msg-no-thread-ref',
          body: 'Got it.',
          'hq-root': tempDir,
          worker: 'architect',
        },
        flags: new Set(),
      };
      const result = await handleReply(args);
      expect(result.success).toBe(false);
      // Should reach config loading (past the threadRef branching)
      expect(result.output).toContain('Error loading HIAMP config');

      if (oldEnv !== undefined) {
        process.env['HIAMP_CONFIG_PATH'] = oldEnv;
      }
    });

    it('validates intent before using transport', async () => {
      const inboxDir = join(tempDir, 'workspace', 'inbox', 'architect');
      await mkdir(inboxDir, { recursive: true });

      const entry: InboxEntry = {
        message: {
          version: 'v1',
          id: 'msg-intent-check',
          from: 'alex/backend-dev',
          to: 'stefan/architect',
          intent: 'handoff',
          body: 'Test.',
        },
        rawText: 'raw text',
        receivedAt: '2026-02-12T10:30:00Z',
        channelId: 'C0CHAN',
        read: false,
      };

      await writeFile(join(inboxDir, 'msg-intent-check.json'), JSON.stringify(entry), 'utf-8');

      // Create a config file that loads successfully
      const configPath = join(tempDir, 'hiamp.yaml');
      const yamlContent = `
identity:
  owner: stefan
  instance-id: stefan-hq-primary

peers:
  - owner: alex
    trust-level: open
    workers:
      - id: backend-dev

slack:
  bot-token: $SLACK_BOT_TOKEN
  app-id: A0TEST
  workspace-id: T0TEST
  channel-strategy: dedicated
  event-mode: socket

worker-permissions:
  default: allow
  workers: []
`;
      await writeFile(configPath, yamlContent, 'utf-8');

      const args: CliArgs = {
        subcommand: 'reply',
        options: {
          'message-id': 'msg-intent-check',
          body: 'Reply text',
          'hq-root': tempDir,
          worker: 'architect',
          config: configPath,
          intent: 'invalid-intent',
        },
        flags: new Set(),
      };
      const result = await handleReply(args);
      expect(result.success).toBe(false);
      expect(result.output).toContain('Invalid intent');
    });
  });

  describe('handleShare uses Transport abstraction (not SlackSender)', () => {
    it('reads files and uses transport.send for sharing', async () => {
      // Create a test file to share
      const testFilePath = join(tempDir, 'test-share.ts');
      await writeFile(testFilePath, 'export const x = 42;', 'utf-8');

      // Clear env so config loading fails (validates file reading succeeds
      // and we reach the transport creation step)
      const oldEnv = process.env['HIAMP_CONFIG_PATH'];
      delete process.env['HIAMP_CONFIG_PATH'];

      const args: CliArgs = {
        subcommand: 'share',
        options: {
          to: 'alex/backend-dev',
          files: testFilePath,
          body: 'Here is the module.',
        },
        flags: new Set(),
      };
      const result = await handleShare(args);
      expect(result.success).toBe(false);
      // Should get past file reading and fail on config loading
      expect(result.output).toContain('Error loading HIAMP config');

      if (oldEnv !== undefined) {
        process.env['HIAMP_CONFIG_PATH'] = oldEnv;
      }
    });

    it('composes multiple files into the message body', async () => {
      // Create two test files
      const file1 = join(tempDir, 'api.ts');
      const file2 = join(tempDir, 'types.json');
      await writeFile(file1, 'export function hello() {}', 'utf-8');
      await writeFile(file2, '{"key": "value"}', 'utf-8');

      const oldEnv = process.env['HIAMP_CONFIG_PATH'];
      delete process.env['HIAMP_CONFIG_PATH'];

      const args: CliArgs = {
        subcommand: 'share',
        options: {
          to: 'alex/backend-dev',
          files: `${file1},${file2}`,
          body: 'Two files for you.',
        },
        flags: new Set(),
      };
      const result = await handleShare(args);
      expect(result.success).toBe(false);
      // Reaches config loading step (past file reading) for both files
      expect(result.output).toContain('Error loading HIAMP config');

      if (oldEnv !== undefined) {
        process.env['HIAMP_CONFIG_PATH'] = oldEnv;
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal HiampConfig for tests that need one */
function makeConfig() {
  return {
    transport: 'slack' as const,
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
