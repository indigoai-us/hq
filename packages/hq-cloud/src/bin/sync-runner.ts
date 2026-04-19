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
import {
  getValidAccessToken,
  VaultClient,
  VaultAuthError,
  type CognitoAuthConfig,
  type VaultServiceConfig,
  type Membership,
  type EntityInfo,
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
      companies: Array<{ uid: string; slug: string }>;
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
  entity: {
    get: (uid: string) => Promise<EntityInfo>;
  };
}

export interface RunnerDeps {
  /** Where to write ndjson events. Defaults to `process.stdout`. */
  stdout?: { write: (chunk: string) => boolean | void };
  /** Where to write diagnostics. Defaults to `process.stderr`. */
  stderr?: { write: (chunk: string) => boolean | void };
  /** Resolve a valid access token. Defaults to `getValidAccessToken` non-interactive. */
  getAccessToken?: () => Promise<string>;
  /**
   * Produce a VaultClient-like object. Defaults to `new VaultClient(config)`.
   * Tests inject a stub here — only `listMyMemberships` and `entity.get` are
   * called by the runner, so stubs only need to implement those.
   */
  createVaultClient?: (config: VaultServiceConfig) => VaultClientSurface;
  /** Sync function. Defaults to `cli/sync.sync`. */
  sync?: (options: SyncOptions) => Promise<SyncResult>;
}

// ---------------------------------------------------------------------------
// argv parser — intentionally minimal (no commander/yargs dep)
// ---------------------------------------------------------------------------

interface ParsedArgs {
  companies: boolean;
  company?: string;
  onConflict: ConflictStrategy;
  hqRoot: string;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  let companies = false;
  let company: string | undefined;
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

  if (companies && company) {
    return { error: "Pass --companies OR --company <slug>, not both" };
  }
  if (!companies && !company) {
    return { error: "Pass --companies or --company <slug>" };
  }

  return { companies, company, onConflict, hqRoot };
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
      memberships = await client.listMyMemberships();
      if (memberships.length === 0) {
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
  const plan: Array<{ uid: string; slug: string }> = [];
  for (const m of memberships) {
    let slug = m.companyUid;
    try {
      const info = await client.entity.get(m.companyUid);
      slug = info.slug || m.companyUid;
    } catch {
      // Best-effort — keep UID as the display identifier.
    }
    plan.push({ uid: m.companyUid, slug });
  }
  emit({ type: "fanout-plan", companies: plan });

  // ---- fanout -----------------------------------------------------------
  const syncFn = deps.sync ?? defaultSync;
  let totalFiles = 0;
  let totalBytes = 0;
  const errors: Array<{ company: string; message: string }> = [];

  for (const target of plan) {
    const companyLabel = target.slug;
    try {
      const result = await syncFn({
        company: target.uid,
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

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  // Handle the case where the shebang'd dist file is invoked via its
  // realpath — e.g. a pnpm `bin` symlink resolves to a node_modules path.
  (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])));

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
