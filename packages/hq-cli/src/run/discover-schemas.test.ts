import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverSchemas } from './discover-schemas.js';

let tmpDir: string;

// Helper: create directory + optional files inside it.
function mkDir(...segments: string[]): string {
  const dir = path.join(tmpDir, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

// Every temp tree gets a .git/ at the root so the walk-up never escapes tmpDir.
function makeRoot(): string {
  const root = mkDir('root');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

const SCHEMA_CO_A = '# @hqCompany("co-a")\n\nFOO=hq()\n';
const SCHEMA_CO_B = '# @hqCompany("co-b")\n\nBAR=hq()\n';
const SCHEMA_CO_E = '# @hqCompany("co-e")\n\nFOO=hq()\n';
const SCHEMA_CO_F = '# @hqCompany("co-f")\n\nFOO=hq()\n';
const SCHEMA_CO_G = '# @hqCompany("co-g")\n\nFOO=hq()\n';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-schemas-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('discoverSchemas', () => {
  // (a) Single schema in cwd — schemaPaths length 1, envLocalPaths length 0, slug matches.
  it('(a) single schema in cwd', () => {
    const root = makeRoot();
    const cwd = mkDir('root', 'cwd');
    writeFile(cwd, '.env.schema', SCHEMA_CO_A);

    const result = discoverSchemas(cwd);

    expect(result.schemaPaths).toHaveLength(1);
    expect(result.schemaPaths[0]).toBe(path.join(cwd, '.env.schema'));
    expect(result.envLocalPaths).toHaveLength(0);
    expect(result.companySlug).toBe('co-a');
    expect(result.conflict).toBeNull();
  });

  // (b) Parent + child both have schemas with same slug — schemaPaths length 2 (parent first, child last).
  it('(b) parent and child schemas with same slug', () => {
    const root = makeRoot();
    const parent = mkDir('root', 'parent');
    const child = mkDir('root', 'parent', 'child');
    writeFile(parent, '.env.schema', SCHEMA_CO_A);
    writeFile(child, '.env.schema', SCHEMA_CO_A);

    const result = discoverSchemas(child);

    expect(result.schemaPaths).toHaveLength(2);
    expect(result.schemaPaths[0]).toBe(path.join(parent, '.env.schema')); // parent first
    expect(result.schemaPaths[1]).toBe(path.join(child, '.env.schema'));  // child last (cwd-closest)
    expect(result.companySlug).toBe('co-a');
    expect(result.conflict).toBeNull();
  });

  // (c) Parent has slug A, child has slug B — conflict reported with both paths and both slugs.
  it('(c) conflicting slugs', () => {
    const root = makeRoot();
    const parent = mkDir('root', 'parent');
    const child = mkDir('root', 'parent', 'child');
    writeFile(parent, '.env.schema', SCHEMA_CO_A);
    writeFile(child, '.env.schema', SCHEMA_CO_B);

    const result = discoverSchemas(child);

    expect(result.schemaPaths).toHaveLength(2);
    expect(result.companySlug).toBeNull();
    expect(result.conflict).not.toBeNull();
    expect(result.conflict!.paths).toContain(path.join(parent, '.env.schema'));
    expect(result.conflict!.paths).toContain(path.join(child, '.env.schema'));
    expect(result.conflict!.slugs).toContain('co-a');
    expect(result.conflict!.slugs).toContain('co-b');
  });

  // (d) No schema found from cwd up — empty result.
  it('(d) no schema found', () => {
    const root = makeRoot();
    const cwd = mkDir('root', 'cwd');

    const result = discoverSchemas(cwd);

    expect(result.schemaPaths).toHaveLength(0);
    expect(result.envLocalPaths).toHaveLength(0);
    expect(result.companySlug).toBeNull();
    expect(result.conflict).toBeNull();
  });

  // (e) Schema at cwd PLUS sibling .env.local — schemaPaths length 1, envLocalPaths length 1.
  it('(e) schema with sibling .env.local', () => {
    const root = makeRoot();
    const cwd = mkDir('root', 'cwd');
    writeFile(cwd, '.env.schema', SCHEMA_CO_E);
    writeFile(cwd, '.env.local', 'FOO=local-override\n');

    const result = discoverSchemas(cwd);

    expect(result.schemaPaths).toHaveLength(1);
    expect(result.envLocalPaths).toHaveLength(1);
    expect(result.envLocalPaths[0]).toBe(path.join(cwd, '.env.local'));
    expect(result.companySlug).toBe('co-e');
  });

  // (f) Repo-root has .env.schema next to .git/, cwd is grandchild — schemaPaths length 1
  //     pointing at repo-root (.git/-containing dir IS included).
  it('(f) schema at .git root, cwd is grandchild', () => {
    const root = makeRoot(); // root has .git/ already
    writeFile(root, '.env.schema', SCHEMA_CO_F);
    const child = mkDir('root', 'child');
    const grandchild = mkDir('root', 'child', 'grandchild');

    const result = discoverSchemas(grandchild);

    expect(result.schemaPaths).toHaveLength(1);
    expect(result.schemaPaths[0]).toBe(path.join(root, '.env.schema'));
    expect(result.companySlug).toBe('co-f');
  });

  // (g) Parent has .env.local but no schema, child has schema — envLocalPaths length 0
  //     (.env.local collected ONLY when next to a .env.schema).
  it('(g) .env.local without schema in parent is ignored', () => {
    const root = makeRoot();
    const parent = mkDir('root', 'parent');
    const child = mkDir('root', 'parent', 'child');
    writeFile(parent, '.env.local', 'PARENT_ONLY=1\n');
    writeFile(child, '.env.schema', SCHEMA_CO_G);

    const result = discoverSchemas(child);

    expect(result.schemaPaths).toHaveLength(1);
    expect(result.envLocalPaths).toHaveLength(0);
    expect(result.companySlug).toBe('co-g');
  });
});
