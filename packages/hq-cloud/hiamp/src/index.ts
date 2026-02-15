/**
 * @hq-cloud/hiamp — HIAMP v1 Message Envelope Library
 *
 * Compose, parse, and validate inter-agent messages per the
 * HQ Inter-Agent Messaging Protocol (HIAMP) v1 specification.
 *
 * @example
 * ```ts
 * import { compose, parse, validate, generateMessageId, generateThreadId } from '@hq-cloud/hiamp';
 *
 * // Compose a message
 * const raw = compose({
 *   from: 'stefan/architect',
 *   to: 'alex/backend-dev',
 *   intent: 'handoff',
 *   body: 'The API contract is ready.',
 *   thread: generateThreadId(),
 * });
 *
 * // Parse it back
 * const result = parse(raw);
 * if (result.success) {
 *   const validation = validate(result.message);
 *   console.log(validation.valid); // true
 * }
 * ```
 */

// Types
export type {
  IntentType,
  Priority,
  AckMode,
  WorkerAddress,
  MessageId,
  ThreadId,
  HiampMessage,
  ComposeInput,
  ParseSuccess,
  ParseFailure,
  ParseResult,
  ValidationError,
  ValidationResult,
} from './types.js';

// Functions
export { compose } from './compose.js';
export { parse } from './parse.js';
export { validate } from './validate.js';
export { generateMessageId, generateThreadId } from './ids.js';

// Constants
export {
  PROTOCOL_VERSION,
  INTENT_TYPES,
  PRIORITY_LEVELS,
  ACK_MODES,
  DEFAULT_SEPARATOR,
  SEPARATOR_CHAR,
  SEPARATOR_CHAR_ASCII,
  SEPARATOR_MIN_LENGTH,
  HEADER_ARROW,
  HEADER_ARROW_ASCII,
  FIELD_DELIMITER,
  MESSAGE_ID_PATTERN,
  THREAD_ID_PATTERN,
  WORKER_ADDRESS_PATTERN,
  MAX_ADDRESS_LENGTH,
  SEPARATOR_LINE_REGEX,
  HEADER_LINE_REGEX,
  REQUIRED_FIELDS,
  KNOWN_FIELDS,
  MESSAGE_ID_PREFIX,
  THREAD_ID_PREFIX,
} from './constants.js';

// Slack integration
export { SlackSender } from './slack-sender.js';
export type { SendInput, ReplyInput, SendResult, SendSuccess, SendFailure } from './slack-sender.js';

export { ChannelResolver } from './channel-resolver.js';
export type {
  ChannelResolveInput,
  ChannelResolveResult,
  ChannelResolveSuccess,
  ChannelResolveFailure,
} from './channel-resolver.js';

export { RateLimiter } from './rate-limiter.js';
export type { RateLimiterOptions } from './rate-limiter.js';

export { loadConfig, loadConfigFromString, resolveEnvRef } from './config-loader.js';
export type {
  HiampConfig,
  HiampIdentity,
  HiampPeer,
  PeerWorker,
  HiampSlackConfig,
  HiampSecurityConfig,
  HiampSettings,
  WorkerPermissionsConfig,
  WorkerPermission,
  ChannelConfig,
  DedicatedChannel,
  RelationshipChannel,
  ContextualChannel,
  ChannelStrategy,
  TrustLevel,
  EventMode,
  ConfigLoadResult,
  ConfigValidationError,
  RateLimitingConfig,
  AuditConfig,
  TokenConfig,
  SharedSecret,
} from './config-loader.js';

// Receive pipeline (US-005)
export { detectHiampMessage } from './message-detector.js';
export type {
  SlackMessageEvent,
  DetectionResult,
} from './message-detector.js';

export { Inbox, extractInlineAttachments } from './inbox.js';
export type {
  InboxEntry,
  InboxWriteResult,
  InlineAttachment,
} from './inbox.js';

export { Router } from './router.js';
export type {
  LocalWorker,
  RouteResult,
  RouterOptions,
} from './router.js';

export { EventListener } from './event-listener.js';
export type {
  EventListenerOptions,
  ProcessedEvent,
  SlackUrlVerification,
  SlackEventCallback,
  SlackWebhookPayload,
} from './event-listener.js';

// Acknowledgment and threading (US-006)
export { AckHandler } from './ack-handler.js';
export type {
  AckHandleResult,
  AckHandlerOptions,
  NackInput,
} from './ack-handler.js';

export { ThreadManager } from './thread-manager.js';
export type {
  ThreadStatus,
  ThreadMessageEntry,
  ThreadState,
  ListThreadsOptions,
} from './thread-manager.js';

export { TimeoutTracker } from './timeout-tracker.js';
export type {
  PendingAck,
  TimedOutEntry,
  TimeoutTrackerOptions,
} from './timeout-tracker.js';
