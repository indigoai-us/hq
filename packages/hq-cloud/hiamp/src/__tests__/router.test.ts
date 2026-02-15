import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { Router } from '../router.js';
import { Inbox } from '../inbox.js';
import type { HiampConfig } from '../config-loader.js';
import type { HiampMessage } from '../types.js';
import type { LocalWorker } from '../router.js';

/** Generate a unique temp directory */
function makeTempDir(): string {
  return join(tmpdir(), `hiamp-router-test-${randomBytes(4).toString('hex')}`);
}

/** Build a minimal HiampConfig for testing */
function makeConfig(overrides?: Partial<HiampConfig>): HiampConfig {
  return {
    identity: {
      owner: 'stefan',
      instanceId: 'stefan-hq-primary',
    },
    peers: [
      {
        owner: 'alex',
        slackBotId: 'U0ALEX1234',
        trustLevel: 'channel-scoped',
        workers: [
          { id: 'backend-dev', description: 'API dev' },
          { id: 'qa-tester', description: 'Testing' },
        ],
      },
    ],
    slack: {
      botToken: 'xoxb-test-token',
      appId: 'A0TEST',
      workspaceId: 'T0TEST',
      channelStrategy: 'dedicated',
      channels: {
        dedicated: { name: '#hq-agents', id: 'C0HQAGENTS' },
      },
      eventMode: 'socket',
    },
    workerPermissions: {
      default: 'deny',
      workers: [
        {
          id: 'architect',
          send: true,
          receive: true,
          allowedIntents: ['handoff', 'request', 'inform', 'query', 'response', 'acknowledge', 'error', 'share'],
          allowedPeers: ['*'],
        },
        {
          id: 'backend-dev',
          send: true,
          receive: true,
          allowedIntents: ['handoff', 'request'],
          allowedPeers: ['alex'],
        },
        {
          id: 'qa-tester',
          send: false,
          receive: true,
          allowedIntents: ['query', 'response'],
          allowedPeers: ['alex'],
        },
        {
          id: 'no-receive',
          send: true,
          receive: false,
          allowedPeers: ['*'],
        },
      ],
    },
    ...overrides,
  };
}

/** Build a minimal HiampMessage */
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

/** Local workers for testing */
const LOCAL_WORKERS: LocalWorker[] = [
  { id: 'architect', name: 'Architect', type: 'code', status: 'active' },
  { id: 'backend-dev', name: 'Backend Dev', type: 'code', status: 'active' },
  { id: 'qa-tester', name: 'QA Tester', type: 'code', status: 'active' },
  { id: 'no-receive', name: 'No Receive', type: 'code', status: 'active' },
  { id: 'disabled-worker', name: 'Disabled', type: 'code', status: 'inactive' },
];

describe('router', () => {
  let tempDir: string;
  let config: HiampConfig;
  let inbox: Inbox;
  let router: Router;
  let mockSender: { send: ReturnType<typeof vi.fn>; sendReply: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
    config = makeConfig();
    inbox = new Inbox(tempDir, 'inbox');

    mockSender = {
      send: vi.fn().mockResolvedValue({ success: true }),
      sendReply: vi.fn().mockResolvedValue({ success: true }),
    };

    router = new Router(config, {
      hqRoot: tempDir,
      registryLoader: () => LOCAL_WORKERS,
      sender: mockSender as any,
      inbox,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('route', () => {
    it('delivers a valid message to the target worker inbox', async () => {
      const message = makeMessage();
      const result = await router.route(message, 'raw text', 'C0CHAN', 'U0USER', '12345');

      expect(result.success).toBe(true);
      expect(result.action).toBe('delivered');
      expect(result.workerId).toBe('architect');

      // Verify the message landed in the inbox
      const entries = await inbox.readInbox('architect');
      expect(entries.length).toBe(1);
      expect(entries[0]!.message.id).toBe('msg-a1b2c3d4');
    });

    it('ignores messages not addressed to local owner', async () => {
      const message = makeMessage({ to: 'alex/backend-dev' });
      const result = await router.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('ignored');
      expect(result.reason).toContain('not for local owner');
    });

    it('bounces messages for unknown workers', async () => {
      const message = makeMessage({ to: 'stefan/infra-ops' });
      const result = await router.route(message, 'raw', 'C0CHAN', 'U0USER', '12345');

      expect(result.success).toBe(false);
      expect(result.action).toBe('bounced');
      expect(result.errorCode).toBe('ERR_UNKNOWN_RECIPIENT');
      expect(result.reason).toContain('not found');

      // Verify bounce was sent
      expect(mockSender.sendReply).toHaveBeenCalledOnce();
      const bounceCall = mockSender.sendReply.mock.calls[0]![0];
      expect(bounceCall.intent).toBe('error');
      expect(bounceCall.body).toContain('ERR_UNKNOWN_RECIPIENT');
      expect(bounceCall.body).toContain('infra-ops');
    });

    it('bounces messages for inactive workers', async () => {
      const message = makeMessage({ to: 'stefan/disabled-worker' });
      const result = await router.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('bounced');
      expect(result.errorCode).toBe('ERR_UNKNOWN_RECIPIENT');
    });

    it('bounces messages for workers without receive permission', async () => {
      const message = makeMessage({ to: 'stefan/no-receive' });
      const result = await router.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('bounced');
      expect(result.errorCode).toBe('ERR_UNKNOWN_RECIPIENT');
      // Per spec: don't reveal the worker exists but is restricted
    });

    it('bounces messages for workers with default deny permission', async () => {
      // Create a router with a worker that has no permission entry
      const localWorkersWithExtra = [
        ...LOCAL_WORKERS,
        { id: 'unlisted-worker', status: 'active' },
      ];

      const routerExtra = new Router(config, {
        hqRoot: tempDir,
        registryLoader: () => localWorkersWithExtra,
        sender: mockSender as any,
        inbox,
      });

      const message = makeMessage({ to: 'stefan/unlisted-worker' });
      const result = await routerExtra.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('bounced');
      expect(result.errorCode).toBe('ERR_UNKNOWN_RECIPIENT');
    });

    it('bounces messages with unsupported intent for the worker', async () => {
      // qa-tester only allows 'query' and 'response'
      const message = makeMessage({
        to: 'stefan/qa-tester',
        intent: 'handoff',
        from: 'alex/qa-tester',
      });
      const result = await router.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('bounced');
      expect(result.errorCode).toBe('ERR_UNSUPPORTED_INTENT');
    });

    it('bounces messages from unauthorized peers', async () => {
      // backend-dev only allows peer 'alex'
      const message = makeMessage({
        to: 'stefan/backend-dev',
        from: 'maria/designer',
      });
      const result = await router.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('bounced');
      expect(result.errorCode).toBe('ERR_AUTH_FAILED');
    });

    it('bounces expired messages', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const message = makeMessage({ expires: pastDate });
      const result = await router.route(message, 'raw', 'C0CHAN', 'U0USER', '12345');

      expect(result.success).toBe(false);
      expect(result.action).toBe('bounced');
      expect(result.errorCode).toBe('ERR_EXPIRED');
    });

    it('delivers messages with future expiry', async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const message = makeMessage({ expires: futureDate });
      const result = await router.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(true);
      expect(result.action).toBe('delivered');
    });

    it('accepts messages to architect from any peer (wildcard)', async () => {
      const message = makeMessage({
        to: 'stefan/architect',
        from: 'maria/designer',
        intent: 'query',
      });
      const result = await router.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(true);
      expect(result.action).toBe('delivered');
    });

    it('rejects messages with invalid to address format', async () => {
      const message = makeMessage({ to: 'invalid' });
      const result = await router.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('rejected');
    });

    it('sends bounce via send() when no slackTs provided', async () => {
      const message = makeMessage({ to: 'stefan/infra-ops' });
      await router.route(message, 'raw', 'C0CHAN');

      // Should use send() instead of sendReply() when no ts
      expect(mockSender.send).toHaveBeenCalledOnce();
      expect(mockSender.sendReply).not.toHaveBeenCalled();
    });

    it('works without sender (no bounce sent)', async () => {
      const routerNoSender = new Router(config, {
        hqRoot: tempDir,
        registryLoader: () => LOCAL_WORKERS,
        inbox,
      });

      const message = makeMessage({ to: 'stefan/infra-ops' });
      const result = await routerNoSender.route(message, 'raw', 'C0CHAN');

      // Should still return bounced result, just no Slack message sent
      expect(result.success).toBe(false);
      expect(result.action).toBe('bounced');
    });
  });

  describe('processRaw', () => {
    it('processes a valid raw HIAMP message text', async () => {
      const rawText = [
        'alex/backend-dev \u2192 stefan/architect',
        '',
        'The API contract is ready.',
        '',
        '\u2500'.repeat(15),
        'hq-msg:v1 | id:msg-a1b2c3d4',
        'from:alex/backend-dev | to:stefan/architect',
        'intent:handoff',
      ].join('\n');

      const result = await router.processRaw(rawText, 'C0CHAN', 'U0USER');

      expect(result.success).toBe(true);
      expect(result.action).toBe('delivered');
      expect(result.workerId).toBe('architect');
    });

    it('rejects raw text that fails parsing', async () => {
      const result = await router.processRaw('Not a HIAMP message', 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('rejected');
      expect(result.reason).toContain('Parse failed');
    });

    it('rejects raw text that fails validation', async () => {
      const rawText = [
        'alex/backend-dev \u2192 stefan/architect',
        '',
        'Body text.',
        '',
        '\u2500'.repeat(15),
        'hq-msg:v2 | id:msg-a1b2c3d4',
        'from:alex/backend-dev | to:stefan/architect',
        'intent:handoff',
      ].join('\n');

      const result = await router.processRaw(rawText, 'C0CHAN');

      expect(result.success).toBe(false);
      expect(result.action).toBe('rejected');
      expect(result.reason).toContain('Validation failed');
    });
  });

  describe('reloadRegistry', () => {
    it('clears cached worker registry', async () => {
      let callCount = 0;
      const dynamicLoader = () => {
        callCount++;
        return LOCAL_WORKERS;
      };

      const routerDynamic = new Router(config, {
        hqRoot: tempDir,
        registryLoader: dynamicLoader,
        inbox,
      });

      // First route call loads the registry
      await routerDynamic.route(makeMessage(), 'raw', 'C0CHAN');
      expect(callCount).toBe(1);

      // Second route call uses cache
      await routerDynamic.route(makeMessage(), 'raw', 'C0CHAN');
      expect(callCount).toBe(1);

      // After reload, next call reloads
      routerDynamic.reloadRegistry();
      await routerDynamic.route(makeMessage(), 'raw', 'C0CHAN');
      expect(callCount).toBe(2);
    });
  });

  describe('worker-permissions default: allow', () => {
    it('accepts messages for unlisted workers when default is allow', async () => {
      const allowConfig = makeConfig({
        workerPermissions: {
          default: 'allow',
          workers: [],
        },
      });

      const localWorkersWithExtra = [
        ...LOCAL_WORKERS,
        { id: 'unlisted-worker', status: 'active' },
      ];

      const allowRouter = new Router(allowConfig, {
        hqRoot: tempDir,
        registryLoader: () => localWorkersWithExtra,
        inbox,
      });

      const message = makeMessage({ to: 'stefan/unlisted-worker' });
      const result = await allowRouter.route(message, 'raw', 'C0CHAN');

      expect(result.success).toBe(true);
      expect(result.action).toBe('delivered');
    });
  });
});
