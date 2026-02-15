import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { ModulesManifest, ModuleDefinition, ModuleLock, SyncState } from '../types.js';

const MANIFEST_FILE = 'modules.yaml';
const LOCK_FILE = 'modules.lock';
const STATE_FILE = '.hq-sync-state.json';

export function findHqRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, '.claude')) || fs.existsSync(path.join(dir, 'workers'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // Reached filesystem root (works on Windows and Unix)
    dir = parent;
  }
  return process.cwd();
}

export function getManifestPath(hqRoot: string): string {
  return path.join(hqRoot, MANIFEST_FILE);
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
