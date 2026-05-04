import { beforeAll, describe, expect, it } from 'vitest';
import { internal } from 'varlock';
// Resolver is a type-only export in varlock@1.0.0's plugin-lib.js (d.ts/JS mismatch);
// the value is extracted at runtime from graph.registeredResolverFunctions below.
import type { Resolver } from 'varlock/plugin-lib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RuntimeResolver: typeof Resolver;

beforeAll(async () => {
  // Spin up a minimal graph to access built-in resolvers registered by varlock.
  // No schema files are needed — varlock registers built-in resolvers in afterInit.
  await internal.loadEnvGraph({
    entryFilePaths: [],
    afterInit: async (graph) => {
      const fns = (graph as any).registeredResolverFunctions as Record<string, unknown>;
      const firstClass = Object.values(fns)[0];
      if (firstClass == null) throw new Error('registeredResolverFunctions is empty — varlock API shape changed');
      // Each registered class extends Resolver; its prototype chain gives us the base class.
      RuntimeResolver = Object.getPrototypeOf(firstClass) as typeof Resolver;
    },
  });
});

describe('varlock 1.0.0 API shape smoke test', () => {
  it('internal.loadEnvGraph is a function', () => {
    expect(typeof internal.loadEnvGraph).toBe('function');
  });

  it('internal.EnvGraph is a function (class)', () => {
    expect(typeof internal.EnvGraph).toBe('function');
  });

  it('EnvGraph.prototype.registerRootDecorator exists', () => {
    expect(typeof internal.EnvGraph.prototype.registerRootDecorator).toBe('function');
  });

  it('EnvGraph.prototype.registerResolver exists', () => {
    expect(typeof internal.EnvGraph.prototype.registerResolver).toBe('function');
  });

  it('EnvGraph.prototype.registerItemDecorator exists', () => {
    expect(typeof internal.EnvGraph.prototype.registerItemDecorator).toBe('function');
  });

  it('EnvGraph.prototype.registerDataType exists', () => {
    expect(typeof internal.EnvGraph.prototype.registerDataType).toBe('function');
  });

  it('Resolver.prototype.process exists', () => {
    expect(typeof RuntimeResolver.prototype.process).toBe('function');
  });

  it('Resolver.prototype.resolve exists', () => {
    expect(typeof RuntimeResolver.prototype.resolve).toBe('function');
  });
});
