/**
 * ECS Task Integration Tests
 *
 * Validates the deployed ECS cluster:
 * - Cluster exists and is active
 * - Can run and stop a minimal task
 * - CloudWatch log group exists
 *
 * Requires: AWS credentials, cluster + task definition deployed via CDK
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  ECSClient,
  DescribeClustersCommand,
  ListTaskDefinitionsCommand,
  RunTaskCommand,
  StopTaskCommand,
  DescribeTasksCommand,
  ListTasksCommand,
} from '@aws-sdk/client-ecs';
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

const CLUSTER_NAME = process.env['HQ_TEST_CLUSTER'] ?? 'hq-cloud-dev';
const LOG_GROUP = process.env['HQ_TEST_LOG_GROUP'] ?? '/hq/workers';
const REGION = process.env['AWS_REGION'] ?? 'us-east-1';

const ecs = new ECSClient({ region: REGION });
const cwlogs = new CloudWatchLogsClient({ region: REGION });
const tasksToCleanup: string[] = [];

afterAll(async () => {
  // Stop any tasks we started
  for (const taskArn of tasksToCleanup) {
    try {
      await ecs.send(
        new StopTaskCommand({
          cluster: CLUSTER_NAME,
          task: taskArn,
          reason: 'integration-test-cleanup',
        })
      );
    } catch {
      // Best effort
    }
  }
});

describe('ECS Task Integration', () => {
  it('cluster exists and is active', async () => {
    const response = await ecs.send(
      new DescribeClustersCommand({ clusters: [CLUSTER_NAME] })
    );
    expect(response.clusters).toHaveLength(1);
    expect(response.clusters![0].clusterName).toBe(CLUSTER_NAME);
    expect(response.clusters![0].status).toBe('ACTIVE');
  });

  it('task definitions are registered', async () => {
    // CDK generates family names like HqWorkerRuntimedevTaskDef<hash>
    const response = await ecs.send(
      new ListTaskDefinitionsCommand({})
    );
    expect(response.taskDefinitionArns).toBeDefined();
    const hqTaskDefs = response.taskDefinitionArns!.filter((arn) =>
      arn.includes('HqWorkerRuntime')
    );
    expect(hqTaskDefs.length).toBeGreaterThan(0);
  });

  it('CloudWatch log group exists', async () => {
    const response = await cwlogs.send(
      new DescribeLogGroupsCommand({ logGroupNamePrefix: LOG_GROUP })
    );
    expect(response.logGroups).toBeDefined();
    const match = response.logGroups!.find((lg) =>
      lg.logGroupName?.startsWith(LOG_GROUP)
    );
    expect(match).toBeTruthy();
  });

  it('can list tasks in cluster', async () => {
    const response = await ecs.send(
      new ListTasksCommand({ cluster: CLUSTER_NAME })
    );
    // Just verify the call succeeds — may have zero tasks
    expect(response.taskArns).toBeDefined();
  });

  // This test is expensive (starts Fargate) — skip by default, enable with RUN_FARGATE_TEST=1
  it.skipIf(!process.env['RUN_FARGATE_TEST'])(
    'can run and stop a Fargate task',
    async () => {
      // Get latest task definition
      const tdResponse = await ecs.send(
        new ListTaskDefinitionsCommand({ sort: 'DESC' })
      );
      const taskDefArn = tdResponse.taskDefinitionArns!.find((arn) =>
        arn.includes('HqWorkerRuntime')
      );
      expect(taskDefArn).toBeTruthy();

      // Get VPC info from cluster
      const clusterResponse = await ecs.send(
        new DescribeClustersCommand({ clusters: [CLUSTER_NAME] })
      );
      const cluster = clusterResponse.clusters![0];

      // Run task
      const runResponse = await ecs.send(
        new RunTaskCommand({
          cluster: CLUSTER_NAME,
          taskDefinition: taskDefArn,
          launchType: 'FARGATE',
          count: 1,
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: [], // Will need real subnet IDs from deployment
              assignPublicIp: 'ENABLED',
            },
          },
          overrides: {
            containerOverrides: [
              {
                name: 'session',
                command: ['echo', 'integration-test'],
              },
            ],
          },
          tags: [
            { key: 'project', value: 'hq-cloud' },
            { key: 'purpose', value: 'integration-test' },
          ],
        })
      );

      expect(runResponse.tasks).toBeDefined();
      expect(runResponse.tasks!.length).toBe(1);

      const taskArn = runResponse.tasks![0].taskArn!;
      tasksToCleanup.push(taskArn);

      // Verify task is running/provisioning
      const describeResponse = await ecs.send(
        new DescribeTasksCommand({
          cluster: CLUSTER_NAME,
          tasks: [taskArn],
        })
      );

      const task = describeResponse.tasks![0];
      expect(['PROVISIONING', 'PENDING', 'RUNNING', 'STOPPED']).toContain(
        task.lastStatus
      );

      // Stop it immediately (don't waste money)
      await ecs.send(
        new StopTaskCommand({
          cluster: CLUSTER_NAME,
          task: taskArn,
          reason: 'integration-test-complete',
        })
      );
    }
  );
});
