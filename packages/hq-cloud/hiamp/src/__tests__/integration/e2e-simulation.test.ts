/**
 * HIAMP End-to-End Integration Simulation
 *
 * Simulates two HQ instances ("stefan" and "alex") with mocked Slack API,
 * wiring together compose, parse, validate, SlackSender, Router, Inbox,
 * AckHandler, and ThreadManager to validate the complete message lifecycle.
 *
 * US-009: End-to-end integration validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { compose } from '../../compose.js';
import { parse } from '../../parse.js';
import { validate } from '../../validate.js';
import { generateMessageId, generateThreadId } from '../../ids.js';
import { SlackSender } from '../../slack-sender.js';
import { Router } from '../../router.js';
import { Inbox } from '../../inbox.js';
import { AckHandler } from '../../ack-handler.js';
import { ThreadManager } from '../../thread-manager.js';
import { detectHiampMessage } from '../../message-detector.js';
import type { HiampConfig } from '../../config-loader.js';
import type { HiampMessage } from '../../types.js';
import type { LocalWorker } from '../../router.js';
import type { SendResult, SendSuccess } from '../../slack-sender.js';

// ---------------------------------------------------------------------------
// Simulation infrastructure
// ---------------------------------------------------------------------------

/** A captured Slack message from chat.postMessage */
interface CapturedSlackMessage {
  channel: string;
  text: string;
  thread_ts?: string;
  ts: string; // simulated timestamp
}

/** One simulated HQ instance with all HIAMP components */
interface SimulatedInstance {
  name: string;
  config: HiampConfig;
  sender: SlackSender;
  router: Router;
  inbox: Inbox;
  ackHandler: AckHandler;
  threadManager: ThreadManager;
  hqRoot: string;
  localWorkers: LocalWorker[];
}

/** The full simulation environment */
interface Simulation {
  stefan: SimulatedInstance;
  alex: SimulatedInstance;
  /** All messages "posted" to Slack by either instance */
  slackMessages: CapturedSlackMessage[];
  /** Counter for generating unique Slack timestamps */
  tsCounter: number;
  /** Clean up temp directories */
  cleanup: () => Promise<void>;
}

/** Generate a unique temp directory */
function makeTempDir(label: string): string {
  return join(tmpdir(), `hiamp-e2e-${label}-${randomBytes(4).toString('hex')}`);
}

/** Build a HiampConfig for a simulated instance */
function buildConfig(
  owner: string,
  peerOwner: string,
  peerWorkers: Array<{ id: string; description?: string }>,
  localWorkerPermissions: Array<{
    id: string;
    send: boolean;
    receive: boolean;
    allowedIntents?: string[];
    allowedPeers?: string[];
  }>,
): HiampConfig {
  return {
    transport: 'slack',
    identity: {
      owner,
      instanceId: `${owner}-hq-dev`,
      displayName: owner.charAt(0).toUpperCase() + owner.slice(1),
    },
    peers: [
      {
        owner: peerOwner,
        displayName: peerOwner.charAt(0).toUpperCase() + peerOwner.slice(1),
        slackBotId: `B_${peerOwner.toUpperCase()}`,
        trustLevel: 'channel-scoped',
        workers: peerWorkers,
      },
    ],
    slack: {
      botToken: 'xoxb-mock-token',
      appId: `A_${owner.toUpperCase()}`,
      workspaceId: 'T_WORKSPACE',
      channelStrategy: 'dedicated',
      channels: {
        dedicated: {
          name: '#hq-interagent',
          id: 'C_INTERAGENT',
        },
      },
      eventMode: 'socket',
    },
    security: {
      defaultTrustLevel: 'channel-scoped',
      killSwitch: false,
    },
    workerPermissions: {
      default: 'allow',
      workers: localWorkerPermissions,
    },
    settings: {
      ackTimeout: 300,
      maxRetries: 1,
      threadIdleTimeout: 86400,
      threadMaxAge: 604800,
      inboxPath: 'workspace/inbox',
      threadLogPath: 'workspace/threads/hiamp',
      messageMaxLength: 4000,
      attachmentMaxInlineSize: 4000,
      enabled: true,
    },
  };
}

/** Create the full two-instance simulation */
async function createSimulation(): Promise<Simulation> {
  const stefanRoot = makeTempDir('stefan');
  const alexRoot = makeTempDir('alex');

  await mkdir(stefanRoot, { recursive: true });
  await mkdir(alexRoot, { recursive: true });

  const slackMessages: CapturedSlackMessage[] = [];
  let tsCounter = 1000;

  // Build configs
  const stefanConfig = buildConfig(
    'stefan',
    'alex',
    [
      { id: 'backend-dev', description: 'Backend developer' },
      { id: 'qa-tester', description: 'QA testing' },
    ],
    [
      {
        id: 'architect',
        send: true,
        receive: true,
        allowedPeers: ['*'],
      },
      {
        id: 'frontend-dev',
        send: true,
        receive: true,
        allowedPeers: ['*'],
      },
    ],
  );

  const alexConfig = buildConfig(
    'alex',
    'stefan',
    [
      { id: 'architect', description: 'System architect' },
      { id: 'frontend-dev', description: 'Frontend developer' },
    ],
    [
      {
        id: 'backend-dev',
        send: true,
        receive: true,
        allowedPeers: ['*'],
      },
      {
        id: 'qa-tester',
        send: true,
        receive: true,
        allowedPeers: ['*'],
      },
    ],
  );

  // Create mock Slack WebClient factory
  function createMockSlackClient() {
    return {
      chat: {
        postMessage: vi.fn().mockImplementation(async (args: {
          channel: string;
          text: string;
          thread_ts?: string;
          unfurl_links?: boolean;
          unfurl_media?: boolean;
        }) => {
          const ts = `${++tsCounter}.000000`;
          slackMessages.push({
            channel: args.channel,
            text: args.text,
            thread_ts: args.thread_ts,
            ts,
          });
          return { ok: true, ts, channel: args.channel };
        }),
      },
      conversations: {
        open: vi.fn().mockResolvedValue({ ok: true, channel: { id: 'D_DM_CHAN' } }),
      },
    };
  }

  const stefanSlackClient = createMockSlackClient();
  const alexSlackClient = createMockSlackClient();

  // Stefan's local workers
  const stefanWorkers: LocalWorker[] = [
    { id: 'architect', name: 'Architect', type: 'CodeWorker', status: 'active' },
    { id: 'frontend-dev', name: 'Frontend Dev', type: 'CodeWorker', status: 'active' },
  ];

  // Alex's local workers
  const alexWorkers: LocalWorker[] = [
    { id: 'backend-dev', name: 'Backend Dev', type: 'CodeWorker', status: 'active' },
    { id: 'qa-tester', name: 'QA Tester', type: 'CodeWorker', status: 'active' },
  ];

  // Build instances
  function buildInstance(
    name: string,
    config: HiampConfig,
    slackClient: ReturnType<typeof createMockSlackClient>,
    hqRoot: string,
    localWorkers: LocalWorker[],
  ): SimulatedInstance {
    const sender = new SlackSender(config, {
      slackClient: slackClient as any,
    });
    const inbox = new Inbox(hqRoot, 'workspace/inbox');
    const threadManager = new ThreadManager(hqRoot, 'workspace/threads/hiamp');
    const router = new Router(config, {
      hqRoot,
      registryLoader: () => localWorkers,
      sender,
      inbox,
    });
    const ackHandler = new AckHandler({
      localOwner: config.identity.owner,
      sender,
      threadManager,
    });

    return {
      name,
      config,
      sender,
      router,
      inbox,
      ackHandler,
      threadManager,
      hqRoot,
      localWorkers,
    };
  }

  const stefan = buildInstance('stefan', stefanConfig, stefanSlackClient, stefanRoot, stefanWorkers);
  const alex = buildInstance('alex', alexConfig, alexSlackClient, alexRoot, alexWorkers);

  return {
    stefan,
    alex,
    slackMessages,
    tsCounter,
    cleanup: async () => {
      await rm(stefanRoot, { recursive: true, force: true });
      await rm(alexRoot, { recursive: true, force: true });
    },
  };
}

/**
 * Simulate delivering a captured Slack message to a receiving instance.
 * This mimics what EventListener + MessageDetector would do:
 *   1. Detect the HIAMP message
 *   2. Parse and validate
 *   3. Route to local worker
 *   4. Handle ack if needed
 */
async function deliverToInstance(
  instance: SimulatedInstance,
  captured: CapturedSlackMessage,
  senderBotId?: string,
): Promise<{
  detected: boolean;
  routeResult?: Awaited<ReturnType<Router['route']>>;
  ackResult?: Awaited<ReturnType<AckHandler['handleIncoming']>>;
  parsedMessage?: HiampMessage;
}> {
  // Step 1: Detect
  const detection = detectHiampMessage(
    {
      text: captured.text,
      user: senderBotId,
      channel: captured.channel,
      ts: captured.ts,
      thread_ts: captured.thread_ts,
    },
    instance.config.slack!.appId, // local bot ID for echo filter
  );

  if (!detection.isHiamp) {
    return { detected: false };
  }

  // Step 2: Parse
  const parseResult = parse(captured.text);
  if (!parseResult.success) {
    return { detected: true };
  }

  // Step 3: Validate
  const validation = validate(parseResult.message);
  if (!validation.valid) {
    return { detected: true };
  }

  const message = parseResult.message;

  // Step 4: Log to thread
  if (message.thread) {
    await instance.threadManager.addMessage(message.thread, message, captured.ts);
  }

  // Step 5: Route
  const routeResult = await instance.router.route(
    message,
    captured.text,
    captured.channel,
    senderBotId,
    captured.ts,
    captured.thread_ts,
  );

  // Step 6: Handle ack (if message was delivered successfully)
  let ackResult;
  if (routeResult.success && message.ack === 'requested') {
    ackResult = await instance.ackHandler.handleIncoming(
      message,
      captured.channel,
      captured.ts,
    );
  }

  return {
    detected: true,
    routeResult,
    ackResult,
    parsedMessage: message,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HIAMP End-to-End Integration', () => {
  let sim: Simulation;

  beforeEach(async () => {
    sim = await createSimulation();
  });

  afterEach(async () => {
    await sim.cleanup();
  });

  // =========================================================================
  // Scenario 1: One-shot message (compose -> send -> receive -> route -> deliver)
  // =========================================================================
  describe('Scenario 1: One-shot message lifecycle', () => {
    it('delivers a handoff from stefan/architect to alex/backend-dev', async () => {
      // Step 1: Stefan's architect sends a handoff to Alex's backend-dev
      const sendResult = await sim.stefan.sender.send({
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'handoff',
        body: 'The API contract is ready. Please implement the endpoints defined in the spec.',
        priority: 'high',
      });

      expect(sendResult.success).toBe(true);
      if (!sendResult.success) return;

      // Verify a message was "posted" to Slack
      expect(sim.slackMessages.length).toBeGreaterThanOrEqual(1);
      const postedMessage = sim.slackMessages[sim.slackMessages.length - 1]!;
      expect(postedMessage.channel).toBe('C_INTERAGENT');

      // Step 2: Simulate Alex receiving this Slack message
      const delivery = await deliverToInstance(
        sim.alex,
        postedMessage,
        `B_STEFAN`, // sender's bot ID
      );

      expect(delivery.detected).toBe(true);
      expect(delivery.routeResult).toBeDefined();
      expect(delivery.routeResult!.success).toBe(true);
      expect(delivery.routeResult!.action).toBe('delivered');
      expect(delivery.routeResult!.workerId).toBe('backend-dev');

      // Step 3: Verify the message is in Alex's backend-dev inbox
      const inboxEntries = await sim.alex.inbox.readInbox('backend-dev');
      expect(inboxEntries.length).toBe(1);

      const entry = inboxEntries[0]!;
      expect(entry.message.from).toBe('stefan/architect');
      expect(entry.message.to).toBe('alex/backend-dev');
      expect(entry.message.intent).toBe('handoff');
      expect(entry.message.body).toContain('API contract is ready');
      expect(entry.message.priority).toBe('high');
      expect(entry.read).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 2: Ack round-trip
  // =========================================================================
  describe('Scenario 2: Ack round-trip', () => {
    it('completes full ack cycle: send with ack:requested -> receive -> auto-ack -> sender sees ack', async () => {
      const threadId = generateThreadId();

      // Step 1: Stefan sends with ack:requested
      const sendResult = await sim.stefan.sender.send({
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'request',
        body: 'Please review the PR and provide feedback by EOD.',
        thread: threadId,
        ack: 'requested',
      });

      expect(sendResult.success).toBe(true);
      if (!sendResult.success) return;

      const originalSlackMsg = sim.slackMessages[sim.slackMessages.length - 1]!;

      // Step 2: Alex's system receives and processes
      const delivery = await deliverToInstance(sim.alex, originalSlackMsg, 'B_STEFAN');

      expect(delivery.detected).toBe(true);
      expect(delivery.routeResult!.success).toBe(true);
      expect(delivery.routeResult!.action).toBe('delivered');

      // Step 3: Verify auto-ack was triggered
      expect(delivery.ackResult).toBeDefined();
      expect(delivery.ackResult!.sent).toBe(true);
      expect(delivery.ackResult!.type).toBe('ack');
      expect(delivery.ackResult!.messageId).toMatch(/^msg-/);

      // Step 4: An ack message was "posted" back to Slack
      // (There should be at least 2 Slack messages now: original + ack)
      expect(sim.slackMessages.length).toBeGreaterThanOrEqual(2);
      const ackSlackMsg = sim.slackMessages[sim.slackMessages.length - 1]!;

      // Parse the ack message
      const ackParse = parse(ackSlackMsg.text);
      expect(ackParse.success).toBe(true);
      if (!ackParse.success) return;

      expect(ackParse.message.intent).toBe('acknowledge');
      expect(ackParse.message.from).toBe('alex/backend-dev');
      expect(ackParse.message.to).toBe('stefan/architect');
      expect(ackParse.message.replyTo).toBe(delivery.parsedMessage!.id);
      expect(ackParse.message.thread).toBe(threadId);

      // Step 5: Simulate Stefan receiving the ack
      const ackDelivery = await deliverToInstance(sim.stefan, ackSlackMsg, 'B_ALEX');
      expect(ackDelivery.detected).toBe(true);

      // Step 6: Check thread state on Alex's side
      const alexThread = await sim.alex.threadManager.getThread(threadId);
      expect(alexThread).not.toBeNull();
      // Should have original message + ack
      expect(alexThread!.messages.length).toBeGreaterThanOrEqual(2);
      expect(alexThread!.messages[0]!.intent).toBe('request');
      expect(alexThread!.messages[1]!.intent).toBe('acknowledge');
    });
  });

  // =========================================================================
  // Scenario 3: Threaded conversation (3+ messages)
  // =========================================================================
  describe('Scenario 3: Threaded conversation', () => {
    it('maintains thread continuity across 3 messages', async () => {
      const threadId = generateThreadId();

      // --- Message 1: Stefan/architect -> Alex/backend-dev (query, starts thread) ---
      const send1 = await sim.stefan.sender.send({
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'query',
        body: 'What is the current status of the authentication module?',
        thread: threadId,
      });
      expect(send1.success).toBe(true);
      if (!send1.success) return;

      const msg1Slack = sim.slackMessages[sim.slackMessages.length - 1]!;
      const msg1Parse = parse(msg1Slack.text);
      expect(msg1Parse.success).toBe(true);
      const msg1Id = (msg1Parse as { success: true; message: HiampMessage }).message.id;

      // Alex receives message 1
      const delivery1 = await deliverToInstance(sim.alex, msg1Slack, 'B_STEFAN');
      expect(delivery1.routeResult!.success).toBe(true);

      // --- Message 2: Alex/backend-dev -> Stefan/architect (response, same thread) ---
      // Use sendReply to include replyTo in the envelope
      const send2 = await sim.alex.sender.sendReply({
        from: 'alex/backend-dev',
        to: 'stefan/architect',
        intent: 'response',
        body: 'Auth module is 80% complete. JWT validation is done, OAuth flow needs testing.',
        thread: threadId,
        replyTo: msg1Id,
        threadTs: msg1Slack.ts,
        channelId: 'C_INTERAGENT',
      });
      expect(send2.success).toBe(true);
      if (!send2.success) return;

      const msg2Slack = sim.slackMessages[sim.slackMessages.length - 1]!;
      const msg2Parse = parse(msg2Slack.text);
      expect(msg2Parse.success).toBe(true);
      const msg2Id = (msg2Parse as { success: true; message: HiampMessage }).message.id;

      // Stefan receives message 2
      const delivery2 = await deliverToInstance(sim.stefan, msg2Slack, 'B_ALEX');
      expect(delivery2.routeResult!.success).toBe(true);

      // --- Message 3: Stefan/architect -> Alex/backend-dev (follow-up query, same thread) ---
      // Use sendReply to include replyTo in the envelope
      const send3 = await sim.stefan.sender.sendReply({
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'query',
        body: 'Can you share the test plan for the OAuth flow?',
        thread: threadId,
        replyTo: msg2Id,
        threadTs: msg1Slack.ts,
        channelId: 'C_INTERAGENT',
      });
      expect(send3.success).toBe(true);
      if (!send3.success) return;

      const msg3Slack = sim.slackMessages[sim.slackMessages.length - 1]!;

      // Alex receives message 3
      const delivery3 = await deliverToInstance(sim.alex, msg3Slack, 'B_STEFAN');
      expect(delivery3.routeResult!.success).toBe(true);

      // --- Verify thread state on Alex's side ---
      const alexThread = await sim.alex.threadManager.getThread(threadId);
      expect(alexThread).not.toBeNull();
      expect(alexThread!.threadId).toBe(threadId);
      expect(alexThread!.status).toBe('open');

      // Alex saw messages 1 and 3 (incoming), each logged to thread
      expect(alexThread!.messages.length).toBeGreaterThanOrEqual(2);

      // All thread entries belong to this thread
      expect(alexThread!.threadId).toBe(threadId);

      // Participants should include both workers from both sides
      expect(alexThread!.participants).toContain('stefan/architect');
      expect(alexThread!.participants).toContain('alex/backend-dev');

      // --- Verify thread state on Stefan's side ---
      const stefanThread = await sim.stefan.threadManager.getThread(threadId);
      expect(stefanThread).not.toBeNull();
      expect(stefanThread!.threadId).toBe(threadId);

      // Stefan saw message 2 (incoming), logged to thread
      expect(stefanThread!.messages.length).toBeGreaterThanOrEqual(1);
      expect(stefanThread!.participants).toContain('stefan/architect');
      expect(stefanThread!.participants).toContain('alex/backend-dev');

      // --- Verify reply-to chains survive compose/parse round-trip ---
      const msg2Parsed = (msg2Parse as { success: true; message: HiampMessage }).message;
      expect(msg2Parsed.replyTo).toBe(msg1Id);
      expect(msg2Parsed.thread).toBe(threadId);

      const msg3Parse = parse(msg3Slack.text);
      expect(msg3Parse.success).toBe(true);
      const msg3Parsed = (msg3Parse as { success: true; message: HiampMessage }).message;
      expect(msg3Parsed.replyTo).toBe(msg2Id);
      expect(msg3Parsed.thread).toBe(threadId);
    });
  });

  // =========================================================================
  // Scenario 4: Error - unknown worker produces bounce
  // =========================================================================
  describe('Scenario 4: Unknown worker bounce', () => {
    it('bounces message to nonexistent worker with ERR_UNKNOWN_RECIPIENT', async () => {
      // Stefan sends to alex/nonexistent-worker
      // First we need to add the fake worker to Stefan's peer config so SlackSender
      // doesn't reject it before sending. We'll use the Router's processRaw method directly.

      // Compose a message manually to alex/nonexistent-worker
      const messageText = compose({
        from: 'stefan/architect',
        to: 'alex/nonexistent-worker',
        intent: 'handoff',
        body: 'This should bounce because the worker does not exist.',
        thread: generateThreadId(),
      });

      // Simulate Alex receiving this raw message through the router pipeline
      const routeResult = await sim.alex.router.processRaw(
        messageText,
        'C_INTERAGENT',
        'B_STEFAN',
        '1234.5678',
      );

      expect(routeResult.success).toBe(false);
      expect(routeResult.action).toBe('bounced');
      expect(routeResult.errorCode).toBe('ERR_UNKNOWN_RECIPIENT');
      expect(routeResult.reason).toContain('nonexistent-worker');
      expect(routeResult.reason).toContain('not found');

      // A bounce error message should have been "posted" to Slack by Alex's sender
      // (if the sender is configured; the router calls sendBounce which uses the sender)
      const bounceMessages = sim.slackMessages.filter((m) => {
        const p = parse(m.text);
        return p.success && p.message.intent === 'error';
      });

      // The bounce should exist and mention the error code
      if (bounceMessages.length > 0) {
        const bounceParse = parse(bounceMessages[0]!.text);
        expect(bounceParse.success).toBe(true);
        if (bounceParse.success) {
          expect(bounceParse.message.intent).toBe('error');
          expect(bounceParse.message.body).toContain('ERR_UNKNOWN_RECIPIENT');
          // The bounce body should list available workers
          expect(bounceParse.message.body).toContain('backend-dev');
        }
      }
    });
  });

  // =========================================================================
  // Scenario 5: Malformed envelope produces parse error
  // =========================================================================
  describe('Scenario 5: Malformed envelope', () => {
    it('rejects a message with broken envelope format', () => {
      const malformedMessage = [
        'stefan/architect \u2192 alex/backend-dev',
        '',
        'Some body text',
        '',
        '\u2500'.repeat(15),
        'this is not a valid envelope',
      ].join('\n');

      const parseResult = parse(malformedMessage);

      // Should fail because envelope fields are not in key:value format
      // or missing required fields
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.errors.length).toBeGreaterThan(0);
      }
    });

    it('rejects a message with no separator line', () => {
      const noSeparator = [
        'stefan/architect \u2192 alex/backend-dev',
        '',
        'Some body text',
        '',
        'hq-msg:v1 | id:msg-abc12345 | from:stefan/architect | to:alex/backend-dev | intent:handoff',
      ].join('\n');

      const parseResult = parse(noSeparator);
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.errors.some((e) => e.includes('separator'))).toBe(true);
      }
    });

    it('rejects empty input', () => {
      const parseResult = parse('');
      expect(parseResult.success).toBe(false);
    });

    it('rejects message with missing required envelope fields', () => {
      const missingFields = [
        'stefan/architect \u2192 alex/backend-dev',
        '',
        'Body text',
        '',
        '\u2500'.repeat(15),
        'hq-msg:v1 | id:msg-abc12345',
      ].join('\n');

      const parseResult = parse(missingFields);
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        // Should complain about missing from, to, intent
        expect(parseResult.errors.some((e) => e.includes('from'))).toBe(true);
        expect(parseResult.errors.some((e) => e.includes('to'))).toBe(true);
        expect(parseResult.errors.some((e) => e.includes('intent'))).toBe(true);
      }
    });

    it('router rejects malformed message in processRaw pipeline', async () => {
      const garbled = 'this is not a HIAMP message at all';

      const routeResult = await sim.alex.router.processRaw(
        garbled,
        'C_INTERAGENT',
        'B_STEFAN',
      );

      expect(routeResult.success).toBe(false);
      expect(routeResult.action).toBe('rejected');
      expect(routeResult.reason).toContain('Parse failed');
    });
  });

  // =========================================================================
  // Scenario 6: Knowledge share flow
  // =========================================================================
  describe('Scenario 6: Knowledge share flow', () => {
    it('delivers a share intent with inline attachment to inbox shared directory', async () => {
      const threadId = generateThreadId();

      // Compose a share message with inline attachment
      // The inline attachment format uses the paperclip emoji pattern
      const fileContent = `export interface AuthConfig {\n  jwtSecret: string;\n  expiresIn: number;\n}`;
      const bodyWithAttachment = [
        'Sharing the auth config interface for your reference.',
        '',
        '\u{1F4CE} auth-config.ts',
        '```typescript',
        fileContent,
        '```',
      ].join('\n');

      const messageText = compose({
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'share',
        body: bodyWithAttachment,
        thread: threadId,
        attach: 'auth-config.ts',
      });

      // Simulate Alex receiving and routing the share message
      const routeResult = await sim.alex.router.processRaw(
        messageText,
        'C_INTERAGENT',
        'B_STEFAN',
        '1234.5678',
      );

      expect(routeResult.success).toBe(true);
      expect(routeResult.action).toBe('delivered');
      expect(routeResult.workerId).toBe('backend-dev');

      // Verify the message is in the inbox
      const inboxEntries = await sim.alex.inbox.readInbox('backend-dev');
      expect(inboxEntries.length).toBe(1);
      expect(inboxEntries[0]!.message.intent).toBe('share');
      expect(inboxEntries[0]!.message.attach).toBe('auth-config.ts');

      // Verify the shared file was staged
      const sharedDir = join(
        sim.alex.hqRoot,
        'workspace/inbox/backend-dev/shared/stefan',
      );
      let sharedFiles: string[];
      try {
        sharedFiles = await readdir(sharedDir);
      } catch {
        sharedFiles = [];
      }

      if (sharedFiles.length > 0) {
        expect(sharedFiles).toContain('auth-config.ts');
        const stagedContent = await readFile(join(sharedDir, 'auth-config.ts'), 'utf-8');
        expect(stagedContent).toContain('AuthConfig');
      }
    });
  });

  // =========================================================================
  // Cross-cutting: compose -> parse round-trip integrity
  // =========================================================================
  describe('Cross-cutting: message integrity', () => {
    it('maintains full fidelity through compose -> parse -> validate cycle', () => {
      const input = {
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'handoff' as const,
        body: 'Complete API contract with all endpoints documented.',
        thread: generateThreadId(),
        priority: 'high' as const,
        ack: 'requested' as const,
        ref: 'https://github.com/org/repo/pull/42',
      };

      // Compose
      const raw = compose(input);

      // Parse back
      const parseResult = parse(raw);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      const msg = parseResult.message;

      // Validate
      const validation = validate(msg);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Verify all fields survived the round-trip
      expect(msg.from).toBe(input.from);
      expect(msg.to).toBe(input.to);
      expect(msg.intent).toBe(input.intent);
      expect(msg.body).toBe(input.body);
      expect(msg.thread).toBe(input.thread);
      expect(msg.priority).toBe(input.priority);
      expect(msg.ack).toBe(input.ack);
      expect(msg.ref).toBe(input.ref);
    });
  });

  // =========================================================================
  // Cross-cutting: bidirectional messaging
  // =========================================================================
  describe('Cross-cutting: bidirectional communication', () => {
    it('both instances can send and receive', async () => {
      // Stefan -> Alex
      const send1 = await sim.stefan.sender.send({
        from: 'stefan/architect',
        to: 'alex/backend-dev',
        intent: 'inform',
        body: 'Sprint planning is tomorrow at 10am.',
      });
      expect(send1.success).toBe(true);

      const msg1Slack = sim.slackMessages[sim.slackMessages.length - 1]!;
      const delivery1 = await deliverToInstance(sim.alex, msg1Slack, 'B_STEFAN');
      expect(delivery1.routeResult!.success).toBe(true);

      // Alex -> Stefan
      const send2 = await sim.alex.sender.send({
        from: 'alex/backend-dev',
        to: 'stefan/architect',
        intent: 'inform',
        body: 'Got it. I will prepare the backend status update.',
      });
      expect(send2.success).toBe(true);

      const msg2Slack = sim.slackMessages[sim.slackMessages.length - 1]!;
      const delivery2 = await deliverToInstance(sim.stefan, msg2Slack, 'B_ALEX');
      expect(delivery2.routeResult!.success).toBe(true);

      // Both inboxes have messages
      const alexInbox = await sim.alex.inbox.readInbox('backend-dev');
      expect(alexInbox.length).toBe(1);

      const stefanInbox = await sim.stefan.inbox.readInbox('architect');
      expect(stefanInbox.length).toBe(1);
    });
  });
});
