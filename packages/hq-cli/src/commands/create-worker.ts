/**
 * hq create-worker [name] — scaffold a publishable worker package (US-015)
 *
 * Flow:
 *   1. If [name] arg provided, skip prompts
 *   2. Otherwise prompt for name, then type
 *   3. Validate name format
 *   4. Scaffold directory structure under --out-dir/<name>/
 *   5. Validate generated hq-package.yaml
 *   6. Print summary of created files
 */

import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import chalk from 'chalk';
import { Command } from 'commander';
import yaml from 'js-yaml';

import { validateManifest } from './publish.js';
import type { HQPackage } from '../types/package-types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const VALID_PACKAGE_TYPES = [
  'worker-pack',
  'command-set',
  'skill-bundle',
  'knowledge-base',
  'company-template',
] as const;

export type PackageType = typeof VALID_PACKAGE_TYPES[number];

// ─── Name validation ──────────────────────────────────────────────────────────

/**
 * Validate a worker/package name.
 * Allows lowercase letters and digits, separated by single hyphens.
 * Single char names (e.g. "a") are allowed.
 */
export function validateName(name: string): string | null {
  if (!name || name.trim() === '') {
    return 'Name cannot be empty';
  }
  const trimmed = name.trim();
  // Must start + end with letter/digit; may contain hyphens (no consecutive)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(trimmed)) {
    return 'Name must be lowercase letters/digits, optionally separated by hyphens (e.g. "my-worker")';
  }
  if (/--/.test(trimmed)) {
    return 'Name must not contain consecutive hyphens';
  }
  return null;
}

// ─── Scaffolding ──────────────────────────────────────────────────────────────

export interface ScaffoldOptions {
  name: string;
  type: PackageType;
  outDir: string;
}

/**
 * Scaffold a publishable worker package directory.
 * Returns a list of relative paths (relative to outDir) that were created.
 * Pure I/O — no process.exit, no readline. Safe to call in tests.
 */
export async function scaffoldWorkerPackage(opts: ScaffoldOptions): Promise<string[]> {
  const { name, type, outDir } = opts;
  const pkgRoot = path.join(outDir, name);

  const created: string[] = [];

  // ── Directory structure ──────────────────────────────────────────────────

  const dirs = [
    pkgRoot,
    path.join(pkgRoot, 'workers', name),
    path.join(pkgRoot, 'skills'),
    path.join(pkgRoot, 'knowledge'),
    path.join(pkgRoot, 'hooks'),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // ── hq-package.yaml ─────────────────────────────────────────────────────

  const manifest: HQPackage = {
    name,
    type,
    version: '0.1.0',
    description: `Worker pack for ${name}`,
    exposes: {
      workers: [`workers/${name}/worker.yaml`],
    },
    hooks: {
      'on-install': 'hooks/on-install.sh',
    },
  };

  const manifestYaml = yaml.dump(manifest, { lineWidth: -1 });
  const manifestPath = path.join(pkgRoot, 'hq-package.yaml');
  await writeFile(manifestPath, manifestYaml, 'utf8');
  created.push(`${name}/hq-package.yaml`);

  // ── workers/{name}/worker.yaml ───────────────────────────────────────────

  const workerManifest = {
    name,
    description: '',
    version: '0.1.0',
    skills: [],
    knowledge: [],
  };

  const workerYaml = yaml.dump(workerManifest, { lineWidth: -1 });
  const workerPath = path.join(pkgRoot, 'workers', name, 'worker.yaml');
  await writeFile(workerPath, workerYaml, 'utf8');
  created.push(`${name}/workers/${name}/worker.yaml`);

  // ── skills/.gitkeep ─────────────────────────────────────────────────────

  const skillsGitkeep = path.join(pkgRoot, 'skills', '.gitkeep');
  await writeFile(skillsGitkeep, '', 'utf8');
  created.push(`${name}/skills/.gitkeep`);

  // ── knowledge/.gitkeep ──────────────────────────────────────────────────

  const knowledgeGitkeep = path.join(pkgRoot, 'knowledge', '.gitkeep');
  await writeFile(knowledgeGitkeep, '', 'utf8');
  created.push(`${name}/knowledge/.gitkeep`);

  // ── hooks/on-install.sh ─────────────────────────────────────────────────

  const hookContent = [
    '#!/usr/bin/env bash',
    `# on-install.sh — runs after "${name}" package installation`,
    '# Add any post-install steps here.',
    '# Example:',
    '# qmd update 2>/dev/null || true',
    '',
  ].join('\n');

  const hookPath = path.join(pkgRoot, 'hooks', 'on-install.sh');
  await writeFile(hookPath, hookContent, 'utf8');
  await chmod(hookPath, 0o755);
  created.push(`${name}/hooks/on-install.sh`);

  return created;
}

// ─── Interactive prompts ──────────────────────────────────────────────────────

async function promptName(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = await rl.question(chalk.bold('Worker/package name: '));
      const trimmed = answer.trim();
      const err = validateName(trimmed);
      if (!err) {
        return trimmed;
      }
      console.error(chalk.red(`  ${err}`));
    }
  } finally {
    rl.close();
  }
}

async function promptType(): Promise<PackageType> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log(chalk.dim('\nPackage type:'));
    VALID_PACKAGE_TYPES.forEach((t, i) => {
      const marker = i === 0 ? chalk.green('*') : ' ';
      console.log(`  ${marker} ${i + 1}. ${t}${i === 0 ? chalk.dim(' (default)') : ''}`);
    });

    while (true) {
      const answer = await rl.question(chalk.bold(`Type [1-${VALID_PACKAGE_TYPES.length}] (default 1): `));
      const trimmed = answer.trim();

      // Empty = default (worker-pack)
      if (trimmed === '') {
        return 'worker-pack';
      }

      const idx = parseInt(trimmed, 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < VALID_PACKAGE_TYPES.length) {
        return VALID_PACKAGE_TYPES[idx];
      }

      // Also allow typing the name directly
      const direct = trimmed as PackageType;
      if ((VALID_PACKAGE_TYPES as readonly string[]).includes(direct)) {
        return direct;
      }

      console.error(chalk.red(`  Enter a number between 1 and ${VALID_PACKAGE_TYPES.length}, or press Enter for default`));
    }
  } finally {
    rl.close();
  }
}

// ─── Run logic ────────────────────────────────────────────────────────────────

interface CreateWorkerOptions {
  outDir: string;
}

async function runCreateWorker(
  nameArg: string | undefined,
  options: CreateWorkerOptions
): Promise<void> {
  let name: string;
  let type: PackageType;

  if (nameArg) {
    // Non-interactive: name from arg, type defaults to worker-pack
    const err = validateName(nameArg);
    if (err) {
      console.error(chalk.red(`Error: ${err}`));
      process.exit(1);
    }
    name = nameArg.trim();
    type = 'worker-pack';
  } else {
    // Interactive: prompt for name + type
    name = await promptName();
    type = await promptType();
  }

  const outDir = path.resolve(options.outDir);

  console.log(chalk.dim(`\nScaffolding ${chalk.bold(name)} (${type}) in ${outDir}…`));

  let createdFiles: string[];
  try {
    createdFiles = await scaffoldWorkerPackage({ name, type, outDir });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error scaffolding package: ${msg}`));
    process.exit(1);
  }

  // Validate the generated manifest
  const manifestPath = path.join(outDir, name, 'hq-package.yaml');
  let manifestContent: string;
  try {
    const { readFile } = await import('node:fs/promises');
    manifestContent = await readFile(manifestPath, 'utf8');
  } catch {
    console.error(chalk.red('Error: could not read generated hq-package.yaml'));
    process.exit(1);
  }

  const parsed = yaml.load(manifestContent);
  const errors = validateManifest(parsed);
  if (errors.length > 0) {
    console.error(chalk.red('Generated manifest failed validation:'));
    for (const error of errors) {
      console.error(chalk.red(`  • ${error}`));
    }
    process.exit(1);
  }

  // Success output
  console.log(`\n${chalk.green('✓')} Created ${chalk.bold(name)} package:`);
  for (const f of createdFiles) {
    console.log(`  ${chalk.dim(f)}`);
  }
  console.log(
    `\n${chalk.dim('Next steps:')}\n` +
    `  ${chalk.dim('1.')} cd ${name}\n` +
    `  ${chalk.dim('2.')} Edit workers/${name}/worker.yaml\n` +
    `  ${chalk.dim('3.')} hq publish --dry-run\n` +
    `  ${chalk.dim('4.')} hq publish`
  );
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerCreateWorkerCommand(program: Command): void {
  program
    .command('create-worker [name]')
    .description('Scaffold a publishable worker package')
    .option('--out-dir <path>', 'Output directory (default: current directory)', process.cwd())
    .action(async (nameArg: string | undefined, options: { outDir: string }) => {
      try {
        await runCreateWorker(nameArg, { outDir: options.outDir });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\nCreate-worker error: ${msg}`));
        process.exit(1);
      }
    });
}
