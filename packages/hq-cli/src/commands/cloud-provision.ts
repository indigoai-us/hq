/**
 * `hq cloud provision company <slug>` — canonical cloud-promotion subcommand.
 *
 * Promotes a local company directory (`companies/<slug>/`) to a cloud-backed
 * entity by:
 *   1. Validating the slug, manifest membership, and local company directory
 *   2. Resolving a Cognito access token (refresh as needed)
 *   3. Idempotently provisioning the vault entity:
 *        GET /v1/entities/by-slug/company/<slug> → 200 reuse, 404 → POST /v1/entities
 *   4. Atomically patching `companies/manifest.yaml` with `cloud_uid` + `bucket_name`
 *   5. Atomically writing `companies/<slug>/.hq/config.json`
 *   6. Triggering an initial sync via `share()` from `@indigoai-us/hq-cloud`
 *   7. Emitting one structured JSON line to stdout (machine-readable result)
 *
 * Replaces three ad-hoc implementations:
 *   - `designate-team` bash script (hq-core-staging)
 *   - AppBar `provision.rs` (hq-sync, auto-provision on first sync)
 *   - AppBar `workspaces.rs` Connect flow (hq-sync, manual Connect)
 *
 * Exit codes:
 *   0 — success (and `initial_sync.ok=true`)
 *   1 — vault auth/network/API error (no entity provisioned)
 *   2 — invalid slug, company missing from manifest, or company dir missing
 *   3 — sync failure after entity provisioned (cloud_uid in JSON;
 *       `initial_sync.ok=false`). Manifest + config may have been written.
 */

import { Command } from "commander";
import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import { share } from "@indigoai-us/hq-cloud";

import {
  DEFAULT_HQ_ROOT,
  DEFAULT_VAULT_API_URL,
  ensureCognitoToken,
  buildVaultConfig,
} from "../utils/cognito-session.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** Vault entity shape (subset we consume). Mirrors hq-pro entity types. */
export interface VaultEntity {
  uid: string;
  type: string;
  slug: string;
  name: string;
  bucketName?: string;
  kmsKeyId?: string | null;
  status?: string;
  ownerUid?: string;
}

/** Per-company `.hq/config.json` schema (matches AppBar `provision.rs::CompanyConfig`). */
export interface CompanyConfig {
  companyUid: string;
  companySlug: string;
  bucketName: string;
  vaultApiUrl: string;
}

/** Final stdout JSON shape. Consumers (designate-team, AppBar) parse this. */
export interface ProvisionResult {
  ok: boolean;
  company_slug: string;
  cloud_uid: string;
  bucket_name: string;
  vault_api_url: string;
  kms_key_id: string | null;
  created_entity: boolean;
  manifest_patched: boolean;
  config_written: boolean;
  initial_sync: {
    ok: boolean;
    files_uploaded?: number;
    bytes_uploaded?: number;
    error?: string;
  };
}

/** Options for the high-level `provisionCompany` orchestrator. */
export interface ProvisionCompanyOptions {
  slug: string;
  name?: string;
  ownerUid?: string;
  hqRoot: string;
  vaultApiUrl: string;
  /** Injected vault HTTP client (override for tests). */
  vaultClient?: VaultClient;
  /** Injected access-token resolver (override for tests). */
  resolveAccessToken?: () => Promise<string>;
  /** Injected sync runner (override for tests). */
  runInitialSync?: (args: InitialSyncArgs) => Promise<{
    filesUploaded: number;
    bytesUploaded: number;
  }>;
  /** Optional progress logger; defaults to stderr-prefixed `[hq cloud provision]`. */
  log?: (msg: string) => void;
}

interface InitialSyncArgs {
  slug: string;
  hqRoot: string;
  accessToken: string;
  vaultApiUrl: string;
}

/** Vault HTTP client interface — minimal surface for entity ops. */
export interface VaultClient {
  findCompanyBySlug(slug: string): Promise<VaultEntity | null>;
  createCompanyEntity(input: {
    slug: string;
    name: string;
    ownerUid?: string;
  }): Promise<VaultEntity>;
}

/** Custom error class so the CLI runner can map to exit codes. */
export class ProvisionError extends Error {
  constructor(
    public readonly code: 1 | 2 | 3,
    message: string,
    public readonly partial?: Partial<ProvisionResult>,
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[A-Za-z0-9._-]+$/;
const FORBIDDEN_SLUGS = new Set(["personal"]);

/**
 * Validate a company slug per the contract: alphanumeric / dot / dash / underscore,
 * non-empty, and never `"personal"` (which is auto-provisioned per-user, not
 * promoted via this subcommand).
 *
 * Throws ProvisionError with code=2 on failure.
 */
export function validateSlug(slug: string): void {
  if (!slug || slug.trim() === "") {
    throw new ProvisionError(2, "Slug is required");
  }
  if (!SLUG_REGEX.test(slug)) {
    throw new ProvisionError(
      2,
      `Invalid slug "${slug}" — must match ${SLUG_REGEX.source}`,
    );
  }
  if (FORBIDDEN_SLUGS.has(slug)) {
    throw new ProvisionError(
      2,
      `Slug "${slug}" is reserved (auto-provisioned per-user, not eligible for cloud promotion)`,
    );
  }
}

/** Path to the top-level companies manifest file. */
export function manifestPath(hqRoot: string): string {
  return path.join(hqRoot, "companies", "manifest.yaml");
}

/** Path to a company's directory inside the HQ tree. */
export function companyDirPath(hqRoot: string, slug: string): string {
  return path.join(hqRoot, "companies", slug);
}

/** Path to a company's `.hq/config.json`. */
export function companyConfigPath(hqRoot: string, slug: string): string {
  return path.join(companyDirPath(hqRoot, slug), ".hq", "config.json");
}

/**
 * Validate that the company exists in the manifest and on disk.
 *
 * Throws ProvisionError with code=2 if:
 *   - manifest file missing
 *   - manifest is malformed (no `companies` map)
 *   - slug not present under `.companies`
 *   - company is `status: archived`
 *   - `companies/<slug>/` does not exist
 *
 * Returns the parsed manifest (so the caller can re-use it for the patch step).
 */
export function validateManifestAndDir(
  hqRoot: string,
  slug: string,
): { manifest: ManifestDoc } {
  const mPath = manifestPath(hqRoot);
  if (!fs.existsSync(mPath)) {
    throw new ProvisionError(
      2,
      `companies/manifest.yaml not found at ${mPath}`,
    );
  }
  const raw = fs.readFileSync(mPath, "utf-8");
  const parsed = yaml.load(raw) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("companies" in parsed) ||
    typeof (parsed as ManifestDoc).companies !== "object"
  ) {
    throw new ProvisionError(
      2,
      `companies/manifest.yaml is malformed — missing top-level .companies map`,
    );
  }
  const manifest = parsed as ManifestDoc;
  const entry = manifest.companies?.[slug];
  if (entry === undefined) {
    throw new ProvisionError(
      2,
      `Company "${slug}" not found under .companies in manifest.yaml`,
    );
  }
  if (entry && typeof entry === "object" && entry.status === "archived") {
    throw new ProvisionError(
      2,
      `Company "${slug}" is status=archived — refusing to promote`,
    );
  }
  const dir = companyDirPath(hqRoot, slug);
  if (!fs.existsSync(dir)) {
    throw new ProvisionError(
      2,
      `Company directory ${dir} does not exist`,
    );
  }
  return { manifest };
}

// ── Manifest patching (atomic) ───────────────────────────────────────────────

/**
 * Top-level manifest shape we touch. We preserve all unknown fields — only
 * `cloud_uid` and `bucket_name` under the target slug are mutated.
 */
export interface ManifestDoc {
  companies?: Record<string, ManifestCompanyEntry | null>;
  [k: string]: unknown;
}

export interface ManifestCompanyEntry {
  cloud_uid?: string;
  bucket_name?: string;
  status?: string;
  [k: string]: unknown;
}

/**
 * Atomically patch `companies/manifest.yaml` to set `cloud_uid` + `bucket_name`
 * under the target slug. Read → mutate → temp-write → rename so concurrent
 * readers never see a partially-written file.
 *
 * Idempotent: if the values already match, this is a no-op (still rewrites
 * the file to canonical YAML, but the mutation is identical).
 *
 * Returns true if the file was written (always true in current impl —
 * reserved for future "skip if unchanged" optimization).
 */
export function patchManifest(
  hqRoot: string,
  slug: string,
  cloudUid: string,
  bucketName: string,
): boolean {
  const mPath = manifestPath(hqRoot);
  const raw = fs.readFileSync(mPath, "utf-8");
  const parsed = (yaml.load(raw) as ManifestDoc) ?? { companies: {} };
  if (!parsed.companies) parsed.companies = {};
  const existing = parsed.companies[slug];
  // Preserve null / object / unknown — promote null → {} so we can write keys.
  const entry: ManifestCompanyEntry =
    existing && typeof existing === "object" ? { ...existing } : {};
  entry.cloud_uid = cloudUid;
  entry.bucket_name = bucketName;
  parsed.companies[slug] = entry;

  const dump = yaml.dump(parsed, { lineWidth: -1, noRefs: true });
  const tmp = `${mPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, dump);
  fs.renameSync(tmp, mPath);
  return true;
}

// ── .hq/config.json writing (atomic) ─────────────────────────────────────────

/**
 * Atomically write `companies/<slug>/.hq/config.json` with the cloud-promotion
 * config. Creates the parent `.hq/` directory if needed. Temp-write + rename
 * so concurrent readers never see a partial file.
 *
 * Idempotent: a re-run with the same inputs writes byte-identical output.
 */
export function writeCompanyConfig(
  hqRoot: string,
  slug: string,
  config: CompanyConfig,
): boolean {
  const cPath = companyConfigPath(hqRoot, slug);
  const dir = path.dirname(cPath);
  fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(config, null, 2) + "\n";
  const tmp = `${cPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, cPath);
  return true;
}

// ── Vault HTTP client (real impl) ────────────────────────────────────────────

/**
 * Default vault HTTP client backed by global `fetch`. Uses the `/v1/entities`
 * route surface (matches AppBar `vault_client.rs` and hq-pro handler routes).
 *
 * Note: the hq-pro handler.ts uses `/entity` (singular, no `/v1/`); the API
 * Gateway in front of it exposes the same handlers under `/v1/entities/*`
 * (plural) — the deployed surface is the prefixed form, which is what
 * AppBar (`vault_client.rs`) and the architecture audit document. We use
 * the deployed `/v1/entities/*` form here.
 */
export function createDefaultVaultClient(
  apiUrl: string,
  accessToken: string,
): VaultClient {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  return {
    async findCompanyBySlug(slug: string): Promise<VaultEntity | null> {
      const url = `${apiUrl.replace(/\/$/, "")}/v1/entities/by-slug/company/${encodeURIComponent(
        slug,
      )}`;
      const res = await fetch(url, { method: "GET", headers });
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await safeBody(res);
        throw new ProvisionError(
          1,
          `Vault GET by-slug failed: ${res.status} ${res.statusText} — ${body}`,
        );
      }
      const data = (await res.json()) as { entity?: VaultEntity };
      if (!data.entity) {
        throw new ProvisionError(
          1,
          `Vault GET by-slug returned 200 with no entity body`,
        );
      }
      return data.entity;
    },
    async createCompanyEntity(input: {
      slug: string;
      name: string;
      ownerUid?: string;
    }): Promise<VaultEntity> {
      const url = `${apiUrl.replace(/\/$/, "")}/v1/entities`;
      const body: Record<string, unknown> = {
        type: "company",
        slug: input.slug,
        name: input.name,
      };
      if (input.ownerUid) body.ownerUid = input.ownerUid;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await safeBody(res);
        // 409 means a concurrent client created it between our GET and POST —
        // surface it as a vault error. The orchestrator is responsible for
        // retrying GET if it wants idempotency on collisions.
        throw new ProvisionError(
          1,
          `Vault POST /v1/entities failed: ${res.status} ${res.statusText} — ${text}`,
        );
      }
      const data = (await res.json()) as { entity?: VaultEntity };
      if (!data.entity) {
        throw new ProvisionError(
          1,
          `Vault POST /v1/entities returned ${res.status} with no entity body`,
        );
      }
      return data.entity;
    },
  };
}

async function safeBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

// ── Default initial-sync runner (wraps share()) ──────────────────────────────

async function defaultRunInitialSync(args: InitialSyncArgs): Promise<{
  filesUploaded: number;
  bytesUploaded: number;
}> {
  const result = await share({
    paths: [companyDirPath(args.hqRoot, args.slug)],
    company: args.slug,
    message: `hq cloud provision:${args.slug}`,
    onConflict: "keep",
    vaultConfig: buildVaultConfig(args.accessToken),
    hqRoot: args.hqRoot,
  });
  return {
    filesUploaded: result.filesUploaded,
    bytesUploaded: result.bytesUploaded,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run the full 9-step provision flow. Returns a `ProvisionResult` on success
 * (including partial success — sync failure after entity provisioned).
 *
 * Throws `ProvisionError` for terminal failures with the right exit code.
 *
 * All side effects (HTTP calls, file writes, sync) flow through injected
 * helpers so unit tests can fully exercise the flow without network or disk.
 */
export async function provisionCompany(
  options: ProvisionCompanyOptions,
): Promise<ProvisionResult> {
  const log = options.log ?? ((msg: string) => process.stderr.write(`[hq cloud provision] ${msg}\n`));

  // Step 1+2+3: validate slug, manifest, dir
  validateSlug(options.slug);
  validateManifestAndDir(options.hqRoot, options.slug);
  log(`validated slug=${options.slug}`);

  // Step 4: auth — defer to injected resolver (default: ensureCognitoToken)
  const accessToken = options.resolveAccessToken
    ? await options.resolveAccessToken()
    : await ensureCognitoToken();
  log(`acquired Cognito access token`);

  // Step 5: GET-then-POST for idempotency
  const vaultClient =
    options.vaultClient ??
    createDefaultVaultClient(options.vaultApiUrl, accessToken);

  let entity = await vaultClient.findCompanyBySlug(options.slug);
  let createdEntity = false;
  if (entity) {
    log(`reusing existing vault entity uid=${entity.uid}`);
  } else {
    log(`vault entity not found — creating`);
    entity = await vaultClient.createCompanyEntity({
      slug: options.slug,
      name: options.name ?? options.slug,
      ownerUid: options.ownerUid,
    });
    createdEntity = true;
    log(`created vault entity uid=${entity.uid}`);
  }

  if (!entity.bucketName) {
    // Vault returned an entity without a bucket — this would happen if the
    // provisioning Lambda asynchronously failed. We have a `cloud_uid` but
    // no `bucket_name` to write to disk. Surface as a vault error since the
    // entity exists but is incomplete.
    throw new ProvisionError(
      1,
      `Vault entity ${entity.uid} has no bucketName — provisioning incomplete`,
      {
        ok: false,
        company_slug: options.slug,
        cloud_uid: entity.uid,
        bucket_name: "",
        vault_api_url: options.vaultApiUrl,
        kms_key_id: entity.kmsKeyId ?? null,
        created_entity: createdEntity,
        manifest_patched: false,
        config_written: false,
        initial_sync: { ok: false, error: "entity has no bucketName" },
      },
    );
  }

  const cloudUid = entity.uid;
  const bucketName = entity.bucketName;
  const kmsKeyId = entity.kmsKeyId ?? null;

  // Step 6: patch manifest atomically
  patchManifest(options.hqRoot, options.slug, cloudUid, bucketName);
  log(`patched companies/manifest.yaml`);

  // Step 7: write .hq/config.json atomically
  writeCompanyConfig(options.hqRoot, options.slug, {
    companyUid: cloudUid,
    companySlug: options.slug,
    bucketName,
    vaultApiUrl: options.vaultApiUrl,
  });
  log(`wrote companies/${options.slug}/.hq/config.json`);

  // Step 8: trigger initial sync (failure ⇒ exit 3 with cloud_uid populated)
  const runner = options.runInitialSync ?? defaultRunInitialSync;
  let initialSync: ProvisionResult["initial_sync"];
  try {
    log(`triggering initial sync via share()`);
    const sync = await runner({
      slug: options.slug,
      hqRoot: options.hqRoot,
      accessToken,
      vaultApiUrl: options.vaultApiUrl,
    });
    initialSync = {
      ok: true,
      files_uploaded: sync.filesUploaded,
      bytes_uploaded: sync.bytesUploaded,
    };
    log(
      `initial sync complete — files=${sync.filesUploaded} bytes=${sync.bytesUploaded}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`initial sync failed: ${msg}`);
    throw new ProvisionError(3, `Initial sync failed: ${msg}`, {
      ok: false,
      company_slug: options.slug,
      cloud_uid: cloudUid,
      bucket_name: bucketName,
      vault_api_url: options.vaultApiUrl,
      kms_key_id: kmsKeyId,
      created_entity: createdEntity,
      manifest_patched: true,
      config_written: true,
      initial_sync: { ok: false, error: msg },
    });
  }

  return {
    ok: true,
    company_slug: options.slug,
    cloud_uid: cloudUid,
    bucket_name: bucketName,
    vault_api_url: options.vaultApiUrl,
    kms_key_id: kmsKeyId,
    created_entity: createdEntity,
    manifest_patched: true,
    config_written: true,
    initial_sync: initialSync,
  };
}

// ── Commander wiring ─────────────────────────────────────────────────────────

/**
 * Register `provision company <slug>` under a `cloud` subcommand group.
 *
 * Wired in `src/index.ts` via `registerCloudProvisionCommands(cloudCmd)` where
 * `cloudCmd` is the top-level `hq cloud` command group.
 */
export function registerCloudProvisionCommands(program: Command): void {
  const provisionCmd = program
    .command("provision")
    .description("Provision a cloud-backed entity (entity + bucket + initial sync)");

  provisionCmd
    .command("company")
    .description(
      "Promote a local company to a cloud-backed entity (idempotent). " +
        "Provisions the vault entity if missing, patches manifest.yaml, " +
        "writes .hq/config.json, and triggers an initial sync.",
    )
    .argument("<slug>", "Company slug (must match a top-level key in companies/manifest.yaml)")
    .option("--name <name>", "Display name for the entity (default: slug)")
    .option("--owner <uid>", "Owner person UID (default: current Cognito user sub)")
    .option(
      "--hq-root <path>",
      `Local HQ tree root (default: ${DEFAULT_HQ_ROOT})`,
      DEFAULT_HQ_ROOT,
    )
    .option(
      "--vault-api-url <url>",
      `Vault API URL (default: ${DEFAULT_VAULT_API_URL})`,
      DEFAULT_VAULT_API_URL,
    )
    .action(
      async (
        slug: string,
        options: {
          name?: string;
          owner?: string;
          hqRoot: string;
          vaultApiUrl: string;
        },
      ) => {
        try {
          const result = await provisionCompany({
            slug,
            name: options.name,
            ownerUid: options.owner,
            hqRoot: options.hqRoot,
            vaultApiUrl: options.vaultApiUrl,
          });
          // Final stdout line — single JSON document for downstream consumers
          process.stdout.write(JSON.stringify(result) + "\n");
          process.exit(0);
        } catch (err) {
          if (err instanceof ProvisionError) {
            // Partial-success path (code 3): cloud_uid is known; emit JSON to stdout
            // so downstream consumers can capture it for retry.
            if (err.partial) {
              process.stdout.write(JSON.stringify(err.partial) + "\n");
            }
            process.stderr.write(
              chalk.red(`[hq cloud provision] ${err.message}\n`),
            );
            process.exit(err.code);
          }
          process.stderr.write(
            chalk.red(
              `[hq cloud provision] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
            ),
          );
          process.exit(1);
        }
      },
    );
}
