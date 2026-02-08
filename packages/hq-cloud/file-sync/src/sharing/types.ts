/**
 * File sharing types for HQ Cloud.
 *
 * Shares allow a user (owner) to grant read access to specific
 * S3 paths for another user (recipient).
 */

/** Permissions that can be granted on a share */
export type SharePermission = 'read';

/** All valid share permissions */
export const SHARE_PERMISSIONS: readonly SharePermission[] = ['read'] as const;

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
