/**
 * HQ Package type definitions (US-005)
 * Covers hq-package.yaml manifest and installed.json structures.
 */

// ─── hq-package.yaml manifest ────────────────────────────────────────────────

export interface HQPackage {
  name: string;
  type:
    | 'worker-pack'
    | 'command-set'
    | 'skill-bundle'
    | 'knowledge-base'
    | 'company-template';
  version: string;
  minHQVersion?: string;
  description: string;
  author?: string;
  repo?: string;
  requires?: {
    packages?: string[];
    services?: string[];
  };
  exposes?: {
    workers?: string[];   // paths relative to package root
    commands?: string[];
    skills?: string[];
    knowledge?: string[];
  };
  hooks?: {
    'on-install'?: string;  // path to shell script, relative to package root
    'on-update'?: string;
    'on-remove'?: string;
  };
}

// ─── packages/installed.json ─────────────────────────────────────────────────

export interface InstalledPackage {
  name: string;
  version: string;
  type: string;
  installedAt: string;      // ISO8601
  updatedAt?: string;
  company?: string;         // if company-scoped
  files: string[];          // relative paths to installed files (for removal)
  repo?: string;
  publisher?: string;
  hooks?: {
    onRemove?: string;      // path relative to HQ root, e.g. "packages/hooks/dev-team/on-remove.sh"
  };
}

export interface InstalledPackages {
  version: '1';
  packages: Record<string, InstalledPackage>;
}
