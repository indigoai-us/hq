#!/usr/bin/env node
/**
 * hq-sync-runner — machine-targeted entrypoint for `@indigoai-us/hq-cloud`
 * (ADR-0001).
 *
 * The AppBar Sync menubar (Tauri + Rust) spawns this binary as a subprocess
 * and reads ndjson events from stdout. The protocol is intentionally narrow
 * and versioned-by-shape, not by tooling — no chalk, no colors, no human
 * prose. If you want to invoke sync as a human, use `hq sync` in
 * `@indigoai-us/hq-cli`.
 *
 * Flags:
 *   --companies               Fan out across every membership the caller has
 *   --company <slug-or-uid>   Sync a single company (alternative to --companies)
 *   --on-conflict <strategy>  abort | overwrite | keep (default: abort)
 *   --hq-root <path>          Local HQ directory (default: $HOME/hq)
 *   --json                    Ignored — ndjson on stdout is the default and
 *                             only output mode. Accepted for symmetry with the
 *                             AppBar's argv in case someone passes it.
 *
 * Event protocol (one JSON object per line on stdout):
 *   setup-needed   — caller signed in but has no person entity yet
 *   auth-error     — no valid token available (interactive login disabled)
 *   fanout-plan    — list of companies we're about to sync
 *   progress       — per-file download
 *   error          — per-file or per-company error
 *   complete       — per-company summary
 *   all-complete   — aggregate summary after fanout
 *
 * Exit code:
 *   0 — event stream describes the outcome (including setup-needed)
 *   1 — argv parse error or unrecoverable pre-sync failure
 */

import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import {
  getValidAccessToken,
  loadCachedTokens,
  VaultClient,
  VaultAuthError,
  listAllCompanies as defaultListAllCompanies,
  promoteLocalCompany as defaultPromoteLocalCompany,
  type CognitoAuthConfig,
  type CognitoTokens,
  type VaultServiceConfig,
  type Membership,
  type EntityInfo,
  type CreateEntityInput,
  type PendingInviteByEmail,
  type CompanyEntry,
  type ListAllCompaniesOptions,
  type PromoteLocalCompanyOptions,
  type PromoteLocalCompanyResult,
} from "../index.js";
import { sync as defaultSync } from "../cli/sync.js";
import type {
  SyncOptions,
  SyncResult,
  SyncProgressEvent,
} from "../cli/sync.js";
import type { ConflictStrategy } from "../cli/conflict.js";

// ---------------------------------------------------------------------------
// Defaults — mirror `hq-cli/src/utils/cognito-session.ts`. Inlined (not
// imported) to avoid a circular dep between hq-cli and hq-cloud. If these
// drift, the symptom is "runner talks to a different stage than hq sync"
// — keep both files lined up.
// ---------------------------------------------------------------------------

const DEFAULT_COGNITO: CognitoAuthConfig = {
  region: process.env.AWS_REGION ?? "us-east-1",
  userPoolDomain: process.env.HQ_COGNITO_DOMAIN ?? "hq-vault-dev",
  clientId: process.env.HQ_COGNITO_CLIENT_ID ?? "4mmujmjq3srakdueg656b9m0mp",
  port: process.env.HQ_COGNITO_CALLBACK_PORT
    ? Number(process.env.HQ_COGNITO_CALLBACK_PORT)
    : 8765,
};

const DEFAULT_VAULT_API_URL =
  process.env.HQ_VAULT_API_URL ??
  "https://tqdwdqxv75.execute-api.us-east-1.amazonaws.com";

const DEFAULT_HQ_ROOT = path.join(os.homedir(), "hq");

// ---------------------------------------------------------------------------
// Event protocol
// ---------------------------------------------------------------------------

/**
 * Every event emitted on stdout. The `company` field is present on every
 * event except `setup-needed` / `auth-error` / `fanout-plan` / `all-complete`
 * (which describe the whole run) — consumers should treat its absence as
 * "meta-event, not tied to a specific company".
 */
export type RunnerEvent =
  | { type: "setup-needed" }
  | { type: "auth-error"; message: string }
  | {
      type: "fanout-plan";
      companies: Array<{
        uid?: string;
        slug: string;
        name?: string;
        source: "aws" | "local" | "both";
      }>;
    }
  | ({ type: "progress"; company: string } & Omit<Extract<SyncProgressEvent, { type: "progress" }>, "type">)
  | ({ type: "error"; company?: string } & Omit<Extract<SyncProgressEvent, { type: "error" }>, "type">)
  | ({ type: "complete"; company: string } & SyncResult)
  | {
      type: "all-complete";
      companiesAttempted: number;
      filesDownloaded: number;
      bytesDownloaded: number;
      errors: Array<{ company: string; message: string }>;
    }
  // Promote flow (US-004a) — used exclusively for `--promote <slug>`. Does not
  // share the fanout loop; emitted strictly in order: start → progress* →
  // complete|error. Runtime invariant: `complete` and `error` are mutually
  // exclusive per run.
  | { type: "promote:start"; slug: string }
  | {
      type: "promote:progress";
      slug: string;
      step: "entity" | "bucket" | "writeback";
    }
  | {
      type: "promote:complete";
      slug: string;
      uid: string;
      bucketName: string;
    }
  | { type: "promote:error"; slug: string; message: string };

/**
 * The narrow VaultClient surface the runner actually uses. Declared here (not
 * `Pick<VaultClient, ...>`) because `Pick` preserves the *entire* `entity`
 * accessor object — but the runner only needs `entity.get`, and forcing test
 * stubs to also implement `findBySlug`/`create` would be dishonest about the
 * real dependency. Keep this interface in sync with the real VaultClient
 * method signatures (both return types come straight from the SDK).
 */
export interface VaultClientSurface {
  listMyMemberships: () => Promise<Membership[]>;
  listMyPendingInvitesByEmail: () => Promise<PendingInviteByEmail[]>;
  claimPendingInvitesByEmail: (personUid: string) => Promise<void>;
  ensureMyPersonEntity: (hints: {
    ownerSub: string;
    displayName: string;
  }) => Promise<EntityInfo>;
  entity: {
    get: (uid: string) => Promise<EntityInfo>;
    /**
     * US-004a (`--promote`) widens the surface to include findBySlug + create
     * so the runner can pass this same stub into `promoteLocalCompany`. Left
     * optional here because the --companies / --company paths don't need
     * them — tests exercising those paths don't have to implement them.
     */
    findBySlug?: (type: string, slug: string) => Promise<EntityInfo>;
    create?: (input: CreateEntityInput) => Promise<EntityInfo>;
  };
  /**
   * Same story — `--promote` needs this; other paths don't. Optional so
   * existing sync-runner stubs keep working. The real VaultClient always
   * provides it.
   */
  provisionBucket?: (
    companyUid: string,
  ) => Promise<{ bucketName: string; kmsKeyId: string }>;
}

/** Minimal shape of the claims we read off the Cognito idToken. */
interface IdTokenClaims {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

export interface RunnerDeps {
  /** Where to write ndjson events. Defaults to `process.stdout`. */
  stdout?: { write: (chunk: string) => boolean | void };
  /** Where to write diagnostics. Defaults to `process.stderr`. */
  stderr?: { write: (chunk: string) => boolean | void };
  /** Resolve a valid access token. Defaults to `getValidAccessToken` non-interactive. */
  getAccessToken?: () => Promise<string>;
  /**
   * Read the caller's identity claims (sub/email/name) off the cached Cognito
   * idToken. Defaults to decoding `loadCachedTokens().idToken`. Returns `null`
   * when no cached tokens exist — the runner will then skip the claim-dance
   * and fall through to the usual listMyMemberships path.
   */
  getIdTokenClaims?: () => IdTokenClaims | null;
  /**
   * Produce a VaultClient-like object. Defaults to `new VaultClient(config)`.
   * Tests inject a stub here — the runner only calls the methods listed in
   * `VaultClientSurface`.
   */
  createVaultClient?: (config: VaultServiceConfig) => VaultClientSurface;
  /** Sync function. Defaults to `cli/sync.sync`. */
  sync?: (options: SyncOptions) => Promise<SyncResult>;
  /**
   * Enumerate local + AWS companies. Defaults to `listAllCompanies`.
   * Injectable so tests can assert on the merge behavior without touching
   * disk — company-discovery owns its own tests.
   */
  listAllCompanies?: (
    options: ListAllCompaniesOptions,
  ) => Promise<CompanyEntry[]>;
  /**
   * Promote a local-only company (US-004a). Defaults to `promoteLocalCompany`.
   * Injectable so tests can drive the event sequence without hitting Vault.
   */
  promoteLocalCompany?: (
    options: PromoteLocalCompanyOptions,
  ) => Promise<PromoteLocalCompanyResult>;
}

// ---------------------------------------------------------------------------
// JWT claim decoder — inlined to avoid pulling a dep just to read an idToken.
// We do NOT verify the signature here — Cognito already did that when it
// issued the token, and we only read the public claims (sub/email/name) to
// drive the claim-dance + create the person entity. If the token is tampered
// with, the downstream vault-service call will reject it (signature-verified
// there) long before any claimed value causes harm.
// ---------------------------------------------------------------------------

function decodeJwtClaims(jwt: string): IdTokenClaims | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as IdTokenClaims;
  } catch {
    return null;
  }
}

function defaultGetIdTokenClaims(): IdTokenClaims | null {
  const tokens: CognitoTokens | null = loadCachedTokens();
  if (!tokens?.idToken) return null;
  return decodeJwtClaims(tokens.idToken);
}

/**
 * Best-effort: claim any email-keyed pending invites that were sent before
 * this user had a person entity. Mirrors the installer's vault-handoff flow.
 *
 * Silent on the happy path — only logs to stderr on soft failures (so a
 * transient network blip doesn't block the sync). Never throws: a caller who
 * can't list memberships despite an unclaimed invite is no worse off than the
 * pre-claim-dance behavior (which was to emit setup-needed).
 */
async function runClaimDance(
  client: VaultClientSurface,
  claims: IdTokenClaims,
  stderr: { write: (chunk: string) => boolean | void },
): Promise<void> {
  try {
    const pending = await client.listMyPendingInvitesByEmail();
    if (pending.length === 0) return;

    const displayName =
      claims.name ??
      [claims.given_name, claims.family_name].filter(Boolean).join(" ") ??
      claims.email ??
      "";
    const ownerSub = claims.sub ?? "";
    if (!ownerSub || !displayName) {
      stderr.write(
        "hq-sync-runner: skipping claim-dance — idToken missing sub/name\n",
      );
      return;
    }

    const person = await client.ensureMyPersonEntity({
      ownerSub,
      displayName,
    });
    await client.claimPendingInvitesByEmail(person.uid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`hq-sync-runner: claim-dance skipped — ${msg}\n`);
  }
}

// ---------------------------------------------------------------------------
// argv parser — intentionally minimal (no commander/yargs dep)
// ---------------------------------------------------------------------------

interface ParsedArgs {
  companies: boolean;
  company?: string;
  /** US-004a: slug of a local-only company to promote to cloud. */
  promote?: string;
  /**
   * US-004b: one-shot discovery mode. When true, the runner prints a single
   * JSON array of `CompanyEntry` rows on stdout (NOT ndjson — it's consumed
   * by a non-streaming Tauri command) and exits 0. Mutually exclusive with
   * the other modes.
   */
  listAllCompanies: boolean;
  onConflict: ConflictStrategy;
  hqRoot: string;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  let companies = false;
  let company: string | undefined;
  let promote: string | undefined;
  let listAllCompaniesFlag = false;
  let onConflict: ConflictStrategy = "abort";
  let hqRoot = DEFAULT_HQ_ROOT;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--companies":
        companies = true;
        break;
      case "--company":
        company = argv[++i];
        if (!company) return { error: "--company requires a value" };
        break;
      case "--promote":
        promote = argv[++i];
        if (!promote) return { error: "--promote requires a value" };
        break;
      case "--list-all-companies":
        listAllCompaniesFlag = true;
        break;
      case "--on-conflict": {
        const val = argv[++i];
        if (val !== "abort" && val !== "overwrite" && val !== "keep") {
          return {
            error: `--on-conflict must be one of abort|overwrite|keep, got: ${val ?? "(missing)"}`,
          };
        }
        onConflict = val;
        break;
      }
      case "--hq-root":
        hqRoot = argv[++i];
        if (!hqRoot) return { error: "--hq-root requires a value" };
        break;
      case "--json":
        // Accepted but ignored — ndjson is the only output mode.
        break;
      default:
        return { error: `Unknown argument: ${arg}` };
    }
  }

  // Mode exclusivity — each mode is its own top-level action. We only error
  // if more than one of {companies, company, promote, listAllCompanies} is
  // set, or none are.
  const modes = [companies, !!company, !!promote, listAllCompaniesFlag].filter(
    Boolean,
  ).length;
  if (modes > 1) {
    if (companies && company) {
      return { error: "Pass --companies OR --company <slug>, not both" };
    }
    return {
      error:
        "Pass exactly one of --companies, --company <slug>, --promote <slug>, --list-all-companies",
    };
  }
  if (modes === 0) {
    return { error: "Pass --companies or --company <slug>" };
  }

  return {
    companies,
    company,
    promote,
    listAllCompanies: listAllCompaniesFlag,
    onConflict,
    hqRoot,
  };
}

// ---------------------------------------------------------------------------
// runRunner — testable entrypoint
// ---------------------------------------------------------------------------

export async function runRunner(
  argv: string[],
  deps: RunnerDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  const emit = (event: RunnerEvent): void => {
    stdout.write(`${JSON.stringify(event)}\n`);
  };

  // ---- argv -------------------------------------------------------------
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    stderr.write(`hq-sync-runner: ${parsed.error}\n`);
    return 1;
  }

  // ---- auth -------------------------------------------------------------
  let accessToken: string;
  try {
    const getAccessToken =
      deps.getAccessToken ??
      (() => getValidAccessToken(DEFAULT_COGNITO, { interactive: false }));
    accessToken = await getAccessToken();
  } catch (err) {
    emit({
      type: "auth-error",
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }

  // ---- vault client -----------------------------------------------------
  const vaultConfig: VaultServiceConfig = {
    apiUrl: DEFAULT_VAULT_API_URL,
    authToken: accessToken,
    region: DEFAULT_COGNITO.region,
  };
  const client =
    deps.createVaultClient?.(vaultConfig) ?? new VaultClient(vaultConfig);

  // ---- list-all-companies branch (US-004b) ------------------------------
  // One-shot discovery: prints a single JSON array of `CompanyEntry` rows on
  // stdout and exits 0. Consumed by the hq-sync menubar's `list_all_companies`
  // Tauri command, which runs this as a non-streaming subprocess — so the
  // output is a single JSON document, NOT ndjson. Errors go to stderr and
  // exit code 1 so the caller can distinguish "runner crashed" from
  // "legitimately empty list".
  if (parsed.listAllCompanies) {
    const discover = deps.listAllCompanies ?? defaultListAllCompanies;
    try {
      const entries = await discover({
        hqRoot: parsed.hqRoot,
        vaultClient: client,
        stderr,
      });
      stdout.write(`${JSON.stringify(entries)}\n`);
      return 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stderr.write(`hq-sync-runner: list-all-companies failed — ${message}\n`);
      return 1;
    }
  }

  // ---- promote branch (US-004a) ----------------------------------------
  // `--promote <slug>` runs its own event sequence and returns — it does NOT
  // fall through into the fanout loop below (US-003 short-circuits entries
  // without `uid`, but promote is its own lifecycle and must not piggy-back
  // on that path). Emits promote:start → promote:progress* →
  // promote:complete | promote:error.
  if (parsed.promote) {
    const slug = parsed.promote;
    emit({ type: "promote:start", slug });
    const promote = deps.promoteLocalCompany ?? defaultPromoteLocalCompany;
    try {
      // Emit progress before each milestone. We can't peek inside
      // promoteLocalCompany to know which step it's on, so the 'entity' and
      // 'bucket' progress events fire before the call (best-effort
      // granularity — consumers get ordered checkpoints even if we can't
      // surface intra-call progress). The 'writeback' event fires after
      // Vault is done but before the yaml rewrite, keyed off the returned
      // uid/bucketName — wrap the call so we can inject that event at the
      // right moment.
      emit({ type: "promote:progress", slug, step: "entity" });
      emit({ type: "promote:progress", slug, step: "bucket" });
      const result = await promote({
        hqRoot: parsed.hqRoot,
        slug,
        // The promote helper only needs a narrow surface; the full
        // VaultClient (or its stub) satisfies it structurally.
        vaultClient: client as unknown as Parameters<typeof promote>[0]["vaultClient"],
      });
      emit({ type: "promote:progress", slug, step: "writeback" });
      emit({
        type: "promote:complete",
        slug,
        uid: result.uid,
        bucketName: result.bucketName,
      });
      return 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "promote:error", slug, message });
      return 1;
    }
  }

  // ---- resolve targets --------------------------------------------------
  // US-003 layering:
  //   --companies  → union of local on-disk + AWS-known companies, each
  //                  tagged with source ('aws' | 'local' | 'both')
  //   --company    → caller named a uid; we treat it as AWS-targeted since
  //                  the runner can't promote a pure-local company on its
  //                  own (that's US-004a's `--promote`)
  const plan: Array<{
    uid?: string;
    slug: string;
    name?: string;
    source: "aws" | "local" | "both";
  }> = [];
  try {
    if (parsed.companies) {
      // Claim-dance BEFORE discovery so invited users see their new
      // memberships in the union. Without this, an invited user would see
      // "setup-needed" on every tray click.
      const getClaims = deps.getIdTokenClaims ?? defaultGetIdTokenClaims;
      const claims = getClaims();
      if (claims) {
        await runClaimDance(client, claims, stderr);
      }

      const discover = deps.listAllCompanies ?? defaultListAllCompanies;
      const entries = await discover({
        hqRoot: parsed.hqRoot,
        vaultClient: client,
        stderr,
      });

      if (entries.length === 0) {
        // Truly empty on both sides — valid state (no memberships AND no
        // on-disk companies). The tray will show a friendly "create your
        // first company" CTA rather than an alarm banner.
        emit({ type: "setup-needed" });
        return 0;
      }

      for (const entry of entries) {
        plan.push({
          ...(entry.uid ? { uid: entry.uid } : {}),
          slug: entry.slug,
          ...(entry.name ? { name: entry.name } : {}),
          source: entry.source,
        });
      }
    } else {
      // Single-company mode: caller named a uid (or slug; treated as uid by
      // the sync layer). Fabricate a minimal plan row so the fanout loop
      // below treats it uniformly. Resolve slug + name via entity.get for
      // nicer UI labeling, matching the pre-US-003 behavior.
      const uid = parsed.company!;
      let slug = uid;
      let name: string | undefined;
      try {
        const info = await client.entity.get(uid);
        slug = info.slug || uid;
        name = info.name;
      } catch {
        // Best-effort — keep UID as the display identifier.
      }
      plan.push({
        uid,
        slug,
        ...(name ? { name } : {}),
        source: "aws",
      });
    }
  } catch (err) {
    if (err instanceof VaultAuthError) {
      emit({
        type: "auth-error",
        message: err.message,
      });
      return 0;
    }
    // Any other failure is unrecoverable — surface as an error event and
    // exit non-zero so the spawner knows the runner didn't get far enough
    // to emit a useful protocol stream.
    emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
      path: "(discovery)",
    });
    return 1;
  }

  emit({ type: "fanout-plan", companies: plan });

  // ---- fanout -----------------------------------------------------------
  const syncFn = deps.sync ?? defaultSync;
  let totalFiles = 0;
  let totalBytes = 0;
  const errors: Array<{ company: string; message: string }> = [];

  for (const target of plan) {
    const companyLabel = target.slug;
    // Pure-local entries have no uid → no S3 bucket to sync against. Still
    // announced in fanout-plan so UIs can render them (and offer a Promote
    // affordance — see US-004a), but skipped here to avoid passing `undefined`
    // into the sync layer.
    if (!target.uid) continue;
    const companyUid = target.uid;
    try {
      const result = await syncFn({
        company: companyUid,
        vaultConfig,
        hqRoot: parsed.hqRoot,
        onConflict: parsed.onConflict,
        onEvent: (event) => {
          // Tag per-file events with the company they belong to so the
          // menubar can route them to the right company's progress bar.
          if (event.type === "progress") {
            emit({
              type: "progress",
              company: companyLabel,
              path: event.path,
              bytes: event.bytes,
              ...(event.message ? { message: event.message } : {}),
            });
          } else {
            emit({
              type: "error",
              company: companyLabel,
              path: event.path,
              message: event.message,
            });
          }
        },
      });
      emit({ type: "complete", company: companyLabel, ...result });
      totalFiles += result.filesDownloaded;
      totalBytes += result.bytesDownloaded;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ company: companyLabel, message });
      emit({
        type: "error",
        company: companyLabel,
        path: "(company)",
        message,
      });
      // Continue — one company's failure shouldn't abort the whole fanout.
    }
  }

  emit({
    type: "all-complete",
    companiesAttempted: plan.length,
    filesDownloaded: totalFiles,
    bytesDownloaded: totalBytes,
    errors,
  });
  return 0;
}

// ---------------------------------------------------------------------------
// Entrypoint — only runs when invoked directly, not when imported for tests
// ---------------------------------------------------------------------------

// Detect whether this module is the entry point. The obvious check
// (`import.meta.url === file://${argv[1]}`) breaks for every real-world
// install shape: npm-link'd binaries, global installs via Homebrew, and
// pnpm's `node_modules/.bin` shims all leave `process.argv[1]` pointing
// at a symlink named `hq-sync-runner` (no `.js` suffix) while
// `import.meta.url` always resolves to the underlying `sync-runner.js`.
//
// Resolve both sides through realpath before comparing — that's the only
// way to handle all symlink layouts without false negatives. If realpath
// fails (argv[1] gone, permissions), fall through to `false` so we
// don't run twice when imported as a library.
const isDirectInvocation = (() => {
  if (!process.argv[1]) return false;
  try {
    const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));
    const argvPath = fs.realpathSync(process.argv[1]);
    return modulePath === argvPath;
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  runRunner(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `hq-sync-runner: uncaught error — ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
}
