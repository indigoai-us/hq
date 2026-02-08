import { describe, it, expect } from 'vitest';
import { parsePattern, parsePatterns, checkIgnored } from '../ignore/pattern-matcher.js';
import type { IgnoreRule } from '../ignore/types.js';

describe('pattern-matcher', () => {
  describe('parsePattern', () => {
    it('should return null for empty lines', () => {
      expect(parsePattern('', 'test')).toBeNull();
      expect(parsePattern('   ', 'test')).toBeNull();
    });

    it('should return null for comment lines', () => {
      expect(parsePattern('# this is a comment', 'test')).toBeNull();
      expect(parsePattern('  # indented comment', 'test')).toBeNull();
    });

    it('should parse a simple pattern', () => {
      const rule = parsePattern('*.log', 'test');
      expect(rule).not.toBeNull();
      expect(rule!.pattern).toBe('*.log');
      expect(rule!.negated).toBe(false);
      expect(rule!.directoryOnly).toBe(false);
      expect(rule!.source).toBe('test');
    });

    it('should detect negation patterns', () => {
      const rule = parsePattern('!important.env', 'test');
      expect(rule).not.toBeNull();
      expect(rule!.negated).toBe(true);
      expect(rule!.pattern).toBe('!important.env');
    });

    it('should detect directory-only patterns', () => {
      const rule = parsePattern('node_modules/', 'test');
      expect(rule).not.toBeNull();
      expect(rule!.directoryOnly).toBe(true);
    });

    it('should handle negated directory-only patterns', () => {
      const rule = parsePattern('!keep-this/', 'test');
      expect(rule).not.toBeNull();
      expect(rule!.negated).toBe(true);
      expect(rule!.directoryOnly).toBe(true);
    });

    it('should record the source', () => {
      const rule = parsePattern('*.tmp', '/path/to/.hqignore');
      expect(rule!.source).toBe('/path/to/.hqignore');
    });
  });

  describe('parsePatterns', () => {
    it('should parse multiple lines', () => {
      const content = [
        '# Comment',
        '*.log',
        '',
        'node_modules/',
        '!important.log',
      ].join('\n');

      const rules = parsePatterns(content, 'test');
      expect(rules).toHaveLength(3);
      expect(rules[0]!.pattern).toBe('*.log');
      expect(rules[1]!.directoryOnly).toBe(true);
      expect(rules[2]!.negated).toBe(true);
    });

    it('should handle empty content', () => {
      const rules = parsePatterns('', 'test');
      expect(rules).toHaveLength(0);
    });

    it('should handle content with only comments and blanks', () => {
      const content = '# comment\n\n# another comment\n';
      const rules = parsePatterns(content, 'test');
      expect(rules).toHaveLength(0);
    });
  });

  describe('pattern matching - simple filenames', () => {
    it('should match .env exactly', () => {
      const rules = [parsePattern('.env', 'test')!];
      expect(checkIgnored('.env', rules).ignored).toBe(true);
    });

    it('should match .env in subdirectories', () => {
      const rules = [parsePattern('.env', 'test')!];
      expect(checkIgnored('subdir/.env', rules).ignored).toBe(true);
      expect(checkIgnored('deep/nested/.env', rules).ignored).toBe(true);
    });

    it('should not match partial filename', () => {
      const rules = [parsePattern('.env', 'test')!];
      // .env should match .env but also .env/... paths
      // but should NOT match "not-env" or "file.envx"
      expect(checkIgnored('not.env.txt', rules).ignored).toBe(false);
    });
  });

  describe('pattern matching - wildcards', () => {
    it('should match * glob', () => {
      const rules = [parsePattern('*.secret', 'test')!];
      expect(checkIgnored('api.secret', rules).ignored).toBe(true);
      expect(checkIgnored('db.secret', rules).ignored).toBe(true);
      expect(checkIgnored('dir/api.secret', rules).ignored).toBe(true);
    });

    it('should not match * across directories', () => {
      const rules = [parsePattern('*.secret', 'test')!];
      // *.secret should not match paths like "foo/bar" as a whole
      expect(checkIgnored('not-secret.txt', rules).ignored).toBe(false);
    });

    it('should match .env.* pattern', () => {
      const rules = [parsePattern('.env.*', 'test')!];
      expect(checkIgnored('.env.local', rules).ignored).toBe(true);
      expect(checkIgnored('.env.production', rules).ignored).toBe(true);
      expect(checkIgnored('sub/.env.test', rules).ignored).toBe(true);
    });

    it('should match ? single character', () => {
      const rules = [parsePattern('file?.txt', 'test')!];
      expect(checkIgnored('file1.txt', rules).ignored).toBe(true);
      expect(checkIgnored('fileA.txt', rules).ignored).toBe(true);
      expect(checkIgnored('file.txt', rules).ignored).toBe(false);
      expect(checkIgnored('file12.txt', rules).ignored).toBe(false);
    });
  });

  describe('pattern matching - double star', () => {
    it('should match **/ prefix (any directory depth)', () => {
      const rules = [parsePattern('**/logs', 'test')!];
      expect(checkIgnored('logs', rules).ignored).toBe(true);
      expect(checkIgnored('a/logs', rules).ignored).toBe(true);
      expect(checkIgnored('a/b/logs', rules).ignored).toBe(true);
    });
  });

  describe('pattern matching - directory-only', () => {
    it('should match directory-only patterns for directories', () => {
      const rules = [parsePattern('node_modules/', 'test')!];
      expect(checkIgnored('node_modules', rules, true).ignored).toBe(true);
      expect(checkIgnored('sub/node_modules', rules, true).ignored).toBe(true);
    });

    it('should NOT match directory-only patterns for files', () => {
      const rules = [parsePattern('node_modules/', 'test')!];
      expect(checkIgnored('node_modules', rules, false).ignored).toBe(false);
    });

    it('should match credentials/ directory', () => {
      const rules = [parsePattern('credentials/', 'test')!];
      expect(checkIgnored('credentials', rules, true).ignored).toBe(true);
      expect(checkIgnored('deep/credentials', rules, true).ignored).toBe(true);
    });

    it('should match files inside an ignored directory via subdirectory match', () => {
      // In gitignore, ignoring a directory means all its contents are ignored
      // Our checkIgnored checks individual paths, so we match:
      // credentials/ matches 'credentials' as a dir, and also
      // the daemon skips all nested paths when the parent dir is ignored.
      // For our API, the directory pattern matches the dir itself.
      const rules = [parsePattern('credentials/', 'test')!];
      expect(checkIgnored('credentials', rules, true).ignored).toBe(true);
    });
  });

  describe('pattern matching - anchored patterns', () => {
    it('should anchor patterns with leading /', () => {
      const rules = [parsePattern('/root-only.txt', 'test')!];
      expect(checkIgnored('root-only.txt', rules).ignored).toBe(true);
      // Should NOT match in subdirectory
      expect(checkIgnored('sub/root-only.txt', rules).ignored).toBe(false);
    });

    it('should anchor patterns containing / (no leading slash)', () => {
      const rules = [parsePattern('companies/*/settings/', 'test')!];
      expect(checkIgnored('companies/acme/settings', rules, true).ignored).toBe(true);
      expect(checkIgnored('companies/globex/settings', rules, true).ignored).toBe(true);
    });
  });

  describe('pattern matching - negation', () => {
    it('should un-ignore with negation rules', () => {
      const rules = [
        parsePattern('*.log', 'test')!,
        parsePattern('!important.log', 'test')!,
      ];

      expect(checkIgnored('debug.log', rules).ignored).toBe(true);
      expect(checkIgnored('important.log', rules).ignored).toBe(false);
    });

    it('last matching rule wins', () => {
      const rules = [
        parsePattern('*.txt', 'test')!,
        parsePattern('!keep.txt', 'test')!,
        parsePattern('keep.txt', 'test')!,
      ];

      // The last rule re-ignores keep.txt
      expect(checkIgnored('keep.txt', rules).ignored).toBe(true);
    });
  });

  describe('pattern matching - companies/*/settings/', () => {
    it('should match companies/*/settings/ with any company name', () => {
      const rules = [parsePattern('companies/*/settings/', 'test')!];

      expect(checkIgnored('companies/acme/settings', rules, true).ignored).toBe(true);
      expect(checkIgnored('companies/globex/settings', rules, true).ignored).toBe(true);
      expect(checkIgnored('companies/initech/settings', rules, true).ignored).toBe(true);
    });

    it('should not match companies/*/settings/ for non-directory', () => {
      const rules = [parsePattern('companies/*/settings/', 'test')!];
      expect(checkIgnored('companies/acme/settings', rules, false).ignored).toBe(false);
    });

    it('should match nested paths under companies/*/settings/', () => {
      const rules = [parsePattern('companies/*/settings/', 'test')!];
      // The path companies/acme/settings/auth.json starts with the directory
      // Our regex matches companies/acme/settings and everything below it
      expect(checkIgnored('companies/acme/settings/auth.json', rules).ignored).toBe(true);
    });
  });

  describe('pattern matching - character classes', () => {
    it('should match character classes', () => {
      const rules = [parsePattern('file[123].txt', 'test')!];
      expect(checkIgnored('file1.txt', rules).ignored).toBe(true);
      expect(checkIgnored('file2.txt', rules).ignored).toBe(true);
      expect(checkIgnored('file3.txt', rules).ignored).toBe(true);
      expect(checkIgnored('file4.txt', rules).ignored).toBe(false);
    });
  });

  describe('pattern matching - edge cases', () => {
    it('should normalize backslashes', () => {
      const rules = [parsePattern('dir/file.txt', 'test')!];
      expect(checkIgnored('dir\\file.txt', rules).ignored).toBe(true);
    });

    it('should strip leading slashes from paths', () => {
      const rules = [parsePattern('file.txt', 'test')!];
      expect(checkIgnored('/file.txt', rules).ignored).toBe(true);
    });

    it('should return matched rule in result', () => {
      const rules = [parsePattern('*.log', 'test')!];
      const result = checkIgnored('error.log', rules);
      expect(result.ignored).toBe(true);
      expect(result.matchedRule).toBeDefined();
      expect(result.matchedRule!.pattern).toBe('*.log');
    });

    it('should return no matched rule for non-ignored paths', () => {
      const rules = [parsePattern('*.log', 'test')!];
      const result = checkIgnored('readme.md', rules);
      expect(result.ignored).toBe(false);
      expect(result.matchedRule).toBeUndefined();
    });

    it('should handle empty rules list', () => {
      const result = checkIgnored('anything.txt', []);
      expect(result.ignored).toBe(false);
    });

    it('should handle regex special characters in patterns', () => {
      const rules = [parsePattern('file.name+special(chars).txt', 'test')!];
      expect(checkIgnored('file.name+special(chars).txt', rules).ignored).toBe(true);
    });
  });

  describe('default HQ ignore patterns coverage', () => {
    function makeRulesFromPatterns(patterns: string[]): IgnoreRule[] {
      return patterns
        .map((p) => parsePattern(p, 'builtin'))
        .filter((r): r is IgnoreRule => r !== null);
    }

    const defaultPatterns = [
      '.env', '.env.*', '*.secret', 'credentials/',
      'companies/*/settings/', 'node_modules/', '.git/',
      'dist/', '.DS_Store', 'Thumbs.db',
      '.hq-sync.pid', '.hq-sync.log',
    ];
    const rules = makeRulesFromPatterns(defaultPatterns);

    it('should ignore .env', () => {
      expect(checkIgnored('.env', rules).ignored).toBe(true);
    });

    it('should ignore .env.local', () => {
      expect(checkIgnored('.env.local', rules).ignored).toBe(true);
    });

    it('should ignore .env.production', () => {
      expect(checkIgnored('.env.production', rules).ignored).toBe(true);
    });

    it('should ignore *.secret files', () => {
      expect(checkIgnored('api-key.secret', rules).ignored).toBe(true);
      expect(checkIgnored('deep/db.secret', rules).ignored).toBe(true);
    });

    it('should ignore credentials/ directory', () => {
      expect(checkIgnored('credentials', rules, true).ignored).toBe(true);
    });

    it('should ignore files under credentials/', () => {
      expect(checkIgnored('credentials/aws.json', rules).ignored).toBe(true);
    });

    it('should ignore companies/*/settings/ directory', () => {
      expect(checkIgnored('companies/acme/settings', rules, true).ignored).toBe(true);
    });

    it('should ignore files under companies/*/settings/', () => {
      expect(checkIgnored('companies/acme/settings/secrets.yaml', rules).ignored).toBe(true);
    });

    it('should ignore node_modules/', () => {
      expect(checkIgnored('node_modules', rules, true).ignored).toBe(true);
    });

    it('should ignore .git/', () => {
      expect(checkIgnored('.git', rules, true).ignored).toBe(true);
    });

    it('should ignore dist/', () => {
      expect(checkIgnored('dist', rules, true).ignored).toBe(true);
    });

    it('should ignore .DS_Store', () => {
      expect(checkIgnored('.DS_Store', rules).ignored).toBe(true);
      expect(checkIgnored('sub/.DS_Store', rules).ignored).toBe(true);
    });

    it('should ignore Thumbs.db', () => {
      expect(checkIgnored('Thumbs.db', rules).ignored).toBe(true);
    });

    it('should ignore .hq-sync.pid', () => {
      expect(checkIgnored('.hq-sync.pid', rules).ignored).toBe(true);
    });

    it('should ignore .hq-sync.log', () => {
      expect(checkIgnored('.hq-sync.log', rules).ignored).toBe(true);
    });

    it('should NOT ignore normal files', () => {
      expect(checkIgnored('README.md', rules).ignored).toBe(false);
      expect(checkIgnored('workers/registry.yaml', rules).ignored).toBe(false);
      expect(checkIgnored('projects/my-project/prd.json', rules).ignored).toBe(false);
    });
  });
});
