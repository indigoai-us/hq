/**
 * VaultClient — typed SDK for vault-service membership operations (VLT-7 US-001).
 *
 * Wraps vault-service HTTP API with shared auth, retry, and typed errors.
 * Colocated with hq-cloud so /invite, /promote, /accept and future commands
 * share one client instead of each rolling its own HTTP layer.
 */

import type { VaultServiceConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class VaultClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "VaultClientError";
  }
}

export class VaultAuthError extends VaultClientError {
  constructor(message = "Authentication failed — session expired or invalid") {
    super(message, 401);
    this.name = "VaultAuthError";
  }
}

export class VaultPermissionDeniedError extends VaultClientError {
  constructor(message = "Permission denied — admin role required") {
    super(message, 403);
    this.name = "VaultPermissionDeniedError";
  }
}

export class VaultNotFoundError extends VaultClientError {
  constructor(message = "Resource not found") {
    super(message, 404);
    this.name = "VaultNotFoundError";
  }
}

export class VaultConflictError extends VaultClientError {
  constructor(message = "Conflict — resource already exists or was already accepted") {
    super(message, 409);
    this.name = "VaultConflictError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MembershipRole = "owner" | "admin" | "member" | "guest";
export type MembershipStatus = "pending" | "active" | "revoked";

export interface Membership {
  membershipKey: string;
  personUid: string;
  companyUid: string;
  role: MembershipRole;
  status: MembershipStatus;
  allowedPrefixes?: string[];
  inviteToken?: string;
  invitedBy: string;
  invitedAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInviteInput {
  personUid?: string;
  inviteeEmail?: string;
  companyUid: string;
  role: MembershipRole;
  allowedPrefixes?: string[];
  invitedBy: string;
}

export interface CreateInviteResult {
  membership: Membership;
  inviteToken: string;
}

export interface AcceptInviteResult {
  membership: Membership;
}

export interface UpdateRoleInput {
  membershipKey: string;
  newRole: MembershipRole;
  allowedPrefixes?: string[];
  updaterUid: string;
}

export interface EntityInfo {
  uid: string;
  slug: string;
  type: string;
  bucketName?: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Retry config
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// VaultClient
// ---------------------------------------------------------------------------

export class VaultClient {
  private readonly apiUrl: string;
  private readonly authToken: string;

  constructor(config: VaultServiceConfig) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.authToken = config.authToken;
  }

  // -- Membership operations ------------------------------------------------

  async createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
    const data = await this.post<{ membership: Membership; inviteToken: string }>(
      "/membership/invite",
      input,
    );
    return data;
  }

  async acceptInvite(token: string, personUid: string): Promise<AcceptInviteResult> {
    const data = await this.post<{ membership: Membership }>(
      "/membership/accept",
      { token, personUid },
    );
    return data;
  }

  async revokeMembership(membershipKey: string): Promise<void> {
    await this.post("/membership/revoke", { membershipKey });
  }

  async listMembersOfCompany(companyUid: string): Promise<Membership[]> {
    const data = await this.get<{ members: Membership[] }>(
      `/membership/company/${encodeURIComponent(companyUid)}`,
    );
    return data.members;
  }

  async updateRole(input: UpdateRoleInput): Promise<Membership> {
    const data = await this.post<{ membership: Membership }>(
      "/membership/role",
      input,
    );
    return data.membership;
  }

  async listPendingInvites(companyUid: string): Promise<Membership[]> {
    const data = await this.get<{ invites: Membership[] }>(
      `/membership/company/${encodeURIComponent(companyUid)}/pending`,
    );
    return data.invites;
  }

  // -- Entity operations ----------------------------------------------------

  readonly entity = {
    get: async (uid: string): Promise<EntityInfo> => {
      const data = await this.get<{ entity: EntityInfo }>(`/entity/${encodeURIComponent(uid)}`);
      return data.entity;
    },

    findBySlug: async (type: string, slug: string): Promise<EntityInfo> => {
      const data = await this.get<{ entity: EntityInfo }>(
        `/entity/by-slug/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
      );
      return data.entity;
    },
  };

  // -- HTTP primitives with retry -------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/json",
      };

      const init: RequestInit = { method, headers };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }

      let res: Response;
      try {
        res = await fetch(`${this.apiUrl}${path}`, init);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) continue;
        throw lastError;
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const responseBody = await res.text();

      // Non-retryable errors → throw immediately
      if (!isTransient(res.status)) {
        throw this.mapError(res.status, responseBody);
      }

      // Retryable — store and loop
      lastError = this.mapError(res.status, responseBody);
    }

    throw lastError ?? new VaultClientError("Request failed after retries", 500);
  }

  private mapError(status: number, body: string): VaultClientError {
    const message = this.extractMessage(body);

    switch (status) {
      case 401:
        return new VaultAuthError(message);
      case 403:
        return new VaultPermissionDeniedError(message);
      case 404:
        return new VaultNotFoundError(message);
      case 409:
        return new VaultConflictError(message);
      default:
        return new VaultClientError(message || `Request failed with status ${status}`, status, body);
    }
  }

  private extractMessage(body: string): string {
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      return parsed.message ?? parsed.error ?? body;
    } catch {
      return body;
    }
  }
}
