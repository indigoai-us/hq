import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { internal } from 'varlock';
import { discoverSchemas } from '../run/discover-schemas.js';
import { installHqPlugin, prewarmHqSecrets, type PluginState } from '../run/hq-plugin.js';

vi.mock('../utils/secrets-cache.js', () => {
  const store = new Map<string, string>();
  return {
    readCache: (uid: string, name: string): string | null =>
      store.get(`${uid}\0${name}`) ?? null,
    writeCache: (uid: string, name: string, value: string): void => {
      store.set(`${uid}\0${name}`, value);
    },
    removeCacheEntry: (): void => {},
    clearAllCache: (): { removed: number } => ({ removed: 0 }),
  };
});

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hq-run-envlocal-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('.env.local overrides hq()-resolved value', async () => {
  // Blank line after @hqCompany required: varlock only treats it as a root (file-level)
  // decorator when separated from the first var by a blank line.
  writeFileSync(join(dir, '.env.schema'), '# @hqCompany("indigo")\n\n# @required\nKEY=hq()\n');
  writeFileSync(join(dir, '.env.local'), 'KEY=local-value\n');

  const result = discoverSchemas(dir);
  expect(result.schemaPaths).toEqual([join(dir, '.env.schema')]);
  expect(result.envLocalPaths).toEqual([join(dir, '.env.local')]);

  const paths = [...result.schemaPaths, ...result.envLocalPaths];
  const opts = {
    companyOverride: undefined,
    resolveCompanyUid: async () => 'fake-uid',
    // fetchBatch returns "vault-value" — if .env.local is correctly wired,
    // graph resolution should still surface "local-value" because the local
    // file wins precedence.
    fetchBatch: async () => ({ secrets: [{ name: 'KEY', value: 'vault-value' }], errors: [] }),
  };

  let state!: PluginState;
  const graph = await internal.loadEnvGraph({
    entryFilePaths: paths,
    afterInit: (g) => { state = installHqPlugin(g, opts); },
  });
  await prewarmHqSecrets(graph, opts, state);
  await graph.resolveEnvValues();
  expect(graph.getResolvedEnvObject().KEY).toBe('local-value');
});

test('without .env.local, vault value is returned', async () => {
  writeFileSync(join(dir, '.env.schema'), '# @hqCompany("indigo")\n\n# @required\nKEY=hq()\n');

  const result = discoverSchemas(dir);
  expect(result.schemaPaths).toEqual([join(dir, '.env.schema')]);
  expect(result.envLocalPaths).toEqual([]);

  const paths = [...result.schemaPaths, ...result.envLocalPaths];
  const opts = {
    companyOverride: undefined,
    resolveCompanyUid: async () => 'fake-uid',
    fetchBatch: async () => ({ secrets: [{ name: 'KEY', value: 'vault-value' }], errors: [] }),
  };

  let state!: PluginState;
  const graph = await internal.loadEnvGraph({
    entryFilePaths: paths,
    afterInit: (g) => { state = installHqPlugin(g, opts); },
  });
  await prewarmHqSecrets(graph, opts, state);
  await graph.resolveEnvValues();
  expect(graph.getResolvedEnvObject().KEY).toBe('vault-value');
});
