import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { ModulesManifest, ModuleDefinition, ModuleLock, SyncState } from '../types.js';

const MANIFEST_FILE = 'modules.yaml';
const LOCK_FILE = 'modules.lock';
const STATE_FILE = '.hq-sync-state.json';

export function findHqRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, '.claude')) || fs.existsSync(path.join(dir, 'workers'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Resolve the manifest path for a given HQ root.
 *
 * The canonical layout is nested: `{hqRoot}/modules/modules.yaml` (catalog)
 * alongside `{hqRoot}/modules/<module-name>/` (clone targets).
 *
 * Legacy fixtures and very old HQ instances may have the flat layout
 * (`{hqRoot}/modules.yaml`); we honor that if — and only if — the flat file
 * already exists. On fresh HQs we default to the nested form so we never
 * silently create a second shadow manifest at the root.
 *
 * Exported for tests.
 */
export function getManifestPath(hqRoot: string): string {
  const nested = path.join(hqRoot, 'modules', MANIFEST_FILE);
  const flat = path.join(hqRoot, MANIFEST_FILE);
  if (fs.existsSync(nested)) return nested;
  if (fs.existsSync(flat)) return flat;
  return nested; // default for fresh HQs — see getModulesDir()
}

export function getLockPath(hqRoot: string): string {
  return path.join(hqRoot, LOCK_FILE);
}

export function getStatePath(hqRoot: string): string {
  return path.join(hqRoot, STATE_FILE);
}

export function getModulesDir(hqRoot: string): string {
  return path.join(hqRoot, 'modules');
}

export function readManifest(hqRoot: string): ModulesManifest | null {
  const manifestPath = getManifestPath(hqRoot);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const content = fs.readFileSync(manifestPath, 'utf-8');
  return yaml.load(content) as ModulesManifest;
}

export function writeManifest(hqRoot: string, manifest: ModulesManifest): void {
  const manifestPath = getManifestPath(hqRoot);
  // Ensure the parent directory exists — on a fresh HQ the nested
  // `modules/` dir may not yet be present, and fs.writeFileSync does not
  // auto-mkdir. Safe no-op when the dir already exists.
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const content = yaml.dump(manifest, { lineWidth: -1 });
  fs.writeFileSync(manifestPath, content);
}

export function readLock(hqRoot: string): ModuleLock | null {
  const lockPath = getLockPath(hqRoot);
  if (!fs.existsSync(lockPath)) {
    return null;
  }
  const content = fs.readFileSync(lockPath, 'utf-8');
  return yaml.load(content) as ModuleLock;
}

export function writeLock(hqRoot: string, lock: ModuleLock): void {
  const lockPath = getLockPath(hqRoot);
  const content = yaml.dump(lock, { lineWidth: -1 });
  fs.writeFileSync(lockPath, content);
}

export function readState(hqRoot: string): SyncState | null {
  const statePath = getStatePath(hqRoot);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  const content = fs.readFileSync(statePath, 'utf-8');
  return JSON.parse(content) as SyncState;
}

export function writeState(hqRoot: string, state: SyncState): void {
  const statePath = getStatePath(hqRoot);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function addModule(hqRoot: string, module: ModuleDefinition): void {
  let manifest = readManifest(hqRoot);
  if (!manifest) {
    manifest = { version: '1', modules: [] };
  }

  // Check for duplicates
  if (manifest.modules.some(m => m.name === module.name)) {
    throw new Error(`Module "${module.name}" already exists`);
  }

  manifest.modules.push(module);
  writeManifest(hqRoot, manifest);
}

export function parseRepoName(repoUrl: string): string {
  // Extract repo name from URL
  // https://github.com/user/repo.git -> repo
  // git@github.com:user/repo.git -> repo
  const match = repoUrl.match(/[\/:]([^\/]+?)(\.git)?$/);
  if (!match) {
    throw new Error(`Cannot parse repo name from: ${repoUrl}`);
  }
  return match[1];
}

export function isValidRepoUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('git@');
}
