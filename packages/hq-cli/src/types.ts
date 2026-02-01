/**
 * HQ Module Manifest Types (US-001)
 */

export type SyncStrategy = 'link' | 'merge' | 'copy';
export type AccessLevel = 'public' | 'team' | `role:${string}`;

export interface PathMapping {
  src: string;   // Path within module repo
  dest: string;  // Path in HQ tree (relative to HQ root)
}

export interface ModuleDefinition {
  name: string;
  repo: string;              // Git URL (https or git@)
  branch?: string;           // Default: main
  strategy: SyncStrategy;    // link | merge | copy
  paths: PathMapping[];      // What to sync and where
  access?: AccessLevel;      // For future RBAC
}

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
