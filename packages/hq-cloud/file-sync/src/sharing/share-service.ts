/**
 * Share service: business logic for file sharing.
 *
 * Orchestrates share creation, S3 policy generation,
 * and access verification.
 */

import type {
  Share,
  CreateShareInput,
  UpdateShareInput,
  ShareQuery,
  SharePolicyResult,
  SharePolicyStatement,
  ShareValidation,
} from './types.js';
import { ShareStore, validateCreateShareInput } from './share-store.js';
import { buildSharePolicy, toAwsPolicyDocument } from '../s3/policies.js';

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

  constructor(store: ShareStore, config?: Partial<ShareServiceConfig>) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new share.
   * Validates input, checks limits, creates the share, and generates the S3 policy.
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

    const share = this.store.update(id, input);
    return { share, validation: { valid: true, errors: [] } };
  }

  /** Revoke a share (soft delete - marks as revoked) */
  revokeShare(id: string): Share | undefined {
    return this.store.revoke(id);
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
   * Generate an S3 policy for a share.
   * This produces the IAM policy statements needed to grant
   * the recipient read access to the shared paths.
   */
  generateSharePolicy(shareId: string): SharePolicyResult | undefined {
    const share = this.store.get(shareId);
    if (!share || share.status !== 'active') {
      return undefined;
    }

    const policy = buildSharePolicy(this.config.bucketName, share.ownerId, share.paths);

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
   * Returns the AWS-formatted JSON policy.
   */
  generateAwsPolicyDocument(shareId: string): Record<string, unknown> | undefined {
    const share = this.store.get(shareId);
    if (!share || share.status !== 'active') {
      return undefined;
    }

    const policy = buildSharePolicy(this.config.bucketName, share.ownerId, share.paths);
    return toAwsPolicyDocument(policy);
  }

  /**
   * Get a consolidated list of all S3 paths accessible to a recipient.
   * Aggregates across all active shares.
   */
  getAccessiblePaths(recipientId: string): Array<{
    ownerId: string;
    paths: string[];
    shareId: string;
    label: string | null;
  }> {
    const shares = this.store.getReceivedShares(recipientId);
    return shares.map((share) => ({
      ownerId: share.ownerId,
      paths: [...share.paths],
      shareId: share.id,
      label: share.label,
    }));
  }
}
