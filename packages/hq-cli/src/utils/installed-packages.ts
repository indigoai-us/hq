/**
 * Read / write packages/installed.json (US-005)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { InstalledPackage, InstalledPackages } from '../types/package-types.js';

const INSTALLED_FILE = path.join('packages', 'installed.json');

const EMPTY: InstalledPackages = { version: '1', packages: {} };

async function load(hqRoot: string): Promise<InstalledPackages> {
  const filePath = path.join(hqRoot, INSTALLED_FILE);
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as InstalledPackages;
  } catch {
    return { ...EMPTY, packages: {} };
  }
}

async function save(hqRoot: string, data: InstalledPackages): Promise<void> {
  const filePath = path.join(hqRoot, INSTALLED_FILE);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Returns the installed package record or null if not installed. */
export async function getInstalled(
  hqRoot: string,
  name: string
): Promise<InstalledPackage | null> {
  const data = await load(hqRoot);
  return data.packages[name] ?? null;
}

/** Writes (creates or overwrites) a package entry. */
export async function setInstalled(
  hqRoot: string,
  pkg: InstalledPackage
): Promise<void> {
  const data = await load(hqRoot);
  data.packages[pkg.name] = pkg;
  await save(hqRoot, data);
}

/** Returns all installed package records as a name → record map. */
export async function getAllInstalled(
  hqRoot: string
): Promise<Record<string, InstalledPackage>> {
  const data = await load(hqRoot);
  return { ...data.packages };
}

/** Removes a package entry. No-op if not present. */
export async function removeInstalled(
  hqRoot: string,
  name: string
): Promise<void> {
  const data = await load(hqRoot);
  if (name in data.packages) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete data.packages[name];
    await save(hqRoot, data);
  }
}
