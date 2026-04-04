/**
 * hq packages install <slug> — download, verify, and extract a package (US-005)
 *
 * Flow:
 * 1. Check auth (prompt login if needed)
 * 2. Check entitlement via API
 * 3. Download tarball via presigned URL
 * 4. Verify SHA256 hash
 * 5. Verify RSA signature (if provided)
 * 6. Extract to packages/installed/<slug>/
 * 7. Validate extracted package.yaml slug matches
 * 8. Update packages/registry.yaml
 * 9. Print next-step message
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { execSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import { getAuthToken } from '../utils/auth.js';
import { findHqRoot } from '../utils/hq-root.js';
import {
  getRegistryUrl,
  RegistryClient,
} from '../utils/registry-client.js';
import { verifySha256, verifyRsaSignature } from '../utils/integrity.js';
import { addToRegistry } from '../utils/registry.js';

export function registerPackageInstallCommand(parent: Command): void {
  parent
    .command('install <slug>')
    .description('Install a package from the registry')
    .option('--company <co>', 'Scope the package to a specific company')
    .action(async (slug: string, opts: { company?: string }) => {
      try {
        await installPackage(slug, opts.company);
      } catch (error) {
        console.error(
          chalk.red('Install failed:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}

async function installPackage(
  slug: string,
  company?: string
): Promise<void> {
  // 1. Auth
  const token = await getAuthToken();
  const registryUrl = getRegistryUrl();
  const client = new RegistryClient(registryUrl, token.clerk_session_token);

  // 2. Check entitlement
  console.log(chalk.dim(`Checking entitlement for ${slug}...`));
  const entitlement = await client.checkEntitlement(slug);
  if (!entitlement.entitled) {
    throw new Error(
      `You are not entitled to package "${slug}". Visit the registry to purchase or request access.`
    );
  }

  // 3. Get download URL
  console.log(chalk.dim('Fetching download URL...'));
  const download = await client.getDownloadUrl(slug);

  // 4. Download to temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.resolve(tmpDir, `hq-pkg-${slug}-${Date.now()}.tar.gz`);

  try {
    console.log(chalk.dim('Downloading package...'));
    const response = await fetch(download.url, {
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tmpFile, buffer);

    // 5. Verify SHA256
    console.log(chalk.dim('Verifying integrity...'));
    const hashValid = await verifySha256(tmpFile, download.sha256);
    if (!hashValid) {
      throw new Error(
        'SHA256 hash mismatch — the downloaded file may be corrupted or tampered with.'
      );
    }

    // 6. Verify RSA signature (if provided)
    if (download.signature) {
      const sigValid = verifyRsaSignature(download.sha256, download.signature);
      if (!sigValid) {
        throw new Error(
          'RSA signature verification failed — the package may have been tampered with or the public key is missing/invalid. Aborting install.'
        );
      }
    }

    // 7. Extract
    const hqRoot = findHqRoot();
    const installDir = path.resolve(hqRoot, 'packages', 'installed', slug);

    // Clean existing installation
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    fs.mkdirSync(installDir, { recursive: true });

    execSync(`tar -xzf "${tmpFile}" -C "${installDir}"`, {
      stdio: 'pipe',
    });

    // 8. Validate package.yaml slug
    const packageYamlPath = path.resolve(installDir, 'package.yaml');
    if (fs.existsSync(packageYamlPath)) {
      const pkgContent = fs.readFileSync(packageYamlPath, 'utf-8');
      const pkgMeta = yaml.load(pkgContent) as { slug?: string } | null;
      if (pkgMeta?.slug && pkgMeta.slug !== slug) {
        // Mismatch — clean up and abort
        fs.rmSync(installDir, { recursive: true, force: true });
        throw new Error(
          `Package slug mismatch: expected "${slug}", got "${pkgMeta.slug}"`
        );
      }
    }

    // 9. Get package info for registry entry
    let version = 'unknown';
    let name = slug;
    try {
      const pkgInfo = await client.getPackage(slug);
      version = pkgInfo.package.latest_version;
      name = pkgInfo.package.name;
    } catch {
      // Best-effort — fall back to package.yaml if present
      const packageYaml = path.resolve(installDir, 'package.yaml');
      if (fs.existsSync(packageYaml)) {
        const content = fs.readFileSync(packageYaml, 'utf-8');
        const meta = yaml.load(content) as {
          version?: string;
          name?: string;
        } | null;
        if (meta?.version) version = meta.version;
        if (meta?.name) name = meta.name;
      }
    }

    // 10. Update registry.yaml
    const now = new Date().toISOString();
    addToRegistry(hqRoot, {
      name,
      slug,
      version,
      source: registryUrl,
      scope: company,
      installed_at: now,
      updated_at: now,
    });

    console.log(chalk.green(`\nInstalled ${slug}@${version} to packages/installed/${slug}/`));
    console.log(
      chalk.cyan(
        'Run /package-install ' + slug + ' in Claude to merge into your HQ.'
      )
    );
  } finally {
    // Clean up temp file — never leave partial downloads
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}
