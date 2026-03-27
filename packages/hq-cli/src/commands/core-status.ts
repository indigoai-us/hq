/**
 * hq core status — kernel integrity check (US-013)
 *
 * Reads core.yaml, computes SHA256 of each locked file, compares against
 * stored checksums, and reports modified/unmodified status per file.
 * Exit code 0 if all unmodified, exit code 1 if any modified.
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

import { findHQRoot } from '../utils/hq-root.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoreYaml {
  version: number;
  hqVersion: string;
  updatedAt: string;
  rules: {
    locked: string[];
    reviewable: string[];
    open: string[];
  };
  checksums: Record<string, string>;
}

interface FileStatus {
  path: string;
  stored: string;
  computed: string;
  modified: boolean;
  missing: boolean;
}

// ─── SHA256 helpers ───────────────────────────────────────────────────────────

/**
 * Compute SHA256 of a single file's content.
 */
async function sha256File(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null; // file missing or unreadable
  }
}

/**
 * Recursively list all files under a directory, sorted by path.
 * Returns relative paths from dirPath.
 */
async function listFilesRecursive(dirPath: string, base: string = dirPath): Promise<string[]> {
  const results: string[] = [];
  let entries: string[] = [];
  try {
    entries = (await readdir(dirPath)).sort();
  } catch {
    return results; // directory missing — treat as no files
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry);
    let info;
    try {
      info = await stat(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      const sub = await listFilesRecursive(full, base);
      results.push(...sub);
    } else {
      results.push(full);
    }
  }
  return results;
}

/**
 * Compute SHA256 for a directory.
 * Algorithm (mirrors core.yaml spec): sha256 of the concatenated output of
 * `find -type f | sort | xargs shasum -a 256` — i.e. for each file in sorted
 * order, append "<sha256>  <relativePath>\n" and hash the whole string.
 */
async function sha256Dir(dirPath: string): Promise<string | null> {
  const allFiles = await listFilesRecursive(dirPath);
  if (allFiles.length === 0) {
    return null; // no files → treat as missing
  }

  const lines: string[] = [];
  for (const filePath of allFiles) {
    const fileHash = await sha256File(filePath);
    if (fileHash === null) continue;
    // Format matches `shasum -a 256`: "<hash>  <path>"
    lines.push(`${fileHash}  ${filePath}`);
  }

  if (lines.length === 0) return null;

  const combined = lines.join('\n') + '\n';
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Compute the appropriate SHA256 for a path (file or directory).
 * Trailing `/` in the key indicates a directory.
 */
async function computeChecksum(hqRoot: string, entry: string): Promise<string | null> {
  const fullPath = path.join(hqRoot, entry);

  // core.yaml uses trailing slash to mark directories
  if (entry.endsWith('/')) {
    return sha256Dir(fullPath);
  }

  // Verify it's actually a file vs directory
  try {
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      return sha256Dir(fullPath);
    }
    return sha256File(fullPath);
  } catch {
    return null; // missing
  }
}

// ─── Main status logic ────────────────────────────────────────────────────────

export async function runCoreStatus(): Promise<void> {
  // 1. Find HQ root
  let hqRoot: string;
  try {
    hqRoot = await findHQRoot();
  } catch {
    console.error(chalk.red('Error: not inside an HQ installation (workers/registry.yaml not found)'));
    process.exit(1);
  }

  // 2. Read core.yaml
  const coreYamlPath = path.join(hqRoot, 'core.yaml');
  let coreYaml: CoreYaml;
  try {
    const raw = await readFile(coreYamlPath, 'utf8');
    coreYaml = parseYaml(raw) as CoreYaml;
  } catch {
    console.error(chalk.red('Error: core.yaml not found or invalid. Run from an HQ instance with governance initialized.'));
    process.exit(1);
  }

  const checksums = coreYaml.checksums ?? {};
  const entries = Object.entries(checksums);

  if (entries.length === 0) {
    console.log(chalk.yellow('Warning: no checksums in core.yaml — nothing to check.'));
    process.exit(0);
  }

  // 3. Compute checksums and collect results
  const statuses: FileStatus[] = [];

  for (const [entry, stored] of entries) {
    const computed = await computeChecksum(hqRoot, entry);
    const missing = computed === null;
    const modified = !missing && computed !== stored;
    statuses.push({
      path: entry,
      stored,
      computed: computed ?? '',
      modified,
      missing,
    });
  }

  // 4. Print header
  console.log('');
  console.log(chalk.bold('HQ Kernel Integrity Report'));
  console.log(chalk.dim(`Version: ${coreYaml.hqVersion}  │  Last updated: ${coreYaml.updatedAt}`));
  console.log('');

  // 5. Compute column widths
  const COL_PATH = Math.max(8, ...statuses.map(s => s.path.length));
  const COL_STATUS = 12;

  const header =
    chalk.bold(padRight('File', COL_PATH)) + '  ' +
    chalk.bold(padRight('Status', COL_STATUS));
  console.log(header);
  console.log(chalk.dim('─'.repeat(COL_PATH) + '  ' + '─'.repeat(COL_STATUS)));

  // 6. Print rows
  let anyModified = false;

  for (const s of statuses) {
    let statusLabel: string;
    if (s.missing) {
      statusLabel = chalk.red('MISSING');
      anyModified = true;
    } else if (s.modified) {
      statusLabel = chalk.red('MODIFIED');
      anyModified = true;
    } else {
      statusLabel = chalk.green('unmodified');
    }

    console.log(padRight(s.path, COL_PATH) + '  ' + statusLabel);
  }

  console.log('');

  // 7. Summary
  const modifiedCount = statuses.filter(s => s.modified || s.missing).length;
  if (anyModified) {
    console.log(chalk.red.bold(`${modifiedCount} file(s) modified or missing — kernel drift detected.`));
    process.exit(1);
  } else {
    console.log(chalk.green.bold('All locked files unmodified — kernel integrity intact.'));
    process.exit(0);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

// ─── Commander registration ───────────────────────────────────────────────────

export function registerCoreStatusCommand(coreCmd: Command): void {
  coreCmd
    .command('status')
    .description('Check kernel integrity — compare locked file checksums against core.yaml')
    .action(async () => {
      await runCoreStatus();
    });
}
