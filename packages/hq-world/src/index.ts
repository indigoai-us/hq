/**
 * HQ World Protocol — File-based Transfer Implementation
 *
 * This package implements the MVP (v1) file transport for the HQ World Protocol,
 * enabling export and import of transfer bundles between HQ instances.
 *
 * Supported transfer types:
 * - Knowledge: share knowledge files and directories
 * - Worker Pattern: share worker definitions and skills (pollination)
 *
 * The file transport is the simplest possible delivery mechanism:
 * bundles are directories that operators share however they choose
 * (email, Slack, git, USB stick). The protocol does not care how
 * the directory gets from A to B.
 *
 * @module @indigoai/hq-world
 */

// Types
export type {
  TransferEnvelope,
  EnvelopeDocument,
  TransferType,
  TransportType,
  ManifestItem,
  KnowledgeManifestItem,
  KnowledgeManifest,
  WorkerPatternManifestItem,
  WorkerPatternManifest,
  ContextManifest,
  SystemManifest,
  PayloadManifest,
  ProvenanceEvent,
  Provenance,
  CustomizationPoint,
  Adaptation,
  TransferEventType,
  TransferLogEntry,
  TransferLogFile,
} from './types/index.js';

// Export
export {
  exportKnowledge,
  exportWorkerPattern,
  type ExportKnowledgeOptions,
  type ExportWorkerPatternOptions,
  type ExportResult,
} from './export.js';

// Import
export {
  previewImport,
  stageTransfer,
  readEnvelope,
  readPayloadManifest,
  readAdaptation,
  detectConflicts,
  type ImportPreview,
  type ImportOptions,
  type ConflictInfo,
  type IntegrationRecord,
  type StageOptions,
  type StageResult,
} from './import.js';

// Integrity
export {
  hashFile,
  hashBuffer,
  computePayloadHash,
  computePayloadSize,
  computeFileHashes,
  generateVerifyFile,
  parseVerifyFile,
  verifyBundle,
  listFilesRecursive,
  type VerificationResult,
} from './integrity.js';

// Transfer Log
export {
  appendTransferLog,
  logExport,
  logReceive,
  logApproval,
  logRejection,
  logIntegration,
  logQuarantine,
  readTransferLog,
} from './transfer-log.js';

// Utilities
export {
  generateTransferId,
  utcNow,
  todayDateString,
  isValidOwnerName,
  isValidTransferId,
  isValidHash,
} from './utils.js';
