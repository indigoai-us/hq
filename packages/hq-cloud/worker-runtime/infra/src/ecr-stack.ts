/**
 * ECR Stack for HQ Cloud container images
 *
 * Creates ECR repositories with:
 * - Image scanning on push
 * - Lifecycle policy to keep last 10 images
 * - DESTROY removal policy for dev environments
 *
 * Repositories:
 * - hq-cloud/worker-runtime (session runtime containers)
 * - hq-cloud/api (API server)
 */

import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface HqEcrStackProps extends cdk.StackProps {
  /**
   * Worker runtime repository name
   * @default 'hq-cloud/worker-runtime'
   */
  readonly repositoryName?: string;

  /**
   * API repository name
   * @default 'hq-cloud/api'
   */
  readonly apiRepositoryName?: string;

  /**
   * Environment name
   * @default 'dev'
   */
  readonly envName?: string;
}

/**
 * Common lifecycle rules for ECR repositories
 */
function createLifecycleRules(): ecr.LifecycleRule[] {
  return [
    {
      description: 'Keep last 10 images',
      maxImageCount: 10,
      rulePriority: 1,
      tagStatus: ecr.TagStatus.ANY,
    },
  ];
}

export class HqEcrStack extends cdk.Stack {
  /**
   * The worker runtime ECR repository
   */
  public readonly repository: ecr.Repository;

  /**
   * The API ECR repository
   */
  public readonly apiRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: HqEcrStackProps) {
    super(scope, id, props);

    const envName = props?.envName ?? 'dev';
    const repositoryName = props?.repositoryName ?? 'hq-cloud/worker-runtime';
    const apiRepositoryName = props?.apiRepositoryName ?? 'hq-cloud/api';

    // --- Worker Runtime repository ---
    this.repository = new ecr.Repository(this, 'WorkerRuntimeRepo', {
      repositoryName,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: createLifecycleRules(),
    });

    new cdk.CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'HQ Cloud Worker Runtime ECR Repository URI',
      exportName: `HqCloudEcrRepoUri-${envName}`,
    });

    new cdk.CfnOutput(this, 'RepositoryArn', {
      value: this.repository.repositoryArn,
      description: 'HQ Cloud Worker Runtime ECR Repository ARN',
      exportName: `HqCloudEcrRepoArn-${envName}`,
    });

    // --- API repository ---
    this.apiRepository = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: apiRepositoryName,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: createLifecycleRules(),
    });

    new cdk.CfnOutput(this, 'ApiRepositoryUri', {
      value: this.apiRepository.repositoryUri,
      description: 'HQ Cloud API ECR Repository URI',
      exportName: `HqCloudApiEcrRepoUri-${envName}`,
    });

    new cdk.CfnOutput(this, 'ApiRepositoryArn', {
      value: this.apiRepository.repositoryArn,
      description: 'HQ Cloud API ECR Repository ARN',
      exportName: `HqCloudApiEcrRepoArn-${envName}`,
    });
  }
}
