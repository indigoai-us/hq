import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { internal } from 'varlock';
import {
  installHqPlugin,
  prewarmHqSecrets,
  type InstallHqPluginOpts,
  type PluginState,
} from './hq-plugin.js';

// Prevent any test run from writing to ~/.hq/secrets-cache/. Each test uses a
// unique uid (random suffix) so cross-test contamination in the in-memory store
// is not possible even without clearing between tests.
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-plugin-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeMocks(overrides?: Partial<InstallHqPluginOpts>): InstallHqPluginOpts {
  return {
    resolveCompanyUid: async () => `test-uid-${Math.random().toString(36).slice(2)}`,
    fetchBatch: async () => ({ secrets: [], errors: [] }),
    ...overrides,
  };
}

describe('hq-plugin', () => {
  it('happy path: resolves hq() vars via batch fetch and cache', async () => {
    const schemaPath = path.join(tmpDir, '.env.schema');
    // Empty line after @hqCompany is required: varlock's env-spec parser only treats
    // a decorator comment as a root (file-level) decorator when it is separated from the
    // first var by a blank line. Without it, the decorator attaches to FOO as an item decorator.
    fs.writeFileSync(schemaPath, `# @hqCompany("test")\n\nFOO=hq()\n`);

    const uid = `test-uid-${Math.random().toString(36).slice(2)}`;
    const mocks = makeMocks({
      resolveCompanyUid: async () => uid,
      fetchBatch: async (_uid, names) => ({
        secrets: names.map((name) => ({ name, value: 'fixture-value' })),
        errors: [],
      }),
    });

    let state!: PluginState;
    const graph = await internal.loadEnvGraph({
      entryFilePaths: [schemaPath],
      afterInit: async (g) => {
        state = installHqPlugin(g, mocks);
      },
    });
    await prewarmHqSecrets(graph, mocks, state);
    await graph.resolveEnvValues();
    expect(graph.getResolvedEnvObject().FOO).toBe('fixture-value');
  });

  it('missing-company-error: throws when no @hqCompany and no companyOverride', async () => {
    const schemaPath = path.join(tmpDir, '.env.schema');
    // Schema has hq() resolver but no @hqCompany annotation and no opts.companyOverride
    fs.writeFileSync(schemaPath, `FOO=hq()\n`);

    const mocks = makeMocks();

    let state!: PluginState;
    const graph = await internal.loadEnvGraph({
      entryFilePaths: [schemaPath],
      afterInit: async (g) => {
        state = installHqPlugin(g, mocks);
      },
    });
    await expect(prewarmHqSecrets(graph, mocks, state)).rejects.toThrow(
      '@hqCompany("...") not declared and --company not passed',
    );
  });

  it('batch-error-passthrough-403: forbidden error is surfaced as ResolutionError', async () => {
    const schemaPath = path.join(tmpDir, '.env.schema');
    // Empty line after @hqCompany is required: varlock's env-spec parser only treats
    // a decorator comment as a root (file-level) decorator when it is separated from the
    // first var by a blank line. Without it, the decorator attaches to FOO as an item decorator.
    fs.writeFileSync(schemaPath, `# @hqCompany("test")\n\nFOO=hq()\n`);

    const uid = `test-uid-${Math.random().toString(36).slice(2)}`;
    const mocks = makeMocks({
      resolveCompanyUid: async () => uid,
      fetchBatch: async () => ({
        secrets: [],
        errors: [{ name: 'FOO', code: 'forbidden' }],
      }),
    });

    let state!: PluginState;
    const graph = await internal.loadEnvGraph({
      entryFilePaths: [schemaPath],
      afterInit: async (g) => {
        state = installHqPlugin(g, mocks);
      },
    });
    await prewarmHqSecrets(graph, mocks, state);
    await graph.resolveEnvValues();
    // varlock collects ResolutionErrors on ConfigItem.errors (not re-thrown from resolveEnvValues).
    // We verify the per-item error contains the forbidden diagnostic.
    const fooErrors = (graph as any).configSchema['FOO'].errors as Array<{ message: string }>;
    expect(fooErrors.some((e) => e.message.includes('No read permission for secret "FOO"'))).toBe(true);
  });
});
