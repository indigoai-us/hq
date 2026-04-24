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
  type CognitoAuthConfig,
  type CognitoTokens,
  type VaultServiceConfig,
  type Membership,
  type EntityInfo,
  type PendingInviteByEmail,
} from "../index.js";
import { sync as defaultSync } from "../cli/sync.js";
import type {
  SyncOptions,
  SyncResult,
  SyncProgressEvent,
} from "../cli/sync.js";
import { share as defaultShare } from "../cli/share.js";
import type { ShareOptions, ShareResult } from "../cli/share.js";
import type { ConflictStrategy } from "../cli/conflict.js";

/**
 * Sync direction for a run.
 *
 * - `pull`: download-only (legacy `hq sync` behaviour, and the default for
 *   back-compat with pre-5.1.11 callers of the runner).
 * - `push`: upload-only. Walks the company folder and sends every file whose
 *   local hash differs from the journal (skipUnchanged).
 * - `both`: push first, then pull. "Sync Now" in the menubar app targets this.
 *   Push runs first so the subsequent pull doesn't redownload files we were
 *   about to replace; if a company aborts on push conflict, pull is skipped
 *   for that company but the fanout continues.
 */
export type Direction = "pull" | "push" | "both";

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
      companies: Array<{ uid: string; slug: string; name?: string }>;
    }
  | ({ type: "progress"; company: string } & Omit<Extract<SyncProgressEvent, { type: "progress" }>, "type">)
  | ({ type: "error"; company?: string } & Omit<Extract<SyncProgressEvent, { type: "error" }>, "type">)
  | ({
      type: "complete";
      company: string;
      /**
       * Upload counters. Always emitted (0 when the run was pull-only) so
       * downstream consumers don't need to conditionally read the field.
       * Tauri's `SyncCompleteEvent` ignores extra fields today; adding them
       * to the Rust struct is a follow-up when the UI needs to surface push
       * totals.
       */
      filesUploaded: number;
      bytesUploaded: number;
    } & SyncResult)
  | {
      type: "all-complete";
      companiesAttempted: number;
      filesDownloaded: number;
      bytesDownloaded: number;
      /** Always emitted; 0 when no push phase ran. */
      filesUploaded: number;
      bytesUploaded: number;
      errors: Array<{ company: string; message: string }>;
    };

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
  };
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
  /** Share function (push phase). Defaults to `cli/share.share`. */
  share?: (options: ShareOptions) => Promise<ShareResult>;
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
  onConflict: ConflictStrategy;
  hqRoot: string;
  direction: Direction;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  let companies = false;
  let company: string | undefined;
  let onConflict: ConflictStrategy = "abort";
  let hqRoot = DEFAULT_HQ_ROOT;
  let direction: Direction = "pull";

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
      case "--direction": {
        const val = argv[++i];
        if (val !== "pull" && val !== "push" && val !== "both") {
          return {
            error: `--direction must be one of pull|push|both, got: ${val ?? "(missing)"}`,
          };
        }
        direction = val;
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

  if (companies && company) {
    return { error: "Pass --companies OR --company <slug>, not both" };
  }
  if (!companies && !company) {
    return { error: "Pass --companies or --company <slug>" };
  }

  return { companies, company, onConflict, hqRoot, direction };
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

  // ---- resolve targets --------------------------------------------------
  let memberships: Pick<Membership, "companyUid">[];
  try {
    if (parsed.companies) {
      // Before giving up on memberships, run the claim-dance: new users signed
      // in via the tray may have email-keyed invites waiting for them. Without
      // this, an invited user would see "setup-needed" on every tray click.
      const getClaims = deps.getIdTokenClaims ?? defaultGetIdTokenClaims;
      const claims = getClaims();
      if (claims) {
        await runClaimDance(client, claims, stderr);
      }

      memberships = await client.listMyMemberships();
      if (memberships.length === 0) {
        // Truly empty — still a valid state (no memberships = nothing to
        // sync). The tray will show a friendly "create your first company"
        // CTA rather than an alarm banner.
        emit({ type: "setup-needed" });
        return 0;
      }
    } else {
      // Single-company mode: fabricate a minimal membership so the fanout
      // loop below treats it uniformly. We don't need to hit
      // /membership/me — the caller already told us which company.
      memberships = [{ companyUid: parsed.company! }];
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

  // ---- resolve slugs for the fanout plan --------------------------------
  // The menubar wants "Syncing indigo" in its UI, not the raw cmp_* ULID.
  // If the entity fetch fails for some row (entity deleted, scoping issue),
  // degrade to using the UID as the slug rather than aborting the run.
  const plan: Array<{ uid: string; slug: string; name?: string }> = [];
  for (const m of memberships) {
    let slug = m.companyUid;
    let name: string | undefined;
    try {
      const info = await client.entity.get(m.companyUid);
      slug = info.slug || m.companyUid;
      name = info.name;
    } catch {
      // Best-effort — keep UID as the display identifier.
    }
    plan.push({ uid: m.companyUid, slug, ...(name ? { name } : {}) });
  }
  emit({ type: "fanout-plan", companies: plan });

  // ---- fanout -----------------------------------------------------------
  const syncFn = deps.sync ?? defaultSync;
  const shareFn = deps.share ?? defaultShare;
  const doPush = parsed.direction === "push" || parsed.direction === "both";
  const doPull = parsed.direction === "pull" || parsed.direction === "both";
  let totalDownloaded = 0;
  let totalDownloadedBytes = 0;
  let totalUploaded = 0;
  let totalUploadedBytes = 0;
  const errors: Array<{ company: string; message: string }> = [];

  for (const target of plan) {
    const companyLabel = target.slug;
    // Per-company event tagger — shared by push and pull phases so progress
    // rows land on the right company regardless of which phase emitted them.
    const tagAndEmit = (event: SyncProgressEvent): void => {
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
    };

    try {
      let pushResult: ShareResult = {
        filesUploaded: 0,
        bytesUploaded: 0,
        filesSkipped: 0,
        aborted: false,
      };
      let pullResult: SyncResult = {
        filesDownloaded: 0,
        bytesDownloaded: 0,
        filesSkipped: 0,
        conflicts: 0,
        aborted: false,
      };

      // Push first so a subsequent pull doesn't overwrite files we were about
      // to broadcast. Uses the walk-everything-under-companies/{slug}/ entry
      // point with `skipUnchanged` so we don't re-upload files that haven't
      // changed since the last sync.
      if (doPush) {
        pushResult = await shareFn({
          paths: [path.join(parsed.hqRoot, "companies", target.slug)],
          company: target.uid,
          vaultConfig,
          hqRoot: parsed.hqRoot,
          onConflict: parsed.onConflict,
          skipUnchanged: true,
          onEvent: tagAndEmit,
        });
      }

      // Pull runs unless the push phase aborted on conflict — aborted means
      // the user has local edits + remote drift; blindly pulling would erase
      // whichever side `--on-conflict abort` just protected.
      if (doPull && !pushResult.aborted) {
        pullResult = await syncFn({
          company: target.uid,
          vaultConfig,
          hqRoot: parsed.hqRoot,
          onConflict: parsed.onConflict,
          onEvent: tagAndEmit,
        });
      }

      emit({
        type: "complete",
        company: companyLabel,
        filesDownloaded: pullResult.filesDownloaded,
        bytesDownloaded: pullResult.bytesDownloaded,
        filesUploaded: pushResult.filesUploaded,
        bytesUploaded: pushResult.bytesUploaded,
        filesSkipped: pullResult.filesSkipped + pushResult.filesSkipped,
        conflicts: pullResult.conflicts,
        // Either phase aborting marks the company aborted — the UI treats
        // `aborted: true` as "sync didn't complete cleanly for this company".
        aborted: pullResult.aborted || pushResult.aborted,
      });
      totalDownloaded += pullResult.filesDownloaded;
      totalDownloadedBytes += pullResult.bytesDownloaded;
      totalUploaded += pushResult.filesUploaded;
      totalUploadedBytes += pushResult.bytesUploaded;
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
    filesDownloaded: totalDownloaded,
    bytesDownloaded: totalDownloadedBytes,
    filesUploaded: totalUploaded,
    bytesUploaded: totalUploadedBytes,
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
