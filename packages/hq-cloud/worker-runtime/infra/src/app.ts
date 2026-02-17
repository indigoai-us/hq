#!/usr/bin/env node
/**
 * HQ Worker Runtime CDK App
 *
 * Entry point for deploying the worker runtime infrastructure.
 * Deploys: S3 bucket, ECR repos, Budget alerts, CodeBuild project,
 *          ECS cluster + task definition, API ECS service + ALB.
 * Configure via environment variables or cdk.context.json.
 */

import * as cdk from 'aws-cdk-lib';
import { HqWorkerRuntimeStack } from './task-definition.js';
import { HqS3Stack } from './s3-stack.js';
import { HqEcrStack } from './ecr-stack.js';
import { HqBudgetStack } from './budget-stack.js';
import { HqSecretsStack } from './secrets-stack.js';
import { HqCodeBuildStack } from './codebuild-stack.js';
import { HqApiServiceStack } from './api-service-stack.js';

/**
 * Get a string from CDK context or environment variable
 */
function getConfig(
  app: cdk.App,
  contextKey: string,
  envKey: string,
  defaultValue?: string
): string | undefined {
  const contextValue = app.node.tryGetContext(contextKey) as string | undefined;
  const envValue = process.env[envKey];
  return contextValue ?? envValue ?? defaultValue;
}

/**
 * Get a number from CDK context or environment variable
 */
function getNumberConfig(
  app: cdk.App,
  contextKey: string,
  envKey: string,
  defaultValue: number
): number {
  const stringValue = getConfig(app, contextKey, envKey);
  if (!stringValue) {
    return defaultValue;
  }
  const parsed = parseInt(stringValue, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

const app = new cdk.App();

// Get configuration from context or environment
const envName = getConfig(app, 'env', 'HQ_ENV', 'dev') ?? 'dev';
const cpu = getNumberConfig(app, 'cpu', 'HQ_WORKER_CPU', 512);
const memory = getNumberConfig(app, 'memory', 'HQ_WORKER_MEMORY', 1024);
const alertEmail = getConfig(app, 'alertEmail', 'HQ_ALERT_EMAIL');
const apiDomainName = getConfig(app, 'apiDomainName', 'HQ_API_DOMAIN_NAME');
const hostedZoneDomain = getConfig(app, 'hostedZoneDomain', 'HQ_HOSTED_ZONE_DOMAIN');

const awsEnv = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
};

const commonTags = {
  project: 'hq-cloud',
  environment: envName,
  'managed-by': 'cdk',
};

// --- S3 bucket (other stacks depend on this) ---
const s3Stack = new HqS3Stack(app, `HqCloudS3-${envName}`, {
  envName,
  env: awsEnv,
  tags: commonTags,
});

// --- ECR repository ---
const ecrStack = new HqEcrStack(app, `HqCloudEcr-${envName}`, {
  envName,
  env: awsEnv,
  tags: commonTags,
});

// --- Budget alerts ---
new HqBudgetStack(app, `HqCloudBudget-${envName}`, {
  envName,
  monthlyBudgetUsd: 100,
  alertEmail,
  env: awsEnv,
  tags: commonTags,
});

// --- Secrets Manager ---
const secretsStack = new HqSecretsStack(app, `HqCloudSecrets-${envName}`, {
  envName,
  env: awsEnv,
  tags: commonTags,
});

// --- CodeBuild project (container image builds) ---
const codebuildStack = new HqCodeBuildStack(app, `HqCloudCodeBuild-${envName}`, {
  envName,
  workerRuntimeRepository: ecrStack.repository,
  apiRepository: ecrStack.apiRepository,
  env: awsEnv,
  tags: commonTags,
});
codebuildStack.addDependency(ecrStack);

// --- Worker Runtime (ECS cluster + task definition) ---
// imageUri comes from ECR stack output or config override
const imageUri = getConfig(app, 'imageUri', 'HQ_WORKER_IMAGE_URI')
  ?? ecrStack.repository.repositoryUri;
const imageTag = getConfig(app, 'imageTag', 'HQ_WORKER_IMAGE_TAG', 'latest') ?? 'latest';

const runtimeStack = new HqWorkerRuntimeStack(app, `HqWorkerRuntime-${envName}`, {
  imageUri,
  imageTag,
  s3BucketArn: s3Stack.bucket.bucketArn,
  secretsArn: secretsStack.secret.secretArn,
  cpu,
  memory,
  env: awsEnv,
  tags: commonTags,
});
runtimeStack.addDependency(s3Stack);
runtimeStack.addDependency(ecrStack);
runtimeStack.addDependency(secretsStack);

// --- API ECS Service + ALB ---
const apiImageTag = getConfig(app, 'apiImageTag', 'HQ_API_IMAGE_TAG', 'latest') ?? 'latest';

const apiServiceStack = new HqApiServiceStack(app, `HqCloudApiService-${envName}`, {
  envName,
  vpc: runtimeStack.vpc,
  cluster: runtimeStack.cluster,
  apiRepository: ecrStack.apiRepository,
  apiImageTag,
  secret: secretsStack.secret,
  s3BucketName: s3Stack.bucket.bucketName,
  s3Region: awsEnv.region,
  sessionTaskDefinitionArn: runtimeStack.taskDefinition.taskDefinition.taskDefinitionArn,
  ecsSubnets: runtimeStack.getSubnetIds().join(','),
  ecsSecurityGroups: runtimeStack.securityGroup.securityGroupId,
  domainName: apiDomainName,
  hostedZoneDomain,
  env: awsEnv,
  tags: commonTags,
});
apiServiceStack.addDependency(runtimeStack);
apiServiceStack.addDependency(ecrStack);
apiServiceStack.addDependency(secretsStack);
apiServiceStack.addDependency(s3Stack);

app.synth();
