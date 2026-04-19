/**
 * @indigoai-us/godclaw — goClaw manager SDK (VLT-8)
 *
 * godClaw is the parent manager service that spawns task-scoped goClaw
 * child agents. This package provides the two primitives godClaw needs:
 *
 *   1. vendChildCredentials — get task-scoped STS credentials from the
 *      vault-service (strict subset of parent membership)
 *   2. spawnChild — spawn a child process with those credentials injected
 *      into its env vars, and no other AWS creds bleeding through
 *
 * The strict-subset security invariant is enforced server-side in the
 * vault-service (VLT-8 US-001 scope-override layer) — this package is a
 * thin client wrapper and does not duplicate that check.
 */

export { vendChildCredentials } from "./vend-child-credentials.js";
export type {
  GodclawTaskInput,
  GodclawChildCredentials,
} from "./vend-child-credentials.js";

export { spawnChild, buildChildEnv } from "./spawn-child.js";
export type { SpawnChildOptions } from "./spawn-child.js";
