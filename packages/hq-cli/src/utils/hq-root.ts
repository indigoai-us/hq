/**
 * HQ root detection — walks up from cwd looking for HQ markers (US-004)
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Find the HQ root directory by walking up from cwd.
 * Looks for CLAUDE.md or .claude/ directory as markers.
 * Throws if not found.
 */
export function findHqRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, 'CLAUDE.md')) ||
      fs.existsSync(path.join(dir, '.claude'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error(
    'Could not find HQ root. Run this command from within your HQ directory.'
  );
}
