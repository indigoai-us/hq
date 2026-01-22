import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { parse } from 'yaml';

interface Module {
  name: string;
  repo: string;
  branch: string;
  strategy: 'link' | 'merge' | 'copy';
  access: 'public' | 'team' | `role:${string}`;
  paths: Record<string, string>;
}

interface ModuleManifest {
  version: string;
  modules: Module[];
}

interface SyncResult {
  module: string;
  success: boolean;
  message: string;
}

/**
 * File sync state for conflict detection
 */
interface FileSyncState {
  /** Hash of file content when last synced */
  hash: string;
  /** Timestamp of last sync */
  syncedAt: string;
  /** Source path in module repo */
  srcPath: string;
}

/**
 * Sync state for a single module
 */
interface ModuleSyncState {
  /** Module name */
  name: string;
  /** Commit hash when last synced */
  commit: string;
  /** Timestamp of last sync */
  syncedAt: string;
  /** File states keyed by destination path */
  files: Record<string, FileSyncState>;
}

/**
 * Root sync state structure
 */
interface SyncState {
  /** Schema version */
  version: string;
  /** Module states keyed by module name */
  modules: Record<string, ModuleSyncState>;
}

/**
 * Find modules.yaml path (searches up from cwd)
 */
function findManifestPath(): string | null {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'modules', 'modules.yaml');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const directCandidate = path.join(dir, 'modules.yaml');
    if (fs.existsSync(directCandidate)) {
      return directCandidate;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Find HQ root directory (parent of modules/)
 */
function findHqRoot(manifestPath: string): string {
  const dir = path.dirname(manifestPath);
  // If manifest is in modules/, go up one level
  if (path.basename(dir) === 'modules') {
    return path.dirname(dir);
  }
  return dir;
}

/**
 * Load manifest from file
 */
function loadManifest(manifestPath: string): ModuleManifest {
  const content = fs.readFileSync(manifestPath, 'utf-8');
  return parse(content) as ModuleManifest;
}

/**
 * Ensure the synced modules directory exists and is gitignored
 */
function ensureSyncedModulesDir(hqRoot: string): string {
  const syncedDir = path.join(hqRoot, 'modules', '.synced');

  // Create directory if it doesn't exist
  if (!fs.existsSync(syncedDir)) {
    fs.mkdirSync(syncedDir, { recursive: true });
  }

  // Ensure .synced is in .gitignore
  const gitignorePath = path.join(hqRoot, '.gitignore');
  const gitignoreEntry = 'modules/.synced/';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(gitignoreEntry)) {
      fs.appendFileSync(gitignorePath, `\n# Synced modules (cloned repos)\n${gitignoreEntry}\n`);
    }
  } else {
    fs.writeFileSync(gitignorePath, `# Synced modules (cloned repos)\n${gitignoreEntry}\n`);
  }

  return syncedDir;
}

/**
 * Get path to .hq-sync-state.json
 */
function getSyncStatePath(hqRoot: string): string {
  return path.join(hqRoot, '.hq-sync-state.json');
}

/**
 * Load sync state from file
 */
function loadSyncState(hqRoot: string): SyncState {
  const statePath = getSyncStatePath(hqRoot);
  if (fs.existsSync(statePath)) {
    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as SyncState;
  }
  return { version: '1', modules: {} };
}

/**
 * Save sync state to file
 */
function saveSyncState(hqRoot: string, state: SyncState): void {
  const statePath = getSyncStatePath(hqRoot);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

/**
 * Compute SHA-256 hash of file content
 */
function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get current commit hash of a repo
 */
function getRepoCommit(repoPath: string): string {
  return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dir: string, base: string = ''): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = base ? path.join(base, entry.name) : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

/**
 * Clone or fetch a module repository
 */
function cloneOrFetch(module: Module, syncedDir: string): { cloned: boolean; repoPath: string } {
  const repoPath = path.join(syncedDir, module.name);

  if (fs.existsSync(repoPath)) {
    // Fetch latest changes
    console.log(`  Fetching ${module.name}...`);
    execSync(`git fetch origin ${module.branch}`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
    execSync(`git checkout ${module.branch}`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
    execSync(`git pull origin ${module.branch}`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
    return { cloned: false, repoPath };
  } else {
    // Clone fresh
    console.log(`  Cloning ${module.name}...`);
    execSync(`git clone --branch ${module.branch} ${module.repo} ${repoPath}`, {
      stdio: 'pipe',
    });
    return { cloned: true, repoPath };
  }
}

/**
 * Apply 'link' strategy - create symlinks from source to destination
 * Uses relative symlinks for portability across machines
 */
function applyLinkStrategy(module: Module, repoPath: string, hqRoot: string): void {
  for (const [srcPath, destPath] of Object.entries(module.paths)) {
    const source = path.join(repoPath, srcPath);
    const dest = path.join(hqRoot, destPath);

    if (!fs.existsSync(source)) {
      console.log(`    Warning: Source path does not exist: ${srcPath}`);
      continue;
    }

    // Check if destination already exists
    let destExists = false;
    let isSymlink = false;
    try {
      const stat = fs.lstatSync(dest);
      destExists = true;
      isSymlink = stat.isSymbolicLink();
    } catch {
      // dest does not exist
    }

    if (destExists) {
      if (isSymlink) {
        // Remove existing symlink and recreate
        fs.unlinkSync(dest);
      } else {
        // Real file/directory exists - warn and skip
        console.log(`    Warning: Skipping ${destPath} - real file exists (not a symlink). Remove manually to sync.`);
        continue;
      }
    }

    // Ensure parent directory exists
    const destParent = path.dirname(dest);
    if (!fs.existsSync(destParent)) {
      fs.mkdirSync(destParent, { recursive: true });
    }

    // Create relative symlink for portability
    const relativeSource = path.relative(destParent, source);
    fs.symlinkSync(relativeSource, dest);
    console.log(`    Linked: ${srcPath} -> ${destPath}`);
  }
}

/**
 * Apply 'merge' strategy - copy files, tracking state for conflict detection
 * Only overwrites files that haven't been modified locally since last sync
 */
function applyMergeStrategy(
  module: Module,
  repoPath: string,
  hqRoot: string,
  syncState: SyncState
): { copied: number; skipped: number; conflicts: string[] } {
  const now = new Date().toISOString();
  const commit = getRepoCommit(repoPath);

  // Initialize module state if not exists
  if (!syncState.modules[module.name]) {
    syncState.modules[module.name] = {
      name: module.name,
      commit: '',
      syncedAt: '',
      files: {},
    };
  }
  const moduleState = syncState.modules[module.name];

  let copied = 0;
  let skipped = 0;
  const conflicts: string[] = [];

  for (const [srcPath, destPath] of Object.entries(module.paths)) {
    const source = path.join(repoPath, srcPath);

    if (!fs.existsSync(source)) {
      console.log(`    Warning: Source path does not exist: ${srcPath}`);
      continue;
    }

    const sourceStat = fs.statSync(source);

    if (sourceStat.isDirectory()) {
      // Handle directory: get all files and process each
      const files = getAllFiles(source);
      for (const relFile of files) {
        const srcFile = path.join(source, relFile);
        const destFile = path.join(hqRoot, destPath, relFile);
        const destRelative = path.join(destPath, relFile);
        const srcRelative = path.join(srcPath, relFile);

        const result = syncSingleFile(srcFile, destFile, destRelative, srcRelative, moduleState, now);
        if (result === 'copied') {
          copied++;
          console.log(`    Copied: ${srcRelative} -> ${destRelative}`);
        } else if (result === 'skipped') {
          skipped++;
        } else if (result === 'conflict') {
          conflicts.push(destRelative);
          console.log(`    Conflict: ${destRelative} has local changes, skipping`);
        }
      }
    } else {
      // Handle single file
      const destFile = path.join(hqRoot, destPath);
      const result = syncSingleFile(source, destFile, destPath, srcPath, moduleState, now);
      if (result === 'copied') {
        copied++;
        console.log(`    Copied: ${srcPath} -> ${destPath}`);
      } else if (result === 'skipped') {
        skipped++;
      } else if (result === 'conflict') {
        conflicts.push(destPath);
        console.log(`    Conflict: ${destPath} has local changes, skipping`);
      }
    }
  }

  // Update module state
  moduleState.commit = commit;
  moduleState.syncedAt = now;

  return { copied, skipped, conflicts };
}

/**
 * Sync a single file with conflict detection
 * Returns: 'copied' | 'skipped' | 'conflict'
 */
function syncSingleFile(
  srcFile: string,
  destFile: string,
  destRelative: string,
  srcRelative: string,
  moduleState: ModuleSyncState,
  now: string
): 'copied' | 'skipped' | 'conflict' {
  const srcHash = hashFile(srcFile);
  const previousState = moduleState.files[destRelative];

  // Ensure parent directory exists
  const destParent = path.dirname(destFile);
  if (!fs.existsSync(destParent)) {
    fs.mkdirSync(destParent, { recursive: true });
  }

  if (!fs.existsSync(destFile)) {
    // Destination doesn't exist - copy it
    fs.copyFileSync(srcFile, destFile);
    moduleState.files[destRelative] = {
      hash: srcHash,
      syncedAt: now,
      srcPath: srcRelative,
    };
    return 'copied';
  }

  const destHash = hashFile(destFile);

  if (destHash === srcHash) {
    // Files are identical - update state but don't copy
    moduleState.files[destRelative] = {
      hash: srcHash,
      syncedAt: now,
      srcPath: srcRelative,
    };
    return 'skipped';
  }

  if (!previousState) {
    // No previous state - this is a conflict (local file exists but wasn't tracked)
    // Don't overwrite user's file
    return 'conflict';
  }

  if (destHash === previousState.hash) {
    // Local file unchanged since last sync - safe to overwrite
    fs.copyFileSync(srcFile, destFile);
    moduleState.files[destRelative] = {
      hash: srcHash,
      syncedAt: now,
      srcPath: srcRelative,
    };
    return 'copied';
  }

  // Local file has been modified since last sync - conflict
  return 'conflict';
}

/**
 * Apply 'copy' strategy - one-time copy, overwriting destination
 */
function applyCopyStrategy(module: Module, repoPath: string, hqRoot: string): void {
  for (const [srcPath, destPath] of Object.entries(module.paths)) {
    const source = path.join(repoPath, srcPath);
    const dest = path.join(hqRoot, destPath);

    if (!fs.existsSync(source)) {
      console.log(`    Warning: Source path does not exist: ${srcPath}`);
      continue;
    }

    // Remove existing destination
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true });
    }

    // Ensure parent directory exists
    const destParent = path.dirname(dest);
    if (!fs.existsSync(destParent)) {
      fs.mkdirSync(destParent, { recursive: true });
    }

    // Copy recursively
    execSync(`cp -R "${source}" "${dest}"`, {
      stdio: 'pipe',
    });
    console.log(`    Copied: ${srcPath} -> ${destPath}`);
  }
}

/**
 * Sync a single module
 */
function syncModule(module: Module, syncedDir: string, hqRoot: string, syncState: SyncState): SyncResult {
  try {
    console.log(`\nSyncing module: ${module.name}`);

    // Clone or fetch repository
    const { cloned, repoPath } = cloneOrFetch(module, syncedDir);
    console.log(`  ${cloned ? 'Cloned' : 'Updated'} from ${module.repo}`);

    // Check if there are any path mappings
    if (Object.keys(module.paths).length === 0) {
      return {
        module: module.name,
        success: true,
        message: `${cloned ? 'Cloned' : 'Updated'} (no path mappings)`,
      };
    }

    // Apply sync strategy
    console.log(`  Applying ${module.strategy} strategy...`);
    let mergeResult: { copied: number; skipped: number; conflicts: string[] } | null = null;

    switch (module.strategy) {
      case 'link':
        applyLinkStrategy(module, repoPath, hqRoot);
        break;
      case 'merge':
        mergeResult = applyMergeStrategy(module, repoPath, hqRoot, syncState);
        break;
      case 'copy':
        applyCopyStrategy(module, repoPath, hqRoot);
        break;
    }

    // Build result message
    let message: string;
    if (module.strategy === 'merge' && mergeResult) {
      const parts = [`${cloned ? 'Cloned' : 'Updated'}`];
      if (mergeResult.copied > 0) parts.push(`${mergeResult.copied} copied`);
      if (mergeResult.skipped > 0) parts.push(`${mergeResult.skipped} unchanged`);
      if (mergeResult.conflicts.length > 0) parts.push(`${mergeResult.conflicts.length} conflicts`);
      message = parts.join(', ');
    } else {
      const strategyPastTense = module.strategy === 'copy' ? 'copied' : 'linked';
      message = `${cloned ? 'Cloned' : 'Updated'} and ${strategyPastTense}`;
    }

    return {
      module: module.name,
      success: true,
      message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      module: module.name,
      success: false,
      message: errorMessage,
    };
  }
}

export const modulesSyncCommand = new Command('sync')
  .description('Sync all modules from modules.yaml')
  .option('--module <name>', 'Sync only a specific module')
  .option('--dry-run', 'Show what would be synced without making changes')
  .action((options: { module?: string; dryRun?: boolean }) => {
    // Find and load manifest
    const manifestPath = findManifestPath();
    if (!manifestPath) {
      console.error('Error: modules.yaml not found.');
      console.error('Run "hq modules add <repo-url>" to create one.');
      process.exit(1);
    }

    const manifest = loadManifest(manifestPath);
    const hqRoot = findHqRoot(manifestPath);

    console.log(`HQ root: ${hqRoot}`);
    console.log(`Manifest: ${manifestPath}`);
    console.log(`Modules to sync: ${manifest.modules.length}`);

    // Filter modules if --module flag is provided
    let modulesToSync = manifest.modules;
    if (options.module) {
      modulesToSync = manifest.modules.filter((m) => m.name === options.module);
      if (modulesToSync.length === 0) {
        console.error(`Error: Module "${options.module}" not found in manifest.`);
        process.exit(1);
      }
    }

    // Dry run mode
    if (options.dryRun) {
      console.log('\n--- DRY RUN ---\n');
      for (const module of modulesToSync) {
        console.log(`Would sync: ${module.name}`);
        console.log(`  repo: ${module.repo}`);
        console.log(`  branch: ${module.branch}`);
        console.log(`  strategy: ${module.strategy}`);
        for (const [src, dest] of Object.entries(module.paths)) {
          console.log(`  path: ${src} -> ${dest}`);
        }
      }
      return;
    }

    // Ensure synced modules directory exists and is gitignored
    const syncedDir = ensureSyncedModulesDir(hqRoot);
    console.log(`Synced repos: ${syncedDir}`);

    // Load sync state for merge strategy conflict detection
    const syncState = loadSyncState(hqRoot);

    // Sync each module
    const results: SyncResult[] = [];
    for (const module of modulesToSync) {
      const result = syncModule(module, syncedDir, hqRoot, syncState);
      results.push(result);
    }

    // Save sync state after all modules are synced
    saveSyncState(hqRoot, syncState);

    // Print summary
    console.log('\n--- Sync Summary ---\n');
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (succeeded.length > 0) {
      console.log('Succeeded:');
      for (const r of succeeded) {
        console.log(`  ✓ ${r.module}: ${r.message}`);
      }
    }

    if (failed.length > 0) {
      console.log('\nFailed:');
      for (const r of failed) {
        console.log(`  ✗ ${r.module}: ${r.message}`);
      }
      process.exit(1);
    }

    console.log(`\nSync complete: ${succeeded.length} succeeded, ${failed.length} failed`);
  });
