/**
 * Registry YAML helpers — read/write packages/registry.yaml (US-005)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface RegistryEntry {
  name: string;
  slug: string;
  version: string;
  source: string;
  license_key?: string;
  scope?: string;
  installed_at: string;
  updated_at: string;
}

interface RegistryFile {
  packages: RegistryEntry[];
}

function registryPath(hqRoot: string): string {
  return path.resolve(hqRoot, 'packages', 'registry.yaml');
}

/**
 * Read all entries from packages/registry.yaml.
 * Returns an empty array if the file does not exist.
 */
export function readRegistry(hqRoot: string): RegistryEntry[] {
  const filePath = registryPath(hqRoot);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content) as RegistryFile | null;
  return parsed?.packages ?? [];
}

/**
 * Write the full registry back to packages/registry.yaml.
 */
export function writeRegistry(
  hqRoot: string,
  entries: RegistryEntry[]
): void {
  const filePath = registryPath(hqRoot);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = yaml.dump(
    { packages: entries },
    { lineWidth: 120, noRefs: true }
  );
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Add or update an entry in packages/registry.yaml.
 * If an entry with the same slug exists, it is replaced.
 */
export function addToRegistry(
  hqRoot: string,
  entry: RegistryEntry
): void {
  const entries = readRegistry(hqRoot);
  const idx = entries.findIndex((e) => e.slug === entry.slug);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  writeRegistry(hqRoot, entries);
}

/**
 * Remove an entry by slug from packages/registry.yaml.
 * No-op if the slug is not found.
 */
export function removeFromRegistry(
  hqRoot: string,
  slug: string
): void {
  const entries = readRegistry(hqRoot).filter((e) => e.slug !== slug);
  writeRegistry(hqRoot, entries);
}
