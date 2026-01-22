import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as readline from 'node:readline';
import { execSync, spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';

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
 * Conflict resolution choice
 */
type ConflictResolution = 'keep' | 'take' | 'skip';

/**
 * Recorded conflict resolution to avoid re-prompting
 */
interface ConflictResolutionRecord {
  /** Resolution choice made by user */
  resolution: ConflictResolution;
  /** Hash of local file when resolution was made */
  localHash: string;
  /** Hash of source file when resolution was made */
  sourceHash: string;
  /** Timestamp of resolution */
  resolvedAt: string;
}

/**
 * Root sync state structure
 */
interface SyncState {
  /** Schema version */
  version: string;
  /** Module states keyed by module name */
  modules: Record<string, ModuleSyncState>;
  /** Recorded conflict resolutions keyed by module:filePath */
  resolutions?: Record<string, ConflictResolutionRecord>;
}

/**
 * Lock file entry for a single module
 */
interface LockEntry {
  /** Git commit SHA */
  commit: string;
  /** Timestamp when locked */
  lockedAt: string;
}

/**
 * Lock file structure (modules.lock)
 */
interface LockFile {
  /** Lock file version */
  version: string;
  /** Module locks keyed by module name */
  modules: Record<string, LockEntry>;
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
 * Get path to modules.lock
 */
function getLockFilePath(hqRoot: string): string {
  return path.join(hqRoot, 'modules', 'modules.lock');
}

/**
 * Load lock file from disk
 */
function loadLockFile(hqRoot: string): LockFile | null {
  const lockPath = getLockFilePath(hqRoot);
  if (fs.existsSync(lockPath)) {
    const content = fs.readFileSync(lockPath, 'utf-8');
    return parse(content) as LockFile;
  }
  return null;
}

/**
 * Save lock file to disk as human-readable YAML
 */
function saveLockFile(hqRoot: string, lockFile: LockFile): void {
  const lockPath = getLockFilePath(hqRoot);
  const header = `# HQ Modules Lock File
# This file tracks pinned module versions for reproducible installs.
# Do not edit manually - use 'hq modules update <name>' to update.

`;
  fs.writeFileSync(lockPath, header + stringify(lockFile, { lineWidth: 0 }));
}

/**
 * Compute SHA-256 hash of file content
 */
function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Get resolution key for a conflict
 */
function getResolutionKey(moduleName: string, filePath: string): string {
  return `${moduleName}:${filePath}`;
}

/**
 * Show diff between local and source file
 */
function showDiff(localFile: string, sourceFile: string, destPath: string): void {
  console.log(`\n--- Diff for ${destPath} ---`);
  console.log('(< local file, > incoming from module)\n');

  // Try to use diff command if available
  const result = spawnSync('diff', ['-u', localFile, sourceFile], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== null && result.stdout) {
    // diff exits with 1 when files differ, which is expected
    const lines = result.stdout.split('\n');
    // Show limited diff output (first 50 lines)
    const maxLines = 50;
    const truncated = lines.length > maxLines;
    console.log(lines.slice(0, maxLines).join('\n'));
    if (truncated) {
      console.log(`\n... (${lines.length - maxLines} more lines truncated)`);
    }
  } else {
    // Fallback: show file sizes
    const localStat = fs.statSync(localFile);
    const sourceStat = fs.statSync(sourceFile);
    console.log(`  Local file: ${localStat.size} bytes`);
    console.log(`  Source file: ${sourceStat.size} bytes`);
  }
  console.log('');
}

/**
 * Prompt user for conflict resolution
 */
async function promptConflictResolution(
  destPath: string,
  localFile: string,
  sourceFile: string
): Promise<ConflictResolution> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const askQuestion = (): void => {
      console.log(`\nConflict: ${destPath}`);
      console.log('  Local file has been modified since last sync.');
      console.log('  Options:');
      console.log('    [k]eep   - Keep your local version, skip this file');
      console.log('    [t]ake   - Overwrite with incoming version from module');
      console.log('    [d]iff   - Show diff between versions');
      console.log('    [m]anual - Open in editor for manual merge');

      rl.question('  Choice [k/t/d/m]: ', (answer) => {
        const choice = answer.toLowerCase().trim();

        switch (choice) {
          case 'k':
          case 'keep':
            rl.close();
            resolve('keep');
            break;
          case 't':
          case 'take':
            rl.close();
            resolve('take');
            break;
          case 'd':
          case 'diff':
            showDiff(localFile, sourceFile, destPath);
            askQuestion(); // Ask again after showing diff
            break;
          case 'm':
          case 'manual':
            openInEditor(localFile, sourceFile, destPath);
            rl.close();
            // After manual edit, treat as 'keep' since user handled it
            resolve('skip');
            break;
          default:
            console.log('  Invalid choice. Please enter k, t, d, or m.');
            askQuestion();
        }
      });
    };

    askQuestion();
  });
}

/**
 * Open files in editor for manual merge
 */
function openInEditor(localFile: string, sourceFile: string, destPath: string): void {
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

  console.log(`\nOpening files in ${editor} for manual merge...`);
  console.log(`  Local: ${localFile}`);
  console.log(`  Source: ${sourceFile}`);
  console.log('\nMerge the changes manually, save the local file, then close the editor.');

  // Open both files - different editors handle multiple files differently
  try {
    // For VS Code and similar, open both files
    if (editor.includes('code')) {
      spawnSync(editor, ['--diff', sourceFile, localFile, '--wait'], {
        stdio: 'inherit',
      });
    } else {
      // For vim/emacs/nano, open local file with source as reference
      console.log(`Reference source file: ${sourceFile}`);
      spawnSync(editor, [localFile], {
        stdio: 'inherit',
      });
    }
    console.log('Manual merge complete.');
  } catch (error) {
    console.log(`Warning: Could not open editor (${editor}). Please merge manually.`);
  }
}

/**
 * Check if a previous resolution applies to current conflict
 */
function checkPreviousResolution(
  syncState: SyncState,
  moduleName: string,
  destPath: string,
  localHash: string,
  sourceHash: string
): ConflictResolution | null {
  const key = getResolutionKey(moduleName, destPath);
  const record = syncState.resolutions?.[key];

  if (!record) {
    return null;
  }

  // Resolution only applies if the file hashes match what was recorded
  // This means user chose to 'keep' their version and neither file has changed
  if (record.localHash === localHash && record.sourceHash === sourceHash) {
    return record.resolution;
  }

  // If files have changed, resolution no longer applies
  return null;
}

/**
 * Record a conflict resolution
 */
function recordResolution(
  syncState: SyncState,
  moduleName: string,
  destPath: string,
  resolution: ConflictResolution,
  localHash: string,
  sourceHash: string
): void {
  if (!syncState.resolutions) {
    syncState.resolutions = {};
  }

  const key = getResolutionKey(moduleName, destPath);
  syncState.resolutions[key] = {
    resolution,
    localHash,
    sourceHash,
    resolvedAt: new Date().toISOString(),
  };
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
 * @param lockedCommit - If provided, checkout this specific commit instead of branch HEAD
 */
function cloneOrFetch(
  module: Module,
  syncedDir: string,
  lockedCommit?: string
): { cloned: boolean; repoPath: string } {
  const repoPath = path.join(syncedDir, module.name);

  if (fs.existsSync(repoPath)) {
    // Fetch latest changes
    console.log(`  Fetching ${module.name}...`);
    execSync(`git fetch origin ${module.branch}`, {
      cwd: repoPath,
      stdio: 'pipe',
    });

    if (lockedCommit) {
      // Checkout specific locked commit
      console.log(`  Checking out locked commit: ${lockedCommit.substring(0, 8)}...`);
      execSync(`git checkout ${lockedCommit}`, {
        cwd: repoPath,
        stdio: 'pipe',
      });
    } else {
      // Checkout branch and pull latest
      execSync(`git checkout ${module.branch}`, {
        cwd: repoPath,
        stdio: 'pipe',
      });
      execSync(`git pull origin ${module.branch}`, {
        cwd: repoPath,
        stdio: 'pipe',
      });
    }
    return { cloned: false, repoPath };
  } else {
    // Clone fresh
    console.log(`  Cloning ${module.name}...`);
    execSync(`git clone --branch ${module.branch} ${module.repo} ${repoPath}`, {
      stdio: 'pipe',
    });

    if (lockedCommit) {
      // Checkout specific locked commit after clone
      console.log(`  Checking out locked commit: ${lockedCommit.substring(0, 8)}...`);
      execSync(`git checkout ${lockedCommit}`, {
        cwd: repoPath,
        stdio: 'pipe',
      });
    }
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
 * Info about a detected conflict for later resolution
 */
interface ConflictInfo {
  srcFile: string;
  destFile: string;
  destRelative: string;
  srcRelative: string;
  srcHash: string;
  destHash: string;
}

/**
 * Apply 'merge' strategy - copy files, tracking state for conflict detection
 * Only overwrites files that haven't been modified locally since last sync
 */
async function applyMergeStrategy(
  module: Module,
  repoPath: string,
  hqRoot: string,
  syncState: SyncState,
  interactive: boolean
): Promise<{ copied: number; skipped: number; kept: number; conflicts: string[] }> {
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
  let kept = 0;
  const conflicts: string[] = [];
  const pendingConflicts: ConflictInfo[] = [];

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

        const result = detectFileSync(srcFile, destFile, destRelative, srcRelative, moduleState);
        if (result.action === 'copy') {
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          fs.copyFileSync(srcFile, destFile);
          moduleState.files[destRelative] = {
            hash: result.srcHash!,
            syncedAt: now,
            srcPath: srcRelative,
          };
          copied++;
          console.log(`    Copied: ${srcRelative} -> ${destRelative}`);
        } else if (result.action === 'skip') {
          moduleState.files[destRelative] = {
            hash: result.srcHash!,
            syncedAt: now,
            srcPath: srcRelative,
          };
          skipped++;
        } else if (result.action === 'conflict') {
          pendingConflicts.push({
            srcFile,
            destFile,
            destRelative,
            srcRelative,
            srcHash: result.srcHash!,
            destHash: result.destHash!,
          });
        }
      }
    } else {
      // Handle single file
      const destFile = path.join(hqRoot, destPath);
      const result = detectFileSync(source, destFile, destPath, srcPath, moduleState);
      if (result.action === 'copy') {
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.copyFileSync(source, destFile);
        moduleState.files[destPath] = {
          hash: result.srcHash!,
          syncedAt: now,
          srcPath: srcPath,
        };
        copied++;
        console.log(`    Copied: ${srcPath} -> ${destPath}`);
      } else if (result.action === 'skip') {
        moduleState.files[destPath] = {
          hash: result.srcHash!,
          syncedAt: now,
          srcPath: srcPath,
        };
        skipped++;
      } else if (result.action === 'conflict') {
        pendingConflicts.push({
          srcFile: source,
          destFile,
          destRelative: destPath,
          srcRelative: srcPath,
          srcHash: result.srcHash!,
          destHash: result.destHash!,
        });
      }
    }
  }

  // Handle conflicts
  if (pendingConflicts.length > 0) {
    console.log(`\n  Found ${pendingConflicts.length} conflict(s):`);

    for (const conflict of pendingConflicts) {
      // Check for previous resolution
      const previousResolution = checkPreviousResolution(
        syncState,
        module.name,
        conflict.destRelative,
        conflict.destHash,
        conflict.srcHash
      );

      let resolution: ConflictResolution;

      if (previousResolution) {
        console.log(`    ${conflict.destRelative}: using previous resolution (${previousResolution})`);
        resolution = previousResolution;
      } else if (interactive) {
        // Prompt user for resolution
        resolution = await promptConflictResolution(
          conflict.destRelative,
          conflict.destFile,
          conflict.srcFile
        );
        // Record the resolution
        recordResolution(
          syncState,
          module.name,
          conflict.destRelative,
          resolution,
          conflict.destHash,
          conflict.srcHash
        );
      } else {
        // Non-interactive: skip (keep local)
        console.log(`    Conflict: ${conflict.destRelative} has local changes, skipping`);
        resolution = 'keep';
      }

      // Apply resolution
      if (resolution === 'take') {
        fs.copyFileSync(conflict.srcFile, conflict.destFile);
        moduleState.files[conflict.destRelative] = {
          hash: conflict.srcHash,
          syncedAt: now,
          srcPath: conflict.srcRelative,
        };
        copied++;
        console.log(`    Overwrote: ${conflict.destRelative}`);
      } else if (resolution === 'keep' || resolution === 'skip') {
        // Keep local version - update state to track current local hash
        // so we don't prompt again until something changes
        kept++;
        if (resolution === 'keep') {
          console.log(`    Kept local: ${conflict.destRelative}`);
        }
      } else {
        conflicts.push(conflict.destRelative);
      }
    }
  }

  // Update module state
  moduleState.commit = commit;
  moduleState.syncedAt = now;

  return { copied, skipped, kept, conflicts };
}

/**
 * Result of detecting file sync action
 */
interface FileSyncDetection {
  action: 'copy' | 'skip' | 'conflict';
  srcHash?: string;
  destHash?: string;
}

/**
 * Detect what action is needed for syncing a single file
 * Does not modify files - just determines the action
 */
function detectFileSync(
  srcFile: string,
  destFile: string,
  destRelative: string,
  _srcRelative: string,
  moduleState: ModuleSyncState
): FileSyncDetection {
  const srcHash = hashFile(srcFile);
  const previousState = moduleState.files[destRelative];

  if (!fs.existsSync(destFile)) {
    // Destination doesn't exist - copy it
    return { action: 'copy', srcHash };
  }

  const destHash = hashFile(destFile);

  if (destHash === srcHash) {
    // Files are identical - skip
    return { action: 'skip', srcHash };
  }

  if (!previousState) {
    // No previous state - this is a conflict (local file exists but wasn't tracked)
    return { action: 'conflict', srcHash, destHash };
  }

  if (destHash === previousState.hash) {
    // Local file unchanged since last sync - safe to overwrite
    return { action: 'copy', srcHash };
  }

  // Local file has been modified since last sync - conflict
  return { action: 'conflict', srcHash, destHash };
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
 * Extended sync result that includes commit hash for lock file
 */
interface SyncResultWithCommit extends SyncResult {
  commit?: string;
}

/**
 * Sync a single module
 * @param lockedCommit - If provided, checkout this specific commit instead of branch HEAD
 * @param interactive - If true, prompt user for conflict resolution
 */
async function syncModule(
  module: Module,
  syncedDir: string,
  hqRoot: string,
  syncState: SyncState,
  lockedCommit?: string,
  interactive: boolean = true
): Promise<SyncResultWithCommit> {
  try {
    console.log(`\nSyncing module: ${module.name}`);

    // Clone or fetch repository
    const { cloned, repoPath } = cloneOrFetch(module, syncedDir, lockedCommit);
    console.log(`  ${cloned ? 'Cloned' : 'Updated'} from ${module.repo}`);

    // Get current commit hash for lock file
    const commit = getRepoCommit(repoPath);

    // Check if there are any path mappings
    if (Object.keys(module.paths).length === 0) {
      return {
        module: module.name,
        success: true,
        message: `${cloned ? 'Cloned' : 'Updated'} (no path mappings)`,
        commit,
      };
    }

    // Apply sync strategy
    console.log(`  Applying ${module.strategy} strategy...`);
    let mergeResult: { copied: number; skipped: number; kept: number; conflicts: string[] } | null = null;

    switch (module.strategy) {
      case 'link':
        applyLinkStrategy(module, repoPath, hqRoot);
        break;
      case 'merge':
        mergeResult = await applyMergeStrategy(module, repoPath, hqRoot, syncState, interactive);
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
      if (mergeResult.kept > 0) parts.push(`${mergeResult.kept} kept local`);
      if (mergeResult.conflicts.length > 0) parts.push(`${mergeResult.conflicts.length} unresolved`);
      message = parts.join(', ');
    } else {
      const strategyPastTense = module.strategy === 'copy' ? 'copied' : 'linked';
      message = `${cloned ? 'Cloned' : 'Updated'} and ${strategyPastTense}`;
    }

    return {
      module: module.name,
      success: true,
      message,
      commit,
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
  .option('--locked', 'Use exact versions from modules.lock for reproducible installs')
  .option('--no-interactive', 'Skip interactive conflict prompts (keep local files on conflict)')
  .action(async (options: { module?: string; dryRun?: boolean; locked?: boolean; interactive?: boolean }) => {
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

    // Load lock file if --locked flag is provided
    let lockFile: LockFile | null = null;
    if (options.locked) {
      lockFile = loadLockFile(hqRoot);
      if (!lockFile) {
        console.error('Error: --locked flag requires modules.lock file.');
        console.error('Run "hq modules sync" first to generate the lock file.');
        process.exit(1);
      }
      console.log('Using locked versions from modules.lock');
    }

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

    // Determine if interactive mode (default true, --no-interactive sets to false)
    const interactive = options.interactive !== false;

    // Sync each module
    const results: SyncResultWithCommit[] = [];
    const now = new Date().toISOString();
    for (const module of modulesToSync) {
      // Get locked commit if using --locked flag
      const lockedCommit = lockFile?.modules[module.name]?.commit;
      if (options.locked && !lockedCommit) {
        console.warn(`  Warning: Module "${module.name}" not found in lock file, syncing latest`);
      }
      const result = await syncModule(module, syncedDir, hqRoot, syncState, lockedCommit, interactive);
      results.push(result);
    }

    // Save sync state after all modules are synced
    saveSyncState(hqRoot, syncState);

    // Generate/update modules.lock after successful sync (not in locked mode)
    if (!options.locked) {
      const newLockFile: LockFile = {
        version: '1',
        modules: {},
      };

      // Add successful syncs to lock file
      for (const result of results) {
        if (result.success && result.commit) {
          newLockFile.modules[result.module] = {
            commit: result.commit,
            lockedAt: now,
          };
        }
      }

      // Preserve locks for modules not synced (when using --module flag)
      if (options.module) {
        const existingLockFile = loadLockFile(hqRoot);
        if (existingLockFile) {
          for (const [name, entry] of Object.entries(existingLockFile.modules)) {
            if (!newLockFile.modules[name]) {
              newLockFile.modules[name] = entry;
            }
          }
        }
      }

      // Only write lock file if there are entries
      if (Object.keys(newLockFile.modules).length > 0) {
        saveLockFile(hqRoot, newLockFile);
        console.log(`\nLock file updated: ${getLockFilePath(hqRoot)}`);
      }
    }

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
