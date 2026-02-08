/**
 * Tests for task runner utilities
 */

import { describe, it, expect } from 'vitest';
import {
  buildRunTaskParams,
  validateFargateResources,
  getRecommendedMemory,
  estimateTaskCostPerHour,
  describeTask,
} from '../run-task.js';
import {
  SpawnTaskInput,
  spawnInputToEnvironment,
  environmentToContainerEnv,
  DEFAULT_TASK_CONFIG,
} from '../../../types/infra/index.js';
import type { RunTaskConfig } from '../run-task.js';

describe('spawnInputToEnvironment', () => {
  it('converts spawn input to environment variables', () => {
    const input: SpawnTaskInput = {
      trackingId: 'spawn-abc123',
      workerId: 'dev-team/coder',
      skill: 'implement-feature',
      parameters: { feature: 'auth', repo: 'myapp' },
      hqApiUrl: 'https://api.hq.example.com',
      hqApiKey: 'hq-key-secret',
    };

    const env = spawnInputToEnvironment(input);

    expect(env.HQ_API_URL).toBe('https://api.hq.example.com');
    expect(env.HQ_API_KEY).toBe('hq-key-secret');
    expect(env.WORKER_ID).toBe('dev-team/coder');
    expect(env.WORKER_SKILL).toBe('implement-feature');
    expect(env.WORKER_PARAMS).toBe(JSON.stringify({ feature: 'auth', repo: 'myapp' }));
    expect(env.SPAWN_TRACKING_ID).toBe('spawn-abc123');
    expect(env.NODE_ENV).toBe('production');
  });

  it('allows custom NODE_ENV', () => {
    const input: SpawnTaskInput = {
      trackingId: 'spawn-abc123',
      workerId: 'worker',
      skill: 'skill',
      parameters: {},
      hqApiUrl: 'https://api.example.com',
      hqApiKey: 'key',
    };

    const env = spawnInputToEnvironment(input, 'development');
    expect(env.NODE_ENV).toBe('development');
  });
});

describe('environmentToContainerEnv', () => {
  it('converts object to array of name/value pairs', () => {
    const env = {
      FOO: 'bar',
      BAZ: 'qux',
    };

    const result = environmentToContainerEnv(env);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ name: 'FOO', value: 'bar' });
    expect(result).toContainEqual({ name: 'BAZ', value: 'qux' });
  });
});

describe('buildRunTaskParams', () => {
  const baseInput: SpawnTaskInput = {
    trackingId: 'spawn-xyz789',
    workerId: 'content-writer',
    skill: 'draft-post',
    parameters: { topic: 'AI' },
    hqApiUrl: 'https://api.hq.example.com',
    hqApiKey: 'secret-key',
  };

  const baseConfig: RunTaskConfig = {
    cluster: 'hq-workers',
    taskDefinition: 'hq-worker:5',
    network: {
      vpcId: 'vpc-123',
      subnetIds: ['subnet-a', 'subnet-b'],
      securityGroupIds: ['sg-123'],
      assignPublicIp: false,
    },
  };

  it('builds complete RunTask parameters', () => {
    const params = buildRunTaskParams(baseInput, baseConfig);

    expect(params.cluster).toBe('hq-workers');
    expect(params.taskDefinition).toBe('hq-worker:5');
    expect(params.launchType).toBe('FARGATE');
    expect(params.count).toBe(1);
    expect(params.networkConfiguration.awsvpcConfiguration.subnets).toEqual([
      'subnet-a',
      'subnet-b',
    ]);
    expect(params.networkConfiguration.awsvpcConfiguration.securityGroups).toEqual([
      'sg-123',
    ]);
    expect(params.networkConfiguration.awsvpcConfiguration.assignPublicIp).toBe(
      'DISABLED'
    );
  });

  it('includes environment variables from spawn input', () => {
    const params = buildRunTaskParams(baseInput, baseConfig);

    const containerOverride = params.overrides.containerOverrides[0];
    expect(containerOverride?.name).toBe('worker');
    expect(containerOverride?.environment).toContainEqual({
      name: 'WORKER_ID',
      value: 'content-writer',
    });
    expect(containerOverride?.environment).toContainEqual({
      name: 'WORKER_SKILL',
      value: 'draft-post',
    });
    expect(containerOverride?.environment).toContainEqual({
      name: 'SPAWN_TRACKING_ID',
      value: 'spawn-xyz789',
    });
  });

  it('includes tracking tags', () => {
    const params = buildRunTaskParams(baseInput, baseConfig);

    expect(params.tags).toContainEqual({
      key: 'hq:tracking-id',
      value: 'spawn-xyz789',
    });
    expect(params.tags).toContainEqual({
      key: 'hq:worker-id',
      value: 'content-writer',
    });
    expect(params.tags).toContainEqual({
      key: 'hq:skill',
      value: 'draft-post',
    });
  });

  it('enables public IP when configured', () => {
    const config: RunTaskConfig = {
      ...baseConfig,
      network: {
        ...baseConfig.network,
        assignPublicIp: true,
      },
    };

    const params = buildRunTaskParams(baseInput, config);
    expect(params.networkConfiguration.awsvpcConfiguration.assignPublicIp).toBe(
      'ENABLED'
    );
  });

  it('includes custom tags', () => {
    const config: RunTaskConfig = {
      ...baseConfig,
      tags: {
        Environment: 'prod',
        Team: 'platform',
      },
    };

    const params = buildRunTaskParams(baseInput, config);
    expect(params.tags).toContainEqual({ key: 'Environment', value: 'prod' });
    expect(params.tags).toContainEqual({ key: 'Team', value: 'platform' });
  });
});

describe('validateFargateResources', () => {
  it('validates correct CPU/memory combinations', () => {
    expect(validateFargateResources(256, 512)).toBe(true);
    expect(validateFargateResources(512, 1024)).toBe(true);
    expect(validateFargateResources(1024, 2048)).toBe(true);
    expect(validateFargateResources(2048, 4096)).toBe(true);
    expect(validateFargateResources(4096, 8192)).toBe(true);
  });

  it('rejects invalid CPU/memory combinations', () => {
    expect(validateFargateResources(256, 8192)).toBe(false);
    expect(validateFargateResources(512, 512)).toBe(false);
    expect(validateFargateResources(1024, 16384)).toBe(false);
  });

  it('validates default configuration', () => {
    expect(
      validateFargateResources(DEFAULT_TASK_CONFIG.cpu, DEFAULT_TASK_CONFIG.memory)
    ).toBe(true);
  });
});

describe('getRecommendedMemory', () => {
  it('returns appropriate memory for CPU size', () => {
    expect(getRecommendedMemory(256)).toBe(512);
    expect(getRecommendedMemory(512)).toBe(1024);
    expect(getRecommendedMemory(1024)).toBe(2048);
    expect(getRecommendedMemory(2048)).toBe(4096);
    expect(getRecommendedMemory(4096)).toBe(8192);
  });
});

describe('estimateTaskCostPerHour', () => {
  it('calculates cost for default resources', () => {
    const cost = estimateTaskCostPerHour(512, 1024);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(1); // Should be under $1/hour for small tasks
  });

  it('higher resources cost more', () => {
    const smallCost = estimateTaskCostPerHour(512, 1024);
    const largeCost = estimateTaskCostPerHour(4096, 8192);
    expect(largeCost).toBeGreaterThan(smallCost);
  });
});

describe('describeTask', () => {
  it('generates readable task description', () => {
    const input: SpawnTaskInput = {
      trackingId: 'spawn-test',
      workerId: 'test-worker',
      skill: 'test-skill',
      parameters: {},
      hqApiUrl: 'https://api.example.com',
      hqApiKey: 'key',
    };

    const config: RunTaskConfig = {
      cluster: 'my-cluster',
      taskDefinition: 'my-task:1',
      network: {
        vpcId: 'vpc-abc',
        subnetIds: ['subnet-1'],
        securityGroupIds: ['sg-1'],
        assignPublicIp: false,
      },
    };

    const description = describeTask(input, config);

    expect(description).toContain('Task: spawn-test');
    expect(description).toContain('Worker: test-worker');
    expect(description).toContain('Skill: test-skill');
    expect(description).toContain('Cluster: my-cluster');
    expect(description).toContain('VPC vpc-abc');
  });
});
