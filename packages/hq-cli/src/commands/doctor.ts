/**
 * hq doctor — HQ health diagnostics (US-017)
 *
 * Runs 5 health checks and outputs a formatted table.
 * Exit code 0 if all pass, 1 if any fail.
 *
 * Check 1: required deps installed (claude, gh, qmd)
 * Check 2: installed.json entries match files on disk
 * Check 3: no broken symlinks in workers/ and knowledge/
 * Check 4: core.yaml locked files unmodified (delegates to core-status logic)
 * Check 5: registry reachable
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { access, lstat, readdir } from 'node:fs/promises';
import { execFile as execFileCb } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { findHQRoot } from '../utils/hq-root.js';
import { getAllInstalled } from '../utils/installed-packages.js';
import { checkCoreIntegrity } from './core-status.js';

const execFile = promisify(execFileCb);

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

// ─── Check 1: Required deps ───────────────────────────────────────────────────

const REQUIRED_BINS = ['claude', 'gh'] as const;
const OPTIONAL_BINS = ['qmd'] as const;

async function binaryExists(bin: string): Promise<boolean> {
  try {
    await execFile('which', [bin]);
    return true;
  } catch {
    return false;
  }
}

export async function checkRequiredDeps(): Promise<CheckResult> {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const bin of REQUIRED_BINS) {
    if (!(await binaryExists(bin))) missingRequired.push(bin);
  }
  for (const bin of OPTIONAL_BINS) {
    if (!(await binaryExists(bin))) missingOptional.push(bin);
  }

  if (missingRequired.length > 0) {
    return {
      name: 'required deps',
      status: 'fail',
      detail: `missing: ${missingRequired.join(', ')}`,
    };
  }
  if (missingOptional.length > 0) {
    return {
      name: 'required deps',
      status: 'warn',
      detail: `optional missing: ${missingOptional.join(', ')}`,
    };
  }
  return {
    name: 'required deps',
    status: 'pass',
    detail: [...REQUIRED_BINS, ...OPTIONAL_BINS].join(', ') + ' installed',
  };
}

// ─── Check 2: installed.json entries match files on disk ─────────────────────

export async function checkInstalledPackages(hqRoot: string): Promise<CheckResult> {
  const pkgs = await getAllInstalled(hqRoot);
  const entries = Object.entries(pkgs);

  if (entries.length === 0) {
    return { name: 'installed packages', status: 'pass', detail: 'no packages installed' };
  }

  const broken: string[] = [];

  for (const [name, pkg] of entries) {
    for (const file of pkg.files) {
      try {
        await access(path.join(hqRoot, file));
      } catch {
        broken.push(`${name}:${file}`);
      }
    }
  }

  if (broken.length > 0) {
    const preview = broken.slice(0, 2).join(', ') + (broken.length > 2 ? ' …' : '');
    return {
      name: 'installed packages',
      status: 'fail',
      detail: `${broken.length} missing file(s): ${preview}`,
    };
  }

  return {
    name: 'installed packages',
    status: 'pass',
    detail: `${entries.length} package(s) verified`,
  };
}

// ─── Check 3: No broken symlinks in workers/ and knowledge/ ──────────────────

async function collectBrokenSymlinks(dirPath: string): Promise<string[]> {
  const broken: string[] = [];
  let entries: string[];

  try {
    entries = await readdir(dirPath);
  } catch {
    return broken; // directory absent — skip
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry);
    try {
      const info = await lstat(full);
      if (info.isSymbolicLink()) {
        try {
          await access(full); // follows the symlink — throws if target missing
        } catch {
          broken.push(full);
        }
      } else if (info.isDirectory()) {
        const sub = await collectBrokenSymlinks(full);
        broken.push(...sub);
      }
    } catch {
      // lstat failed — skip
    }
  }

  return broken;
}

export async function checkSymlinks(hqRoot: string): Promise<CheckResult> {
  const dirsToScan = ['workers', 'knowledge'];
  const broken: string[] = [];

  for (const dir of dirsToScan) {
    const b = await collectBrokenSymlinks(path.join(hqRoot, dir));
    broken.push(...b);
  }

  if (broken.length > 0) {
    const preview = broken
      .slice(0, 2)
      .map(p => path.relative(hqRoot, p))
      .join(', ') + (broken.length > 2 ? ' …' : '');
    return {
      name: 'symlinks',
      status: 'fail',
      detail: `${broken.length} broken symlink(s): ${preview}`,
    };
  }

  return { name: 'symlinks', status: 'pass', detail: 'no broken symlinks' };
}

// ─── Check 4: Kernel integrity (delegates to core-status logic) ──────────────

export async function checkKernelIntegrity(hqRoot: string): Promise<CheckResult> {
  const result = await checkCoreIntegrity(hqRoot);
  // skipped = governance not initialized; treat as warn rather than fail
  const status: CheckStatus = result.skipped ? 'warn' : result.pass ? 'pass' : 'fail';
  return {
    name: 'kernel integrity',
    status,
    detail: result.message,
  };
}

// ─── Check 5: Registry reachable ─────────────────────────────────────────────

const REGISTRY_TIMEOUT_MS = 5_000;
const DEFAULT_REGISTRY_URL = 'https://admin.getindigo.ai';

export async function checkRegistryReachable(): Promise<CheckResult> {
  const registryUrl = (
    process.env['HQ_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL
  ).replace(/\/$/, '');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);

  try {
    const response = await fetch(`${registryUrl}/health`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.status < 500) {
      return { name: 'registry', status: 'pass', detail: `reachable (HTTP ${response.status})` };
    }
    return { name: 'registry', status: 'warn', detail: `server error (HTTP ${response.status})` };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      name: 'registry',
      status: 'warn',
      detail: isTimeout ? `timeout after ${REGISTRY_TIMEOUT_MS / 1000}s` : 'unreachable',
    };
  }
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

function statusLabel(status: CheckStatus, colWidth: number): string {
  const padded = padRight(status, colWidth);
  if (status === 'pass') return chalk.green(padded);
  if (status === 'warn') return chalk.yellow(padded);
  return chalk.red(padded);
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runDoctor(): Promise<void> {
  let hqRoot: string;
  try {
    hqRoot = await findHQRoot();
  } catch {
    console.error(chalk.red('Error: not inside an HQ installation (workers/registry.yaml not found)'));
    process.exit(1);
  }

  // Run all checks concurrently where safe; kernel integrity is fast enough to run in parallel
  const results: CheckResult[] = await Promise.all([
    checkRequiredDeps(),
    checkInstalledPackages(hqRoot),
    checkSymlinks(hqRoot),
    checkKernelIntegrity(hqRoot),
    checkRegistryReachable(),
  ]);

  // Header
  console.log('');
  console.log(chalk.bold('HQ Health Report'));
  console.log('');

  // Column widths
  const COL_NAME = Math.max(16, ...results.map(r => r.name.length));
  const COL_STATUS = 6; // 'pass' | 'warn' | 'fail'
  const COL_DETAIL = 55;

  const header =
    chalk.bold(padRight('Check', COL_NAME)) +
    '  ' +
    chalk.bold(padRight('Status', COL_STATUS)) +
    '  ' +
    chalk.bold('Detail');
  console.log(header);
  console.log(chalk.dim('─'.repeat(COL_NAME) + '  ' + '─'.repeat(COL_STATUS) + '  ' + '─'.repeat(COL_DETAIL)));

  let anyFailed = false;
  let anyWarned = false;

  for (const r of results) {
    if (r.status === 'fail') anyFailed = true;
    if (r.status === 'warn') anyWarned = true;
    console.log(
      padRight(r.name, COL_NAME) +
        '  ' +
        statusLabel(r.status, COL_STATUS) +
        '  ' +
        r.detail
    );
  }

  console.log('');

  if (anyFailed) {
    console.log(chalk.red.bold('HQ has issues — see failures above.'));
    process.exit(1);
  } else if (anyWarned) {
    console.log(chalk.yellow.bold('HQ is healthy with warnings.'));
    process.exit(0);
  } else {
    console.log(chalk.green.bold('HQ is healthy.'));
    process.exit(0);
  }
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run HQ health diagnostics — check deps, packages, symlinks, kernel integrity, and registry')
    .action(async () => {
      await runDoctor();
    });
}
