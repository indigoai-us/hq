/**
 * Regression tests for manifest path resolution.
 *
 * Bug caught during hq-core-split S3 testing (2026-04-21): prior to this
 * fix, `getManifestPath()` returned a flat path (`{hqRoot}/modules.yaml`),
 * but real HQ installs use the nested layout (`{hqRoot}/modules/modules.yaml`).
 * Running `hq install` against a real HQ would silently create a shadow
 * manifest at the root, orphaning the canonical nested one.
 *
 * These tests lock in:
 *   1. Nested layout is preferred when it exists.
 *   2. Flat layout is honored when (and only when) it already exists.
 *   3. Fresh HQs default to writing the nested form — never shadow-writing
 *      a root-level `modules.yaml`.
 *   4. Read/write round-trips correctly against the nested layout.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import {
  addModule,
  getManifestPath,
  readManifest,
  writeManifest,
} from './manifest.js';
import type { ModulesManifest } from '../types.js';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-manifest-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const sampleManifest: ModulesManifest = {
  version: '1',
  modules: [
    {
      name: 'knowledge-public-hq-core',
      repo: 'https://github.com/indigoai-us/knowledge-public-hq-core.git',
      strategy: 'link',
      paths: [
        {
          src: '.',
          dest: 'knowledge/public/hq-core',
        },
      ],
    },
  ],
};

describe('getManifestPath', () => {
  it('prefers nested modules/modules.yaml when it exists', () => {
    const nested = path.join(tmpRoot, 'modules', 'modules.yaml');
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.writeFileSync(nested, yaml.dump(sampleManifest));

    expect(getManifestPath(tmpRoot)).toBe(nested);
  });

  it('honors legacy flat modules.yaml when only the flat form exists', () => {
    // Legacy fixtures / very old HQ instances may pre-date the nested layout.
    const flat = path.join(tmpRoot, 'modules.yaml');
    fs.writeFileSync(flat, yaml.dump(sampleManifest));

    expect(getManifestPath(tmpRoot)).toBe(flat);
  });

  it('defaults to nested path on a fresh HQ (neither file exists)', () => {
    // Regression: previously returned the flat path, which meant writeManifest
    // created a shadow root-level manifest on real HQs.
    expect(getManifestPath(tmpRoot)).toBe(
      path.join(tmpRoot, 'modules', 'modules.yaml'),
    );
  });
});

describe('readManifest / writeManifest round-trip', () => {
  it('round-trips against the nested layout', () => {
    writeManifest(tmpRoot, sampleManifest);

    const nested = path.join(tmpRoot, 'modules', 'modules.yaml');
    expect(fs.existsSync(nested)).toBe(true);

    const roundTripped = readManifest(tmpRoot);
    expect(roundTripped).toEqual(sampleManifest);
  });

  it('writes into the nested modules/ dir on fresh HQs (creates dir)', () => {
    // The nested dir does not exist yet — writeManifest must mkdir-p.
    expect(fs.existsSync(path.join(tmpRoot, 'modules'))).toBe(false);

    writeManifest(tmpRoot, sampleManifest);

    expect(fs.existsSync(path.join(tmpRoot, 'modules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'modules', 'modules.yaml'))).toBe(
      true,
    );
  });

  it('does NOT shadow-write a root-level modules.yaml on fresh HQs', () => {
    // This is the original bug: pre-fix, writeManifest on a fresh HQ created
    // `{hqRoot}/modules.yaml`, which shadowed the canonical nested manifest.
    writeManifest(tmpRoot, sampleManifest);

    expect(fs.existsSync(path.join(tmpRoot, 'modules.yaml'))).toBe(false);
  });

  it('rewrites into the flat layout when flat already exists (legacy compat)', () => {
    const flat = path.join(tmpRoot, 'modules.yaml');
    fs.writeFileSync(flat, yaml.dump({ version: '1', modules: [] }));

    writeManifest(tmpRoot, sampleManifest);

    // Flat stays flat; no silent migration to nested, no shadow write.
    expect(fs.existsSync(flat)).toBe(true);
    expect(
      fs.existsSync(path.join(tmpRoot, 'modules', 'modules.yaml')),
    ).toBe(false);

    const reread = readManifest(tmpRoot);
    expect(reread).toEqual(sampleManifest);
  });
});

describe('addModule', () => {
  it('appends to the existing nested manifest without creating a flat shadow', () => {
    writeManifest(tmpRoot, sampleManifest);

    addModule(tmpRoot, {
      name: 'knowledge-public-testing',
      repo: 'https://github.com/indigoai-us/knowledge-public-testing.git',
      strategy: 'link',
      paths: [{ src: '.', dest: 'knowledge/public/testing' }],
    });

    const after = readManifest(tmpRoot);
    expect(after?.modules).toHaveLength(2);
    expect(fs.existsSync(path.join(tmpRoot, 'modules.yaml'))).toBe(false);
  });
});
