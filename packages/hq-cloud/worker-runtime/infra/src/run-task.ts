/**
 * ECS Fargate Task Runner
 *
 * Provides utilities for running Fargate tasks from spawn requests.
 * Handles environment variable injection and task configuration.
 */

import {
  spawnInputToEnvironment,
  environmentToContainerEnv,
  DEFAULT_TASK_CONFIG,
} from '../../types/infra/index.js';
import type {
  SpawnTaskInput,
  VpcNetworkConfig,
  FargateCpuSize,
  FargateMemorySize,
} from '../../types/infra/index.js';

/**
 * Configuration for running a task
 */
export interface RunTaskConfig {
  /** ECS cluster ARN or name */
  cluster: string;
  /** Task definition ARN or family:revision */
  taskDefinition: string;
  /** VPC network configuration */
  network: VpcNetworkConfig;
  /** Task count (defaults to 1) */
  count?: number;
  /** Platform version */
  platformVersion?: string;
  /** Enable execute command for debugging */
  enableExecuteCommand?: boolean;
  /** Propagate tags */
  propagateTags?: 'TASK_DEFINITION' | 'SERVICE' | 'NONE';
  /** Task tags */
  tags?: Record<string, string>;
  /** Container overrides */
  overrides?: TaskOverrides;
}

/**
 * Container override configuration
 */
export interface ContainerOverride {
  /** Container name to override */
  name: string;
  /** Command override */
  command?: string[];
  /** Environment variable overrides */
  environment?: Array<{ name: string; value: string }>;
  /** CPU override */
  cpu?: number;
  /** Memory override (hard limit) */
  memory?: number;
  /** Memory reservation override (soft limit) */
  memoryReservation?: number;
}

/**
 * Task-level overrides
 */
export interface TaskOverrides {
  /** Container overrides */
  containerOverrides?: ContainerOverride[];
  /** Task role ARN override */
  taskRoleArn?: string;
  /** Execution role ARN override */
  executionRoleArn?: string;
  /** CPU override (as string like '512') */
  cpu?: string;
  /** Memory override (as string like '1024') */
  memory?: string;
  /** Ephemeral storage override */
  ephemeralStorage?: { sizeInGiB: number };
}

/**
 * Result of running a task
 */
export interface RunTaskResult {
  /** Task ARN(s) that were started */
  taskArns: string[];
  /** Failures if any */
  failures: Array<{
    arn?: string;
    reason?: string;
    detail?: string;
  }>;
}

/**
 * Build the ECS RunTask parameters from a spawn request
 */
export function buildRunTaskParams(
  input: SpawnTaskInput,
  config: RunTaskConfig
): EcsRunTaskParams {
  // Convert spawn input to environment variables
  const env = spawnInputToEnvironment(input);
  const envArray = environmentToContainerEnv(env as unknown as Record<string, string>);

  // Build container overrides with environment variables
  const containerOverrides: ContainerOverride[] = [
    {
      name: 'session',
      environment: envArray,
      ...(config.overrides?.containerOverrides?.[0] ?? {}),
    },
  ];

  // Merge any additional container overrides
  if (config.overrides?.containerOverrides) {
    for (let i = 1; i < config.overrides.containerOverrides.length; i++) {
      const override = config.overrides.containerOverrides[i];
      if (override) {
        containerOverrides.push(override);
      }
    }
  }

  // Build default tags
  const defaultTags: Record<string, string> = {
    'hq:tracking-id': input.trackingId,
    'hq:worker-id': input.workerId,
    'hq:skill': input.skill,
  };

  return {
    cluster: config.cluster,
    taskDefinition: config.taskDefinition,
    count: config.count ?? 1,
    launchType: 'FARGATE',
    platformVersion: config.platformVersion ?? DEFAULT_TASK_CONFIG.platformVersion,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: config.network.subnetIds,
        securityGroups: config.network.securityGroupIds,
        assignPublicIp: config.network.assignPublicIp ? 'ENABLED' : 'DISABLED',
      },
    },
    enableExecuteCommand: config.enableExecuteCommand ?? false,
    propagateTags: config.propagateTags ?? 'TASK_DEFINITION',
    tags: [
      ...Object.entries({ ...defaultTags, ...config.tags }).map(([key, value]) => ({
        key,
        value,
      })),
    ],
    overrides: {
      containerOverrides,
      taskRoleArn: config.overrides?.taskRoleArn,
      executionRoleArn: config.overrides?.executionRoleArn,
      cpu: config.overrides?.cpu,
      memory: config.overrides?.memory,
      ephemeralStorage: config.overrides?.ephemeralStorage,
    },
  };
}

/**
 * ECS RunTask API parameters
 * Matches the AWS SDK ECS.RunTaskRequest structure
 */
export interface EcsRunTaskParams {
  cluster: string;
  taskDefinition: string;
  count: number;
  launchType: 'FARGATE' | 'EC2' | 'EXTERNAL';
  platformVersion: string;
  networkConfiguration: {
    awsvpcConfiguration: {
      subnets: string[];
      securityGroups: string[];
      assignPublicIp: 'ENABLED' | 'DISABLED';
    };
  };
  enableExecuteCommand: boolean;
  propagateTags: 'TASK_DEFINITION' | 'SERVICE' | 'NONE';
  tags: Array<{ key: string; value: string }>;
  overrides: {
    containerOverrides: ContainerOverride[];
    taskRoleArn?: string;
    executionRoleArn?: string;
    cpu?: string;
    memory?: string;
    ephemeralStorage?: { sizeInGiB: number };
  };
}

/**
 * Validate CPU/memory combination for Fargate
 * See: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
 */
export function validateFargateResources(
  cpu: FargateCpuSize,
  memory: FargateMemorySize
): boolean {
  const validCombinations: Record<FargateCpuSize, FargateMemorySize[]> = {
    256: [512, 1024, 2048],
    512: [1024, 2048, 3072, 4096],
    1024: [2048, 3072, 4096, 5120, 6144, 7168, 8192],
    2048: [4096, 5120, 6144, 7168, 8192, 16384],
    4096: [8192, 16384, 30720],
    8192: [16384, 30720, 61440],
    16384: [30720, 61440, 122880],
  };

  const validMemory = validCombinations[cpu];
  return validMemory?.includes(memory) ?? false;
}

/**
 * Get recommended memory for a given CPU size
 */
export function getRecommendedMemory(cpu: FargateCpuSize): FargateMemorySize {
  const recommendations: Record<FargateCpuSize, FargateMemorySize> = {
    256: 512,
    512: 1024,
    1024: 2048,
    2048: 4096,
    4096: 8192,
    8192: 16384,
    16384: 30720,
  };
  return recommendations[cpu];
}

/**
 * Estimate task cost per hour based on resources
 * Prices are approximate US East (N. Virginia) on-demand rates
 */
export function estimateTaskCostPerHour(
  cpu: FargateCpuSize,
  memory: FargateMemorySize
): number {
  // Fargate pricing (approximate, USD per hour)
  const cpuPricePerVcpuHour = 0.04048;
  const memoryPricePerGbHour = 0.004445;

  const vcpuHours = cpu / 1024;
  const gbHours = memory / 1024;

  return vcpuHours * cpuPricePerVcpuHour + gbHours * memoryPricePerGbHour;
}

/**
 * Build a task description for logging/debugging
 */
export function describeTask(input: SpawnTaskInput, config: RunTaskConfig): string {
  return [
    `Task: ${input.trackingId}`,
    `Worker: ${input.workerId}`,
    `Skill: ${input.skill}`,
    `Cluster: ${config.cluster}`,
    `Task Definition: ${config.taskDefinition}`,
    `Network: VPC ${config.network.vpcId}`,
    `Subnets: ${config.network.subnetIds.join(', ')}`,
    `Security Groups: ${config.network.securityGroupIds.join(', ')}`,
    `Public IP: ${config.network.assignPublicIp ? 'Yes' : 'No'}`,
  ].join('\n');
}
