/**
 * company-promote — turn a local-only HQ company into a cloud-backed one (US-004a).
 *
 * Flow:
 *   1. Look up the slug in vault-service (`entity.findBySlug`). If it exists,
 *      reuse the uid — makes re-invocation safe after a partial prior run.
 *   2. Otherwise create the company entity.
 *   3. Provision the S3 bucket via `vaultClient.provisionBucket(uid)`. If the
 *      server says the bucket is already provisioned, fall back to `entity.get`
 *      and reuse the existing `bucketName`.
 *   4. Rewrite `{hqRoot}/companies/{slug}/company.yaml` in place — preserving
 *      unrelated keys + comments + key order — setting `cloud: true` and
 *      `cloudCompanyUid: <uid>`. The write is atomic: we stage in a `.tmp`
 *      file and `rename` on top, so a crash between write + rename leaves the
 *      original company.yaml intact.
 *
 * Error policy:
 *   - Any unrecoverable Vault error (4xx that isn't a known-reuse case,
 *     network failure, yaml parse failure on the existing company.yaml) is
 *     surfaced as a descriptive Error. company.yaml is never partially
 *     rewritten — the temp-file dance protects against torn writes.
 *   - The "already provisioned" sentinel matches hq-onboarding's approach
 *     (see `orchestrator.ts` around line 190): we don't rely on a specific
 *     string, we catch the provisionBucket error, re-fetch the entity, and
 *     reuse `entity.bucketName` if present. If the entity still has no
 *     bucketName we re-throw the original error.
 */

import { readFile, writeFile, rename } from "node:fs/promises";
import * as path from "node:path";
import { parseDocument } from "yaml";

import type {
  VaultClient,
  EntityInfo,
  CreateEntityInput,
} from "../vault-client.js";
import { VaultNotFoundError } from "../vault-client.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Narrow VaultClient surface this module uses. Mirrors the pattern in
 * `company-discovery.ts` + `sync-runner.ts` — tests stub only the methods we
 * actually call.
 */
export interface CompanyPromoteVaultClient {
  provisionBucket: (
    companyUid: string,
  ) => Promise<{ bucketName: string; kmsKeyId: string }>;
  entity: {
    get: (uid: string) => Promise<EntityInfo>;
    findBySlug: (type: string, slug: string) => Promise<EntityInfo>;
    create: (input: CreateEntityInput) => Promise<EntityInfo>;
  };
}

export interface PromoteLocalCompanyOptions {
  /** Absolute path to the HQ root (folder containing `companies/`). */
  hqRoot: string;
  /** Slug of the local company — matches the directory name under `companies/`. */
  slug: string;
  /** VaultClient (or a stub with the same narrow surface). */
  vaultClient: CompanyPromoteVaultClient | VaultClient;
  /**
   * Optional human-readable display name. When omitted, falls back to the
   * slug — mirrors `ensureMyPersonEntity`'s posture of "always produce a
   * non-empty name rather than rejecting the POST".
   */
  displayName?: string;
}

export interface PromoteLocalCompanyResult {
  uid: string;
  bucketName: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function promoteLocalCompany(
  options: PromoteLocalCompanyOptions,
): Promise<PromoteLocalCompanyResult> {
  const { hqRoot, slug, vaultClient, displayName } = options;

  if (!slug || typeof slug !== "string") {
    throw new Error("promoteLocalCompany: slug is required");
  }

  // ---- Step 1: resolve-or-create entity ---------------------------------
  // `findBySlug` throws VaultNotFoundError for a slug that doesn't exist;
  // anything else (auth failure, 5xx, network) bubbles up. This matches the
  // posture of onboarding's `orchestrator.ts` + `cli/promote.ts`.
  let entity: EntityInfo;
  try {
    entity = await vaultClient.entity.findBySlug("company", slug);
  } catch (err) {
    if (isNotFound(err)) {
      entity = await vaultClient.entity.create({
        type: "company",
        slug,
        name: displayName ?? slug,
      });
    } else {
      throw err;
    }
  }

  const uid = entity.uid;
  if (!uid) {
    throw new Error(
      `promoteLocalCompany: vault returned an entity without a uid for slug "${slug}"`,
    );
  }

  // ---- Step 2: provision bucket (or reuse existing) ---------------------
  // If provisionBucket succeeds, its response carries the bucketName
  // directly. If it throws, re-fetch the entity and fall back to its
  // bucketName — mirrors hq-onboarding's approach, which doesn't rely on a
  // specific error string because the server message has drifted between
  // stages.
  let bucketName: string | undefined;
  try {
    const provision = await vaultClient.provisionBucket(uid);
    bucketName = provision.bucketName;
  } catch (err) {
    let refetched: EntityInfo | undefined;
    try {
      refetched = await vaultClient.entity.get(uid);
    } catch {
      // Swallow the refetch error — the original provision error is the
      // more useful signal to re-throw.
    }
    if (refetched?.bucketName) {
      bucketName = refetched.bucketName;
    } else {
      throw err;
    }
  }

  if (!bucketName) {
    throw new Error(
      `promoteLocalCompany: no bucketName available for uid ${uid} after provisioning`,
    );
  }

  // ---- Step 3: rewrite company.yaml atomically --------------------------
  await rewriteCompanyYaml({ hqRoot, slug, uid });

  return { uid, bucketName };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect a vault-service 404 without hard-depending on the exact error class —
 * the onboarding codebase checks both `instanceof VaultNotFoundError` AND
 * `err.name === "VaultNotFoundError"` because tests sometimes stub the SDK
 * with a class that's a distinct identity. Mirror that lenient check here.
 */
function isNotFound(err: unknown): boolean {
  if (err instanceof VaultNotFoundError) return true;
  if (err instanceof Error && err.name === "VaultNotFoundError") return true;
  return false;
}

interface RewriteOptions {
  hqRoot: string;
  slug: string;
  uid: string;
}

/**
 * Rewrite `{hqRoot}/companies/{slug}/company.yaml` in place, preserving
 * comments, key order, and unrelated keys. Atomic via `.tmp` + rename.
 *
 * If the file doesn't exist (edge case — caller is promoting a slug that has
 * no on-disk row yet), we create a minimal doc with just `slug`, `name`,
 * `cloud`, `cloudCompanyUid`. Preserves the contract that callers can always
 * re-run promote safely.
 */
async function rewriteCompanyYaml(options: RewriteOptions): Promise<void> {
  const { hqRoot, slug, uid } = options;
  const yamlPath = path.join(hqRoot, "companies", slug, "company.yaml");

  let raw: string | null = null;
  try {
    raw = await readFile(yamlPath, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      throw new Error(
        `promoteLocalCompany: failed to read ${yamlPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // ENOENT — fall through; we'll create a fresh doc below.
  }

  // parseDocument preserves comments + key order on re-stringify, which is
  // what we want for a human-edited company.yaml. A plain parse/stringify
  // round-trip would drop comments.
  let doc;
  try {
    doc = raw != null ? parseDocument(raw) : parseDocument("{}");
  } catch (err) {
    throw new Error(
      `promoteLocalCompany: failed to parse ${yamlPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (doc.errors && doc.errors.length > 0) {
    throw new Error(
      `promoteLocalCompany: yaml parse errors in ${yamlPath}: ${doc.errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }

  // If the file was missing or empty-ish, seed the required keys so the
  // resulting file is a valid company.yaml. When the file already exists
  // with a `name`, we leave it alone.
  if (raw == null || doc.get("slug") == null) {
    doc.set("slug", slug);
  }
  if (raw == null || doc.get("name") == null) {
    doc.set("name", slug);
  }
  doc.set("cloud", true);
  doc.set("cloudCompanyUid", uid);

  const serialized = doc.toString();

  // Atomic write: stage to .tmp, rename on top. If the process crashes after
  // writeFile but before rename, the original company.yaml is untouched.
  const tmpPath = `${yamlPath}.tmp`;
  try {
    await writeFile(tmpPath, serialized, "utf-8");
  } catch (err) {
    throw new Error(
      `promoteLocalCompany: failed to write ${tmpPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  try {
    await rename(tmpPath, yamlPath);
  } catch (err) {
    throw new Error(
      `promoteLocalCompany: failed to rename ${tmpPath} → ${yamlPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
