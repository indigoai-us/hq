/**
 * ECR Repository Integration Tests
 *
 * Validates the deployed ECR repository:
 * - Repository exists
 * - Auth token can be obtained
 * - Lifecycle policy is configured
 * - Image scanning is enabled
 *
 * Requires: AWS credentials with ECR access, repo deployed via CDK
 */

import { describe, it, expect } from 'vitest';
import {
  ECRClient,
  DescribeRepositoriesCommand,
  GetAuthorizationTokenCommand,
  GetLifecyclePolicyCommand,
  DescribeImageScanFindingsCommand,
  ListImagesCommand,
} from '@aws-sdk/client-ecr';

const REPO_NAME = process.env['HQ_TEST_ECR_REPO'] ?? 'hq-cloud/worker-runtime';
const REGION = process.env['AWS_REGION'] ?? 'us-east-1';

const ecr = new ECRClient({ region: REGION });

describe('ECR Repository Integration', () => {
  it('repository exists', async () => {
    const response = await ecr.send(
      new DescribeRepositoriesCommand({ repositoryNames: [REPO_NAME] })
    );
    expect(response.repositories).toHaveLength(1);
    expect(response.repositories![0].repositoryName).toBe(REPO_NAME);
  });

  it('auth token can be obtained', async () => {
    const response = await ecr.send(new GetAuthorizationTokenCommand({}));
    expect(response.authorizationData).toBeDefined();
    expect(response.authorizationData!.length).toBeGreaterThan(0);
    expect(response.authorizationData![0].authorizationToken).toBeTruthy();
  });

  it('lifecycle policy is configured', async () => {
    const response = await ecr.send(
      new GetLifecyclePolicyCommand({ repositoryName: REPO_NAME })
    );
    expect(response.lifecyclePolicyText).toBeTruthy();

    const policy = JSON.parse(response.lifecyclePolicyText!);
    expect(policy.rules).toBeDefined();
    expect(policy.rules.length).toBeGreaterThan(0);

    // Should keep last 10 images
    const keepRule = policy.rules.find(
      (r: { selection: { countNumber: number } }) => r.selection.countNumber === 10
    );
    expect(keepRule).toBeTruthy();
  });

  it('image scanning is enabled', async () => {
    const response = await ecr.send(
      new DescribeRepositoriesCommand({ repositoryNames: [REPO_NAME] })
    );
    const repo = response.repositories![0];
    expect(repo.imageScanningConfiguration?.scanOnPush).toBe(true);
  });

  it('can list images (may be empty)', async () => {
    const response = await ecr.send(
      new ListImagesCommand({ repositoryName: REPO_NAME })
    );
    // Just verify the call succeeds — may be empty before first push
    expect(response.imageIds).toBeDefined();
  });
});
