/**
 * Tests for CodeBuild Stack
 */

import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HqCodeBuildStack } from '../codebuild-stack.js';
import { HqEcrStack } from '../ecr-stack.js';

/**
 * Helper to create a test stack with ECR dependencies
 */
function createTestStack(overrides?: Partial<ConstructorParameters<typeof HqCodeBuildStack>[2]>) {
  const app = new cdk.App();
  const ecrStack = new HqEcrStack(app, 'TestEcr', { envName: 'dev' });
  const stack = new HqCodeBuildStack(app, 'TestCodeBuild', {
    envName: 'dev',
    workerRuntimeRepository: ecrStack.repository,
    apiRepository: ecrStack.apiRepository,
    ...overrides,
  });
  return { app, ecrStack, stack, template: Template.fromStack(stack) };
}

describe('HqCodeBuildStack', () => {
  it('creates a CodeBuild project with default name', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Name: 'hq-cloud-build-dev',
    });
  });

  it('creates a CodeBuild project with custom name', () => {
    const { template } = createTestStack({ projectName: 'my-custom-build' });

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Name: 'my-custom-build',
    });
  });

  it('uses Amazon Linux 2 standard 5.0 image', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: Match.objectLike({
        Image: 'aws/codebuild/amazonlinux2-x86_64-standard:5.0',
      }),
    });
  });

  it('enables privileged mode for Docker builds', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: Match.objectLike({
        PrivilegedMode: true,
      }),
    });
  });

  it('sets environment variables for account, region, and ECR URIs', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Environment: Match.objectLike({
        EnvironmentVariables: Match.arrayWith([
          Match.objectLike({
            Name: 'AWS_ACCOUNT_ID',
            Type: 'PLAINTEXT',
          }),
          Match.objectLike({
            Name: 'AWS_DEFAULT_REGION',
            Type: 'PLAINTEXT',
          }),
          Match.objectLike({
            Name: 'API_REPO_URI',
            Type: 'PLAINTEXT',
          }),
          Match.objectLike({
            Name: 'WORKER_RUNTIME_REPO_URI',
            Type: 'PLAINTEXT',
          }),
        ]),
      }),
    });
  });

  it('has a build timeout of 30 minutes by default', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      TimeoutInMinutes: 30,
    });
  });

  it('supports custom build timeout', () => {
    const { template } = createTestStack({ buildTimeoutMinutes: 60 });

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      TimeoutInMinutes: 60,
    });
  });

  it('uses NO_SOURCE source type with inline buildspec', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: Match.objectLike({
        Type: 'NO_SOURCE',
        BuildSpec: Match.stringLikeRegexp('docker build'),
      }),
    });
  });

  it('inline buildspec builds both API and worker-runtime images', () => {
    const { template } = createTestStack();

    // The buildspec should contain commands for both image builds
    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: Match.objectLike({
        BuildSpec: Match.stringLikeRegexp('api/Dockerfile'),
      }),
    });

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: Match.objectLike({
        BuildSpec: Match.stringLikeRegexp('Dockerfile\\.session'),
      }),
    });
  });

  it('inline buildspec uses linux/amd64 platform', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: Match.objectLike({
        BuildSpec: Match.stringLikeRegexp('linux/amd64'),
      }),
    });
  });

  it('inline buildspec logs in to ECR', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: Match.objectLike({
        BuildSpec: Match.stringLikeRegexp('ecr get-login-password'),
      }),
    });
  });

  it('inline buildspec pushes images to ECR', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Source: Match.objectLike({
        BuildSpec: Match.stringLikeRegexp('docker push'),
      }),
    });
  });

  it('has IAM policy for ECR GetAuthorizationToken', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ecr:GetAuthorizationToken',
            Effect: 'Allow',
            Resource: '*',
          }),
        ]),
      }),
    });
  });

  it('has IAM policies granting ECR push to repositories', () => {
    const { template } = createTestStack();

    // grantPullPush adds ecr:PutImage in the policy statements
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith([
              'ecr:PutImage',
            ]),
          }),
        ]),
      }),
    });
  });

  it('has outputs for project name and ARN', () => {
    const { template } = createTestStack();

    template.hasOutput('ProjectName', {});
    template.hasOutput('ProjectArn', {});
  });

  it('creates exactly one CodeBuild project', () => {
    const { template } = createTestStack();

    template.resourceCountIs('AWS::CodeBuild::Project', 1);
  });

  it('has description on the project', () => {
    const { template } = createTestStack();

    template.hasResourceProperties('AWS::CodeBuild::Project', {
      Description: Match.stringLikeRegexp('HQ Cloud'),
    });
  });
});
