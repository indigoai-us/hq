import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { walkDirectory } from '../data/initial-sync.js';

describe('Initial Sync', () => {
  let tempDir: string;

  function writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(tempDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'initial-sync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('walkDirectory', () => {
    it('should collect all files as FileEvents', () => {
      writeFile('workers/registry.yaml', 'workers: []');
      writeFile('knowledge/readme.md', '# Knowledge');
      writeFile('projects/test/prd.json', '{}');

      const events = walkDirectory(tempDir);
      expect(events.length).toBe(3);

      const paths = events.map((e) => e.relativePath);
      expect(paths).toContain('workers/registry.yaml');
      expect(paths).toContain('knowledge/readme.md');
      expect(paths).toContain('projects/test/prd.json');

      // All events should be 'add' type
      expect(events.every((e) => e.type === 'add')).toBe(true);
    });

    it('should skip .git directory', () => {
      writeFile('.git/config', 'git config');
      writeFile('workers/test.yaml', 'content');

      const events = walkDirectory(tempDir);
      expect(events.length).toBe(1);
      expect(events[0]!.relativePath).toBe('workers/test.yaml');
    });

    it('should skip node_modules', () => {
      writeFile('node_modules/pkg/index.js', 'module');
      writeFile('real.txt', 'content');

      const events = walkDirectory(tempDir);
      expect(events.length).toBe(1);
      expect(events[0]!.relativePath).toBe('real.txt');
    });

    it('should skip hidden files and directories', () => {
      writeFile('.hidden/secret.txt', 'secret');
      writeFile('.dotfile', 'hidden');
      writeFile('visible.txt', 'content');

      const events = walkDirectory(tempDir);
      expect(events.length).toBe(1);
      expect(events[0]!.relativePath).toBe('visible.txt');
    });

    it('should skip dist directory', () => {
      writeFile('dist/bundle.js', 'bundled');
      writeFile('src/index.ts', 'source');

      const events = walkDirectory(tempDir);
      expect(events.length).toBe(1);
      expect(events[0]!.relativePath).toBe('src/index.ts');
    });

    it('should return empty array for empty directory', () => {
      const events = walkDirectory(tempDir);
      expect(events).toEqual([]);
    });

    it('should use forward slashes in relativePath', () => {
      writeFile('workers/dev-team/worker.yaml', 'content');

      const events = walkDirectory(tempDir);
      expect(events[0]!.relativePath).toBe('workers/dev-team/worker.yaml');
      expect(events[0]!.relativePath).not.toContain('\\');
    });

    it('should set absolute paths', () => {
      writeFile('test.txt', 'content');

      const events = walkDirectory(tempDir);
      expect(path.isAbsolute(events[0]!.absolutePath)).toBe(true);
    });
  });
});
