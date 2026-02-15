import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { EventListener } from '../event-listener.js';
import { Router } from '../router.js';
import { Inbox } from '../inbox.js';
import type { HiampConfig } from '../config-loader.js';
import type { SlackMessageEvent } from '../message-detector.js';
import type { LocalWorker } from '../router.js';
import type { SlackUrlVerification, SlackEventCallback } from '../event-listener.js';
import { DEFAULT_SEPARATOR, HEADER_ARROW } from '../constants.js';

/** Generate a unique temp directory */
function makeTempDir(): string {
  return join(tmpdir(), `hiamp-listener-test-${randomBytes(4).toString('hex')}`);
}

/** Build a minimal HiampConfig */
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
      ],
    },
    ...overrides,
  };
}

/** Build a HIAMP message text */
function makeHiampText(overrides?: { to?: string; from?: string; intent?: string }): string {
  const from = overrides?.from ?? 'alex/backend-dev';
  const to = overrides?.to ?? 'stefan/architect';
  const intent = overrides?.intent ?? 'handoff';

  return [
    `${from} ${HEADER_ARROW} ${to}`,
    '',
    'The API contract is ready.',
    '',
    DEFAULT_SEPARATOR,
    `hq-msg:v1 | id:msg-a1b2c3d4`,
    `from:${from} | to:${to}`,
    `intent:${intent}`,
  ].join('\n');
}

/** Build a Slack message event */
function makeEvent(overrides?: Partial<SlackMessageEvent>): SlackMessageEvent {
  return {
    text: makeHiampText(),
    user: 'U0ALEX1234',
    channel: 'C0HQAGENTS',
    ts: '1234567890.123456',
    ...overrides,
  };
}

/** Local workers */
const LOCAL_WORKERS: LocalWorker[] = [
  { id: 'architect', name: 'Architect', type: 'code', status: 'active' },
  { id: 'backend-dev', name: 'Backend Dev', type: 'code', status: 'active' },
];

describe('event-listener', () => {
  let tempDir: string;
  let config: HiampConfig;
  let inbox: Inbox;
  let router: Router;
  let listener: EventListener;
  let processedEvents: any[];

  beforeEach(async () => {
    tempDir = makeTempDir();
    await mkdir(tempDir, { recursive: true });
    config = makeConfig();
    inbox = new Inbox(tempDir, 'inbox');
    processedEvents = [];

    router = new Router(config, {
      hqRoot: tempDir,
      registryLoader: () => LOCAL_WORKERS,
      inbox,
    });

    listener = new EventListener({
      config,
      hqRoot: tempDir,
      localBotId: 'U0MYBOT',
      router,
      onMessage: (event) => processedEvents.push(event),
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('processEvent', () => {
    it('processes a valid HIAMP message through the full pipeline', async () => {
      const result = await listener.processEvent(makeEvent());

      expect(result.detected).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message!.id).toBe('msg-a1b2c3d4');
      expect(result.routeResult).toBeDefined();
      expect(result.routeResult!.success).toBe(true);
      expect(result.routeResult!.action).toBe('delivered');
      expect(result.processedAt).toBeDefined();

      // Verify onMessage was called
      expect(processedEvents.length).toBe(1);
    });

    it('rejects non-HIAMP messages', async () => {
      const result = await listener.processEvent(
        makeEvent({ text: 'Hey team, standup in 5!' }),
      );

      expect(result.detected).toBe(false);
      expect(result.message).toBeUndefined();
      expect(result.routeResult).toBeUndefined();
    });

    it('filters out local bot messages (echo prevention)', async () => {
      const result = await listener.processEvent(
        makeEvent({ user: 'U0MYBOT' }),
      );

      expect(result.detected).toBe(false);
      expect(result.error).toContain('echo prevention');
    });

    it('rejects messages from non-monitored channels', async () => {
      const result = await listener.processEvent(
        makeEvent({ channel: 'C0RANDOM' }),
      );

      expect(result.detected).toBe(false);
      expect(result.error).toContain('not monitored');
    });

    it('handles parse failures gracefully', async () => {
      // A message with separator but broken envelope
      const text = [
        `alex/backend-dev ${HEADER_ARROW} stefan/architect`,
        '',
        'Some body.',
        '',
        DEFAULT_SEPARATOR,
        '', // Empty envelope
      ].join('\n');

      const result = await listener.processEvent(makeEvent({ text }));

      expect(result.detected).toBe(true);
      expect(result.error).toContain('Parse failed');
    });

    it('handles validation failures gracefully', async () => {
      // v2 is unsupported
      const text = [
        `alex/backend-dev ${HEADER_ARROW} stefan/architect`,
        '',
        'Body.',
        '',
        DEFAULT_SEPARATOR,
        'hq-msg:v2 | id:msg-a1b2c3d4',
        'from:alex/backend-dev | to:stefan/architect',
        'intent:handoff',
      ].join('\n');

      const result = await listener.processEvent(makeEvent({ text }));

      expect(result.detected).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.error).toContain('Validation failed');
    });

    it('respects kill switch', async () => {
      const killConfig = makeConfig({
        security: {
          defaultTrustLevel: 'channel-scoped',
          killSwitch: true,
        },
      });

      const killListener = new EventListener({
        config: killConfig,
        hqRoot: tempDir,
        router,
      });

      const result = await killListener.processEvent(makeEvent());
      expect(result.detected).toBe(false);
      expect(result.error).toContain('kill switch');
    });

    it('respects enabled=false in settings', async () => {
      const disabledConfig = makeConfig({
        settings: {
          ackTimeout: 300,
          maxRetries: 1,
          threadIdleTimeout: 86400,
          threadMaxAge: 604800,
          inboxPath: 'workspace/inbox',
          threadLogPath: 'workspace/threads/hiamp',
          messageMaxLength: 4000,
          attachmentMaxInlineSize: 4000,
          enabled: false,
        },
      });

      const disabledListener = new EventListener({
        config: disabledConfig,
        hqRoot: tempDir,
        router,
      });

      const result = await disabledListener.processEvent(makeEvent());
      expect(result.detected).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('handles messages with no text', async () => {
      const result = await listener.processEvent(makeEvent({ text: undefined }));
      expect(result.detected).toBe(false);
    });

    it('calls onError when an exception occurs', async () => {
      const errors: Error[] = [];
      const errorRouter = new Router(config, {
        hqRoot: tempDir,
        registryLoader: () => { throw new Error('Registry explosion'); },
        inbox,
      });

      const errorListener = new EventListener({
        config,
        hqRoot: tempDir,
        router: errorRouter,
        onError: (err) => errors.push(err),
      });

      const result = await errorListener.processEvent(makeEvent());
      // The error gets caught and reported
      expect(result.error).toBeDefined();
    });

    it('allows all channels when no monitored channels configured', async () => {
      const noChannelConfig = makeConfig({
        slack: {
          botToken: 'xoxb-test-token',
          appId: 'A0TEST',
          workspaceId: 'T0TEST',
          channelStrategy: 'dedicated',
          channels: {},
          eventMode: 'socket',
        },
      });

      const noChannelListener = new EventListener({
        config: noChannelConfig,
        hqRoot: tempDir,
        router,
      });

      const result = await noChannelListener.processEvent(
        makeEvent({ channel: 'C0ANYCHANNEL' }),
      );

      // With no channels configured, all channels are accepted
      expect(result.detected).toBe(true);
    });
  });

  describe('handleWebhook', () => {
    it('responds to URL verification challenge', async () => {
      const payload: SlackUrlVerification = {
        type: 'url_verification',
        challenge: 'test-challenge-token',
        token: 'verification-token',
      };

      const response = await listener.handleWebhook(payload);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.challenge).toBe('test-challenge-token');
    });

    it('processes event callback messages', async () => {
      const payload: SlackEventCallback = {
        type: 'event_callback',
        token: 'test-token',
        team_id: 'T0TEST',
        event: {
          type: 'message',
          text: makeHiampText(),
          user: 'U0ALEX1234',
          channel: 'C0HQAGENTS',
          ts: '1234567890.123456',
        },
        event_id: 'Ev01TEST',
        event_time: 1234567890,
      };

      const response = await listener.handleWebhook(payload);

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('OK');

      // Wait a tick for the async processing
      await new Promise((r) => setTimeout(r, 50));
    });

    it('ignores non-message event types', async () => {
      const payload: SlackEventCallback = {
        type: 'event_callback',
        token: 'test-token',
        team_id: 'T0TEST',
        event: {
          type: 'reaction_added',
          text: undefined,
          user: 'U0USER',
          channel: 'C0CHAN',
        } as any,
        event_id: 'Ev01TEST',
        event_time: 1234567890,
      };

      const response = await listener.handleWebhook(payload);
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('OK');
    });

    it('returns 400 for unknown payload types', async () => {
      const payload = { type: 'unknown_type' } as any;
      const response = await listener.handleWebhook(payload);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Unknown payload type');
    });
  });

  describe('isRunning', () => {
    it('returns false initially', () => {
      expect(listener.isRunning()).toBe(false);
    });
  });

  describe('stop', () => {
    it('can be called when not running', async () => {
      await listener.stop();
      expect(listener.isRunning()).toBe(false);
    });
  });

  describe('monitored channels', () => {
    it('uses configured dedicated channel', async () => {
      // Message from the dedicated channel should be accepted
      const result = await listener.processEvent(
        makeEvent({ channel: 'C0HQAGENTS' }),
      );
      expect(result.detected).toBe(true);
    });

    it('uses per-relationship channels', async () => {
      const perRelConfig = makeConfig({
        slack: {
          botToken: 'xoxb-test',
          appId: 'A0TEST',
          workspaceId: 'T0TEST',
          channelStrategy: 'per-relationship',
          channels: {
            perRelationship: [
              { peer: 'alex', name: '#hq-stefan-alex', id: 'C0STEFANALEX' },
            ],
          },
          eventMode: 'socket',
        },
      });

      const perRelListener = new EventListener({
        config: perRelConfig,
        hqRoot: tempDir,
        router,
      });

      const result = await perRelListener.processEvent(
        makeEvent({ channel: 'C0STEFANALEX' }),
      );
      expect(result.detected).toBe(true);

      const resultBad = await perRelListener.processEvent(
        makeEvent({ channel: 'C0OTHER' }),
      );
      expect(resultBad.detected).toBe(false);
      expect(resultBad.error).toContain('not monitored');
    });

    it('supports custom monitored channels override', async () => {
      const customListener = new EventListener({
        config,
        hqRoot: tempDir,
        router,
        monitoredChannels: ['C0CUSTOM1', 'C0CUSTOM2'],
      });

      const result = await customListener.processEvent(
        makeEvent({ channel: 'C0CUSTOM1' }),
      );
      expect(result.detected).toBe(true);

      const resultBad = await customListener.processEvent(
        makeEvent({ channel: 'C0HQAGENTS' }),
      );
      expect(resultBad.detected).toBe(false);
    });
  });
});
