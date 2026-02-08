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
  AuditLogEntry,
  AuditLogQuery,
  AuditAction,
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

  /**
   * Check if a recipient has write access to a specific path.
   * Returns the share granting write access, or undefined if no write access.
   */
  checkWriteAccess(recipientId: string, ownerId: string, path: string): Share | undefined {
    const shares = this.query({
      ownerId,
      recipientId,
      status: 'active',
    });

    for (const share of shares) {
      if (!share.permissions.includes('write')) {
        continue;
      }
      for (const sharedPath of share.paths) {
        if (path === sharedPath || path.startsWith(sharedPath)) {
          return share;
        }
      }
    }

    return undefined;
  }

  /**
   * Get all active shares that grant write access to a specific path.
   * Returns all shares from any owner that give write to this path.
   */
  getWritersForPath(ownerId: string, path: string): Share[] {
    const results: Share[] = [];

    for (const share of this.shares.values()) {
      if (share.status !== 'active') continue;
      if (share.ownerId !== ownerId) continue;
      if (!share.permissions.includes('write')) continue;

      for (const sharedPath of share.paths) {
        if (path === sharedPath || path.startsWith(sharedPath)) {
          results.push(share);
          break;
        }
      }
    }

    return results;
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

// ─── Audit Log ──────────────────────────────────────────────────────

/**
 * In-memory audit log for tracking file share actions.
 *
 * Records all share-related actions (create, update, revoke, file access)
 * for accountability and compliance. Production would persist to DynamoDB/Postgres.
 */
export class ShareAuditLog {
  private readonly entries: AuditLogEntry[] = [];
  private counter = 0;
  private readonly maxEntries: number;

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  /** Generate a unique audit entry ID */
  private generateId(): string {
    this.counter++;
    return `audit-${Date.now()}-${this.counter}`;
  }

  /**
   * Record an audit log entry.
   */
  record(params: {
    shareId: string;
    userId: string;
    action: AuditAction;
    path?: string | null;
    details?: string | null;
  }): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      shareId: params.shareId,
      userId: params.userId,
      action: params.action,
      path: params.path ?? null,
      timestamp: new Date(),
      details: params.details ?? null,
    };

    this.entries.push(entry);

    // Evict oldest entries if over capacity
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    return entry;
  }

  /**
   * Query audit log entries with filters.
   */
  query(filters: AuditLogQuery): AuditLogEntry[] {
    let results = [...this.entries];

    if (filters.shareId) {
      results = results.filter((e) => e.shareId === filters.shareId);
    }
    if (filters.userId) {
      results = results.filter((e) => e.userId === filters.userId);
    }
    if (filters.action) {
      results = results.filter((e) => e.action === filters.action);
    }
    if (filters.after) {
      const afterTime = filters.after.getTime();
      results = results.filter((e) => e.timestamp.getTime() > afterTime);
    }
    if (filters.before) {
      const beforeTime = filters.before.getTime();
      results = results.filter((e) => e.timestamp.getTime() < beforeTime);
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Pagination
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return results;
  }

  /** Get all entries for a specific share */
  getByShareId(shareId: string): AuditLogEntry[] {
    return this.entries
      .filter((e) => e.shareId === shareId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /** Get all entries for a specific user */
  getByUserId(userId: string): AuditLogEntry[] {
    return this.entries
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /** Get total count of audit entries */
  count(): number {
    return this.entries.length;
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.entries.length = 0;
    this.counter = 0;
  }
}

// ─── Singleton accessor ─────────────────────────────────────────────

let _shareStore: ShareStore | undefined;
let _auditLog: ShareAuditLog | undefined;

/** Get the global share store instance */
export function getShareStore(): ShareStore {
  if (!_shareStore) {
    _shareStore = new ShareStore();
  }
  return _shareStore;
}

/** Get the global audit log instance */
export function getAuditLog(): ShareAuditLog {
  if (!_auditLog) {
    _auditLog = new ShareAuditLog();
  }
  return _auditLog;
}

/** Reset the global share store (for testing) */
export function resetShareStore(): void {
  _shareStore = undefined;
}

/** Reset the global audit log (for testing) */
export function resetAuditLog(): void {
  _auditLog = undefined;
}
