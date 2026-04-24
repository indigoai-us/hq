/**
 * company-discovery — union-view of local (on-disk) and AWS (Vault) companies.
 *
 * Downstream consumers (sync-runner, future CLI, future UI) ask a single
 * question: "what companies does this user have access to, and where does
 * each one live right now?" This module owns the answer so no caller
 * reimplements the merge.
 *
 * Merge rule (see US-003 PRD):
 *   - `'both'`: a local `company.yaml` has `cloudCompanyUid` matching a Vault
 *     membership uid
 *   - `'aws'` : exists only in Vault memberships
 *   - `'local'`: exists only on disk (or disk uid conflicts with a Vault row
 *     for the same slug — we lean to 'local' and log the mismatch)
 *
 * Error policy: silent on bad yaml (a malformed `company.yaml` is skipped,
 * not fatal — HQ folders routinely contain stray dirs). The *only* thing
 * that hits stderr is the uid-mismatch case, which is a real data anomaly
 * users should see.
 */

import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";

import type { VaultClient, Membership, EntityInfo } from "../vault-client.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Narrow surface of VaultClient this module actually uses. Declared here so
 * tests can stub just the two methods we need without building a full
 * VaultClient — mirrors the `VaultClientSurface` pattern in sync-runner.
 */
export interface CompanyDiscoveryVaultClient {
  listMyMemberships: () => Promise<Membership[]>;
  entity: {
    get: (uid: string) => Promise<EntityInfo>;
  };
}

export interface ListAllCompaniesOptions {
  /** Absolute path to the HQ root (the folder that contains `companies/`). */
  hqRoot: string;
  /** A VaultClient — only `listMyMemberships` + `entity.get` are called. */
  vaultClient: CompanyDiscoveryVaultClient | VaultClient;
  /**
   * Diagnostics sink. Defaults to `process.stderr`. Injectable so tests can
   * capture warnings instead of letting them leak into vitest's stderr.
   */
  stderr?: { write: (chunk: string) => boolean | void };
}

/**
 * A unified view row. `uid` is present when the entry is known to Vault
 * (`'aws'` or `'both'`). For pure-`'local'` rows we deliberately omit it —
 * callers that want to promote a local company to the cloud should detect
 * its absence and go through the provisioning flow.
 */
export interface CompanyEntry {
  slug: string;
  name: string;
  uid?: string;
  source: "aws" | "local" | "both";
}

// ---------------------------------------------------------------------------
// Local enumeration
// ---------------------------------------------------------------------------

/**
 * Shape of a local `company.yaml` — we only look at the four fields we need.
 * Anything else in the file (workers[], repos[], notes, etc.) is ignored
 * here; company-discovery stays narrow so future shape additions don't churn
 * this module.
 */
interface LocalCompanyFile {
  slug?: unknown;
  name?: unknown;
  cloud?: unknown;
  cloudCompanyUid?: unknown;
}

interface LocalCompany {
  slug: string;
  name: string;
  cloudCompanyUid?: string;
}

async function readLocalCompanies(hqRoot: string): Promise<LocalCompany[]> {
  const companiesDir = path.join(hqRoot, "companies");

  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = await readdir(companiesDir, { withFileTypes: true });
  } catch {
    // hqRoot missing, or companies/ missing → no locals. Treat as empty.
    return [];
  }

  const results: LocalCompany[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const yamlPath = path.join(companiesDir, entry.name, "company.yaml");
    let raw: string;
    try {
      raw = await readFile(yamlPath, "utf-8");
    } catch {
      // Missing company.yaml — skip silently; this isn't an error, just a
      // dir that isn't a company (e.g. `.DS_Store`-adjacent stray dirs).
      continue;
    }

    let parsed: LocalCompanyFile | null;
    try {
      parsed = parseYaml(raw) as LocalCompanyFile | null;
    } catch {
      // Malformed yaml — skip. Logging would be noisy on every sync run.
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const slug = typeof parsed.slug === "string" ? parsed.slug : undefined;
    const name = typeof parsed.name === "string" ? parsed.name : undefined;
    if (!slug || !name) continue;

    const cloudCompanyUid =
      typeof parsed.cloudCompanyUid === "string" && parsed.cloudCompanyUid.length > 0
        ? parsed.cloudCompanyUid
        : undefined;

    results.push({ slug, name, ...(cloudCompanyUid ? { cloudCompanyUid } : {}) });
  }

  return results;
}

// ---------------------------------------------------------------------------
// AWS enumeration
// ---------------------------------------------------------------------------

interface AwsCompany {
  uid: string;
  slug: string;
  name: string;
}

/**
 * Pull memberships, then resolve each one to a slug + display name via
 * `entity.get`. If entity.get fails (deleted entity, permission hiccup), we
 * degrade to using the uid as both slug and name — matches the sync-runner's
 * best-effort stance when building its own fanout plan.
 */
async function readAwsCompanies(
  client: CompanyDiscoveryVaultClient | VaultClient,
): Promise<AwsCompany[]> {
  const memberships = await client.listMyMemberships();
  const rows: AwsCompany[] = [];
  for (const m of memberships) {
    let slug = m.companyUid;
    let name = m.companyUid;
    try {
      const info = await client.entity.get(m.companyUid);
      slug = info.slug || m.companyUid;
      name = info.name || slug;
    } catch {
      // Best-effort — keep UID as the display identifier.
    }
    rows.push({ uid: m.companyUid, slug, name });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

/**
 * Union of on-disk + Vault-known companies. Ordering is stable but not
 * alphabetized — AWS-only rows appear in membership order, then local-only
 * rows appear in directory order. Callers that want a sorted view sort it
 * themselves (presentation concern).
 */
export async function listAllCompanies(
  options: ListAllCompaniesOptions,
): Promise<CompanyEntry[]> {
  const stderr = options.stderr ?? process.stderr;

  const [locals, aws] = await Promise.all([
    readLocalCompanies(options.hqRoot),
    readAwsCompanies(options.vaultClient),
  ]);

  // Index aws by uid AND by slug so we can resolve both join keys cheaply.
  const awsByUid = new Map<string, AwsCompany>();
  const awsBySlug = new Map<string, AwsCompany>();
  for (const row of aws) {
    awsByUid.set(row.uid, row);
    awsBySlug.set(row.slug, row);
  }

  const entries: CompanyEntry[] = [];
  const matchedUids = new Set<string>();

  // Walk locals first and classify each as 'both' or 'local' (with conflict
  // detection). This keeps the O(n+m) shape — no nested scans.
  for (const local of locals) {
    const awsMatchByUid = local.cloudCompanyUid
      ? awsByUid.get(local.cloudCompanyUid)
      : undefined;

    if (awsMatchByUid) {
      entries.push({
        slug: local.slug,
        name: local.name,
        uid: awsMatchByUid.uid,
        source: "both",
      });
      matchedUids.add(awsMatchByUid.uid);
      continue;
    }

    // Slug collision with a different uid → conflict. Tag local, log to stderr.
    const awsMatchBySlug = awsBySlug.get(local.slug);
    if (
      awsMatchBySlug &&
      local.cloudCompanyUid &&
      awsMatchBySlug.uid !== local.cloudCompanyUid
    ) {
      stderr.write(
        `hq-cloud company-discovery: uid mismatch for slug "${local.slug}" — ` +
          `local=${local.cloudCompanyUid} aws=${awsMatchBySlug.uid}. ` +
          `Treating as local-only.\n`,
      );
    }

    entries.push({ slug: local.slug, name: local.name, source: "local" });
  }

  // Now append AWS rows that weren't matched by any local.
  for (const row of aws) {
    if (matchedUids.has(row.uid)) continue;
    entries.push({
      slug: row.slug,
      name: row.name,
      uid: row.uid,
      source: "aws",
    });
  }

  return entries;
}
