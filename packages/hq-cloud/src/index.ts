/**
 * @indigoai-us/hq-cloud — public API
 *
 * VLT-5: Entity-aware sync engine. Operations resolve their target bucket
 * and credentials from the vault-service entity registry + STS vending.
 */

export {
  resolveEntityContext,
  refreshEntityContext,
  clearContextCache,
  isExpiringSoon,
} from "./context.js";

export {
  uploadFile,
  downloadFile,
  listRemoteFiles,
  deleteRemoteFile,
  headRemoteFile,
} from "./s3.js";

export type { RemoteFile } from "./s3.js";

export {
  readJournal,
  writeJournal,
  hashFile,
  updateEntry,
  getEntry,
  removeEntry,
  getJournalPath,
} from "./journal.js";

export {
  createIgnoreFilter,
  isWithinSizeLimit,
} from "./ignore.js";

// CLI commands
export { share, sync } from "./cli/index.js";
export type { ShareOptions, ShareResult, SyncOptions, SyncResult } from "./cli/index.js";
export { resolveConflict, showDiff } from "./cli/index.js";
export type { ConflictStrategy, ConflictInfo, ConflictResolution } from "./cli/index.js";

export type {
  EntityContext,
  VaultCredentials,
  VaultServiceConfig,
  SyncConfig,
  Credentials,
  JournalEntry,
  SyncJournal,
  SyncStatus,
  PushResult,
  PullResult,
  DaemonState,
} from "./types.js";
