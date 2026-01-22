/**
 * HQ Module Manifest Types
 * TypeScript definitions for parsing modules.yaml
 */

/**
 * Sync strategy for module content
 * - link: Symlink for real-time sync (requires local clone)
 * - merge: Git merge that preserves local changes
 * - copy: One-time copy with no ongoing sync
 */
export type SyncStrategy = 'link' | 'merge' | 'copy';

/**
 * Access level for RBAC (future implementation)
 * - public: Anyone can use this module
 * - team: Only team members can access
 * - role:X: Specific role required (e.g., "role:admin", "role:engineer")
 */
export type AccessLevel = 'public' | 'team' | `role:${string}`;

/**
 * Path mappings from source repo to local HQ
 * Keys are paths in the source repository
 * Values are destination paths in the local HQ instance
 */
export type PathMappings = Record<string, string>;

/**
 * Module definition
 * Declares a single external module to sync
 */
export interface Module {
  /** Unique identifier for this module */
  name: string;

  /** Git repository URL (HTTPS or SSH) */
  repo: string;

  /** Branch to sync from */
  branch: string;

  /** How to sync the module content */
  strategy: SyncStrategy;

  /** Access control level for RBAC */
  access: AccessLevel;

  /** Source path -> destination path mappings */
  paths: PathMappings;
}

/**
 * Module manifest root structure
 * Represents the full modules.yaml file
 */
export interface ModuleManifest {
  /** Schema version */
  version: string;

  /** List of modules to sync */
  modules: Module[];
}

/**
 * Type guard to check if a value is a valid SyncStrategy
 */
export function isSyncStrategy(value: unknown): value is SyncStrategy {
  return value === 'link' || value === 'merge' || value === 'copy';
}

/**
 * Type guard to check if a value is a valid AccessLevel
 */
export function isAccessLevel(value: unknown): value is AccessLevel {
  if (typeof value !== 'string') return false;
  return value === 'public' || value === 'team' || value.startsWith('role:');
}

/**
 * Type guard to check if an object is a valid Module
 */
export function isModule(value: unknown): value is Module {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.name === 'string' &&
    typeof obj.repo === 'string' &&
    typeof obj.branch === 'string' &&
    isSyncStrategy(obj.strategy) &&
    isAccessLevel(obj.access) &&
    typeof obj.paths === 'object' &&
    obj.paths !== null
  );
}

/**
 * Type guard to check if an object is a valid ModuleManifest
 */
export function isModuleManifest(value: unknown): value is ModuleManifest {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.version === 'string' &&
    Array.isArray(obj.modules) &&
    obj.modules.every(isModule)
  );
}
