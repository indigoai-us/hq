/**
 * Gitignore-style pattern compiler and matcher.
 *
 * Converts gitignore patterns into RegExp objects and provides
 * a check function for testing paths against compiled rules.
 *
 * Supports:
 * - `*` matches anything except `/`
 * - `**` matches anything including `/` (directory traversal)
 * - `?` matches a single character except `/`
 * - `[abc]` character classes
 * - `!` negation (un-ignore)
 * - Trailing `/` to match directories only
 * - Leading `/` to anchor to root
 * - `#` comments and blank lines are skipped
 */

import type { IgnoreRule, IgnoreCheckResult } from './types.js';

/**
 * Parse a single gitignore pattern line into an IgnoreRule, or null
 * if the line is a comment or blank.
 */
export function parsePattern(line: string, source: string): IgnoreRule | null {
  // Trim whitespace from both sides
  let pattern = line.trim();

  // Skip blank lines and comments
  if (pattern === '' || pattern.startsWith('#')) {
    return null;
  }

  // Detect negation
  let negated = false;
  if (pattern.startsWith('!')) {
    negated = true;
    pattern = pattern.slice(1);
  }

  // Detect directory-only patterns (trailing /)
  let directoryOnly = false;
  if (pattern.endsWith('/')) {
    directoryOnly = true;
    pattern = pattern.slice(0, -1);
  }

  // Build the regexes
  const { full, exact } = patternToRegex(pattern);

  return {
    pattern: line.trim(),
    regex: full,
    dirExactRegex: exact,
    negated,
    directoryOnly,
    source,
  };
}

/**
 * Convert a gitignore glob pattern to a RegExp.
 *
 * Gitignore rules:
 * - If the pattern contains a `/` (not trailing), it's relative to root.
 * - If no `/`, it can match in any directory.
 * - `**` matches zero or more directories.
 * - `*` matches anything except `/`.
 * - `?` matches one character except `/`.
 */
function patternToRegex(pattern: string): { full: RegExp; exact: RegExp } {
  // Determine if the pattern is anchored to root
  let anchored = false;
  let workPattern = pattern;

  if (workPattern.startsWith('/')) {
    anchored = true;
    workPattern = workPattern.slice(1);
  } else if (workPattern.includes('/')) {
    // Pattern contains a slash (not leading), so it's anchored
    anchored = true;
  }

  // Convert the glob pattern to regex
  let regexStr = '';
  let i = 0;

  while (i < workPattern.length) {
    const char = workPattern[i]!;

    if (char === '*') {
      if (workPattern[i + 1] === '*') {
        // ** pattern
        if (workPattern[i + 2] === '/') {
          // **/ matches zero or more directories
          regexStr += '(?:.+/)?';
          i += 3;
        } else if (i + 2 === workPattern.length) {
          // trailing ** matches everything
          regexStr += '.*';
          i += 2;
        } else {
          // ** in middle without trailing slash
          regexStr += '.*';
          i += 2;
        }
      } else {
        // Single * matches anything except /
        regexStr += '[^/]*';
        i += 1;
      }
    } else if (char === '?') {
      regexStr += '[^/]';
      i += 1;
    } else if (char === '[') {
      // Character class - find the closing bracket
      const closeBracket = workPattern.indexOf(']', i + 1);
      if (closeBracket === -1) {
        // No closing bracket, treat literally
        regexStr += '\\[';
        i += 1;
      } else {
        regexStr += workPattern.slice(i, closeBracket + 1);
        i = closeBracket + 1;
      }
    } else if ('.+^${}()|\\'.includes(char)) {
      // Escape regex special characters
      regexStr += '\\' + char;
      i += 1;
    } else {
      regexStr += char;
      i += 1;
    }
  }

  // Apply anchoring
  // full: matches the pattern and any child paths (for directory content matching)
  // exact: matches only the exact pattern (no child paths)
  if (anchored) {
    return {
      full: new RegExp('^' + regexStr + '(?:/.*)?$'),
      exact: new RegExp('^' + regexStr + '$'),
    };
  } else {
    return {
      full: new RegExp('(?:^|/)' + regexStr + '(?:/.*)?$'),
      exact: new RegExp('(?:^|/)' + regexStr + '$'),
    };
  }
}

/**
 * Parse multiple pattern lines (e.g., .hqignore file content).
 */
export function parsePatterns(content: string, source: string): IgnoreRule[] {
  const lines = content.split('\n');
  const rules: IgnoreRule[] = [];

  for (const line of lines) {
    const rule = parsePattern(line, source);
    if (rule !== null) {
      rules.push(rule);
    }
  }

  return rules;
}

/**
 * Check whether a given relative path is ignored by a set of rules.
 *
 * Rules are evaluated in order (last match wins, gitignore semantics).
 * Negation rules (!) can un-ignore previously ignored paths.
 *
 * @param relativePath - Forward-slash separated path relative to HQ root
 * @param rules - Ordered list of ignore rules
 * @param isDirectory - Whether the path is a directory
 */
export function checkIgnored(
  relativePath: string,
  rules: IgnoreRule[],
  isDirectory = false,
): IgnoreCheckResult {
  // Normalize path: ensure forward slashes, no leading /
  const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\//, '');

  let ignored = false;
  let matchedRule: IgnoreRule | undefined;

  for (const rule of rules) {
    if (!rule.regex.test(normalizedPath)) {
      continue;
    }

    // Directory-only rules (trailing / in pattern):
    // In gitignore, "credentials/" means ignore the directory itself AND
    // everything inside it. So:
    //   - "credentials" (isDirectory=true) -> match
    //   - "credentials/aws.json" (isDirectory=false) -> match (child of dir)
    //   - "credentials" (isDirectory=false) -> skip (it's a file named "credentials")
    if (rule.directoryOnly && !isDirectory) {
      // Only match if this path is INSIDE the ignored directory,
      // i.e., the regex matched because of the (?:/.*)?$ suffix catching a child path.
      // We detect this by checking if the path contains a '/' that would indicate nesting.
      // Use the dirRegex (without the child suffix) to test the exact match.
      if (rule.dirExactRegex.test(normalizedPath)) {
        // Exact match on a non-directory -> skip (file named same as the pattern)
        continue;
      }
      // Otherwise it's a child path -> fall through to match
    }

    if (rule.negated) {
      ignored = false;
      matchedRule = rule;
    } else {
      ignored = true;
      matchedRule = rule;
    }
  }

  return { ignored, matchedRule };
}
