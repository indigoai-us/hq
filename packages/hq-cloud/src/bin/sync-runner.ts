#!/usr/bin/env node
/**
 * hq-sync-runner — machine-targeted entrypoint for `@indigoai-us/hq-cloud`
 * (ADR-0001).
 *
 * The AppBar Sync menubar (Tauri + Rust) spawns this binary as a subprocess
 * and reads ndjson events from BOTH stdout and stderr (see "Channels"
 * below). The protocol is intentionally narrow and versioned-by-shape, not
 * by tooling — no chalk, no colors, no human prose. If you want to invoke
 * sync as a human, use `hq sync` in `@indigoai-us/hq-cli`.
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
 * Channels (one JSON object per line):
 *   stdout — protocol stream:
 *     setup-needed   caller signed in but has no person entity yet
 *     fanout-plan    list of companies we're about to sync
 *     progress       per-file download
 *     complete       per-company summary
 *     all-complete   aggregate summary after fanout
 *   stderr — diagnostic stream:
 *     error          per-file or per-company error
 *     auth-error     no valid token available (interactive login disabled)
 *
 * Why the split: error-class events go to stderr so the menubar's Sentry
 * breadcrumb pipeline picks them up automatically (see hq-sync
 * src-tauri/src/commands/sync.rs `ProcessEvent::Stderr` handler). The
 * single Sentry capture at runner-exit then ships one #hq-alerts issue
 * with the full per-file → company → exit error trail attached, instead
 * of requiring per-event capture calls in the menubar.
 *
 * Exit code:
 *   0 — event stream describes the outcome. The runner finished its protocol
 *       without any company throwing. Includes setup-needed, auth-error, and
 *       runs where every company completed OR cleanly returned `aborted: true`
 *       (a `--on-conflict abort` policy decision is not an error).
 *   1 — argv parse error or unrecoverable pre-sync failure.
 *   2 — at least one company threw mid-stream (e.g. mid-fanout 401, network
 *       reset, S3 5xx after retries). The all-complete event carries
 *       `partial: true` and per-company partial counts captured from
 *       `progress` events before the throw, so consumers parsing ndjson see
 *       what actually transferred. This is distinct from exit 0 with
 *       `partial: true` (clean conflict-aborts) — exit 2 is "something
 *       unexpected happened", which the Tauri menubar converts to a Sentry
 *       alert. Conflict-aborts intentionally do NOT alert.
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
import { pickCanonicalPersonEntity } from "../vault-client.js";
import { sync as defaultSync } from "../cli/sync.js";
import type {
  SyncOptions,
  SyncResult,
  SyncProgressEvent,
} from "../cli/sync.js";
import { share as defaultShare } from "../cli/share.js";
import type { ShareOptions, ShareResult } from "../cli/share.js";
import type { ConflictStrategy } from "../cli/conflict.js";
import type { UploadAuthor } from "../s3.js";

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
  userPoolDomain: process.env.HQ_COGNITO_DOMAIN ?? "vault-indigo-hq-prod",
  clientId: process.env.HQ_COGNITO_CLIENT_ID ?? "7acei2c8v870enheptb1j5foln",
  port: process.env.HQ_COGNITO_CALLBACK_PORT
    ? Number(process.env.HQ_COGNITO_CALLBACK_PORT)
    : 8765,
};

const DEFAULT_VAULT_API_URL =
  process.env.HQ_VAULT_API_URL ?? "https://hqapi.getindigo.ai";

const DEFAULT_HQ_ROOT = path.join(os.homedir(), "hq");

// ---------------------------------------------------------------------------
// Event protocol
// ---------------------------------------------------------------------------

/**
 * Every event the runner emits. Channel routing (stdout vs stderr) is
 * decided inside `runRunner`'s `emit` helper based on the event's `type`
 * — see the doc-block on the file header for the split.
 *
 * The `company` field is present on every event except `setup-needed` /
 * `auth-error` / `fanout-plan` / `all-complete` (which describe the whole
 * run) — consumers should treat its absence as "meta-event, not tied to a
 * specific company".
 */
export type RunnerEvent =
  | { type: "setup-needed" }
  | { type: "auth-error"; message: string }
  | {
      type: "fanout-plan";
      companies: Array<{ uid: string; slug: string; name?: string }>;
    }
  | ({
      /**
       * Stage-1 results for a single company's sync/share pass. Emitted once
       * before any `progress` events for that company arrive — once for the
       * pull phase (download counts) and once for the push phase (upload
       * counts) when `--direction both`. Consumers (the menubar) sum the
       * non-zero fields across all `plan` events seen for a fanout to render
       * an accurate "X of Y files" denominator before transfers begin.
       */
      type: "plan";
      company: string;
    } & Omit<Extract<SyncProgressEvent, { type: "plan" }>, "type">)
  | ({ type: "progress"; company: string } & Omit<Extract<SyncProgressEvent, { type: "progress" }>, "type">)
  | ({ type: "error"; company?: string } & Omit<Extract<SyncProgressEvent, { type: "error" }>, "type">)
  | ({ type: "conflict"; company: string } & Omit<Extract<SyncProgressEvent, { type: "conflict" }>, "type">)
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
      /**
       * Conflict file paths aggregated across every company in the run.
       * Always emitted; empty array when no conflicts were detected. Lets
       * the menubar UI render a flat list without re-walking per-company
       * `complete` events.
       */
      conflictPaths: Array<{ company: string; path: string; direction: "pull" | "push" }>;
      errors: Array<{ company: string; message: string }>;
      /**
       * True when at least one company in the fanout did not complete cleanly
       * — either it returned `aborted: true` (e.g. conflict-abort) or its sync
       * function threw mid-stream (e.g. mid-fanout 401). When `partial: true`,
       * the totals above include partial counts captured from `progress` events
       * before the abort, NOT just companies that emitted a clean `complete`.
       *
       * Automated monitors should check this field — `errors.length > 0` alone
       * isn't sufficient because a `aborted: true` return doesn't push to
       * `errors` (it's a clean conflict-abort, not an exception).
       */
      partial: boolean;
      /**
       * Per-company breakdown of the fanout. Always present, one entry per
       * planned company, in fanout order. Lets consumers reconcile per-company
       * partial counts with the aggregate without re-walking `complete` /
       * `error` event streams. The `status` field is the canonical signal:
       * - "complete" — sync returned cleanly, `aborted: false`
       * - "aborted"  — sync returned cleanly with `aborted: true` (conflict-abort)
       * - "errored"  — sync threw mid-stream; counts are sourced from progress
       *                events seen before the throw
       */
      companies: Array<{
        company: string;
        status: "complete" | "aborted" | "errored";
        filesDownloaded: number;
        bytesDownloaded: number;
        filesUploaded: number;
        bytesUploaded: number;
      }>;
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
    listByType: (type: string) => Promise<EntityInfo[]>;
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

  // ---- emit ---------------------------------------------------------------
  // Error-class events go to stderr; everything else to stdout.
  //
  // Why split: the AppBar Sync menubar (Tauri + Rust) feeds runner stderr
  // into Sentry as breadcrumbs and captures one Sentry event when the
  // runner exits non-zero. Routing `error` / `auth-error` events through
  // stderr makes them part of that breadcrumb trail automatically — the
  // menubar doesn't need a per-event capture call, and operators get the
  // full context (per-file errors → company error → exit) in a single
  // Sentry issue alerted to #hq-alerts.
  //
  // Non-error events (progress, complete, fanout-plan, all-complete,
  // setup-needed) stay on stdout. They're the protocol stream the menubar
  // parses for UI updates; mixing them with error events on the same
  // channel was the original design (single ndjson stream, simpler to
  // tee), but error context belongs in the diagnostic channel.
  //
  // Backward compat: older menubar releases (pre-PR-#34) parse only
  // stdout for ndjson; with this change they will NOT receive error
  // events. The menubar's `HQ_CLOUD_VERSION` pin gates which runner
  // they spawn, so old menubars stay on the previous runner version
  // even after this one is published.
  const ERROR_TYPES: ReadonlySet<RunnerEvent["type"]> = new Set([
    "error",
    "auth-error",
  ]);
  const emit = (event: RunnerEvent): void => {
    const stream = ERROR_TYPES.has(event.type) ? stderr : stdout;
    stream.write(`${JSON.stringify(event)}\n`);
  };

  // ---- argv -------------------------------------------------------------
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    stderr.write(`hq-sync-runner: ${parsed.error}\n`);
    return 1;
  }

  // ---- auth -------------------------------------------------------------
  // Resolve the access token up-front to surface auth-error early (before any
  // protocol events). Long-running multi-company syncs can outlast Cognito's
  // 60-min access token TTL, so the vaultConfig captures a *getter* — every
  // vault request resolves the latest token via getValidAccessToken, which
  // re-reads `~/.hq/cognito-tokens.json` and refreshes on demand. Without
  // this, a captured string goes stale mid-fanout (e.g. personal sync runs
  // last → STS expires after 13 min → refreshEntityContext → fetchEntity →
  // 401 against API Gateway's JWT authorizer because the captured token
  // expired while the menubar was happily rotating the on-disk token).
  const getAccessToken =
    deps.getAccessToken ??
    (() => getValidAccessToken(DEFAULT_COGNITO, { interactive: false }));
  try {
    await getAccessToken();
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
    authToken: getAccessToken,
    region: DEFAULT_COGNITO.region,
  };
  const client =
    deps.createVaultClient?.(vaultConfig) ?? new VaultClient(vaultConfig);

  // ---- resolve identity claims -----------------------------------------
  // Read the cached idToken claims once. Two consumers downstream:
  //   1. The claim-dance (only fires in `--companies` mode for setup-needed
  //      invitees).
  //   2. The S3 upload author (every share() call stamps `Metadata['created-by']`
  //      with `claims.email` so the hq-console vault UI's CREATED BY column
  //      attributes the file to the syncing user).
  // Resolved here (not inside `parsed.companies`) so single-company runs also
  // get author attribution. `null` is fine — share() simply omits the metadata.
  const getClaims = deps.getIdTokenClaims ?? defaultGetIdTokenClaims;
  const claims = getClaims();
  const uploadAuthor: UploadAuthor | undefined =
    claims?.sub && claims?.email
      ? { userSub: claims.sub, email: claims.email }
      : undefined;

  // ---- resolve targets --------------------------------------------------
  let memberships: Pick<Membership, "companyUid">[];
  try {
    if (parsed.companies) {
      // Before giving up on memberships, run the claim-dance: new users signed
      // in via the tray may have email-keyed invites waiting for them. Without
      // this, an invited user would see "setup-needed" on every tray click.
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
  const plan: Array<{
    uid: string;
    slug: string;
    name?: string;
    bucketName?: string;
    personalMode?: boolean;
    journalSlug?: string;
  }> = [];
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

  if (parsed.companies) {
    const persons = await client.entity.listByType("person");
    const pick = pickCanonicalPersonEntity(persons);
    if (pick?.bucketName) {
      plan.push({
        slug: "personal",
        uid: pick.uid,
        bucketName: pick.bucketName,
        personalMode: true,
        journalSlug: "personal",
      });
    }
  }

  emit({ type: "fanout-plan", companies: plan });

  // ---- fanout -----------------------------------------------------------
  const syncFn = deps.sync ?? defaultSync;
  const shareFn = deps.share ?? defaultShare;
  const doPush = parsed.direction === "push" || parsed.direction === "both";
  const doPull = parsed.direction === "pull" || parsed.direction === "both";
  const errors: Array<{ company: string; message: string }> = [];
  const allConflicts: Array<{ company: string; path: string; direction: "pull" | "push" }> = [];

  // Per-company state, keyed by the company label (slug or UID-fallback) so
  // both `progress` (which streams) and `complete`/throw (which lands once)
  // can update the same row. The rollup at the bottom of the function walks
  // every entry — this is the source of truth that closes the bug where an
  // aborted company's partial counts were dropped from `all-complete`.
  //
  // We seed `direction` from the parsed flag so we know whether a `progress`
  // event without a clear phase should bump downloaded or uploaded counters.
  // For `direction: "both"` runs we lean on the path of the in-flight phase
  // — push runs first and sets `phaseRef.current = "push"` while shareFn runs,
  // pull sets it to "pull". The closure shared by tagAndEmit reads `.current`
  // at event time, so progress events route to the right column.
  type CompanyStatus = "complete" | "aborted" | "errored";
  interface CompanyState {
    company: string;
    status: CompanyStatus;
    filesDownloaded: number;
    bytesDownloaded: number;
    filesUploaded: number;
    bytesUploaded: number;
  }
  const stateByCompany = new Map<string, CompanyState>();

  for (const target of plan) {
    const companyLabel = target.slug;
    const state: CompanyState = {
      company: companyLabel,
      // Default to "errored" so a throw before any complete-or-clean-abort
      // path (the original bug) leaves the entry flagged as not-clean. The
      // success/clean-abort paths overwrite this before the loop body exits.
      status: "errored",
      filesDownloaded: 0,
      bytesDownloaded: 0,
      filesUploaded: 0,
      bytesUploaded: 0,
    };
    stateByCompany.set(companyLabel, state);

    // Which phase is currently emitting `progress` events. Mutable closure so
    // tagAndEmit (defined once below) reads the latest value when each event
    // fires. "pull" is the default for back-compat with pull-only runs.
    let activePhase: "pull" | "push" = doPush && !doPull ? "push" : "pull";

    // Per-company event tagger — shared by push and pull phases so progress
    // rows land on the right company regardless of which phase emitted them.
    // Also updates `state` for `progress` events so the rollup has accurate
    // partial counts even if the sync function throws before returning.
    const tagAndEmit = (event: SyncProgressEvent): void => {
      if (event.type === "plan") {
        emit({
          type: "plan",
          company: companyLabel,
          filesToDownload: event.filesToDownload,
          bytesToDownload: event.bytesToDownload,
          filesToUpload: event.filesToUpload,
          bytesToUpload: event.bytesToUpload,
          filesToSkip: event.filesToSkip,
          filesToConflict: event.filesToConflict,
          filesToDelete: event.filesToDelete,
        });
      } else if (event.type === "progress") {
        if (activePhase === "push") {
          state.filesUploaded += 1;
          state.bytesUploaded += event.bytes;
        } else {
          state.filesDownloaded += 1;
          state.bytesDownloaded += event.bytes;
        }
        emit({
          type: "progress",
          company: companyLabel,
          path: event.path,
          bytes: event.bytes,
          ...(event.message ? { message: event.message } : {}),
        });
      } else if (event.type === "conflict") {
        emit({
          type: "conflict",
          company: companyLabel,
          path: event.path,
          direction: event.direction,
          resolution: event.resolution,
        });
      } else if (event.type === "error") {
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
        filesDeleted: 0,
        conflictPaths: [],
        aborted: false,
      };
      let pullResult: SyncResult = {
        filesDownloaded: 0,
        bytesDownloaded: 0,
        filesSkipped: 0,
        conflicts: 0,
        conflictPaths: [],
        aborted: false,
      };

      // Push first so a subsequent pull doesn't overwrite files we were about
      // to broadcast. Uses the walk-everything-under-companies/{slug}/ entry
      // point with `skipUnchanged` so we don't re-upload files that haven't
      // changed since the last sync.
      if (doPush) {
        activePhase = "push";
        pushResult = await shareFn({
          paths: [path.join(parsed.hqRoot, "companies", target.slug)],
          company: target.uid,
          vaultConfig,
          hqRoot: parsed.hqRoot,
          onConflict: parsed.onConflict,
          skipUnchanged: true,
          // Local deletes propagate to S3 as soft deletes (versioning is on
          // — DeleteObject writes a delete-marker, prior versions remain
          // recoverable). Without this, a deleted file resurfaces on the
          // next pull because the remote object is still listable.
          propagateDeletes: true,
          onEvent: tagAndEmit,
          ...(uploadAuthor ? { author: uploadAuthor } : {}),
        });
      }

      // Pull runs unless the push phase aborted on conflict — aborted means
      // the user has local edits + remote drift; blindly pulling would erase
      // whichever side `--on-conflict abort` just protected.
      if (doPull && !pushResult.aborted) {
        activePhase = "pull";
        pullResult = await syncFn({
          company: target.uid,
          vaultConfig,
          hqRoot: parsed.hqRoot,
          onConflict: parsed.onConflict,
          ...(target.personalMode !== undefined ? { personalMode: target.personalMode } : {}),
          ...(target.journalSlug !== undefined ? { journalSlug: target.journalSlug } : {}),
          onEvent: tagAndEmit,
        });
      }

      // Concat push + pull conflict paths into a single per-company list.
      // Both arrays are always present (defaulted to []) so consumers can
      // treat `conflictPaths` as authoritative without a falsy check.
      const mergedConflictPaths = [
        ...pullResult.conflictPaths,
        ...pushResult.conflictPaths,
      ];
      const aborted = pullResult.aborted || pushResult.aborted;

      // Overwrite the progress-derived counts with the authoritative numbers
      // from the sync/share return values. The `progress` stream over-counts
      // when the inner walker emits a progress row for a file it then skips
      // due to a journal hit — a clean return value is the source of truth.
      // For the throw case below this overwrite never runs, so `state` keeps
      // its progress-derived counts (which is exactly what we want there).
      state.filesDownloaded = pullResult.filesDownloaded;
      state.bytesDownloaded = pullResult.bytesDownloaded;
      state.filesUploaded = pushResult.filesUploaded;
      state.bytesUploaded = pushResult.bytesUploaded;
      state.status = aborted ? "aborted" : "complete";

      emit({
        type: "complete",
        company: companyLabel,
        filesDownloaded: pullResult.filesDownloaded,
        bytesDownloaded: pullResult.bytesDownloaded,
        filesUploaded: pushResult.filesUploaded,
        bytesUploaded: pushResult.bytesUploaded,
        filesSkipped: pullResult.filesSkipped + pushResult.filesSkipped,
        // Sourced from the merged path list so push-side conflicts are
        // counted too — `ShareResult` doesn't expose a numeric counter,
        // and using `pullResult.conflicts` alone silently dropped any
        // push conflict from the count while leaving its path in
        // `conflictPaths`.
        conflicts: mergedConflictPaths.length,
        conflictPaths: mergedConflictPaths,
        // Either phase aborting marks the company aborted — the UI treats
        // `aborted: true` as "sync didn't complete cleanly for this company".
        aborted,
      });
      for (const p of pullResult.conflictPaths) {
        allConflicts.push({ company: companyLabel, path: p, direction: "pull" });
      }
      for (const p of pushResult.conflictPaths) {
        allConflicts.push({ company: companyLabel, path: p, direction: "push" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ company: companyLabel, message });
      // `state.status` was seeded as "errored" at loop entry — the throw
      // path leaves it there, and `state.files{Down,Up}loaded` reflects the
      // partial counts captured from `progress` events before the throw.
      // Emit a `complete` event with `aborted: true` and those partial
      // counts so consumers walking the `complete` event stream see every
      // company in the fanout uniformly. This is the fix for the misleading
      // rollup — see file header `Exit code: 2` doc.
      emit({
        type: "complete",
        company: companyLabel,
        filesDownloaded: state.filesDownloaded,
        bytesDownloaded: state.bytesDownloaded,
        filesUploaded: state.filesUploaded,
        bytesUploaded: state.bytesUploaded,
        filesSkipped: 0,
        conflicts: 0,
        conflictPaths: [],
        aborted: true,
      });
      emit({
        type: "error",
        company: companyLabel,
        path: "(company)",
        message,
      });
      // Continue — one company's failure shouldn't abort the whole fanout.
    }
  }

  // Walk every per-company entry — the map holds one row per planned company,
  // including ones that aborted via thrown exception. This is the fix for the
  // bug where `all-complete` reported `filesDownloaded: 0` for an aborted
  // personal-sync that had already emitted thousands of `progress` events:
  // the rollup used to only sum companies that emitted a clean `complete`,
  // which silently dropped partials when the sync function threw.
  let totalDownloaded = 0;
  let totalDownloadedBytes = 0;
  let totalUploaded = 0;
  let totalUploadedBytes = 0;
  let partial = false;
  const companies: Array<{
    company: string;
    status: CompanyStatus;
    filesDownloaded: number;
    bytesDownloaded: number;
    filesUploaded: number;
    bytesUploaded: number;
  }> = [];
  for (const target of plan) {
    const s = stateByCompany.get(target.slug);
    if (!s) continue; // unreachable — every plan entry seeds the map
    totalDownloaded += s.filesDownloaded;
    totalDownloadedBytes += s.bytesDownloaded;
    totalUploaded += s.filesUploaded;
    totalUploadedBytes += s.bytesUploaded;
    if (s.status !== "complete") partial = true;
    companies.push({
      company: s.company,
      status: s.status,
      filesDownloaded: s.filesDownloaded,
      bytesDownloaded: s.bytesDownloaded,
      filesUploaded: s.filesUploaded,
      bytesUploaded: s.bytesUploaded,
    });
  }

  emit({
    type: "all-complete",
    companiesAttempted: plan.length,
    filesDownloaded: totalDownloaded,
    bytesDownloaded: totalDownloadedBytes,
    filesUploaded: totalUploaded,
    bytesUploaded: totalUploadedBytes,
    conflictPaths: allConflicts,
    errors,
    partial,
    companies,
  });
  // Exit 2 only when something actually threw (`errors.length > 0`). A clean
  // conflict-abort sets `partial: true` in the JSON but exits 0 — the Tauri
  // menubar's non-zero-exit Sentry capture would otherwise fire for normal
  // user-policy outcomes. Consumers that want to flag any non-clean outcome
  // (clean-abort + thrown-error) read `partial` from the JSON.
  return errors.length > 0 ? 2 : 0;
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
