/**
 * hq packages update [slug] — check for and apply package updates (US-005)
 *
 * If no slug: check all installed packages for updates.
 * If slug given: update only that package.
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
import {
  readRegistry,
  addToRegistry,
  type RegistryEntry,
} from '../utils/registry.js';

export function registerPackageUpdateCommand(parent: Command): void {
  parent
    .command('update [slug]')
    .description('Check for and apply package updates')
    .action(async (slug?: string) => {
      try {
        await updatePackages(slug);
      } catch (error) {
        console.error(
          chalk.red('Update failed:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });
}

async function updatePackages(slug?: string): Promise<void> {
  const hqRoot = findHqRoot();
  const entries = readRegistry(hqRoot);

  if (entries.length === 0) {
    console.log('No packages installed. Use "hq packages install <slug>" to install one.');
    return;
  }

  const token = await getAuthToken();
  const registryUrl = getRegistryUrl();
  const client = new RegistryClient(registryUrl, token.clerk_session_token);

  const toCheck = slug
    ? entries.filter((e) => e.slug === slug)
    : entries;

  if (slug && toCheck.length === 0) {
    throw new Error(`Package "${slug}" is not installed.`);
  }

  let updatedCount = 0;

  for (const entry of toCheck) {
    try {
      const pkgInfo = await client.getPackage(entry.slug);
      const latestVersion = pkgInfo.package.latest_version;

      if (latestVersion === entry.version) {
        console.log(chalk.dim(`${entry.slug}@${entry.version} — up to date`));
        continue;
      }

      console.log(
        chalk.yellow(
          `${entry.slug}: ${entry.version} → ${latestVersion}`
        )
      );

      // Download new version
      const download = await client.getDownloadUrl(
        entry.slug,
        latestVersion
      );

      const tmpFile = path.resolve(
        os.tmpdir(),
        `hq-pkg-${entry.slug}-${Date.now()}.tar.gz`
      );

      try {
        const response = await fetch(download.url, {
          signal: AbortSignal.timeout(120_000),
        });

        if (!response.ok) {
          throw new Error(`Download failed (${response.status})`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(tmpFile, buffer);

        // Verify SHA256
        const hashValid = await verifySha256(tmpFile, download.sha256);
        if (!hashValid) {
          throw new Error('SHA256 hash mismatch');
        }

        // Verify RSA signature (if provided)
        if (download.signature) {
          const sigValid = verifyRsaSignature(
            download.sha256,
            download.signature
          );
          if (!sigValid) {
            console.warn(
              chalk.yellow(
                `  Warning: RSA signature verification failed for ${entry.slug}. Proceeding with SHA256-only.`
              )
            );
          }
        }

        // Extract over existing
        const installDir = path.resolve(
          hqRoot,
          'packages',
          'installed',
          entry.slug
        );

        if (fs.existsSync(installDir)) {
          fs.rmSync(installDir, { recursive: true, force: true });
        }
        fs.mkdirSync(installDir, { recursive: true });

        execSync(`tar -xzf "${tmpFile}" -C "${installDir}"`, {
          stdio: 'pipe',
        });

        // Validate package.yaml slug
        const packageYamlPath = path.resolve(installDir, 'package.yaml');
        if (fs.existsSync(packageYamlPath)) {
          const pkgContent = fs.readFileSync(packageYamlPath, 'utf-8');
          const pkgMeta = yaml.load(pkgContent) as {
            slug?: string;
          } | null;
          if (pkgMeta?.slug && pkgMeta.slug !== entry.slug) {
            fs.rmSync(installDir, { recursive: true, force: true });
            throw new Error(
              `Package slug mismatch: expected "${entry.slug}", got "${pkgMeta.slug}"`
            );
          }
        }

        // Update registry entry — preserve scope
        const now = new Date().toISOString();
        const updated: RegistryEntry = {
          ...entry,
          version: latestVersion,
          updated_at: now,
        };
        addToRegistry(hqRoot, updated);

        console.log(
          chalk.green(`  Updated ${entry.slug} to ${latestVersion}`)
        );
        updatedCount++;
      } finally {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      }
    } catch (error) {
      console.error(
        chalk.red(`  Error updating ${entry.slug}:`),
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  console.log(
    `\n${updatedCount} package(s) updated${updatedCount > 0 ? '.' : ' — everything is current.'}`
  );
}
