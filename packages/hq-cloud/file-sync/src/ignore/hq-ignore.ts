/**
 * HqIgnore - manages .hqignore file parsing, default rules,
 * and live-reloading when the ignore file changes.
 *
 * This is the main entry point for the ignore module.
 * It integrates with the sync daemon's FileWatcher by providing
 * a shouldIgnore() check and a list of patterns for chokidar.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HqIgnoreConfig, HqIgnoreEvents, IgnoreRule, IgnoreCheckResult } from './types.js';
import { DEFAULT_HQ_IGNORE_PATTERNS } from './types.js';
import { parsePatterns, parsePattern, checkIgnored } from './pattern-matcher.js';

/**
 * Typed event emitter interface for HqIgnore.
 */
export interface TypedHqIgnoreEmitter {
  on<K extends keyof HqIgnoreEvents>(event: K, listener: HqIgnoreEvents[K]): this;
  off<K extends keyof HqIgnoreEvents>(event: K, listener: HqIgnoreEvents[K]): this;
  emit<K extends keyof HqIgnoreEvents>(
    event: K,
    ...args: Parameters<HqIgnoreEvents[K]>
  ): boolean;
}

/**
 * Manages .hqignore rules with built-in defaults and live reload.
 *
 * Usage:
 * ```ts
 * const ignore = new HqIgnore({ hqDir: '/path/to/hq' });
 * ignore.initialize();
 *
 * if (ignore.isIgnored('companies/acme/settings/auth.json')) {
 *   // skip sync
 * }
 *
 * // Later:
 * ignore.dispose();
 * ```
 */
export class HqIgnore extends EventEmitter implements TypedHqIgnoreEmitter {
  private readonly config: Required<HqIgnoreConfig>;
  private builtinRules: IgnoreRule[] = [];
  private fileRules: IgnoreRule[] = [];
  private extraRules: IgnoreRule[] = [];
  private _allRules: IgnoreRule[] = [];
  private fileWatcher: fs.FSWatcher | null = null;
  private _initialized = false;

  constructor(config: HqIgnoreConfig) {
    super();
    this.config = {
      hqDir: config.hqDir,
      hqIgnorePath: config.hqIgnorePath ?? path.join(config.hqDir, '.hqignore'),
      watchForChanges: config.watchForChanges ?? true,
      extraPatterns: config.extraPatterns ?? [],
    };
  }

  /** Whether the ignore manager has been initialized */
  get initialized(): boolean {
    return this._initialized;
  }

  /** All currently active rules (builtin + file + extra) */
  get rules(): readonly IgnoreRule[] {
    return this._allRules;
  }

  /** Number of active rules */
  get ruleCount(): number {
    return this._allRules.length;
  }

  /** Path to the .hqignore file */
  get ignorePath(): string {
    return this.config.hqIgnorePath;
  }

  /**
   * Initialize the ignore manager:
   * 1. Compile built-in default rules
   * 2. Load .hqignore file (if it exists)
   * 3. Compile extra patterns
   * 4. Optionally start watching .hqignore for changes
   */
  initialize(): void {
    if (this._initialized) {
      return;
    }

    // 1. Compile built-in rules
    this.builtinRules = [];
    for (const pattern of DEFAULT_HQ_IGNORE_PATTERNS) {
      const rule = parsePattern(pattern, 'builtin');
      if (rule !== null) {
        this.builtinRules.push(rule);
      }
    }

    // 2. Load .hqignore file
    this.loadIgnoreFile();

    // 3. Compile extra patterns
    this.extraRules = [];
    for (const pattern of this.config.extraPatterns) {
      const rule = parsePattern(pattern, 'extra');
      if (rule !== null) {
        this.extraRules.push(rule);
      }
    }

    // 4. Rebuild combined rule list
    this.rebuildRules();

    // 5. Watch for changes
    if (this.config.watchForChanges) {
      this.startWatching();
    }

    this._initialized = true;
  }

  /**
   * Check if a relative path should be ignored.
   *
   * @param relativePath - Forward-slash path relative to HQ root
   * @param isDirectory - Whether the path is a directory (default: false)
   * @returns true if the path should be excluded from sync
   */
  isIgnored(relativePath: string, isDirectory = false): boolean {
    return checkIgnored(relativePath, this._allRules, isDirectory).ignored;
  }

  /**
   * Check a path and get detailed result including the matching rule.
   */
  check(relativePath: string, isDirectory = false): IgnoreCheckResult {
    return checkIgnored(relativePath, this._allRules, isDirectory);
  }

  /**
   * Get patterns formatted for chokidar's `ignored` option.
   *
   * Returns a function that chokidar can use to test paths.
   * This integrates directly with FileWatcher configuration.
   */
  createChokidarFilter(): (testPath: string) => boolean {
    const hqDir = this.config.hqDir;
    const rules = this._allRules;

    return (testPath: string): boolean => {
      // chokidar passes absolute paths
      const relativePath = path.relative(hqDir, testPath).replace(/\\/g, '/');

      // Don't ignore the root itself
      if (relativePath === '' || relativePath === '.') {
        return false;
      }

      // Check if it's a directory (best effort - check for trailing separator or stat)
      let isDir = false;
      try {
        isDir = fs.statSync(testPath).isDirectory();
      } catch {
        // File may have been deleted, treat as non-directory
      }

      return checkIgnored(relativePath, rules, isDir).ignored;
    };
  }

  /**
   * Reload the .hqignore file manually.
   * Useful if watching is disabled.
   */
  reload(): void {
    this.loadIgnoreFile();
    this.rebuildRules();
    this.emit('reloaded', this._allRules.length);
  }

  /**
   * Create a default .hqignore file in the HQ directory.
   * Does NOT overwrite if one already exists.
   *
   * @returns true if the file was created, false if it already existed
   */
  createDefaultIgnoreFile(): boolean {
    if (fs.existsSync(this.config.hqIgnorePath)) {
      return false;
    }

    const content = [
      '# HQ Cloud Sync - Ignore Patterns',
      '# Gitignore-style syntax: https://git-scm.com/docs/gitignore',
      '#',
      '# Lines starting with # are comments.',
      '# Trailing slashes match directories only.',
      '# Leading ! negates a pattern (un-ignores).',
      '# Leading / anchors to the HQ root.',
      '',
      '# ── Security-sensitive (always keep local) ──',
      '.env',
      '.env.*',
      '*.secret',
      'credentials/',
      'companies/*/settings/',
      '',
      '# ── System / noise ──',
      'node_modules/',
      '.git/',
      'dist/',
      '.DS_Store',
      'Thumbs.db',
      '',
      '# ── HQ daemon artifacts ──',
      '.hq-sync.pid',
      '.hq-sync.log',
      '',
      '# ── Add your custom patterns below ──',
      '',
    ].join('\n');

    const dir = path.dirname(this.config.hqIgnorePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.config.hqIgnorePath, content, 'utf-8');
    return true;
  }

  /**
   * Stop watching and clean up resources.
   */
  dispose(): void {
    this.stopWatching();
    this.builtinRules = [];
    this.fileRules = [];
    this.extraRules = [];
    this._allRules = [];
    this._initialized = false;
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private loadIgnoreFile(): void {
    try {
      if (fs.existsSync(this.config.hqIgnorePath)) {
        const content = fs.readFileSync(this.config.hqIgnorePath, 'utf-8');
        this.fileRules = parsePatterns(content, this.config.hqIgnorePath);
      } else {
        this.fileRules = [];
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      this.fileRules = [];
    }
  }

  private rebuildRules(): void {
    // Order: builtin first, then file rules, then extra.
    // Last match wins in gitignore semantics, so file rules can
    // override builtins, and extra patterns can override both.
    this._allRules = [
      ...this.builtinRules,
      ...this.fileRules,
      ...this.extraRules,
    ];
  }

  private startWatching(): void {
    this.stopWatching();

    try {
      // Watch the directory containing .hqignore
      const dir = path.dirname(this.config.hqIgnorePath);
      const filename = path.basename(this.config.hqIgnorePath);

      if (!fs.existsSync(dir)) {
        return;
      }

      this.fileWatcher = fs.watch(dir, (_eventType, changedFile) => {
        if (changedFile === filename) {
          // Debounce slightly to avoid double-fires
          setTimeout(() => {
            this.reload();
          }, 100);
        }
      });

      this.fileWatcher.on('error', (err: Error) => {
        this.emit('error', err);
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
    }
  }

  private stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
  }
}
