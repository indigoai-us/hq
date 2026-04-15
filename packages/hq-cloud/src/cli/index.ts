/**
 * hq-cloud CLI entry points.
 *
 * Registers `hq share`, `hq sync`, and membership commands.
 * These are consumed by @indigoai-us/hq-cli or invoked directly.
 */

export { share } from "./share.js";
export type { ShareOptions, ShareResult } from "./share.js";

export { sync } from "./sync.js";
export type { SyncOptions, SyncResult } from "./sync.js";

export { resolveConflict, showDiff } from "./conflict.js";
export type { ConflictStrategy, ConflictInfo, ConflictResolution } from "./conflict.js";

// Membership commands (VLT-7)
export { invite, listInvites, revokeInvite } from "./invite.js";
export type { InviteOptions, InviteResult, InviteListOptions, InviteRevokeOptions } from "./invite.js";

export { accept, parseToken } from "./accept.js";
export type { AcceptOptions, AcceptResult } from "./accept.js";

export { promote } from "./promote.js";
export type { PromoteOptions, PromoteResult } from "./promote.js";
