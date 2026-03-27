/**
 * HQ root detection utility (US-005)
 * Walks up from cwd to find the directory containing workers/registry.yaml.
 */

import { access } from 'node:fs/promises';
import path from 'node:path';

const SENTINEL = path.join('workers', 'registry.yaml');
const MAX_LEVELS = 10;

/**
 * Walk up from startDir (default: process.cwd()) to find the HQ root.
 * HQ root is identified by the presence of workers/registry.yaml.
 * Throws if not found within MAX_LEVELS levels.
 */
export async function findHQRoot(startDir?: string): Promise<string> {
  let dir = path.resolve(startDir ?? process.cwd());

  for (let i = 0; i < MAX_LEVELS; i++) {
    const candidate = path.join(dir, SENTINEL);
    try {
      await access(candidate);
      return dir; // found
    } catch {
      // not here — go up
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      // reached filesystem root
      break;
    }
    dir = parent;
  }

  throw new Error(
    `Could not find HQ root (looked for ${SENTINEL} up to ${MAX_LEVELS} levels from ${startDir ?? process.cwd()})`
  );
}
