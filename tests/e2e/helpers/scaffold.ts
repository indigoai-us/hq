import { cpSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface ScaffoldResult {
  dir: string;
  cleanup: () => void;
}

const TEMPLATE_DIR = resolve(__dirname, '../../../template');

const activeTempdirs = new Set<string>();

process.on('exit', () => {
  for (const dir of activeTempdirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup on crash
    }
  }
});

export function scaffoldHQ(): ScaffoldResult {
  const dir = mkdtempSync(join(tmpdir(), 'hq-e2e-'));

  cpSync(TEMPLATE_DIR, dir, { recursive: true });

  activeTempdirs.add(dir);

  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    activeTempdirs.delete(dir);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  return { dir, cleanup };
}
