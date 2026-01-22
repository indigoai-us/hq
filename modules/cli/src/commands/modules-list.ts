import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

interface ModuleStatus {
  name: string;
  repo: string;
  branch: string;
  strategy: string;
  installed: boolean;
  commitHash?: string;
  behindUpstream?: number;
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
 * Get current commit hash for a repo
 */
function getCommitHash(repoPath: string): string | null {
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      cwd: repoPath,
      stdio: 'pipe',
    }).toString().trim();
    return hash;
  } catch {
    return null;
  }
}

/**
 * Get number of commits behind upstream (fetch first without merge)
 */
function getCommitsBehind(repoPath: string, branch: string): number | null {
  try {
    // Fetch without merge to get latest remote state
    execSync(`git fetch origin ${branch}`, {
      cwd: repoPath,
      stdio: 'pipe',
    });

    // Count commits behind
    const behind = execSync(`git rev-list --count HEAD..origin/${branch}`, {
      cwd: repoPath,
      stdio: 'pipe',
    }).toString().trim();

    return parseInt(behind, 10);
  } catch {
    return null;
  }
}

/**
 * Get status for a single module
 */
function getModuleStatus(module: Module, syncedDir: string, checkUpstream: boolean): ModuleStatus {
  const repoPath = path.join(syncedDir, module.name);
  const installed = fs.existsSync(repoPath) && fs.existsSync(path.join(repoPath, '.git'));

  const status: ModuleStatus = {
    name: module.name,
    repo: module.repo,
    branch: module.branch,
    strategy: module.strategy,
    installed,
  };

  if (installed) {
    status.commitHash = getCommitHash(repoPath) ?? undefined;

    if (checkUpstream) {
      const behind = getCommitsBehind(repoPath, module.branch);
      if (behind !== null) {
        status.behindUpstream = behind;
      }
    }
  }

  return status;
}

/**
 * Format module status for display
 */
function formatModuleStatus(status: ModuleStatus): string {
  const installed = status.installed ? 'yes' : 'no';
  const commit = status.commitHash ?? '-';

  let behindStr = '';
  if (status.behindUpstream !== undefined) {
    if (status.behindUpstream === 0) {
      behindStr = ' (up to date)';
    } else {
      behindStr = ` (${status.behindUpstream} behind)`;
    }
  }

  return [
    `  ${status.name}`,
    `    repo:      ${status.repo}`,
    `    branch:    ${status.branch}`,
    `    strategy:  ${status.strategy}`,
    `    installed: ${installed}`,
    `    commit:    ${commit}${behindStr}`,
  ].join('\n');
}

export const modulesListCommand = new Command('list')
  .description('List all modules from manifest with sync status')
  .option('--check-upstream', 'Fetch from upstream to check if behind (slower)')
  .action((options: { checkUpstream?: boolean }) => {
    // Find and load manifest
    const manifestPath = findManifestPath();
    if (!manifestPath) {
      console.error('Error: modules.yaml not found.');
      console.error('Run "hq modules add <repo-url>" to create one.');
      process.exit(1);
    }

    const manifest = loadManifest(manifestPath);
    const hqRoot = findHqRoot(manifestPath);
    const syncedDir = path.join(hqRoot, 'modules', '.synced');

    console.log(`Manifest: ${manifestPath}`);
    console.log(`Total modules: ${manifest.modules.length}\n`);

    if (manifest.modules.length === 0) {
      console.log('No modules configured.');
      console.log('Run "hq modules add <repo-url>" to add a module.');
      return;
    }

    // Get status for each module
    const statuses = manifest.modules.map((module) =>
      getModuleStatus(module, syncedDir, options.checkUpstream ?? false)
    );

    // Display each module
    console.log('Modules:');
    for (const status of statuses) {
      console.log(formatModuleStatus(status));
      console.log();
    }

    // Summary
    const installedCount = statuses.filter((s) => s.installed).length;
    const behindCount = statuses.filter((s) => s.behindUpstream && s.behindUpstream > 0).length;

    console.log('---');
    console.log(`Installed: ${installedCount}/${manifest.modules.length}`);

    if (options.checkUpstream && behindCount > 0) {
      console.log(`Behind upstream: ${behindCount}`);
    }
  });
