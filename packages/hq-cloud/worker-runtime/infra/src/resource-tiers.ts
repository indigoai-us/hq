/**
 * Worker Resource Scaling Configuration
 *
 * Provides resource tier resolution for worker spawn requests.
 * Workers can request a specific tier (small/medium/large), or the
 * system resolves a default tier based on the worker type.
 *
 * Tiers:
 *   small  - 0.5 vCPU / 1 GB  (default)
 *   medium - 1 vCPU   / 2 GB
 *   large  - 2 vCPU   / 4 GB
 *
 * @module resource-tiers
 */

import {
  RESOURCE_TIERS,
  DEFAULT_RESOURCE_TIER,
} from '../../types/infra/index.js';
import type {
  ResourceTier,
  ResourceTierSpec,
  SpawnTaskInput,
} from '../../types/infra/index.js';
import type { TaskOverrides } from './run-task.js';

// ────────────────────────────────────────────────────────────────
// Worker Type Defaults
// ────────────────────────────────────────────────────────────────

/**
 * Configuration for per-worker-type default tiers
 */
export interface WorkerTypeDefaults {
  /** Map of worker type patterns to default resource tiers */
  readonly defaults: ReadonlyMap<string, ResourceTier>;
  /** Fallback tier when no pattern matches */
  readonly fallback: ResourceTier;
}

/**
 * Built-in worker type to tier mappings.
 *
 * Worker IDs are matched by prefix. The first matching prefix wins.
 * More specific prefixes should come first.
 */
const BUILTIN_WORKER_TYPE_DEFAULTS: ReadonlyArray<[string, ResourceTier]> = [
  // Heavy compute workers get large by default
  ['architect', 'medium'],
  ['database-dev', 'medium'],
  // Code workers default to medium
  ['backend-dev', 'medium'],
  ['frontend-dev', 'medium'],
  ['infra-dev', 'medium'],
  // Review/QA stay small - mostly reading
  ['code-reviewer', 'small'],
  ['dev-qa-tester', 'small'],
  ['product-planner', 'small'],
  ['knowledge-curator', 'small'],
  // Content workers stay small
  ['content-', 'small'],
  // Social workers stay small
  ['x-', 'small'],
  ['linkedin-', 'small'],
];

/**
 * Default worker type configuration
 */
let workerTypeDefaults: WorkerTypeDefaults = {
  defaults: new Map(BUILTIN_WORKER_TYPE_DEFAULTS),
  fallback: DEFAULT_RESOURCE_TIER,
};

// ────────────────────────────────────────────────────────────────
// Tier Resolution
// ────────────────────────────────────────────────────────────────

/**
 * Check if a string is a valid resource tier
 */
export function isValidResourceTier(value: string): value is ResourceTier {
  return value === 'small' || value === 'medium' || value === 'large';
}

/**
 * Get the resource tier spec for a given tier name
 */
export function getTierSpec(tier: ResourceTier): ResourceTierSpec {
  return RESOURCE_TIERS[tier];
}

/**
 * Get all available tier specs
 */
export function getAllTierSpecs(): ResourceTierSpec[] {
  return Object.values(RESOURCE_TIERS);
}

/**
 * Resolve the default resource tier for a worker based on its ID.
 *
 * Matches worker ID against registered prefixes. Returns the fallback
 * tier if no prefix matches.
 */
export function getDefaultTierForWorker(workerId: string): ResourceTier {
  const normalizedId = workerId.toLowerCase();

  for (const [prefix, tier] of workerTypeDefaults.defaults) {
    if (normalizedId.startsWith(prefix) || normalizedId.includes(`/${prefix}`)) {
      return tier;
    }
  }

  return workerTypeDefaults.fallback;
}

/**
 * Resolve the effective resource tier for a spawn request.
 *
 * Priority:
 * 1. Explicit tier in spawn input (if provided)
 * 2. Worker-type default (based on worker ID prefix matching)
 * 3. Global fallback (small)
 */
export function resolveResourceTier(input: SpawnTaskInput): ResourceTier {
  if (input.resourceTier && isValidResourceTier(input.resourceTier)) {
    return input.resourceTier;
  }
  return getDefaultTierForWorker(input.workerId);
}

/**
 * Resolve the full resource tier spec for a spawn request.
 * Convenience function combining resolveResourceTier + getTierSpec.
 */
export function resolveResourceTierSpec(input: SpawnTaskInput): ResourceTierSpec {
  return getTierSpec(resolveResourceTier(input));
}

// ────────────────────────────────────────────────────────────────
// Task Override Generation
// ────────────────────────────────────────────────────────────────

/**
 * Build ECS task overrides for a given resource tier.
 *
 * Returns the CPU and memory overrides that should be applied to the
 * RunTask call to scale the container to the requested tier.
 */
export function buildTierOverrides(tier: ResourceTier): Pick<TaskOverrides, 'cpu' | 'memory'> {
  const spec = getTierSpec(tier);
  return {
    cpu: String(spec.cpu),
    memory: String(spec.memory),
  };
}

/**
 * Build complete task overrides merging tier resources with any existing overrides.
 *
 * The tier's CPU/memory takes precedence unless explicit overrides are provided
 * in the existingOverrides parameter.
 */
export function mergeTierOverrides(
  tier: ResourceTier,
  existingOverrides?: TaskOverrides
): TaskOverrides {
  const tierOverrides = buildTierOverrides(tier);

  return {
    ...existingOverrides,
    // Tier CPU/memory are applied only if no explicit override exists
    cpu: existingOverrides?.cpu ?? tierOverrides.cpu,
    memory: existingOverrides?.memory ?? tierOverrides.memory,
  };
}

// ────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────

/**
 * Override the worker type defaults configuration.
 *
 * Useful for customizing which worker types get which default tier.
 * Call with no arguments to reset to built-in defaults.
 */
export function configureWorkerTypeDefaults(
  config?: Partial<WorkerTypeDefaults>
): void {
  if (!config) {
    workerTypeDefaults = {
      defaults: new Map(BUILTIN_WORKER_TYPE_DEFAULTS),
      fallback: DEFAULT_RESOURCE_TIER,
    };
    return;
  }

  workerTypeDefaults = {
    defaults: config.defaults ?? workerTypeDefaults.defaults,
    fallback: config.fallback ?? workerTypeDefaults.fallback,
  };
}

/**
 * Set a default tier for a specific worker type prefix.
 *
 * @param workerPrefix - Worker ID prefix to match (e.g., "backend-dev", "content-")
 * @param tier - Default resource tier for matching workers
 */
export function setWorkerTypeTierDefault(workerPrefix: string, tier: ResourceTier): void {
  const mutableDefaults = new Map(workerTypeDefaults.defaults);
  mutableDefaults.set(workerPrefix.toLowerCase(), tier);
  workerTypeDefaults = {
    ...workerTypeDefaults,
    defaults: mutableDefaults,
  };
}

/**
 * Get the current worker type defaults (for inspection/debugging)
 */
export function getWorkerTypeDefaults(): WorkerTypeDefaults {
  return workerTypeDefaults;
}

// ────────────────────────────────────────────────────────────────
// Cost Estimation
// ────────────────────────────────────────────────────────────────

/**
 * Estimate the hourly cost for a resource tier.
 * Uses approximate US East (N. Virginia) Fargate on-demand rates.
 */
export function estimateTierCostPerHour(tier: ResourceTier): number {
  const spec = getTierSpec(tier);
  const cpuPricePerVcpuHour = 0.04048;
  const memoryPricePerGbHour = 0.004445;
  const vcpuHours = spec.cpu / 1024;
  const gbHours = spec.memory / 1024;
  return vcpuHours * cpuPricePerVcpuHour + gbHours * memoryPricePerGbHour;
}

/**
 * Describe a tier for human-readable logging
 */
export function describeTier(tier: ResourceTier): string {
  const spec = getTierSpec(tier);
  const cost = estimateTierCostPerHour(tier);
  return `${tier} (${spec.description}, ~$${cost.toFixed(4)}/hr)`;
}
