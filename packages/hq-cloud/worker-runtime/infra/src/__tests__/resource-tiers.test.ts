/**
 * Tests for Worker Resource Scaling Configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isValidResourceTier,
  getTierSpec,
  getAllTierSpecs,
  getDefaultTierForWorker,
  resolveResourceTier,
  resolveResourceTierSpec,
  buildTierOverrides,
  mergeTierOverrides,
  configureWorkerTypeDefaults,
  setWorkerTypeTierDefault,
  getWorkerTypeDefaults,
  estimateTierCostPerHour,
  describeTier,
} from '../resource-tiers.js';
import {
  RESOURCE_TIERS,
  DEFAULT_RESOURCE_TIER,
} from '../../../types/infra/index.js';
import type {
  SpawnTaskInput,
  ResourceTier,
} from '../../../types/infra/index.js';
import type { TaskOverrides } from '../run-task.js';

/**
 * Create a minimal spawn input for testing
 */
function createSpawnInput(overrides: Partial<SpawnTaskInput> = {}): SpawnTaskInput {
  return {
    trackingId: 'spawn-test-abc',
    workerId: 'test-worker',
    skill: 'test-skill',
    parameters: {},
    hqApiUrl: 'https://api.hq.test',
    hqApiKey: 'test-key',
    ...overrides,
  };
}

describe('isValidResourceTier', () => {
  it('accepts valid tier names', () => {
    expect(isValidResourceTier('small')).toBe(true);
    expect(isValidResourceTier('medium')).toBe(true);
    expect(isValidResourceTier('large')).toBe(true);
  });

  it('rejects invalid tier names', () => {
    expect(isValidResourceTier('tiny')).toBe(false);
    expect(isValidResourceTier('xlarge')).toBe(false);
    expect(isValidResourceTier('')).toBe(false);
    expect(isValidResourceTier('SMALL')).toBe(false);
    expect(isValidResourceTier('Medium')).toBe(false);
  });
});

describe('getTierSpec', () => {
  it('returns correct spec for small tier', () => {
    const spec = getTierSpec('small');
    expect(spec.tier).toBe('small');
    expect(spec.cpu).toBe(512);
    expect(spec.memory).toBe(1024);
    expect(spec.description).toBe('0.5 vCPU / 1 GB');
  });

  it('returns correct spec for medium tier', () => {
    const spec = getTierSpec('medium');
    expect(spec.tier).toBe('medium');
    expect(spec.cpu).toBe(1024);
    expect(spec.memory).toBe(2048);
    expect(spec.description).toBe('1 vCPU / 2 GB');
  });

  it('returns correct spec for large tier', () => {
    const spec = getTierSpec('large');
    expect(spec.tier).toBe('large');
    expect(spec.cpu).toBe(2048);
    expect(spec.memory).toBe(4096);
    expect(spec.description).toBe('2 vCPU / 4 GB');
  });
});

describe('getAllTierSpecs', () => {
  it('returns all three tier specs', () => {
    const specs = getAllTierSpecs();
    expect(specs).toHaveLength(3);
    expect(specs.map((s) => s.tier)).toContain('small');
    expect(specs.map((s) => s.tier)).toContain('medium');
    expect(specs.map((s) => s.tier)).toContain('large');
  });
});

describe('RESOURCE_TIERS constant', () => {
  it('small matches acceptance criteria: 0.5 vCPU / 1 GB', () => {
    expect(RESOURCE_TIERS.small.cpu).toBe(512);  // 0.5 vCPU
    expect(RESOURCE_TIERS.small.memory).toBe(1024);  // 1 GB
  });

  it('medium matches acceptance criteria: 1 vCPU / 2 GB', () => {
    expect(RESOURCE_TIERS.medium.cpu).toBe(1024);  // 1 vCPU
    expect(RESOURCE_TIERS.medium.memory).toBe(2048);  // 2 GB
  });

  it('large matches acceptance criteria: 2 vCPU / 4 GB', () => {
    expect(RESOURCE_TIERS.large.cpu).toBe(2048);  // 2 vCPU
    expect(RESOURCE_TIERS.large.memory).toBe(4096);  // 4 GB
  });

  it('all tiers use valid Fargate CPU/memory combinations', () => {
    // These are well-known valid combos from the AWS docs
    const validCombinations: Record<number, number[]> = {
      512: [1024, 2048, 3072, 4096],
      1024: [2048, 3072, 4096, 5120, 6144, 7168, 8192],
      2048: [4096, 5120, 6144, 7168, 8192, 16384],
    };

    for (const spec of Object.values(RESOURCE_TIERS)) {
      const validMemory = validCombinations[spec.cpu];
      expect(validMemory).toBeDefined();
      expect(validMemory).toContain(spec.memory);
    }
  });
});

describe('getDefaultTierForWorker', () => {
  afterEach(() => {
    // Reset to builtin defaults after each test
    configureWorkerTypeDefaults();
  });

  it('returns medium for backend-dev', () => {
    expect(getDefaultTierForWorker('backend-dev')).toBe('medium');
  });

  it('returns medium for frontend-dev', () => {
    expect(getDefaultTierForWorker('frontend-dev')).toBe('medium');
  });

  it('returns medium for infra-dev', () => {
    expect(getDefaultTierForWorker('infra-dev')).toBe('medium');
  });

  it('returns medium for architect', () => {
    expect(getDefaultTierForWorker('architect')).toBe('medium');
  });

  it('returns medium for database-dev', () => {
    expect(getDefaultTierForWorker('database-dev')).toBe('medium');
  });

  it('returns small for code-reviewer', () => {
    expect(getDefaultTierForWorker('code-reviewer')).toBe('small');
  });

  it('returns small for dev-qa-tester', () => {
    expect(getDefaultTierForWorker('dev-qa-tester')).toBe('small');
  });

  it('returns small for content workers', () => {
    expect(getDefaultTierForWorker('content-brand')).toBe('small');
    expect(getDefaultTierForWorker('content-sales')).toBe('small');
    expect(getDefaultTierForWorker('content-product')).toBe('small');
  });

  it('returns small for social workers', () => {
    expect(getDefaultTierForWorker('x-stefan')).toBe('small');
    expect(getDefaultTierForWorker('linkedin-stefan')).toBe('small');
  });

  it('returns fallback for unknown worker type', () => {
    expect(getDefaultTierForWorker('unknown-worker')).toBe('small');
  });

  it('matches worker IDs with team prefix (e.g., dev-team/backend-dev)', () => {
    expect(getDefaultTierForWorker('dev-team/backend-dev')).toBe('medium');
    expect(getDefaultTierForWorker('dev-team/code-reviewer')).toBe('small');
  });

  it('is case-insensitive', () => {
    expect(getDefaultTierForWorker('Backend-Dev')).toBe('medium');
    expect(getDefaultTierForWorker('CONTENT-brand')).toBe('small');
  });
});

describe('resolveResourceTier', () => {
  afterEach(() => {
    configureWorkerTypeDefaults();
  });

  it('uses explicit tier when provided', () => {
    const input = createSpawnInput({
      workerId: 'code-reviewer',
      resourceTier: 'large',
    });
    expect(resolveResourceTier(input)).toBe('large');
  });

  it('falls back to worker-type default when no tier specified', () => {
    const input = createSpawnInput({ workerId: 'backend-dev' });
    expect(resolveResourceTier(input)).toBe('medium');
  });

  it('falls back to global default for unknown worker', () => {
    const input = createSpawnInput({ workerId: 'random-worker-xyz' });
    expect(resolveResourceTier(input)).toBe('small');
  });

  it('explicit tier overrides worker-type default', () => {
    // backend-dev defaults to medium, but we request small
    const input = createSpawnInput({
      workerId: 'backend-dev',
      resourceTier: 'small',
    });
    expect(resolveResourceTier(input)).toBe('small');
  });
});

describe('resolveResourceTierSpec', () => {
  it('returns full spec for resolved tier', () => {
    const input = createSpawnInput({ resourceTier: 'large' });
    const spec = resolveResourceTierSpec(input);
    expect(spec.tier).toBe('large');
    expect(spec.cpu).toBe(2048);
    expect(spec.memory).toBe(4096);
  });
});

describe('buildTierOverrides', () => {
  it('returns CPU/memory strings for small tier', () => {
    const overrides = buildTierOverrides('small');
    expect(overrides.cpu).toBe('512');
    expect(overrides.memory).toBe('1024');
  });

  it('returns CPU/memory strings for medium tier', () => {
    const overrides = buildTierOverrides('medium');
    expect(overrides.cpu).toBe('1024');
    expect(overrides.memory).toBe('2048');
  });

  it('returns CPU/memory strings for large tier', () => {
    const overrides = buildTierOverrides('large');
    expect(overrides.cpu).toBe('2048');
    expect(overrides.memory).toBe('4096');
  });
});

describe('mergeTierOverrides', () => {
  it('applies tier overrides when no existing overrides', () => {
    const result = mergeTierOverrides('large');
    expect(result.cpu).toBe('2048');
    expect(result.memory).toBe('4096');
  });

  it('applies tier overrides when existing overrides have no CPU/memory', () => {
    const existing: TaskOverrides = {
      taskRoleArn: 'arn:aws:iam::123:role/custom',
    };
    const result = mergeTierOverrides('medium', existing);
    expect(result.cpu).toBe('1024');
    expect(result.memory).toBe('2048');
    expect(result.taskRoleArn).toBe('arn:aws:iam::123:role/custom');
  });

  it('preserves explicit CPU/memory overrides over tier', () => {
    const existing: TaskOverrides = {
      cpu: '4096',
      memory: '8192',
    };
    const result = mergeTierOverrides('small', existing);
    // Explicit overrides take precedence
    expect(result.cpu).toBe('4096');
    expect(result.memory).toBe('8192');
  });

  it('preserves other override fields', () => {
    const existing: TaskOverrides = {
      taskRoleArn: 'arn:aws:iam::123:role/custom',
      executionRoleArn: 'arn:aws:iam::123:role/exec',
      ephemeralStorage: { sizeInGiB: 50 },
      containerOverrides: [{ name: 'worker', command: ['/custom'] }],
    };
    const result = mergeTierOverrides('large', existing);
    expect(result.taskRoleArn).toBe('arn:aws:iam::123:role/custom');
    expect(result.executionRoleArn).toBe('arn:aws:iam::123:role/exec');
    expect(result.ephemeralStorage).toEqual({ sizeInGiB: 50 });
    expect(result.containerOverrides).toHaveLength(1);
  });
});

describe('configureWorkerTypeDefaults', () => {
  afterEach(() => {
    configureWorkerTypeDefaults();
  });

  it('resets to built-in defaults when called with no arguments', () => {
    // Change something first
    setWorkerTypeTierDefault('backend-dev', 'large');
    expect(getDefaultTierForWorker('backend-dev')).toBe('large');

    // Reset
    configureWorkerTypeDefaults();
    expect(getDefaultTierForWorker('backend-dev')).toBe('medium');
  });

  it('allows custom fallback tier', () => {
    configureWorkerTypeDefaults({ fallback: 'large' });
    expect(getDefaultTierForWorker('totally-unknown-worker')).toBe('large');
  });

  it('allows custom defaults map', () => {
    configureWorkerTypeDefaults({
      defaults: new Map([['custom-worker', 'large']]),
    });
    expect(getDefaultTierForWorker('custom-worker')).toBe('large');
    // Previous defaults are replaced
    expect(getDefaultTierForWorker('backend-dev')).not.toBe('medium');
  });
});

describe('setWorkerTypeTierDefault', () => {
  afterEach(() => {
    configureWorkerTypeDefaults();
  });

  it('sets a new worker type default', () => {
    setWorkerTypeTierDefault('my-custom-worker', 'large');
    expect(getDefaultTierForWorker('my-custom-worker')).toBe('large');
  });

  it('overrides existing worker type default', () => {
    setWorkerTypeTierDefault('backend-dev', 'large');
    expect(getDefaultTierForWorker('backend-dev')).toBe('large');
  });

  it('is case-insensitive', () => {
    setWorkerTypeTierDefault('MY-WORKER', 'large');
    expect(getDefaultTierForWorker('my-worker-instance')).toBe('large');
  });
});

describe('getWorkerTypeDefaults', () => {
  afterEach(() => {
    configureWorkerTypeDefaults();
  });

  it('returns current defaults configuration', () => {
    const defaults = getWorkerTypeDefaults();
    expect(defaults.fallback).toBe('small');
    expect(defaults.defaults).toBeInstanceOf(Map);
    expect(defaults.defaults.size).toBeGreaterThan(0);
  });

  it('reflects changes from setWorkerTypeTierDefault', () => {
    setWorkerTypeTierDefault('new-prefix', 'large');
    const defaults = getWorkerTypeDefaults();
    expect(defaults.defaults.get('new-prefix')).toBe('large');
  });
});

describe('estimateTierCostPerHour', () => {
  it('returns positive costs for all tiers', () => {
    expect(estimateTierCostPerHour('small')).toBeGreaterThan(0);
    expect(estimateTierCostPerHour('medium')).toBeGreaterThan(0);
    expect(estimateTierCostPerHour('large')).toBeGreaterThan(0);
  });

  it('costs increase with tier size', () => {
    const smallCost = estimateTierCostPerHour('small');
    const mediumCost = estimateTierCostPerHour('medium');
    const largeCost = estimateTierCostPerHour('large');
    expect(mediumCost).toBeGreaterThan(smallCost);
    expect(largeCost).toBeGreaterThan(mediumCost);
  });

  it('all tiers cost less than $1/hr', () => {
    expect(estimateTierCostPerHour('small')).toBeLessThan(1);
    expect(estimateTierCostPerHour('medium')).toBeLessThan(1);
    expect(estimateTierCostPerHour('large')).toBeLessThan(1);
  });
});

describe('describeTier', () => {
  it('includes tier name and resources', () => {
    const desc = describeTier('medium');
    expect(desc).toContain('medium');
    expect(desc).toContain('1 vCPU / 2 GB');
    expect(desc).toContain('$');
  });

  it('includes cost estimate', () => {
    const desc = describeTier('large');
    expect(desc).toMatch(/\$\d+\.\d+\/hr/);
  });
});

describe('DEFAULT_RESOURCE_TIER', () => {
  it('defaults to small', () => {
    expect(DEFAULT_RESOURCE_TIER).toBe('small');
  });
});
