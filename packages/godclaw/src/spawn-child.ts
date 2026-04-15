/**
 * godClaw — child process spawning with env-var-injected credentials (VLT-8 US-002).
 *
 * Why env vars only:
 *   - Credentials NEVER touch disk (no config file, no ~/.aws/credentials mutation)
 *   - Child process inherits only what we pass — parent's own AWS creds do not leak
 *   - AWS SDK's default credential chain picks up AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN
 *     from env automatically — the child just calls `new S3Client()` with no config
 *
 * Process isolation:
 *   - We build the child env from scratch using only explicit inheritance for PATH/HOME
 *   - Parent's AWS_* env vars are NEVER propagated — if the parent had long-lived creds
 *     in its env, those would override the vended STS creds via the SDK's precedence rules
 *
 * Task identification:
 *   - HQ_TASK_ID + HQ_COMPANY_UID land in the child env so it can self-identify in logs
 *   - These are NOT secrets; they exist for observability
 */

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { GodclawChildCredentials } from "./vend-child-credentials.js";

/** Env-var keys the AWS SDK picks up automatically. */
const AWS_ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SECURITY_TOKEN", // legacy alias the SDK still reads
  "AWS_PROFILE",
  "AWS_DEFAULT_PROFILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONFIG_FILE",
] as const;

/** Env keys safe to inherit from the parent (not credential-bearing). */
const SAFE_INHERIT_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "NODE_OPTIONS",
] as const;

export interface SpawnChildOptions {
  /** Command to execute (e.g. "node" or a binary path). */
  command: string;
  /** Arguments to pass to the command. */
  args: string[];
  /** Vended credentials from `vendChildCredentials`. */
  credentials: GodclawChildCredentials;
  /**
   * Working directory for the child. Defaults to the parent's cwd —
   * override this if the child needs to operate somewhere specific.
   */
  cwd?: string;
  /**
   * Extra env vars to set on the child (non-credential). Merged AFTER the
   * sanitized base env and AFTER credential vars, so credentials always win.
   * Useful for things like LOG_LEVEL, feature flags, etc.
   */
  extraEnv?: Record<string, string>;
  /**
   * Override which parent env keys to inherit. Defaults to a minimal safe
   * allowlist (PATH, HOME, LANG, LC_ALL, TZ, TMPDIR, NODE_OPTIONS). Pass
   * `[]` for a fully clean env.
   */
  inheritKeys?: readonly string[];
  /** Stdio passed through to Node's spawn. Defaults to "inherit". */
  stdio?: SpawnOptions["stdio"];
}

/**
 * Build the child env from scratch: inherit a minimal allowlist from the
 * parent, strip any AWS_* key that might have bled through, then layer the
 * vended STS credentials and task identifiers on top.
 */
export function buildChildEnv(
  credentials: GodclawChildCredentials,
  parentEnv: NodeJS.ProcessEnv = process.env,
  inheritKeys: readonly string[] = SAFE_INHERIT_KEYS,
  extraEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};

  // 1. Inherit safe keys from parent.
  for (const key of inheritKeys) {
    const value = parentEnv[key];
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }

  // 2. Defensive: strip any AWS_* key (nothing should survive step 1, but if
  //    a caller passes an inheritKeys array containing an AWS key, we still
  //    want vended creds to win).
  for (const key of AWS_ENV_KEYS) {
    delete childEnv[key];
  }

  // 3. Inject vended STS credentials.
  childEnv.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
  childEnv.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
  childEnv.AWS_SESSION_TOKEN = credentials.sessionToken;

  // 4. Inject task identifiers for child-side logging.
  childEnv.HQ_TASK_ID = credentials.taskId;
  childEnv.HQ_COMPANY_UID = credentials.companyUid;
  childEnv.HQ_SESSION_NAME = credentials.sessionName;

  // 5. Layer on caller-supplied extras LAST (but block credential overrides).
  for (const [key, value] of Object.entries(extraEnv)) {
    if ((AWS_ENV_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `spawnChild: extraEnv may not override AWS credential keys (got ${key})`,
      );
    }
    childEnv[key] = value;
  }

  return childEnv;
}

/**
 * Spawn a child process with task-scoped STS credentials injected via env vars.
 *
 * The child inherits only a minimal safe allowlist from the parent env —
 * the parent's own AWS credentials are NEVER propagated.
 */
export function spawnChild(options: SpawnChildOptions): ChildProcess {
  const childEnv = buildChildEnv(
    options.credentials,
    process.env,
    options.inheritKeys ?? SAFE_INHERIT_KEYS,
    options.extraEnv ?? {},
  );

  const spawnOpts: SpawnOptions = {
    env: childEnv,
    stdio: options.stdio ?? "inherit",
  };
  if (options.cwd !== undefined) {
    spawnOpts.cwd = options.cwd;
  }

  return spawn(options.command, options.args, spawnOpts);
}
