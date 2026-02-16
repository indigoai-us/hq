/**
 * Migration Agent Utilities
 *
 * TypeScript implementations of the testable logic from the migration-agent
 * skill instructions (analyze.md, execute.md, restore.md).
 *
 * These utilities extract the core algorithms -- version detection, diff
 * categorization, CLAUDE.md merge, backup manifest generation, and plan
 * formatting -- into pure functions that can be tested with vitest.
 */

export * from "./version.js";
export * from "./diff.js";
export * from "./merge.js";
export * from "./backup.js";
export * from "./plan.js";
