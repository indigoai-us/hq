/**
 * Unit tests for dep-resolver.ts (US-011)
 *
 * Tests use node:test + node:assert/strict.
 * The resolver is pure (async callbacks injected), so no FS or network needed.
 *
 * Run: node --test dist/utils/dep-resolver.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveDependencies, CyclicDependencyError } from './dep-resolver.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build fetchDeps from a simple dependency map. */
function makeFetchDeps(
  deps: Record<string, string[]>
): (name: string) => Promise<string[]> {
  return async (name: string) => deps[name] ?? [];
}

/** Build checkInstalled from a set of installed package names. */
function makeCheckInstalled(
  installed: Set<string>
): (name: string) => Promise<boolean> {
  return async (name: string) => installed.has(name);
}

/** No packages installed. */
const noneInstalled = makeCheckInstalled(new Set());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('dep-resolver — resolveDependencies', () => {

  it('Given A requires B, when resolving A, then B appears in output', async () => {
    // A → B (A depends on B, so B must install first)
    const fetchDeps = makeFetchDeps({ A: ['B'], B: [] });

    const result = await resolveDependencies('A', fetchDeps, noneInstalled);

    assert.ok(result.includes('B'), 'B should be in output');
    // A itself is NOT in output (caller installs it)
    assert.ok(!result.includes('A'), 'A (rootPackage) should not be in output');
  });

  it('Given A requires B and B requires A (cycle), when resolving A, then CyclicDependencyError is thrown', async () => {
    const fetchDeps = makeFetchDeps({ A: ['B'], B: ['A'] });

    await assert.rejects(
      () => resolveDependencies('A', fetchDeps, noneInstalled),
      (err: unknown) => {
        assert.ok(err instanceof CyclicDependencyError, 'Expected CyclicDependencyError');
        assert.ok(
          err.cycle.length >= 2,
          `Cycle array should have at least 2 entries, got: ${JSON.stringify(err.cycle)}`
        );
        // The cycle should contain both A and B
        assert.ok(
          err.cycle.includes('A') && err.cycle.includes('B'),
          `Cycle should include A and B, got: ${JSON.stringify(err.cycle)}`
        );
        return true;
      }
    );
  });

  it('Given A requires B and B is already installed, when resolving A, then result is empty', async () => {
    const fetchDeps = makeFetchDeps({ A: ['B'], B: [] });
    const checkInstalled = makeCheckInstalled(new Set(['B']));

    const result = await resolveDependencies('A', fetchDeps, checkInstalled);

    assert.equal(result.length, 0, 'B should be skipped since it is already installed');
  });

  it('Given A requires B, B requires C (transitive), when resolving A, then C comes before B in output', async () => {
    // A → B → C: install order must be C, B
    const fetchDeps = makeFetchDeps({ A: ['B'], B: ['C'], C: [] });

    const result = await resolveDependencies('A', fetchDeps, noneInstalled);

    assert.ok(result.includes('B'), 'B should be in output');
    assert.ok(result.includes('C'), 'C should be in output');
    assert.ok(!result.includes('A'), 'A (rootPackage) should not be in output');

    const idxC = result.indexOf('C');
    const idxB = result.indexOf('B');
    assert.ok(idxC < idxB, `C (index ${idxC}) must come before B (index ${idxB})`);
  });

  it('Given A requires no packages, when resolving A, then result is empty', async () => {
    const fetchDeps = makeFetchDeps({ A: [] });

    const result = await resolveDependencies('A', fetchDeps, noneInstalled);

    assert.equal(result.length, 0, 'No deps means empty result');
  });

});
