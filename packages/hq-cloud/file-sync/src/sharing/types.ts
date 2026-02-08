/**
 * File sharing types for HQ Cloud.
 *
 * Shares allow a user (owner) to grant read or write access to specific
 * S3 paths for another user (recipient). Multiple writers are supported
 * with conflict resolution and audit logging.
 */

/** Permissions that can be granted on a share */
export type SharePermission = 'read' | 'write';

/** All valid share permissions */
export const SHARE_PERMISSIONS: readonly SharePermission[] = ['read', 'write'] as const;

/** Status of a share */
export type ShareStatus = 'active' | 'revoked' | 'expired';

/** All valid share statuses */
export const SHARE_STATUSES: readonly ShareStatus[] = ['active', 'revoked', 'expired'] as const;

/** A file share record */
export interface Share {
  /** Unique share identifier */
  id: string;
  /** User who owns the shared files */
  ownerId: string;
  /** User who receives access */
  recipientId: string;
  /** S3 paths being shared (relative to owner's HQ prefix) */
  paths: string[];
  /** Granted permissions */
  permissions: SharePermission[];
  /** Current share status */
  status: ShareStatus;
  /** When the share was created */
  createdAt: Date;
  /** When the share was last updated */
  updatedAt: Date;
  /** Optional expiration date */
  expiresAt: Date | null;
  /** Optional human-readable label */
  label: string | null;
}

/** Input for creating a new share */
export interface CreateShareInput {
  /** User who owns the files */
  ownerId: string;
  /** User who will receive access */
  recipientId: string;
  /** Paths to share (relative to owner's HQ root, e.g., 'knowledge/public/') */
  paths: string[];
  /** Permissions to grant (default: ['read']) */
  permissions?: SharePermission[];
  /** Optional expiration date (ISO 8601) */
  expiresAt?: string | null;
  /** Optional human-readable label */
  label?: string | null;
}

/** Input for updating an existing share */
export interface UpdateShareInput {
  /** Add paths to the share */
  addPaths?: string[];
  /** Remove paths from the share */
  removePaths?: string[];
  /** Update permissions */
  permissions?: SharePermission[];
  /** Update expiration */
  expiresAt?: string | null;
  /** Update label */
  label?: string | null;
}

/** Query filters for listing shares */
export interface ShareQuery {
  /** Filter by owner */
  ownerId?: string;
  /** Filter by recipient */
  recipientId?: string;
  /** Filter by status */
  status?: ShareStatus;
}

/** Result of a share policy generation */
export interface SharePolicyResult {
  /** The share that the policy was generated for */
  shareId: string;
  /** S3 bucket name */
  bucketName: string;
  /** Generated policy statements */
  policyStatements: SharePolicyStatement[];
}

/** A single policy statement for share access */
export interface SharePolicyStatement {
  /** Statement ID */
  sid: string;
  /** Allowed S3 actions */
  actions: string[];
  /** S3 resource ARNs */
  resources: string[];
}

/** Validation result for share inputs */
export interface ShareValidation {
  valid: boolean;
  errors: string[];
}

/** Types of auditable actions on shared files */
export type AuditAction =
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'share_created'
  | 'share_updated'
  | 'share_revoked'
  | 'permission_changed'
  | 'write_access_granted'
  | 'write_access_revoked';

/** An entry in the share audit log */
export interface AuditLogEntry {
  /** Unique audit entry identifier */
  id: string;
  /** Share ID this audit entry relates to */
  shareId: string;
  /** User who performed the action */
  userId: string;
  /** Type of action performed */
  action: AuditAction;
  /** S3 path affected (if applicable) */
  path: string | null;
  /** ISO 8601 timestamp */
  timestamp: Date;
  /** Additional details about the action */
  details: string | null;
}

/** Query filters for listing audit log entries */
export interface AuditLogQuery {
  /** Filter by share ID */
  shareId?: string;
  /** Filter by user ID */
  userId?: string;
  /** Filter by action type */
  action?: AuditAction;
  /** Filter entries after this date */
  after?: Date;
  /** Filter entries before this date */
  before?: Date;
  /** Maximum number of results (default: 100) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/** Result of checking write access for a user on a path */
export interface WriteAccessResult {
  /** Whether write access is granted */
  hasWriteAccess: boolean;
  /** The share granting write access (if any) */
  share: Share | undefined;
}
