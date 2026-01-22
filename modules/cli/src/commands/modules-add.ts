import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

/**
 * Validate repo URL format (HTTPS or SSH)
 */
function isValidRepoUrl(url: string): boolean {
  const httpsPattern = /^https:\/\/[^\s]+\.git$/;
  const sshPattern = /^git@[^\s]+:[^\s]+\.git$/;
  return httpsPattern.test(url) || sshPattern.test(url);
}

/**
 * Extract module name from repo URL
 * e.g., https://github.com/user/my-module.git -> my-module
 *       git@github.com:user/my-module.git -> my-module
 */
function extractModuleName(url: string): string {
  const match = url.match(/\/([^/]+)\.git$/) || url.match(/:([^/]+)\.git$/);
  if (match) {
    return match[1];
  }
  throw new Error(`Could not extract module name from URL: ${url}`);
}

/**
 * Find modules.yaml path (searches up from cwd)
 */
function findManifestPath(): string {
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
  // Default: create in cwd/modules/modules.yaml
  return path.join(process.cwd(), 'modules', 'modules.yaml');
}

/**
 * Load existing manifest or create empty one
 */
function loadManifest(manifestPath: string): ModuleManifest {
  if (fs.existsSync(manifestPath)) {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return parse(content) as ModuleManifest;
  }
  return {
    version: '1.0',
    modules: [],
  };
}

/**
 * Save manifest to file
 */
function saveManifest(manifestPath: string, manifest: ModuleManifest): void {
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = stringify(manifest, { lineWidth: 0 });
  fs.writeFileSync(manifestPath, content);
}

export const modulesAddCommand = new Command('add')
  .description('Add a module to the manifest by repo URL')
  .argument('<repo-url>', 'Git repository URL (HTTPS or SSH format)')
  .option('--as <name>', 'Custom module name (auto-detected from repo if not provided)')
  .option('--branch <branch>', 'Branch to sync from', 'main')
  .option('--strategy <strategy>', 'Sync strategy (link|merge|copy)', 'merge')
  .option('--access <access>', 'Access level (public|team|role:X)', 'public')
  .action((repoUrl: string, options: {
    as?: string;
    branch: string;
    strategy: string;
    access: string;
  }) => {
    // Validate repo URL format
    if (!isValidRepoUrl(repoUrl)) {
      console.error('Error: Invalid repo URL format.');
      console.error('Expected HTTPS (https://...git) or SSH (git@...git) format.');
      process.exit(1);
    }

    // Determine module name
    let moduleName: string;
    if (options.as) {
      moduleName = options.as;
    } else {
      try {
        moduleName = extractModuleName(repoUrl);
      } catch (error) {
        console.error((error as Error).message);
        console.error('Use --as <name> to specify a module name manually.');
        process.exit(1);
      }
    }

    // Validate strategy
    const validStrategies = ['link', 'merge', 'copy'];
    if (!validStrategies.includes(options.strategy)) {
      console.error(`Error: Invalid strategy "${options.strategy}".`);
      console.error('Valid strategies: link, merge, copy');
      process.exit(1);
    }

    // Validate access level
    const validAccess = ['public', 'team'];
    if (!validAccess.includes(options.access) && !options.access.startsWith('role:')) {
      console.error(`Error: Invalid access level "${options.access}".`);
      console.error('Valid access levels: public, team, role:<role-name>');
      process.exit(1);
    }

    // Find and load manifest
    const manifestPath = findManifestPath();
    const manifest = loadManifest(manifestPath);

    // Check for duplicate module names
    const existingModule = manifest.modules.find((m) => m.name === moduleName);
    if (existingModule) {
      console.error(`Error: Module "${moduleName}" already exists in manifest.`);
      console.error(`Existing repo: ${existingModule.repo}`);
      process.exit(1);
    }

    // Create new module entry
    const newModule: Module = {
      name: moduleName,
      repo: repoUrl,
      branch: options.branch,
      strategy: options.strategy as 'link' | 'merge' | 'copy',
      access: options.access as 'public' | 'team' | `role:${string}`,
      paths: {},
    };

    // Add to manifest and save
    manifest.modules.push(newModule);
    saveManifest(manifestPath, manifest);

    console.log(`Added module "${moduleName}" to ${manifestPath}`);
    console.log(`  repo: ${repoUrl}`);
    console.log(`  branch: ${options.branch}`);
    console.log(`  strategy: ${options.strategy}`);
    console.log(`  access: ${options.access}`);
  });
