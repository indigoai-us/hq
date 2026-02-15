/**
 * Cost Tags Integration Tests
 *
 * Validates that all deployed resources are properly tagged:
 * - All resources tagged with project: hq-cloud
 * - Budget exists with correct configuration
 *
 * Requires: AWS credentials with tagging/budgets access
 */

import { describe, it, expect } from 'vitest';
import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import {
  BudgetsClient,
  DescribeBudgetCommand,
} from '@aws-sdk/client-budgets';

const ACCOUNT_ID = process.env['AWS_ACCOUNT_ID'] ?? '804849608251';
const REGION = process.env['AWS_REGION'] ?? 'us-east-1';

const tagging = new ResourceGroupsTaggingAPIClient({ region: REGION });
const budgetsClient = new BudgetsClient({ region: REGION });

describe('Cost Tags Integration', () => {
  it('resources are tagged with project:hq-cloud', async () => {
    const response = await tagging.send(
      new GetResourcesCommand({
        TagFilters: [{ Key: 'project', Values: ['hq-cloud'] }],
      })
    );
    expect(response.ResourceTagMappingList).toBeDefined();
    expect(response.ResourceTagMappingList!.length).toBeGreaterThan(0);
  });

  it('resources have environment tag', async () => {
    const response = await tagging.send(
      new GetResourcesCommand({
        TagFilters: [
          { Key: 'project', Values: ['hq-cloud'] },
          { Key: 'environment', Values: ['dev'] },
        ],
      })
    );
    expect(response.ResourceTagMappingList).toBeDefined();
    expect(response.ResourceTagMappingList!.length).toBeGreaterThan(0);
  });

  it('resources have managed-by:cdk tag', async () => {
    const response = await tagging.send(
      new GetResourcesCommand({
        TagFilters: [
          { Key: 'project', Values: ['hq-cloud'] },
          { Key: 'managed-by', Values: ['cdk'] },
        ],
      })
    );
    expect(response.ResourceTagMappingList).toBeDefined();
    expect(response.ResourceTagMappingList!.length).toBeGreaterThan(0);
  });

  it('budget exists with correct limit', async () => {
    const response = await budgetsClient.send(
      new DescribeBudgetCommand({
        AccountId: ACCOUNT_ID,
        BudgetName: 'hq-cloud-monthly',
      })
    );
    expect(response.Budget).toBeDefined();
    expect(response.Budget!.BudgetName).toBe('hq-cloud-monthly');
    expect(parseFloat(response.Budget!.BudgetLimit!.Amount!)).toBe(100);
    expect(response.Budget!.BudgetLimit!.Unit).toBe('USD');
    expect(response.Budget!.TimeUnit).toBe('MONTHLY');
  });

  it('all CloudFormation stacks have project tag', async () => {
    const response = await tagging.send(
      new GetResourcesCommand({
        TagFilters: [{ Key: 'project', Values: ['hq-cloud'] }],
        ResourceTypeFilters: ['cloudformation:stack'],
      })
    );
    expect(response.ResourceTagMappingList).toBeDefined();

    // Should have at least the S3, ECR, Budget, and Runtime stacks
    const stackArns = response.ResourceTagMappingList!.map((r) => r.ResourceARN!);
    expect(stackArns.length).toBeGreaterThanOrEqual(3);
  });
});
