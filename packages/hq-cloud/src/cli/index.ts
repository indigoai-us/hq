/**
 * hq-cloud CLI entry points (VLT-5 US-002).
 *
 * Registers `hq share` and `hq sync` commands.
 * These are consumed by @indigoai-us/hq-cli or invoked directly.
 */

export { share } from "./share.js";
export type { ShareOptions, ShareResult } from "./share.js";

export { sync } from "./sync.js";
export type { SyncOptions, SyncResult } from "./sync.js";

export { resolveConflict, showDiff } from "./conflict.js";
export type { ConflictStrategy, ConflictInfo, ConflictResolution } from "./conflict.js";
