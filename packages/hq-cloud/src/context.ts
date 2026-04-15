/**
 * Entity context resolution (VLT-5 US-001).
 *
 * Resolves an entity (company) via vault-service, vends STS-scoped credentials,
 * and returns an EntityContext for S3 operations. Handles auto-refresh when
 * credentials are within 2 minutes of expiry.
 */

import type { EntityContext, VaultServiceConfig } from "./types.js";

/** Minimum remaining TTL before auto-refresh triggers (2 minutes). */
const REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

/** STS session duration requested from vault-service (15 minutes). */
const DEFAULT_SESSION_DURATION_SECONDS = 900;

/** Cached contexts keyed by entity UID. */
const contextCache = new Map<string, EntityContext>();

/**
 * Look up an entity by slug or UID via vault-service, then vend STS-scoped
 * credentials for that entity. Returns an EntityContext ready for S3 ops.
 *
 * Caches the result and auto-refreshes when the credentials are within
 * 2 minutes of expiry.
 */
export async function resolveEntityContext(
  companyUidOrSlug: string,
  config: VaultServiceConfig,
): Promise<EntityContext> {
  // Check cache — return if credentials still fresh
  const cached = contextCache.get(companyUidOrSlug);
  if (cached && !isExpiringSoon(cached.expiresAt)) {
    return cached;
  }

  // Step 1: Resolve entity — if it looks like a UID (cmp_*), fetch directly;
  // otherwise look up by slug
  const entity = companyUidOrSlug.startsWith("cmp_")
    ? await fetchEntity(companyUidOrSlug, config)
    : await fetchEntityBySlug("company", companyUidOrSlug, config);

  if (!entity.bucketName) {
    throw new Error(
      `Entity ${entity.uid} (${entity.slug}) has no bucket provisioned. ` +
      `Run VLT-2 bucket provisioning first.`,
    );
  }

  // Step 2: Vend STS-scoped credentials
  const vendResult = await vendCredentials(entity.uid, config);

  const ctx: EntityContext = {
    uid: entity.uid,
    bucketName: entity.bucketName,
    region: config.region ?? "us-east-1",
    credentials: {
      accessKeyId: vendResult.credentials.accessKeyId,
      secretAccessKey: vendResult.credentials.secretAccessKey,
      sessionToken: vendResult.credentials.sessionToken,
    },
    expiresAt: vendResult.expiresAt,
  };

  // Cache by both UID and slug for fast lookups
  contextCache.set(entity.uid, ctx);
  contextCache.set(entity.slug, ctx);

  return ctx;
}

/**
 * Check if credentials are expiring within the refresh threshold.
 */
export function isExpiringSoon(expiresAt: string): boolean {
  const expiryMs = new Date(expiresAt).getTime();
  const nowMs = Date.now();
  return expiryMs - nowMs < REFRESH_THRESHOLD_MS;
}

/**
 * Force-refresh a cached context. Useful when an S3 operation fails with
 * an expired credentials error.
 */
export async function refreshEntityContext(
  companyUidOrSlug: string,
  config: VaultServiceConfig,
): Promise<EntityContext> {
  // Evict cache entry to force fresh resolution
  contextCache.delete(companyUidOrSlug);
  return resolveEntityContext(companyUidOrSlug, config);
}

/**
 * Clear the entire context cache. Useful for tests.
 */
export function clearContextCache(): void {
  contextCache.clear();
}

// ---------------------------------------------------------------------------
// Vault-service API calls
// ---------------------------------------------------------------------------

interface EntityResponse {
  uid: string;
  slug: string;
  bucketName?: string;
  status: string;
}

interface VendResponse {
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: string;
  };
  expiresAt: string;
}

async function fetchEntity(
  uid: string,
  config: VaultServiceConfig,
): Promise<EntityResponse> {
  const res = await fetch(`${config.apiUrl}/entity/${uid}`, {
    headers: { Authorization: `Bearer ${config.authToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch entity ${uid}: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { entity: EntityResponse };
  return data.entity;
}

async function fetchEntityBySlug(
  type: string,
  slug: string,
  config: VaultServiceConfig,
): Promise<EntityResponse> {
  const res = await fetch(`${config.apiUrl}/entity/by-slug/${type}/${slug}`, {
    headers: { Authorization: `Bearer ${config.authToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to find entity by slug ${type}/${slug}: ${res.status} ${body}`,
    );
  }
  const data = (await res.json()) as { entity: EntityResponse };
  return data.entity;
}

async function vendCredentials(
  companyUid: string,
  config: VaultServiceConfig,
): Promise<VendResponse> {
  const res = await fetch(`${config.apiUrl}/sts/vend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authToken}`,
    },
    body: JSON.stringify({
      companyUid,
      durationSeconds: DEFAULT_SESSION_DURATION_SECONDS,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `STS vend failed for ${companyUid}: ${res.status} ${body}`,
    );
  }
  return (await res.json()) as VendResponse;
}
