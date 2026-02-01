/**
 * Link Sync Strategy (US-006)
 * Symlinks module paths into HQ tree
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ModuleDefinition, SyncResult } from '../types.js';

export async function linkSync(
  module: ModuleDefinition,
  moduleDir: string,
  hqRoot: string
): Promise<SyncResult> {
  let filesChanged = 0;

  for (const mapping of module.paths) {
    const srcPath = path.join(moduleDir, mapping.src);
    const destPath = path.join(hqRoot, mapping.dest);

    // Validate source exists
    if (!fs.existsSync(srcPath)) {
      return {
        module: module.name,
        success: false,
        action: 'skipped',
        message: `Source path not found: ${mapping.src}`,
      };
    }

    // Ensure dest parent directory exists
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Handle existing dest
    if (fs.existsSync(destPath)) {
      const stat = fs.lstatSync(destPath);
      if (stat.isSymbolicLink()) {
        // Remove existing symlink and recreate
        fs.unlinkSync(destPath);
      } else {
        // Real file exists - warn and skip
        console.warn(`  Warning: Real file exists at ${mapping.dest}, skipping`);
        continue;
      }
    }

    // Create relative symlink for portability
    const relativeSrc = path.relative(destDir, srcPath);
    fs.symlinkSync(relativeSrc, destPath);
    filesChanged++;
  }

  return {
    module: module.name,
    success: true,
    action: 'synced',
    filesChanged,
  };
}
