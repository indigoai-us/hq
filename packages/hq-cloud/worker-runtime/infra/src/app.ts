#!/usr/bin/env node
/**
 * HQ Worker Runtime CDK App
 *
 * Entry point for deploying the worker runtime infrastructure.
 * Configure via environment variables or cdk.context.json.
 */

import * as cdk from 'aws-cdk-lib';
import { HqWorkerRuntimeStack } from './task-definition.js';

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
 * Get a required string from CDK context or environment variable
 */
function getRequiredConfig(
  app: cdk.App,
  contextKey: string,
  envKey: string
): string {
  const value = getConfig(app, contextKey, envKey);
  if (!value) {
    throw new Error(
      `Missing required configuration: ${contextKey}. ` +
        `Set via CDK context (-c ${contextKey}=...) or ${envKey} environment variable.`
    );
  }
  return value;
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
const imageUri = getRequiredConfig(app, 'imageUri', 'HQ_WORKER_IMAGE_URI');
const imageTag = getConfig(app, 'imageTag', 'HQ_WORKER_IMAGE_TAG', 'latest') ?? 'latest';
const s3BucketArn = getRequiredConfig(app, 's3BucketArn', 'HQ_WORKER_S3_BUCKET_ARN');
const cpu = getNumberConfig(app, 'cpu', 'HQ_WORKER_CPU', 512);
const memory = getNumberConfig(app, 'memory', 'HQ_WORKER_MEMORY', 1024);
const envName = getConfig(app, 'env', 'HQ_ENV', 'dev') ?? 'dev';

// Create the stack
new HqWorkerRuntimeStack(app, `HqWorkerRuntime-${envName}`, {
  imageUri,
  imageTag,
  s3BucketArn,
  cpu,
  memory,
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
  },
  tags: {
    Project: 'hq-cloud',
    Component: 'worker-runtime',
    Environment: envName,
    ManagedBy: 'cdk',
  },
});

app.synth();
