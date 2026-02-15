/**
 * HQ Worker Runtime Infrastructure
 *
 * AWS CDK constructs and utilities for deploying and running
 * HQ workers on ECS Fargate.
 */

// Re-export all types from the types module
export * from '../../types/infra/index.js';

// Export CDK constructs
export { HqWorkerTaskDefinition, HqWorkerRuntimeStack } from './task-definition.js';
export type {
  HqWorkerTaskDefinitionProps,
  HqWorkerRuntimeStackProps,
} from './task-definition.js';

export { HqS3Stack } from './s3-stack.js';
export type { HqS3StackProps } from './s3-stack.js';

export { HqEcrStack } from './ecr-stack.js';
export type { HqEcrStackProps } from './ecr-stack.js';

export { HqBudgetStack } from './budget-stack.js';
export type { HqBudgetStackProps } from './budget-stack.js';

export { HqCodeBuildStack } from './codebuild-stack.js';
export type { HqCodeBuildStackProps } from './codebuild-stack.js';

export { HqApiServiceStack } from './api-service-stack.js';
export type { HqApiServiceStackProps } from './api-service-stack.js';

export { HqSecretsStack, SECRET_KEYS } from './secrets-stack.js';
export type { HqSecretsStackProps, SecretKey } from './secrets-stack.js';

// Export task runner utilities
export {
  buildRunTaskParams,
  validateFargateResources,
  getRecommendedMemory,
  estimateTaskCostPerHour,
  describeTask,
} from './run-task.js';
export type {
  RunTaskConfig,
  RunTaskResult,
  ContainerOverride,
  TaskOverrides,
  EcsRunTaskParams,
} from './run-task.js';

// Export spawner service
export {
  WorkerSpawnerService,
  createEcsClient,
  createMockEcsClient,
} from './spawner-service.js';
export type {
  SpawnRequest,
  SpawnResult,
  SpawnCallback,
  SpawnResultCallback,
  WorkerRegistryCallback,
  EcsClient,
  TaskDescription,
  SpawnerServiceConfig,
} from './spawner-service.js';

// Export Claude CLI wrapper
export {
  ClaudeCliWrapper,
  classifyOutputLine,
  createCallbackEventSender,
  createHttpEventSender,
  createCliWrapperFromEnv,
  executeWithHttpStreaming,
} from './claude-cli-wrapper.js';
export type {
  CliEventType,
  CliEvent,
  CliWrapperConfig,
  CliWrapperResult,
  EventStreamCallback,
  QuestionAnswerCallback,
  CliWrapperLogger,
  EventSender,
} from './claude-cli-wrapper.js';

// Export graceful shutdown service
export {
  GracefulShutdown,
  createHttpShutdownNotifier,
  createFilesystemCheckpointWriter,
  createGracefulShutdownFromEnv,
} from './graceful-shutdown.js';
export type {
  ShutdownPhase,
  ShutdownEventType,
  ShutdownEvent,
  ShutdownLogger,
  CheckpointData,
  CheckpointWriter,
  ShutdownApiNotifier,
  Disposable,
  GracefulShutdownConfig,
} from './graceful-shutdown.js';

// Export question blocker service
export {
  QuestionBlocker,
  createHttpQuestionApiClient,
  createWebSocketAnswerListener,
  createQuestionBlockerFromEnv,
} from './question-blocker.js';
export type {
  WorkerBlockingStatus,
  PendingQuestion,
  QuestionAnswer,
  QuestionBlockerEventType,
  QuestionBlockerEvent,
  QuestionApiClient,
  AnswerListener,
  QuestionBlockerLogger,
  QuestionBlockerConfig,
} from './question-blocker.js';

// Export resource tier configuration
export {
  isValidResourceTier,
  getTierSpec,
  getAllTierSpecs,
  getDefaultTierForWorker,
  resolveResourceTier,
  resolveResourceTierSpec,
  buildTierOverrides,
  mergeTierOverrides,
  configureWorkerTypeDefaults,
  setWorkerTypeTierDefault,
  getWorkerTypeDefaults,
  estimateTierCostPerHour,
  describeTier,
} from './resource-tiers.js';
export type {
  WorkerTypeDefaults,
} from './resource-tiers.js';

// Export auto-terminator service
export {
  AutoTerminator,
  createAutoTerminatorFromEnv,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_SCAN_INTERVAL_MS,
} from './auto-terminator.js';
export type {
  AutoTerminatorLogger,
  WorkerActivity,
  AutoTerminatorEventType,
  AutoTerminatorEvent,
  CostSavingsEntry,
  FinalStatusCallback,
  CostSavingsCallback,
  TerminationEventCallback,
  AutoTerminatorConfig,
} from './auto-terminator.js';

// Export worker logs streaming service
export {
  WorkerLogsService,
  WorkerLogsError,
  extractTaskIdFromArn,
  isValidRetentionDays,
  buildCloudWatchLogConfig,
  createMockCloudWatchLogsClient,
  createWorkerLogsServiceFromEnv,
  DEFAULT_LOG_LIMIT,
  MAX_LOG_LIMIT,
  DEFAULT_RETENTION_DAYS,
  VALID_RETENTION_DAYS,
} from './worker-logs.js';
export type {
  WorkerLogsLogger,
  LogEntry,
  LogLevel,
  GetLogsParams,
  GetLogsResponse,
  LogRetentionConfig,
  CloudWatchLogsClient,
  LogStreamConnection,
  LogsEventType,
  WorkerLogsServiceConfig,
  LogStreamInfo,
} from './worker-logs.js';
