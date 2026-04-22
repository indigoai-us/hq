/**
 * HQ Module Manifest Types (US-001)
 *
 * `modules.yaml` hosts two kinds of entries, discriminated by `strategy`:
 *   - link | merge | copy  → git-repo-based module sync (existing flow)
 *   - package              → hq-pack content pack installed via `hq install`
 *                            (new in hq-core v12.0.0; see
 *                            knowledge/public/hq-core/package-yaml-spec.md)
 */

export type LegacyStrategy = 'link' | 'merge' | 'copy';
export type SyncStrategy = LegacyStrategy | 'package';
export type AccessLevel = 'public' | 'team' | `role:${string}`;

export interface PathMapping {
  src: string;   // Path within module repo
  dest: string;  // Path in HQ tree (relative to HQ root)
}

export interface LegacyModuleDefinition {
  name: string;
  repo: string;              // Git URL (https or git@)
  branch?: string;           // Default: main
  strategy: LegacyStrategy;
  paths: PathMapping[];      // What to sync and where
  access?: AccessLevel;
}

export interface PackModuleDefinition {
  name: string;              // e.g. 'hq-pack-gstack'
  strategy: 'package';
  source: string;            // '@scope/name@ver' | git URL#sha | local path
  version?: string;          // semver from the pack's package.yaml
  installed_at?: string;     // e.g. 'packages/hq-pack-gstack'
  installed_at_iso?: string; // ISO timestamp
  resolved_sha?: string;     // git transport only
  access?: AccessLevel;
}

export type ModuleDefinition = LegacyModuleDefinition | PackModuleDefinition;

export interface ModulesManifest {
  version: '1';
  modules: ModuleDefinition[];
}

export interface ModuleLock {
  version: '1';
  locked: Record<string, string>; // module name -> commit SHA
}

export interface SyncState {
  version: '1';
  files: Record<string, {
    hash: string;          // SHA256 of file content at sync time
    syncedAt: string;      // ISO timestamp
    fromModule: string;    // Module that provided this file
  }>;
}

export interface SyncResult {
  module: string;
  success: boolean;
  action: 'cloned' | 'fetched' | 'synced' | 'skipped';
  message?: string;
  filesChanged?: number;
}

// ---------------------------------------------------------------------------
// hq-pack content-pack manifest (packages/{name}/package.yaml).
//
// Distinct from packages/hq-cli/src/schemas/hq-package.schema.json, which
// covers the entitlement-gated registry flow (`hq packages install <slug>`).
// ---------------------------------------------------------------------------

export type PackContributeKey =
  | 'workers'
  | 'knowledge'
  | 'skills'
  | 'commands'
  | 'hooks'
  | 'policies'
  | 'scripts';

export interface PackManifest {
  name: string;                 // ^hq-pack-[a-z0-9][a-z0-9-]*$
  version: string;              // semver
  publisher: string;            // @scope
  access: 'public' | 'private';
  requires: { hqCore: string }; // semver range
  contributes: Partial<Record<PackContributeKey, string[]>>;
  description?: string;
  license?: string;
  repository?: string;
  keywords?: string[];
  conditional?: string;         // bash predicate; skip install if exits non-zero
}
