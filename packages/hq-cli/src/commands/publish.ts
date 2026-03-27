/**
 * hq publish — build tarball and publish to HQ registry (US-014)
 *
 * Flow:
 *   1. Find and read hq-package.yaml in cwd (or --dir)
 *   2. Validate against required fields + enum values (hand-rolled)
 *   3. If --dry-run: print validation result and exit 0
 *   4. Load auth; auto-refresh if expired; prompt login if missing/unrefreshable
 *   5. Build tarball via `tar -czf`
 *   6. Create FormData with manifest + tarball blob
 *   7. Determine POST (new) vs PUT (new version) via GET /api/packages/:name
 *   8. Publish; handle auth errors gracefully
 */

import { execSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import yaml from 'js-yaml';

import {
  registryClient,
  RegistryAuthError,
  RegistryNotFoundError,
} from '../utils/registry-client.js';
import { loadAuth, saveAuth, isTokenExpired, refreshAuthToken } from '../utils/auth.js';
import type { HQPackage } from '../types/package-types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_REGISTRY_URL = 'https://admin.getindigo.ai';

const VALID_TYPES = [
  'worker-pack',
  'command-set',
  'skill-bundle',
  'knowledge-base',
  'company-template',
] as const;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate an unknown value against required hq-package.yaml fields.
 * Returns an array of error messages (empty = valid).
 */
export function validateManifest(pkg: unknown): string[] {
  const errors: string[] = [];

  if (pkg === null || typeof pkg !== 'object') {
    return ['Manifest must be a YAML object'];
  }

  const p = pkg as Record<string, unknown>;

  // Required: name
  if (!p['name'] || typeof p['name'] !== 'string' || p['name'].trim() === '') {
    errors.push('Missing required field: name');
  }

  // Required: type (must be valid enum)
  if (!p['type']) {
    errors.push('Missing required field: type');
  } else if (typeof p['type'] !== 'string') {
    errors.push('Field "type" must be a string');
  } else if (!(VALID_TYPES as readonly string[]).includes(p['type'])) {
    errors.push(
      `Invalid type "${p['type']}". Must be one of: ${VALID_TYPES.join(', ')}`
    );
  }

  // Required: version
  if (!p['version']) {
    errors.push('Missing required field: version');
  } else if (typeof p['version'] !== 'string' || p['version'].trim() === '') {
    errors.push('Field "version" must be a non-empty string');
  }

  // Required: description
  if (!p['description']) {
    errors.push('Missing required field: description');
  } else if (typeof p['description'] !== 'string' || p['description'].trim() === '') {
    errors.push('Field "description" must be a non-empty string');
  }

  return errors;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getRegistryBaseUrl(): string {
  return (process.env['HQ_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL).replace(/\/$/, '');
}

/**
 * Ensure we have a valid, non-expired auth token.
 * Auto-refreshes via refresh token if expired.
 * Exits the process with an actionable error if auth cannot be resolved.
 */
async function ensureAuth(): Promise<void> {
  const auth = await loadAuth();

  if (!auth) {
    console.error(chalk.red('Not logged in — run `hq login` first'));
    process.exit(1);
  }

  if (isTokenExpired(auth)) {
    if (auth.refreshToken) {
      console.log(chalk.dim('Token expired — refreshing…'));
      const refreshed = await refreshAuthToken(auth, getRegistryBaseUrl());
      if (refreshed) {
        await saveAuth(refreshed);
        console.log(chalk.dim('  Token refreshed successfully'));
        return;
      }
    }
    console.error(chalk.red('Token expired — run `hq login` to re-authenticate'));
    process.exit(1);
  }
}

// ─── Publish logic ────────────────────────────────────────────────────────────

interface PublishOptions {
  dryRun: boolean;
  dir: string;
}

async function runPublish(options: PublishOptions): Promise<void> {
  const packageDir = path.resolve(options.dir);
  const manifestPath = path.join(packageDir, 'hq-package.yaml');

  // 1. Read manifest
  let rawYaml: string;
  try {
    rawYaml = await readFile(manifestPath, 'utf8');
  } catch {
    console.error(chalk.red(`Error: hq-package.yaml not found in ${packageDir}`));
    console.error(chalk.dim('  Run this command from your package directory, or use --dir <path>'));
    process.exit(1);
  }

  let pkg: unknown;
  try {
    pkg = yaml.load(rawYaml);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error parsing hq-package.yaml: ${msg}`));
    process.exit(1);
  }

  // 2. Validate
  const errors = validateManifest(pkg);
  if (errors.length > 0) {
    console.error(chalk.red('hq-package.yaml validation failed:'));
    for (const error of errors) {
      console.error(chalk.red(`  • ${error}`));
    }
    process.exit(1);
  }

  const manifest = pkg as HQPackage;
  console.log(chalk.dim(`Validated ${chalk.bold(manifest.name)} v${manifest.version}`));

  // 3. --dry-run: stop here
  if (options.dryRun) {
    console.log(chalk.green('\n✓ Validation passed (dry run — not publishing)'));
    console.log(chalk.dim(`  Package: ${manifest.name} v${manifest.version} (${manifest.type})`));
    return;
  }

  // 4. Ensure valid auth
  await ensureAuth();

  // 5. Build tarball
  const tempDir = await mkdtemp(path.join(tmpdir(), 'hq-publish-'));

  try {
    const tarballPath = path.join(tempDir, `${manifest.name}-${manifest.version}.tar.gz`);

    console.log(chalk.dim('Building tarball…'));
    try {
      execSync(`tar -czf "${tarballPath}" -C "${packageDir}" .`, { stdio: 'pipe' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Failed to build tarball: ${msg}`));
      process.exit(1);
    }

    // 6. Read tarball + build FormData
    const tarballBuffer = await readFile(tarballPath);
    const tarballBlob = new Blob([tarballBuffer], { type: 'application/gzip' });
    const formData = new FormData();
    formData.append('manifest', JSON.stringify(manifest));
    formData.append('file', tarballBlob, `${manifest.name}-${manifest.version}.tar.gz`);

    // 7. Check if package already exists
    let packageExists = false;
    try {
      await registryClient.getPackage(manifest.name);
      packageExists = true;
    } catch (err: unknown) {
      if (!(err instanceof RegistryNotFoundError)) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error checking registry: ${msg}`));
        process.exit(1);
      }
    }

    // 8. Publish
    console.log(
      chalk.dim(
        packageExists
          ? `Publishing new version of ${manifest.name}…`
          : `Publishing ${manifest.name} (new package)…`
      )
    );

    try {
      if (packageExists) {
        await registryClient.publishVersion(manifest.name, formData);
      } else {
        await registryClient.publishPackage(formData);
      }
    } catch (err: unknown) {
      // 9. Auth error: friendly message
      if (err instanceof RegistryAuthError) {
        console.error(chalk.red('Authentication failed — run `hq login` to re-authenticate'));
        process.exit(1);
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Publish failed: ${msg}`));
      process.exit(1);
    }

    // 10. Success
    console.log(
      `\n${chalk.green('✓')} ${chalk.bold(manifest.name)} v${manifest.version} published successfully`
    );
    console.log(chalk.dim(`  Registry: ${getRegistryBaseUrl()}`));
  } finally {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  }
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerPublishCommand(program: Command): void {
  program
    .command('publish')
    .description('Build and publish a package to the HQ registry')
    .option('--dry-run', 'Validate the manifest without uploading', false)
    .option('--dir <path>', 'Package directory (default: current directory)', process.cwd())
    .action(async (options: { dryRun: boolean; dir: string }) => {
      try {
        await runPublish({ dryRun: options.dryRun, dir: options.dir });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\nPublish error: ${msg}`));
        process.exit(1);
      }
    });
}
