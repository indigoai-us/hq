import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { HqIgnore } from '../ignore/hq-ignore.js';
import { DEFAULT_HQ_IGNORE_PATTERNS } from '../ignore/types.js';

describe('HqIgnore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-ignore-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should initialize with default rules when no .hqignore exists', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      expect(ignore.initialized).toBe(true);
      expect(ignore.ruleCount).toBeGreaterThan(0);

      ignore.dispose();
    });

    it('should not re-initialize if already initialized', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();
      const ruleCount = ignore.ruleCount;

      ignore.initialize(); // Second call should be no-op
      expect(ignore.ruleCount).toBe(ruleCount);

      ignore.dispose();
    });

    it('should load .hqignore file on initialization', () => {
      const hqIgnoreContent = '*.custom\nmy-temp/\n';
      fs.writeFileSync(path.join(tmpDir, '.hqignore'), hqIgnoreContent, 'utf-8');

      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      // Should have builtin rules + file rules
      expect(ignore.ruleCount).toBeGreaterThan(DEFAULT_HQ_IGNORE_PATTERNS.length);
      expect(ignore.isIgnored('test.custom')).toBe(true);

      ignore.dispose();
    });

    it('should support custom .hqignore path', () => {
      const customPath = path.join(tmpDir, 'custom-ignore');
      fs.writeFileSync(customPath, '*.xyz\n', 'utf-8');

      const ignore = new HqIgnore({
        hqDir: tmpDir,
        hqIgnorePath: customPath,
        watchForChanges: false,
      });
      ignore.initialize();

      expect(ignore.isIgnored('test.xyz')).toBe(true);
      expect(ignore.ignorePath).toBe(customPath);

      ignore.dispose();
    });

    it('should include extra patterns', () => {
      const ignore = new HqIgnore({
        hqDir: tmpDir,
        watchForChanges: false,
        extraPatterns: ['*.extra', 'temp/'],
      });
      ignore.initialize();

      expect(ignore.isIgnored('file.extra')).toBe(true);
      expect(ignore.isIgnored('temp', true)).toBe(true);

      ignore.dispose();
    });
  });

  describe('default ignore rules', () => {
    let ignore: HqIgnore;

    beforeEach(() => {
      ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();
    });

    afterEach(() => {
      ignore.dispose();
    });

    it('should ignore .env', () => {
      expect(ignore.isIgnored('.env')).toBe(true);
    });

    it('should ignore .env.local', () => {
      expect(ignore.isIgnored('.env.local')).toBe(true);
    });

    it('should ignore *.secret', () => {
      expect(ignore.isIgnored('api-key.secret')).toBe(true);
    });

    it('should ignore credentials/ directory', () => {
      expect(ignore.isIgnored('credentials', true)).toBe(true);
    });

    it('should ignore companies/*/settings/ directory', () => {
      expect(ignore.isIgnored('companies/acme/settings', true)).toBe(true);
    });

    it('should ignore node_modules/ directory', () => {
      expect(ignore.isIgnored('node_modules', true)).toBe(true);
    });

    it('should ignore .git/ directory', () => {
      expect(ignore.isIgnored('.git', true)).toBe(true);
    });

    it('should NOT ignore normal HQ files', () => {
      expect(ignore.isIgnored('INDEX.md')).toBe(false);
      expect(ignore.isIgnored('workers/registry.yaml')).toBe(false);
      expect(ignore.isIgnored('projects/my-project/prd.json')).toBe(false);
      expect(ignore.isIgnored('knowledge/hq-core/data.md')).toBe(false);
    });
  });

  describe('check() detailed results', () => {
    it('should return matched rule details', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      const result = ignore.check('.env');
      expect(result.ignored).toBe(true);
      expect(result.matchedRule).toBeDefined();
      expect(result.matchedRule!.source).toBe('builtin');

      ignore.dispose();
    });

    it('should indicate file rule source', () => {
      fs.writeFileSync(path.join(tmpDir, '.hqignore'), '*.custom\n', 'utf-8');

      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      const result = ignore.check('test.custom');
      expect(result.ignored).toBe(true);
      expect(result.matchedRule!.source).toBe(path.join(tmpDir, '.hqignore'));

      ignore.dispose();
    });
  });

  describe('.hqignore file parsing', () => {
    it('should handle comments and blank lines', () => {
      const content = [
        '# This is a comment',
        '',
        '*.tmp',
        '',
        '# Another comment',
        '*.bak',
      ].join('\n');
      fs.writeFileSync(path.join(tmpDir, '.hqignore'), content, 'utf-8');

      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      expect(ignore.isIgnored('test.tmp')).toBe(true);
      expect(ignore.isIgnored('test.bak')).toBe(true);

      ignore.dispose();
    });

    it('should support negation in .hqignore', () => {
      const content = [
        '*.log',
        '!important.log',
      ].join('\n');
      fs.writeFileSync(path.join(tmpDir, '.hqignore'), content, 'utf-8');

      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      expect(ignore.isIgnored('debug.log')).toBe(true);
      expect(ignore.isIgnored('important.log')).toBe(false);

      ignore.dispose();
    });

    it('should allow .hqignore to un-ignore built-in patterns', () => {
      // User wants to sync a specific .env file
      const content = '!.env.shared\n';
      fs.writeFileSync(path.join(tmpDir, '.hqignore'), content, 'utf-8');

      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      // .env is still ignored (builtin)
      expect(ignore.isIgnored('.env')).toBe(true);
      // .env.shared is un-ignored by the file rule
      expect(ignore.isIgnored('.env.shared')).toBe(false);

      ignore.dispose();
    });
  });

  describe('reload', () => {
    it('should reload .hqignore file', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      // No .hqignore yet - *.custom should not be ignored
      expect(ignore.isIgnored('test.custom')).toBe(false);

      // Create .hqignore
      fs.writeFileSync(path.join(tmpDir, '.hqignore'), '*.custom\n', 'utf-8');

      // Manually reload
      ignore.reload();

      expect(ignore.isIgnored('test.custom')).toBe(true);

      ignore.dispose();
    });

    it('should emit reloaded event', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      let emittedCount = -1;
      ignore.on('reloaded', (count: number) => {
        emittedCount = count;
      });

      fs.writeFileSync(path.join(tmpDir, '.hqignore'), '*.tmp\n*.bak\n', 'utf-8');
      ignore.reload();

      expect(emittedCount).toBeGreaterThan(0);

      ignore.dispose();
    });
  });

  describe('createDefaultIgnoreFile', () => {
    it('should create a .hqignore file with defaults', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      const created = ignore.createDefaultIgnoreFile();
      expect(created).toBe(true);

      const content = fs.readFileSync(path.join(tmpDir, '.hqignore'), 'utf-8');
      expect(content).toContain('.env');
      expect(content).toContain('*.secret');
      expect(content).toContain('credentials/');
      expect(content).toContain('companies/*/settings/');
      expect(content).toContain('node_modules/');

      ignore.dispose();
    });

    it('should not overwrite existing .hqignore', () => {
      const existingContent = '# Custom rules\n*.mypattern\n';
      fs.writeFileSync(path.join(tmpDir, '.hqignore'), existingContent, 'utf-8');

      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      const created = ignore.createDefaultIgnoreFile();
      expect(created).toBe(false);

      const content = fs.readFileSync(path.join(tmpDir, '.hqignore'), 'utf-8');
      expect(content).toBe(existingContent);

      ignore.dispose();
    });
  });

  describe('createChokidarFilter', () => {
    it('should return a function', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      const filter = ignore.createChokidarFilter();
      expect(typeof filter).toBe('function');

      ignore.dispose();
    });

    it('should not ignore the root directory', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      const filter = ignore.createChokidarFilter();
      expect(filter(tmpDir)).toBe(false);

      ignore.dispose();
    });

    it('should ignore .env file via filter', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      // Create the file so stat works
      fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=123', 'utf-8');

      const filter = ignore.createChokidarFilter();
      expect(filter(path.join(tmpDir, '.env'))).toBe(true);

      ignore.dispose();
    });

    it('should ignore node_modules directory via filter', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      // Create the directory so stat works
      fs.mkdirSync(path.join(tmpDir, 'node_modules'));

      const filter = ignore.createChokidarFilter();
      expect(filter(path.join(tmpDir, 'node_modules'))).toBe(true);

      ignore.dispose();
    });

    it('should not ignore normal files via filter', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();

      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Hello', 'utf-8');

      const filter = ignore.createChokidarFilter();
      expect(filter(path.join(tmpDir, 'README.md'))).toBe(false);

      ignore.dispose();
    });
  });

  describe('dispose', () => {
    it('should clean up all state', () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.initialize();
      expect(ignore.initialized).toBe(true);
      expect(ignore.ruleCount).toBeGreaterThan(0);

      ignore.dispose();
      expect(ignore.initialized).toBe(false);
      expect(ignore.ruleCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should emit error when .hqignore is unreadable', () => {
      // Create a directory where .hqignore would be (to cause read error)
      fs.mkdirSync(path.join(tmpDir, '.hqignore'));

      const errors: Error[] = [];
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: false });
      ignore.on('error', (err: Error) => errors.push(err));

      ignore.initialize();

      // Should have emitted an error but still initialized with builtin rules
      expect(errors.length).toBeGreaterThan(0);
      expect(ignore.initialized).toBe(true);

      ignore.dispose();
    });
  });

  describe('file watching', () => {
    it('should auto-reload when .hqignore changes', async () => {
      const ignore = new HqIgnore({ hqDir: tmpDir, watchForChanges: true });
      ignore.initialize();

      // Initially, *.custom is not ignored
      expect(ignore.isIgnored('file.custom')).toBe(false);

      // Create .hqignore with new pattern
      let reloaded = false;
      ignore.on('reloaded', () => {
        reloaded = true;
      });

      fs.writeFileSync(path.join(tmpDir, '.hqignore'), '*.custom\n', 'utf-8');

      // Wait for fs.watch debounce + our 100ms debounce
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(reloaded).toBe(true);
      expect(ignore.isIgnored('file.custom')).toBe(true);

      ignore.dispose();
    });
  });
});
