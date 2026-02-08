/**
 * In-memory share store for managing file shares.
 *
 * Provides CRUD operations on shares with query capabilities.
 * Production would use a persistent store (DynamoDB, Postgres).
 */

import type {
  Share,
  CreateShareInput,
  UpdateShareInput,
  ShareQuery,
  SharePermission,
  ShareValidation,
} from './types.js';
import { SHARE_PERMISSIONS } from './types.js';

/** Path validation: no traversal, no absolute paths, alphanumeric + common file chars */
const PATH_PATTERN = /^[a-zA-Z0-9_\-./]+$/;

/** User ID validation pattern */
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate a create share input.
 */
export function validateCreateShareInput(input: CreateShareInput): ShareValidation {
  const errors: string[] = [];

  // Validate ownerId
  if (!input.ownerId || typeof input.ownerId !== 'string') {
    errors.push('ownerId is required');
  } else if (!USER_ID_PATTERN.test(input.ownerId)) {
    errors.push('ownerId must contain only alphanumeric characters, underscores, or hyphens');
  }

  // Validate recipientId
  if (!input.recipientId || typeof input.recipientId !== 'string') {
    errors.push('recipientId is required');
  } else if (!USER_ID_PATTERN.test(input.recipientId)) {
    errors.push('recipientId must contain only alphanumeric characters, underscores, or hyphens');
  }

  // Cannot share with yourself
  if (input.ownerId && input.recipientId && input.ownerId === input.recipientId) {
    errors.push('Cannot share with yourself');
  }

  // Validate paths
  if (!input.paths || !Array.isArray(input.paths) || input.paths.length === 0) {
    errors.push('paths must be a non-empty array');
  } else {
    for (const path of input.paths) {
      if (typeof path !== 'string' || path.length === 0) {
        errors.push('Each path must be a non-empty string');
        break;
      }
      if (!PATH_PATTERN.test(path)) {
        errors.push(`Invalid path: '${path}'. Paths must contain only alphanumeric characters, underscores, hyphens, dots, and forward slashes`);
        break;
      }
      if (path.includes('..')) {
        errors.push(`Path traversal not allowed: '${path}'`);
        break;
      }
      if (path.startsWith('/')) {
        errors.push(`Absolute paths not allowed: '${path}'. Use relative paths from HQ root`);
        break;
      }
    }

    // Check for duplicate paths
    if (input.paths.length > 0) {
      const uniquePaths = new Set(input.paths);
      if (uniquePaths.size !== input.paths.length) {
        errors.push('Duplicate paths are not allowed');
      }
    }

    // Limit number of paths
    if (input.paths.length > 100) {
      errors.push('Maximum 100 paths per share');
    }
  }

  // Validate permissions
  if (input.permissions !== undefined) {
    if (!Array.isArray(input.permissions) || input.permissions.length === 0) {
      errors.push('permissions must be a non-empty array');
    } else {
      for (const perm of input.permissions) {
        if (!SHARE_PERMISSIONS.includes(perm as SharePermission)) {
          errors.push(`Invalid permission: '${String(perm)}'. Must be one of: ${SHARE_PERMISSIONS.join(', ')}`);
          break;
        }
      }
    }
  }

  // Validate expiresAt
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    const date = new Date(input.expiresAt);
    if (isNaN(date.getTime())) {
      errors.push('expiresAt must be a valid ISO 8601 date');
    } else if (date.getTime() <= Date.now()) {
      errors.push('expiresAt must be in the future');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * In-memory store for shares.
 */
export class ShareStore {
  private readonly shares = new Map<string, Share>();
  private counter = 0;

  /** Generate a unique share ID */
  private generateId(): string {
    this.counter++;
    return `share-${Date.now()}-${this.counter}`;
  }

  /**
   * Create a new share.
   * Input must be pre-validated with validateCreateShareInput().
   */
  create(input: CreateShareInput): Share {
    const now = new Date();
    const share: Share = {
      id: this.generateId(),
      ownerId: input.ownerId,
      recipientId: input.recipientId,
      paths: [...input.paths],
      permissions: input.permissions ? [...input.permissions] : ['read'],
      status: 'active',
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      label: input.label ?? null,
    };

    this.shares.set(share.id, share);
    return share;
  }

  /** Get a share by ID */
  get(id: string): Share | undefined {
    const share = this.shares.get(id);
    if (!share) return undefined;

    // Auto-expire if past expiration
    if (share.expiresAt && share.status === 'active' && share.expiresAt.getTime() <= Date.now()) {
      share.status = 'expired';
      share.updatedAt = new Date();
    }

    return share;
  }

  /** Check if a share exists */
  exists(id: string): boolean {
    return this.shares.has(id);
  }

  /** Update a share */
  update(id: string, input: UpdateShareInput): Share | undefined {
    const share = this.shares.get(id);
    if (!share) return undefined;
    if (share.status === 'revoked') return undefined;

    const now = new Date();

    // Add paths
    if (input.addPaths && input.addPaths.length > 0) {
      const existingSet = new Set(share.paths);
      for (const path of input.addPaths) {
        if (!existingSet.has(path)) {
          share.paths.push(path);
          existingSet.add(path);
        }
      }
    }

    // Remove paths
    if (input.removePaths && input.removePaths.length > 0) {
      const removeSet = new Set(input.removePaths);
      share.paths = share.paths.filter((p) => !removeSet.has(p));
    }

    // Update permissions
    if (input.permissions !== undefined) {
      share.permissions = [...input.permissions];
    }

    // Update expiration
    if (input.expiresAt !== undefined) {
      share.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    }

    // Update label
    if (input.label !== undefined) {
      share.label = input.label;
    }

    share.updatedAt = now;
    return share;
  }

  /** Revoke a share */
  revoke(id: string): Share | undefined {
    const share = this.shares.get(id);
    if (!share) return undefined;
    if (share.status === 'revoked') return share;

    share.status = 'revoked';
    share.updatedAt = new Date();
    return share;
  }

  /** Delete a share entirely */
  delete(id: string): boolean {
    return this.shares.delete(id);
  }

  /** Query shares with filters */
  query(filters: ShareQuery): Share[] {
    const results: Share[] = [];

    for (const share of this.shares.values()) {
      // Auto-expire check
      if (share.expiresAt && share.status === 'active' && share.expiresAt.getTime() <= Date.now()) {
        share.status = 'expired';
        share.updatedAt = new Date();
      }

      if (filters.ownerId && share.ownerId !== filters.ownerId) continue;
      if (filters.recipientId && share.recipientId !== filters.recipientId) continue;
      if (filters.status && share.status !== filters.status) continue;

      results.push(share);
    }

    // Sort by createdAt descending (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return results;
  }

  /** Get all active shares where the given user is a recipient */
  getReceivedShares(recipientId: string): Share[] {
    return this.query({ recipientId, status: 'active' });
  }

  /** Get all active shares owned by the given user */
  getOwnedShares(ownerId: string): Share[] {
    return this.query({ ownerId, status: 'active' });
  }

  /**
   * Check if a recipient has access to a specific path.
   * Returns the share granting access, or undefined if no access.
   */
  checkAccess(recipientId: string, ownerId: string, path: string): Share | undefined {
    const shares = this.query({
      ownerId,
      recipientId,
      status: 'active',
    });

    for (const share of shares) {
      for (const sharedPath of share.paths) {
        // Exact match or the path is under the shared prefix
        if (path === sharedPath || path.startsWith(sharedPath)) {
          return share;
        }
      }
    }

    return undefined;
  }

  /** Get total count of shares */
  count(): number {
    return this.shares.size;
  }

  /** Clear all shares (for testing) */
  clear(): void {
    this.shares.clear();
    this.counter = 0;
  }
}

// ─── Singleton accessor ─────────────────────────────────────────────

let _shareStore: ShareStore | undefined;

/** Get the global share store instance */
export function getShareStore(): ShareStore {
  if (!_shareStore) {
    _shareStore = new ShareStore();
  }
  return _shareStore;
}

/** Reset the global share store (for testing) */
export function resetShareStore(): void {
  _shareStore = undefined;
}
