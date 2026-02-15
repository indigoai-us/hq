/**
 * Tests for ECS Fargate Task Definition infrastructure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import {
  HqWorkerTaskDefinition,
  HqWorkerRuntimeStack,
} from '../task-definition.js';

describe('HqWorkerTaskDefinition', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
  });

  it('creates a Fargate task definition with default configuration', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    // Verify task definition is created with Fargate
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
      Cpu: '512',
      Memory: '1024',
    });
  });

  it('creates task definition with custom CPU and memory', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
      cpu: 1024,
      memory: 2048,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Cpu: '1024',
      Memory: '2048',
    });
  });

  it('creates execution role with ECS task execution policy', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    // Verify execution role exists with correct managed policy
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com',
            },
          },
        ],
      },
      ManagedPolicyArns: Match.arrayWith([
        Match.objectLike({
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([
              Match.stringLikeRegexp('AmazonECSTaskExecutionRolePolicy'),
            ]),
          ]),
        }),
      ]),
    });
  });

  it('creates task role with S3 access policy', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    // Verify task role has S3 policy
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['s3:GetObject']),
            Effect: 'Allow',
            Resource: 'arn:aws:s3:::hq-worker-files/*',
          }),
        ]),
      },
    });
  });

  it('creates CloudWatch log group', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
      logGroupName: '/hq/workers/test',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/hq/workers/test',
    });
  });

  it('configures container with health check', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'session',
          Essential: true,
          HealthCheck: Match.objectLike({
            Command: ['CMD-SHELL', '/usr/local/bin/healthcheck.sh || exit 1'],
            Interval: 30,
            Timeout: 10,
            Retries: 3,
            StartPeriod: 60,
          }),
        }),
      ]),
    });
  });

  it('uses specified image tag', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      imageTag: 'v1.0.0',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Image: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker:v1.0.0',
        }),
      ]),
    });
  });

  it('includes default environment variables', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
      defaultEnvironment: {
        NODE_ENV: 'production',
        HQ_ROOT: '/hq',
      },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Environment: Match.arrayWith([
            { Name: 'NODE_ENV', Value: 'production' },
            { Name: 'HQ_ROOT', Value: '/hq' },
          ]),
        }),
      ]),
    });
  });

  it('does not inject secrets when secretsArn is not provided', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    // Container should NOT have Secrets property
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'session',
          Secrets: Match.absent(),
        }),
      ]),
    });
  });

  it('injects all four default secret keys when secretsArn is provided', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
      secretsArn:
        'arn:aws:secretsmanager:us-east-1:804849608251:secret:hq-cloud/dev/api-config-AbCdEf',
    });

    const template = Template.fromStack(stack);

    // Container should have Secrets entries referencing the secret ARN with JSON keys
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'session',
          Secrets: Match.arrayWith([
            Match.objectLike({ Name: 'CLERK_SECRET_KEY' }),
            Match.objectLike({ Name: 'CLERK_JWT_KEY' }),
            Match.objectLike({ Name: 'MONGODB_URI' }),
            Match.objectLike({ Name: 'CLAUDE_CREDENTIALS_JSON' }),
          ]),
        }),
      ]),
    });
  });

  it('grants execution role secretsmanager:GetSecretValue when secretsArn is provided', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
      secretsArn:
        'arn:aws:secretsmanager:us-east-1:804849608251:secret:hq-cloud/dev/api-config-AbCdEf',
    });

    const template = Template.fromStack(stack);

    // Execution role should have a policy with secretsmanager:GetSecretValue
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Effect: 'Allow',
            Resource:
              'arn:aws:secretsmanager:us-east-1:804849608251:secret:hq-cloud/dev/api-config-AbCdEf',
          }),
        ]),
      },
    });
  });

  it('injects only custom secret keys when secretKeys is provided', () => {
    new HqWorkerTaskDefinition(stack, 'TaskDef', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
      secretsArn:
        'arn:aws:secretsmanager:us-east-1:804849608251:secret:hq-cloud/dev/api-config-AbCdEf',
      secretKeys: {
        CLAUDE_CREDENTIALS_JSON: 'CLAUDE_CREDENTIALS_JSON',
      },
    });

    const template = Template.fromStack(stack);

    // Container should have only the specified secret
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'session',
          Secrets: [
            Match.objectLike({ Name: 'CLAUDE_CREDENTIALS_JSON' }),
          ],
        }),
      ]),
    });
  });
});

describe('HqWorkerRuntimeStack', () => {
  it('creates complete infrastructure stack with public-only VPC', () => {
    const app = new cdk.App();
    const stack = new HqWorkerRuntimeStack(app, 'TestStack', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    // Verify VPC is created
    template.resourceCountIs('AWS::EC2::VPC', 1);

    // Verify ECS cluster is created with new name
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'hq-cloud-dev',
      ClusterSettings: Match.arrayWith([
        {
          Name: 'containerInsights',
          Value: 'enabled',
        },
      ]),
    });

    // Verify security group is created
    template.resourceCountIs('AWS::EC2::SecurityGroup', 1);

    // Verify task definition is created
    template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  });

  it('creates VPC with no NAT gateway (public subnets only)', () => {
    const app = new cdk.App();
    const stack = new HqWorkerRuntimeStack(app, 'TestStack', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    // No NAT Gateway should be created
    template.resourceCountIs('AWS::EC2::NatGateway', 0);

    // Should have public subnets (with route to Internet Gateway)
    template.resourceCountIs('AWS::EC2::InternetGateway', 1);
  });

  it('creates S3 VPC Gateway Endpoint', () => {
    const app = new cdk.App();
    const stack = new HqWorkerRuntimeStack(app, 'TestStack', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    // S3 VPC endpoint should exist
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.objectLike({
        'Fn::Join': Match.arrayWith([
          Match.arrayWith([
            Match.stringLikeRegexp('s3'),
          ]),
        ]),
      }),
      VpcEndpointType: 'Gateway',
    });
  });

  it('creates stack with custom CPU and memory', () => {
    const app = new cdk.App();
    const stack = new HqWorkerRuntimeStack(app, 'TestStack', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
      cpu: 2048,
      memory: 4096,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Cpu: '2048',
      Memory: '4096',
    });
  });

  it('creates outputs for resource ARNs', () => {
    const app = new cdk.App();
    const stack = new HqWorkerRuntimeStack(app, 'TestStack', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    // Verify outputs exist
    template.hasOutput('ClusterArn', {});
    template.hasOutput('ClusterName', {});
    template.hasOutput('SecurityGroupId', {});
    template.hasOutput('VpcId', {});
  });

  it('passes secretsArn to task definition when provided', () => {
    const app = new cdk.App();
    const stack = new HqWorkerRuntimeStack(app, 'TestStack', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
      secretsArn:
        'arn:aws:secretsmanager:us-east-1:804849608251:secret:hq-cloud/dev/api-config-AbCdEf',
    });

    const template = Template.fromStack(stack);

    // Task definition container should have secrets
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'session',
          Secrets: Match.arrayWith([
            Match.objectLike({ Name: 'CLERK_SECRET_KEY' }),
            Match.objectLike({ Name: 'CLERK_JWT_KEY' }),
            Match.objectLike({ Name: 'MONGODB_URI' }),
            Match.objectLike({ Name: 'CLAUDE_CREDENTIALS_JSON' }),
          ]),
        }),
      ]),
    });

    // Execution role should have secretsmanager:GetSecretValue permission
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'secretsmanager:GetSecretValue',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  it('does not add secrets when secretsArn is not provided', () => {
    const app = new cdk.App();
    const stack = new HqWorkerRuntimeStack(app, 'TestStack', {
      imageUri: '123456789.dkr.ecr.us-east-1.amazonaws.com/hq-worker',
      s3BucketArn: 'arn:aws:s3:::hq-worker-files',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'session',
          Secrets: Match.absent(),
        }),
      ]),
    });
  });
});
