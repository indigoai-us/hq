import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfigFromString, resolveEnvRef } from '../config-loader.js';

// Minimal valid YAML config for testing
const MINIMAL_CONFIG = `
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
  workers:
    - id: architect
      send: true
      receive: true
      allowed-intents: [handoff, request, inform]
      allowed-peers: ["*"]
`;

const FULL_CONFIG = `
identity:
  owner: stefan
  instance-id: stefan-hq-primary
  display-name: "Stefan's HQ"

peers:
  - owner: alex
    display-name: "Alex's HQ"
    slack-bot-id: U0ALEX1234
    trust-level: channel-scoped
    workers:
      - id: backend-dev
        description: "API endpoints"
        skills: [api-dev, node]
      - id: qa-tester
        description: "Testing"
        skills: [vitest]
    notes: "Co-founder"
  - owner: maria
    display-name: "Maria's HQ"
    slack-bot-id: U0MARIA5678
    trust-level: token-verified
    workers:
      - id: designer
        description: "UI/UX design"

slack:
  bot-token: $SLACK_BOT_TOKEN
  app-id: A0STEFANHQ
  workspace-id: T0MYWORKSPACE
  channel-strategy: per-relationship
  channels:
    dedicated:
      name: "#hq-agents"
      id: C0HQAGENTS
    per-relationship:
      - peer: alex
        name: "#hq-alex-stefan"
        id: C0ALEXSTEFAN
      - peer: maria
        name: "#hq-maria-stefan"
        id: C0MARIASTEFAN
    contextual:
      - context: "hq-cloud"
        name: "#hq-cloud-dev"
        id: C0HQCLOUD
        peers: [alex]
  event-mode: socket
  socket-app-token: $SLACK_APP_TOKEN

security:
  default-trust-level: channel-scoped
  kill-switch: false
  audit:
    enabled: true
    log-path: workspace/audit/hiamp/
    retention-days: 30
  tokens:
    signing-algorithm: HS256
    default-ttl: 86400
    shared-secrets:
      - peer: alex
        secret: $HIAMP_SECRET_ALEX
    revocation-list: []
  rate-limiting:
    max-messages-per-minute: 30
    max-messages-per-minute-global: 100

worker-permissions:
  default: deny
  workers:
    - id: architect
      send: true
      receive: true
      allowed-intents: [handoff, request, inform, query, response, acknowledge, error, share]
      allowed-peers: ["*"]
    - id: backend-dev
      send: true
      receive: true
      allowed-intents: [handoff, request]
      allowed-peers: [alex]

settings:
  ack-timeout: 300
  max-retries: 1
  thread-idle-timeout: 86400
  thread-max-age: 604800
  inbox-path: workspace/inbox/
  thread-log-path: workspace/threads/hiamp/
  message-max-length: 4000
  attachment-max-inline-size: 4000
  enabled: true
`;

describe('config-loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test-token-123';
    process.env['SLACK_APP_TOKEN'] = 'xapp-test-token-456';
    process.env['HIAMP_SECRET_ALEX'] = 'shared-secret-alex-123';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('resolveEnvRef', () => {
    it('should resolve an environment variable reference', () => {
      process.env['MY_TEST_VAR'] = 'hello';
      expect(resolveEnvRef('$MY_TEST_VAR')).toBe('hello');
    });

    it('should return undefined for unset env var', () => {
      delete process.env['NONEXISTENT_VAR'];
      expect(resolveEnvRef('$NONEXISTENT_VAR')).toBeUndefined();
    });

    it('should return the value as-is if not an env ref', () => {
      expect(resolveEnvRef('plain-value')).toBe('plain-value');
    });
  });

  describe('loadConfigFromString', () => {
    it('should load a minimal valid config', () => {
      const result = loadConfigFromString(MINIMAL_CONFIG);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.config.identity.owner).toBe('stefan');
      expect(result.config.identity.instanceId).toBe('stefan-hq-primary');
      expect(result.config.peers).toHaveLength(1);
      expect(result.config.peers[0]?.owner).toBe('alex');
      expect(result.config.slack.channelStrategy).toBe('dedicated');
      expect(result.config.workerPermissions.default).toBe('deny');
    });

    it('should load a full config with all sections', () => {
      const result = loadConfigFromString(FULL_CONFIG);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const { config } = result;

      // Identity
      expect(config.identity.owner).toBe('stefan');
      expect(config.identity.displayName).toBe("Stefan's HQ");

      // Peers
      expect(config.peers).toHaveLength(2);
      expect(config.peers[0]?.owner).toBe('alex');
      expect(config.peers[0]?.slackBotId).toBe('U0ALEX1234');
      expect(config.peers[0]?.trustLevel).toBe('channel-scoped');
      expect(config.peers[0]?.workers).toHaveLength(2);
      expect(config.peers[0]?.workers[0]?.id).toBe('backend-dev');
      expect(config.peers[0]?.workers[0]?.skills).toContain('api-dev');

      expect(config.peers[1]?.owner).toBe('maria');
      expect(config.peers[1]?.trustLevel).toBe('token-verified');

      // Slack
      expect(config.slack.botToken).toBe('xoxb-test-token-123');
      expect(config.slack.channelStrategy).toBe('per-relationship');
      expect(config.slack.channels?.dedicated?.id).toBe('C0HQAGENTS');
      expect(config.slack.channels?.perRelationship).toHaveLength(2);
      expect(config.slack.channels?.perRelationship?.[0]?.peer).toBe('alex');
      expect(config.slack.channels?.contextual).toHaveLength(1);
      expect(config.slack.channels?.contextual?.[0]?.context).toBe('hq-cloud');

      // Security
      expect(config.security?.killSwitch).toBe(false);
      expect(config.security?.audit?.enabled).toBe(true);
      expect(config.security?.tokens?.sharedSecrets?.[0]?.secret).toBe('shared-secret-alex-123');
      expect(config.security?.rateLimiting?.maxMessagesPerMinute).toBe(30);

      // Worker permissions
      expect(config.workerPermissions.default).toBe('deny');
      expect(config.workerPermissions.workers).toHaveLength(2);
      expect(config.workerPermissions.workers[0]?.id).toBe('architect');
      expect(config.workerPermissions.workers[0]?.send).toBe(true);

      // Settings
      expect(config.settings?.ackTimeout).toBe(300);
      expect(config.settings?.messageMaxLength).toBe(4000);
      expect(config.settings?.enabled).toBe(true);
    });

    it('should fail on missing identity section', () => {
      const yaml = `
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
  socket-app-token: $SLACK_APP_TOKEN
worker-permissions:
  default: deny
  workers: []
`;
      const result = loadConfigFromString(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors.some((e) => e.field === 'identity')).toBe(true);
    });

    it('should fail on missing peers section', () => {
      const yaml = `
identity:
  owner: stefan
  instance-id: stefan-hq-primary
slack:
  bot-token: $SLACK_BOT_TOKEN
  app-id: A0TEST
  workspace-id: T0TEST
  channel-strategy: dedicated
  event-mode: socket
  socket-app-token: $SLACK_APP_TOKEN
worker-permissions:
  default: deny
  workers: []
`;
      const result = loadConfigFromString(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors.some((e) => e.field === 'peers')).toBe(true);
    });

    it('should fail on missing slack section', () => {
      const yaml = `
identity:
  owner: stefan
  instance-id: stefan-hq-primary
peers:
  - owner: alex
    trust-level: open
    workers:
      - id: backend-dev
worker-permissions:
  default: deny
  workers: []
`;
      const result = loadConfigFromString(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors.some((e) => e.field === 'slack')).toBe(true);
    });

    it('should fail on missing worker-permissions section', () => {
      const yaml = `
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
  socket-app-token: $SLACK_APP_TOKEN
`;
      const result = loadConfigFromString(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors.some((e) => e.field === 'worker-permissions')).toBe(true);
    });

    it('should fail on invalid YAML', () => {
      const result = loadConfigFromString(':::invalid yaml:::');
      expect(result.success).toBe(false);
    });

    it('should fail on empty content', () => {
      const result = loadConfigFromString('');
      expect(result.success).toBe(false);
    });

    it('should resolve env var for bot-token', () => {
      const result = loadConfigFromString(MINIMAL_CONFIG);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.config.slack.botToken).toBe('xoxb-test-token-123');
    });

    it('should fail on invalid owner format', () => {
      const yaml = `
identity:
  owner: INVALID_CAPS
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
  socket-app-token: $SLACK_APP_TOKEN
worker-permissions:
  default: deny
  workers: []
`;
      const result = loadConfigFromString(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors.some((e) => e.field === 'identity.owner')).toBe(true);
    });
  });
});
