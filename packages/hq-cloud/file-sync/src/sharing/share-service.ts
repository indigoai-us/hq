/**
 * Share service: business logic for file sharing.
 *
 * Orchestrates share creation, S3 policy generation,
 * access verification, audit logging, and write access management.
 *
 * Supports:
 * - Read and write permissions on shared paths
 * - Multiple writers on the same shared paths
 * - Conflict resolution integration for shared files
 * - Audit log of all changes by user
 * - Owner can revoke write access independently of read
 */

import type {
  Share,
  CreateShareInput,
  UpdateShareInput,
  ShareQuery,
  SharePolicyResult,
  SharePolicyStatement,
  ShareValidation,
  AuditLogEntry,
  AuditLogQuery,
  WriteAccessResult,
} from './types.js';
import { ShareStore, ShareAuditLog, validateCreateShareInput } from './share-store.js';
import { buildSharePolicy, buildShareWritePolicy, toAwsPolicyDocument } from '../s3/policies.js';

/** Configuration for the share service */
export interface ShareServiceConfig {
  /** S3 bucket name for policy generation */
  bucketName: string;
  /** Maximum paths per share */
  maxPathsPerShare: number;
  /** Maximum active shares per user (as owner) */
  maxSharesPerOwner: number;
}

/** Default share service configuration */
const DEFAULT_CONFIG: ShareServiceConfig = {
  bucketName: process.env['S3_BUCKET_NAME'] ?? 'hq-cloud-files-development',
  maxPathsPerShare: 100,
  maxSharesPerOwner: 50,
};

/**
 * Service for managing file shares between users.
 */
export class ShareService {
  private readonly store: ShareStore;
  private readonly config: ShareServiceConfig;
  private readonly auditLog: ShareAuditLog;

  constructor(store: ShareStore, config?: Partial<ShareServiceConfig>, auditLog?: ShareAuditLog) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.auditLog = auditLog ?? new ShareAuditLog();
  }

  /**
   * Create a new share.
   * Validates input, checks limits, creates the share, and logs the action.
   */
  createShare(input: CreateShareInput): { share: Share; validation: ShareValidation } {
    // Validate input
    const validation = validateCreateShareInput(input);
    if (!validation.valid) {
      return { share: null as unknown as Share, validation };
    }

    // Check owner share limit
    const ownerShares = this.store.getOwnedShares(input.ownerId);
    if (ownerShares.length >= this.config.maxSharesPerOwner) {
      return {
        share: null as unknown as Share,
        validation: {
          valid: false,
          errors: [`Maximum ${this.config.maxSharesPerOwner} active shares per user exceeded`],
        },
      };
    }

    // Check for duplicate share (same owner, recipient, and overlapping paths)
    const existingShares = this.store.query({
      ownerId: input.ownerId,
      recipientId: input.recipientId,
      status: 'active',
    });

    for (const existing of existingShares) {
      const existingPaths = new Set(existing.paths);
      const hasOverlap = input.paths.some((p) => existingPaths.has(p));
      if (hasOverlap) {
        return {
          share: null as unknown as Share,
          validation: {
            valid: false,
            errors: [
              `Share already exists with overlapping paths for recipient '${input.recipientId}'. ` +
              `Use update to modify share '${existing.id}' instead.`,
            ],
          },
        };
      }
    }

    // Create the share
    const share = this.store.create(input);

    // Audit log
    const permissions = input.permissions ?? ['read'];
    this.auditLog.record({
      shareId: share.id,
      userId: input.ownerId,
      action: 'share_created',
      details: `Shared paths [${input.paths.join(', ')}] with ${input.recipientId} (permissions: ${permissions.join(', ')})`,
    });

    if (permissions.includes('write')) {
      this.auditLog.record({
        shareId: share.id,
        userId: input.ownerId,
        action: 'write_access_granted',
        details: `Write access granted to ${input.recipientId}`,
      });
    }

    return { share, validation: { valid: true, errors: [] } };
  }

  /** Get a share by ID */
  getShare(id: string): Share | undefined {
    return this.store.get(id);
  }

  /** Update a share */
  updateShare(id: string, input: UpdateShareInput): { share: Share | undefined; validation: ShareValidation } {
    const existing = this.store.get(id);
    if (!existing) {
      return {
        share: undefined,
        validation: { valid: false, errors: [`Share '${id}' not found`] },
      };
    }

    if (existing.status === 'revoked') {
      return {
        share: undefined,
        validation: { valid: false, errors: ['Cannot update a revoked share'] },
      };
    }

    // Validate new paths if adding
    if (input.addPaths) {
      const pathPattern = /^[a-zA-Z0-9_\-./]+$/;
      for (const path of input.addPaths) {
        if (!pathPattern.test(path) || path.includes('..') || path.startsWith('/')) {
          return {
            share: undefined,
            validation: { valid: false, errors: [`Invalid path: '${path}'`] },
          };
        }
      }

      // Check total paths would not exceed limit
      const currentPaths = new Set(existing.paths);
      let newCount = currentPaths.size;
      for (const path of input.addPaths) {
        if (!currentPaths.has(path)) newCount++;
      }
      if (input.removePaths) {
        for (const path of input.removePaths) {
          if (currentPaths.has(path)) newCount--;
        }
      }
      if (newCount > this.config.maxPathsPerShare) {
        return {
          share: undefined,
          validation: { valid: false, errors: [`Maximum ${this.config.maxPathsPerShare} paths per share exceeded`] },
        };
      }
    }

    // Validate expiresAt if provided
    if (input.expiresAt !== undefined && input.expiresAt !== null) {
      const date = new Date(input.expiresAt);
      if (isNaN(date.getTime())) {
        return {
          share: undefined,
          validation: { valid: false, errors: ['expiresAt must be a valid ISO 8601 date'] },
        };
      }
      if (date.getTime() <= Date.now()) {
        return {
          share: undefined,
          validation: { valid: false, errors: ['expiresAt must be in the future'] },
        };
      }
    }

    // Track permission changes for audit
    const hadWrite = existing.permissions.includes('write');
    const willHaveWrite = input.permissions ? input.permissions.includes('write') : hadWrite;

    const share = this.store.update(id, input);

    // Audit log
    if (share) {
      this.auditLog.record({
        shareId: id,
        userId: existing.ownerId,
        action: 'share_updated',
        details: `Share updated: ${JSON.stringify(input)}`,
      });

      // Track write access changes
      if (!hadWrite && willHaveWrite) {
        this.auditLog.record({
          shareId: id,
          userId: existing.ownerId,
          action: 'write_access_granted',
          details: `Write access granted to ${existing.recipientId}`,
        });
      } else if (hadWrite && !willHaveWrite) {
        this.auditLog.record({
          shareId: id,
          userId: existing.ownerId,
          action: 'write_access_revoked',
          details: `Write access revoked from ${existing.recipientId}`,
        });
      }
    }

    return { share, validation: { valid: true, errors: [] } };
  }

  /** Revoke a share (soft delete - marks as revoked) */
  revokeShare(id: string): Share | undefined {
    const existing = this.store.get(id);
    const result = this.store.revoke(id);

    if (result && existing) {
      this.auditLog.record({
        shareId: id,
        userId: existing.ownerId,
        action: 'share_revoked',
        details: `Share revoked for recipient ${existing.recipientId}`,
      });
    }

    return result;
  }

  /**
   * Revoke only write access from a share, keeping read access intact.
   * The owner can downgrade a share from read+write to read-only.
   */
  revokeWriteAccess(id: string): { share: Share | undefined; validation: ShareValidation } {
    const existing = this.store.get(id);
    if (!existing) {
      return {
        share: undefined,
        validation: { valid: false, errors: [`Share '${id}' not found`] },
      };
    }

    if (existing.status !== 'active') {
      return {
        share: undefined,
        validation: { valid: false, errors: ['Cannot modify a non-active share'] },
      };
    }

    if (!existing.permissions.includes('write')) {
      return {
        share: undefined,
        validation: { valid: false, errors: ['Share does not have write access to revoke'] },
      };
    }

    const share = this.store.update(id, { permissions: ['read'] });

    if (share) {
      this.auditLog.record({
        shareId: id,
        userId: existing.ownerId,
        action: 'write_access_revoked',
        details: `Write access revoked from ${existing.recipientId}, retaining read access`,
      });
    }

    return { share, validation: { valid: true, errors: [] } };
  }

  /** Delete a share (hard delete) */
  deleteShare(id: string): boolean {
    return this.store.delete(id);
  }

  /** List shares with optional filters */
  listShares(query: ShareQuery): Share[] {
    return this.store.query(query);
  }

  /** Get all shares received by a user */
  getReceivedShares(recipientId: string): Share[] {
    return this.store.getReceivedShares(recipientId);
  }

  /** Get all shares owned by a user */
  getOwnedShares(ownerId: string): Share[] {
    return this.store.getOwnedShares(ownerId);
  }

  /**
   * Check if a user has access to a specific path in another user's space.
   * Returns the share granting access, or undefined.
   */
  checkAccess(recipientId: string, ownerId: string, path: string): Share | undefined {
    return this.store.checkAccess(recipientId, ownerId, path);
  }

  /**
   * Check if a user has write access to a specific path.
   * Returns a WriteAccessResult indicating whether write access is granted.
   */
  checkWriteAccess(recipientId: string, ownerId: string, path: string): WriteAccessResult {
    const share = this.store.checkWriteAccess(recipientId, ownerId, path);
    return {
      hasWriteAccess: share !== undefined,
      share,
    };
  }

  /**
   * Get all users who currently have write access to a specific path.
   * Returns shares that grant write permission covering the given path.
   */
  getWritersForPath(ownerId: string, path: string): Share[] {
    return this.store.getWritersForPath(ownerId, path);
  }

  /**
   * Record a file write action in the audit log.
   * Called when a user writes to a shared file.
   */
  recordFileWrite(shareId: string, userId: string, path: string): AuditLogEntry {
    return this.auditLog.record({
      shareId,
      userId,
      action: 'file_write',
      path,
      details: `File written by ${userId}`,
    });
  }

  /**
   * Record a file read action in the audit log.
   * Called when a user reads from a shared file.
   */
  recordFileRead(shareId: string, userId: string, path: string): AuditLogEntry {
    return this.auditLog.record({
      shareId,
      userId,
      action: 'file_read',
      path,
      details: `File read by ${userId}`,
    });
  }

  /**
   * Record a file deletion action in the audit log.
   * Called when a user deletes a shared file.
   */
  recordFileDelete(shareId: string, userId: string, path: string): AuditLogEntry {
    return this.auditLog.record({
      shareId,
      userId,
      action: 'file_delete',
      path,
      details: `File deleted by ${userId}`,
    });
  }

  /**
   * Query the audit log with filters.
   */
  queryAuditLog(query: AuditLogQuery): AuditLogEntry[] {
    return this.auditLog.query(query);
  }

  /**
   * Get all audit log entries for a specific share.
   */
  getShareAuditLog(shareId: string): AuditLogEntry[] {
    return this.auditLog.getByShareId(shareId);
  }

  /** Get the audit log instance (for testing) */
  getAuditLogInstance(): ShareAuditLog {
    return this.auditLog;
  }

  /**
   * Generate an S3 policy for a share.
   * Produces IAM policy statements for read or read+write access
   * depending on the share's permissions.
   */
  generateSharePolicy(shareId: string): SharePolicyResult | undefined {
    const share = this.store.get(shareId);
    if (!share || share.status !== 'active') {
      return undefined;
    }

    const hasWrite = share.permissions.includes('write');
    const policy = hasWrite
      ? buildShareWritePolicy(this.config.bucketName, share.ownerId, share.paths)
      : buildSharePolicy(this.config.bucketName, share.ownerId, share.paths);

    const statements: SharePolicyStatement[] = policy.statements.map((stmt) => ({
      sid: stmt.sid,
      actions: [...stmt.actions],
      resources: [...stmt.resources],
    }));

    return {
      shareId: share.id,
      bucketName: this.config.bucketName,
      policyStatements: statements,
    };
  }

  /**
   * Generate a complete AWS IAM policy document for a share.
   * Returns the AWS-formatted JSON policy with appropriate permissions.
   */
  generateAwsPolicyDocument(shareId: string): Record<string, unknown> | undefined {
    const share = this.store.get(shareId);
    if (!share || share.status !== 'active') {
      return undefined;
    }

    const hasWrite = share.permissions.includes('write');
    const policy = hasWrite
      ? buildShareWritePolicy(this.config.bucketName, share.ownerId, share.paths)
      : buildSharePolicy(this.config.bucketName, share.ownerId, share.paths);

    return toAwsPolicyDocument(policy);
  }

  /**
   * Get a consolidated list of all S3 paths accessible to a recipient.
   * Aggregates across all active shares, including permission info.
   */
  getAccessiblePaths(recipientId: string): Array<{
    ownerId: string;
    paths: string[];
    shareId: string;
    label: string | null;
    permissions: string[];
  }> {
    const shares = this.store.getReceivedShares(recipientId);
    return shares.map((share) => ({
      ownerId: share.ownerId,
      paths: [...share.paths],
      shareId: share.id,
      label: share.label,
      permissions: [...share.permissions],
    }));
  }
}
