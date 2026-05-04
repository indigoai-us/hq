/**
 * `hq cloud demote company <slug>` — convert a cloud-backed company back to
 * local-only after hq-pro has soft-tombstoned its entity (Settings → Delete
 * company in hq-console).
 *
 * Inverse of `hq cloud provision company <slug>`. Both commands live here in
 * hq-cli so the file-touching contract (manifest patch + per-folder config
 * write + company.yaml mutation) is single-sourced. AppBar HQ Sync's Path A
 * shells out to this command on the `deleted=true` branch instead of
 * re-implementing the file mutations in Rust.
 *
 * Side-effects (all atomic + idempotent):
 *   1. Remove `companies/<slug>/.hq/config.json`.
 *   2. Flip `cloud: true → false` in `companies/<slug>/company.yaml`. Without
 *      this flip the next `provisionCompany` would re-mint a fresh cloud
 *      company — exactly what the user just deleted.
 *   3. Strip `cloud_uid` + `bucket_name` from `companies/manifest.yaml`'s
 *      `companies.<slug>` entry. The slug entry + other fields stay.
 *
 * Safety check (default on): `findCompanyBySlug` MUST return an entity with
 * `deleted: true`. A live entity, or no entity at all, refuses with code 2.
 * `--force` skips the network call (AppBar passes it because Path A just
 * checked).
 *
 * Exit codes (mirrors cloud-provision):
 *   0 — success or idempotent no-op.
 *   1 — vault HTTP failure during the safety check.
 *   2 — validation (bad slug, missing dir/manifest, cloud not deleted).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { Command } from "commander";
import chalk from "chalk";

import {
  ProvisionError,
  companyConfigPath,
  companyDirPath,
  createDefaultVaultClient,
  manifestPath,
  validateManifestAndDir,
  validateSlug,
  type VaultClient,
} from "./cloud-provision.js";
import {
  DEFAULT_HQ_ROOT,
  DEFAULT_VAULT_API_URL,
  ensureCognitoToken,
} from "../utils/cognito-session.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** Final stdout JSON shape. AppBar parses this. */
export interface DemoteResult {
  ok: boolean;
  company_slug: string;
  /** True if `.hq/config.json` was actually deleted (false if absent). */
  config_removed: boolean;
  /** True if `company.yaml`'s `cloud` was changed (true→false or absent→false). */
  yaml_flipped: boolean;
  /** True if manifest had `cloud_uid` / `bucket_name` to strip. */
  manifest_stripped: boolean;
  /**
   * `true` when the cloud entity verified as `deleted=true`. `null` when
   * `--force` was used and the verify was skipped. (`false` is unreachable —
   * a non-deleted entity throws code 2 before reaching the result.)
   */
  cloud_was_deleted: boolean | null;
}

export interface DemoteCompanyOptions {
  slug: string;
  hqRoot: string;
  vaultApiUrl: string;
  /** Skip the `findCompanyBySlug` safety check. AppBar uses this. */
  force?: boolean;
  /** Injected vault HTTP client (override for tests). */
  vaultClient?: VaultClient;
  /** Injected access-token resolver (override for tests). */
  resolveAccessToken?: () => Promise<string>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Flip `cloud: true → false` in `companies/<slug>/company.yaml`. All other
 * keys + ordering preserved (js-yaml round-trip). Atomic (tmp + rename).
 *
 * Returns true if the file was changed, false if no-op (file missing, or
 * `cloud` was already `false`).
 *
 * NOTE: js-yaml doesn't preserve comments, but this matches what
 * `patchManifest` already does — accepted trade-off.
 */
export function flipCompanyYamlCloudOff(hqRoot: string, slug: string): boolean {
  const yPath = path.join(companyDirPath(hqRoot, slug), "company.yaml");
  if (!fs.existsSync(yPath)) return false;
  const raw = fs.readFileSync(yPath, "utf-8");
  const parsed = (yaml.load(raw) as Record<string, unknown> | null) ?? {};
  if (parsed.cloud === false) return false;
  parsed.cloud = false;
  const dump = yaml.dump(parsed, { lineWidth: -1, noRefs: true });
  const tmp = `${yPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, dump);
  fs.renameSync(tmp, yPath);
  return true;
}

/**
 * Remove `cloud_uid` + `bucket_name` from `companies.<slug>` in
 * `companies/manifest.yaml`. The slug entry is preserved (other fields like
 * `name`/`status`/`path` stay). Atomic (tmp + rename).
 *
 * Returns true if the file was changed, false if no-op (manifest missing,
 * slug missing, or both fields already absent).
 */
export function stripManifestCloudForSlug(hqRoot: string, slug: string): boolean {
  const mPath = manifestPath(hqRoot);
  if (!fs.existsSync(mPath)) return false;
  const raw = fs.readFileSync(mPath, "utf-8");
  const parsed = (yaml.load(raw) as { companies?: Record<string, unknown> } | null) ?? {};
  const companies = parsed.companies;
  if (!companies || !(slug in companies)) return false;
  const entry = companies[slug];
  if (!entry || typeof entry !== "object") return false;
  const obj = entry as Record<string, unknown>;
  const hadCloudUid = "cloud_uid" in obj;
  const hadBucketName = "bucket_name" in obj;
  if (!hadCloudUid && !hadBucketName) return false;
  delete obj.cloud_uid;
  delete obj.bucket_name;
  const dump = yaml.dump(parsed, { lineWidth: -1, noRefs: true });
  const tmp = `${mPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, dump);
  fs.renameSync(tmp, mPath);
  return true;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run the full demote flow. Returns a `DemoteResult` on success; throws
 * `ProvisionError` (codes 1 or 2) on any failure.
 */
export async function demoteCompany(
  options: DemoteCompanyOptions,
): Promise<DemoteResult> {
  validateSlug(options.slug);
  // Fails with code 2 if the manifest is missing/malformed, the slug is not
  // present under `.companies`, or `companies/<slug>/` doesn't exist on disk.
  // Without this, a `--force` demote against a missing or renamed slug would
  // be a silent no-op (all helpers return false but we'd still report ok=true).
  validateManifestAndDir(options.hqRoot, options.slug);

  let cloudWasDeleted: boolean | null = null;

  if (!options.force) {
    const accessToken = options.resolveAccessToken
      ? await options.resolveAccessToken()
      : await ensureCognitoToken();
    const client =
      options.vaultClient ??
      createDefaultVaultClient(options.vaultApiUrl, accessToken);
    let entity;
    try {
      entity = await client.findCompanyBySlug(options.slug);
    } catch (err) {
      if (err instanceof ProvisionError) throw err;
      throw new ProvisionError(
        1,
        `Vault GET by-slug failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!entity) {
      throw new ProvisionError(
        2,
        `Refusing to demote '${options.slug}': no cloud entity found. Pass --force to demote anyway.`,
      );
    }
    // `deleted` is added by hq-pro and isn't in the static VaultEntity type.
    const deleted = (entity as unknown as { deleted?: boolean }).deleted === true;
    if (!deleted) {
      throw new ProvisionError(
        2,
        `Refusing to demote '${options.slug}': cloud entity is not deleted (uid=${entity.uid}). Pass --force to demote anyway.`,
      );
    }
    cloudWasDeleted = true;
  }

  const cPath = companyConfigPath(options.hqRoot, options.slug);
  let configRemoved = false;
  if (fs.existsSync(cPath)) {
    fs.rmSync(cPath);
    configRemoved = true;
  }

  const yamlFlipped = flipCompanyYamlCloudOff(options.hqRoot, options.slug);
  const manifestStripped = stripManifestCloudForSlug(options.hqRoot, options.slug);

  return {
    ok: true,
    company_slug: options.slug,
    config_removed: configRemoved,
    yaml_flipped: yamlFlipped,
    manifest_stripped: manifestStripped,
    cloud_was_deleted: cloudWasDeleted,
  };
}

// ── Commander wiring ─────────────────────────────────────────────────────────

/**
 * Register `demote company <slug>` under the `cloud` command group. Wired in
 * `src/index.ts` alongside `registerCloudProvisionCommands(cloudCmd)`.
 */
export function registerCloudDemoteCommands(program: Command): void {
  const demoteCmd = program
    .command("demote")
    .description("Demote a cloud-backed entity back to local-only");

  demoteCmd
    .command("company")
    .description(
      "Demote a cloud-backed company to local-only after the cloud entity " +
        "has been soft-tombstoned in hq-console. Removes .hq/config.json, " +
        "flips company.yaml `cloud: false`, and strips the manifest cloud refs.",
    )
    .argument("<slug>", "Company slug")
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
    .option(
      "--force",
      "Skip the safety check that the cloud entity is actually deleted=true. " +
        "AppBar HQ Sync passes this because its Path A just verified.",
    )
    .action(
      async (
        slug: string,
        options: { hqRoot: string; vaultApiUrl: string; force?: boolean },
      ) => {
        try {
          const result = await demoteCompany({
            slug,
            hqRoot: options.hqRoot,
            vaultApiUrl: options.vaultApiUrl,
            force: options.force,
          });
          process.stdout.write(JSON.stringify(result) + "\n");
          process.exit(0);
        } catch (err) {
          if (err instanceof ProvisionError) {
            process.stderr.write(
              chalk.red(`[hq cloud demote] ${err.message}\n`),
            );
            process.exit(err.code);
          }
          process.stderr.write(
            chalk.red(
              `[hq cloud demote] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
            ),
          );
          process.exit(1);
        }
      },
    );
}
