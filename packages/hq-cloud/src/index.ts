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

// Cognito browser-OAuth (VLT-9)
export {
  browserLogin,
  refreshTokens,
  loadCachedTokens,
  saveCachedTokens,
  clearCachedTokens,
  isExpiring,
  getValidAccessToken,
  CognitoAuthError,
} from "./cognito-auth.js";
export type { CognitoAuthConfig, CognitoTokens } from "./cognito-auth.js";

// Company discovery (US-003) — local + AWS union view
export { listAllCompanies } from "./lib/company-discovery.js";
export type {
  CompanyEntry,
  ListAllCompaniesOptions,
  CompanyDiscoveryVaultClient,
} from "./lib/company-discovery.js";

// VaultClient SDK (VLT-7)
export { VaultClient } from "./vault-client.js";
export {
  VaultClientError,
  VaultAuthError,
  VaultPermissionDeniedError,
  VaultNotFoundError,
  VaultConflictError,
} from "./vault-client.js";
export type {
  MembershipRole,
  MembershipStatus,
  Membership,
  CreateInviteInput,
  CreateInviteResult,
  AcceptInviteResult,
  UpdateRoleInput,
  EntityInfo,
  CreateEntityInput,
  CreateEntityResult,
  PendingInviteByEmail,
} from "./vault-client.js";

// STS child vending (VLT-8)
export type {
  TaskAction,
  TaskScope,
  VendChildInput,
  VendChildResult,
  StsChildCredentials,
} from "./vault-client.js";

// CLI commands
export { share, sync } from "./cli/index.js";
export type { ShareOptions, ShareResult, SyncOptions, SyncResult, SyncProgressEvent } from "./cli/index.js";
export { resolveConflict, showDiff } from "./cli/index.js";
export type { ConflictStrategy, ConflictInfo, ConflictResolution } from "./cli/index.js";

// Membership CLI commands (VLT-7)
export { invite, listInvites, revokeInvite } from "./cli/index.js";
export type { InviteOptions, InviteResult, InviteListOptions, InviteRevokeOptions } from "./cli/index.js";
export { accept, parseToken } from "./cli/index.js";
export type { AcceptOptions, AcceptResult } from "./cli/index.js";
export { promote } from "./cli/index.js";
export type { PromoteOptions, PromoteResult } from "./cli/index.js";

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
