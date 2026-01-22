import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
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

interface LockEntry {
  commit: string;
  lockedAt: string;
}

interface LockFile {
  version: string;
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
 * Get current commit hash of a repo
 */
function getRepoCommit(repoPath: string): string {
  return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
}

/**
 * Fetch and get latest commit hash for a module's branch
 */
function getLatestCommit(module: Module, syncedDir: string): string {
  const repoPath = path.join(syncedDir, module.name);

  if (fs.existsSync(repoPath)) {
    // Fetch latest and checkout branch
    console.log(`  Fetching latest from ${module.repo}...`);
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
  } else {
    // Clone fresh
    console.log(`  Cloning ${module.name}...`);
    execSync(`git clone --branch ${module.branch} ${module.repo} ${repoPath}`, {
      stdio: 'pipe',
    });
  }

  return getRepoCommit(repoPath);
}

export const modulesUpdateCommand = new Command('update')
  .description('Update lock file for a specific module to latest version')
  .argument('<name>', 'Name of the module to update')
  .option('--all', 'Update all modules to latest versions')
  .action((name: string, options: { all?: boolean }) => {
    // Find and load manifest
    const manifestPath = findManifestPath();
    if (!manifestPath) {
      console.error('Error: modules.yaml not found.');
      console.error('Run "hq modules add <repo-url>" to create one.');
      process.exit(1);
    }

    const manifest = loadManifest(manifestPath);
    const hqRoot = findHqRoot(manifestPath);

    // Determine which modules to update
    let modulesToUpdate: Module[];
    if (options.all) {
      modulesToUpdate = manifest.modules;
      console.log(`Updating all ${modulesToUpdate.length} modules to latest versions...`);
    } else {
      const module = manifest.modules.find((m) => m.name === name);
      if (!module) {
        console.error(`Error: Module "${name}" not found in manifest.`);
        console.error('Available modules:');
        for (const m of manifest.modules) {
          console.error(`  - ${m.name}`);
        }
        process.exit(1);
      }
      modulesToUpdate = [module];
      console.log(`Updating module: ${name}`);
    }

    // Load existing lock file or create new one
    let lockFile = loadLockFile(hqRoot);
    if (!lockFile) {
      lockFile = { version: '1', modules: {} };
    }

    // Ensure synced directory exists
    const syncedDir = path.join(hqRoot, 'modules', '.synced');
    if (!fs.existsSync(syncedDir)) {
      fs.mkdirSync(syncedDir, { recursive: true });
    }

    const now = new Date().toISOString();

    // Update each module
    for (const module of modulesToUpdate) {
      try {
        console.log(`\nUpdating ${module.name}...`);
        const oldCommit = lockFile.modules[module.name]?.commit;
        const newCommit = getLatestCommit(module, syncedDir);

        if (oldCommit === newCommit) {
          console.log(`  Already at latest: ${newCommit.substring(0, 8)}`);
        } else {
          lockFile.modules[module.name] = {
            commit: newCommit,
            lockedAt: now,
          };
          if (oldCommit) {
            console.log(`  Updated: ${oldCommit.substring(0, 8)} -> ${newCommit.substring(0, 8)}`);
          } else {
            console.log(`  Locked at: ${newCommit.substring(0, 8)}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  Error updating ${module.name}: ${errorMessage}`);
      }
    }

    // Save updated lock file
    saveLockFile(hqRoot, lockFile);
    console.log(`\nLock file updated: ${getLockFilePath(hqRoot)}`);
    console.log('\nRun "hq modules sync --locked" to sync to these versions.');
  });
