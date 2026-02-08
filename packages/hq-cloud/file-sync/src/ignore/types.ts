/**
 * Types for the .hqignore selective sync module.
 *
 * Provides gitignore-style pattern matching for excluding
 * files and directories from HQ Cloud sync.
 */

/** A single parsed ignore rule */
export interface IgnoreRule {
  /** Original pattern string from .hqignore */
  pattern: string;
  /** Compiled regex for matching (includes (?:/.*)?$ for child path matching) */
  regex: RegExp;
  /** Regex that matches only the exact directory name, not children (used for directoryOnly rules) */
  dirExactRegex: RegExp;
  /** Whether this is a negation rule (starts with !) */
  negated: boolean;
  /** Whether this rule only matches directories (ends with /) */
  directoryOnly: boolean;
  /** Source of this rule (built-in or file path) */
  source: string;
}

/** Result of checking a path against ignore rules */
export interface IgnoreCheckResult {
  /** Whether the path is ignored */
  ignored: boolean;
  /** The rule that matched (if any) */
  matchedRule?: IgnoreRule;
}

/** Configuration for the HqIgnore instance */
export interface HqIgnoreConfig {
  /** Absolute path to the HQ root directory */
  hqDir: string;
  /** Path to the .hqignore file (default: {hqDir}/.hqignore) */
  hqIgnorePath?: string;
  /** Whether to watch .hqignore for changes (default: true) */
  watchForChanges?: boolean;
  /** Additional patterns to add on top of defaults and .hqignore */
  extraPatterns?: string[];
}

/** Events emitted by the HqIgnore manager */
export interface HqIgnoreEvents {
  /** .hqignore file was reloaded */
  reloaded: (ruleCount: number) => void;
  /** Error occurred while reading/watching .hqignore */
  error: (error: Error) => void;
}

/** Default patterns that are always ignored (security-sensitive + noise) */
export const DEFAULT_HQ_IGNORE_PATTERNS: readonly string[] = [
  // Security-sensitive
  '.env',
  '.env.*',
  '*.secret',
  'credentials/',
  'companies/*/settings/',

  // System / noise
  'node_modules/',
  '.git/',
  'dist/',
  '.DS_Store',
  'Thumbs.db',

  // HQ daemon artifacts
  '.hq-sync.pid',
  '.hq-sync.log',
] as const;
