/**
 * Tests for HQ Cloud API Service Stack (ALB + ECS Fargate)
 */

import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { HqApiServiceStack } from '../api-service-stack.js';

/**
 * Helper to create a test stack with all required dependencies
 */
function createTestStack(
  overrides?: Partial<ConstructorParameters<typeof HqApiServiceStack>[2]>
) {
  const app = new cdk.App();

  // Create prerequisite resources in a dependency stack
  const depStack = new cdk.Stack(app, 'DepStack', {
    env: { account: '804849608251', region: 'us-east-1' },
  });

  const vpc = new ec2.Vpc(depStack, 'TestVpc', {
    maxAzs: 2,
    natGateways: 0,
    subnetConfiguration: [
      { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
    ],
  });

  const cluster = new ecs.Cluster(depStack, 'TestCluster', {
    vpc,
    clusterName: 'hq-cloud-dev',
  });

  const apiRepository = new ecr.Repository(depStack, 'TestApiRepo', {
    repositoryName: 'hq-cloud/api',
  });

  const secret = new secretsmanager.Secret(depStack, 'TestSecret', {
    secretName: 'hq-cloud/dev/api-config',
  });

  const stack = new HqApiServiceStack(app, 'TestApiService', {
    envName: 'dev',
    vpc,
    cluster,
    apiRepository,
    secret,
    s3BucketName: 'hq-cloud-files-dev',
    s3Region: 'us-east-1',
    sessionTaskDefinitionArn:
      'arn:aws:ecs:us-east-1:804849608251:task-definition/hq-worker-runtime:1',
    ecsSubnets: 'subnet-abc123,subnet-def456',
    ecsSecurityGroups: 'sg-0030602b7772b78b9',
    env: { account: '804849608251', region: 'us-east-1' },
    ...overrides,
  });

  return { app, stack, depStack, vpc, cluster, apiRepository, secret };
}

describe('HqApiServiceStack', () => {
  describe('Application Load Balancer', () => {
    it('creates an internet-facing ALB', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::LoadBalancer',
        {
          Scheme: 'internet-facing',
          Type: 'application',
          LoadBalancerAttributes: Match.arrayWith([
            Match.objectLike({
              Key: 'idle_timeout.timeout_seconds',
              Value: '3600',
            }),
          ]),
        }
      );
    });

    it('creates ALB with correct name', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::LoadBalancer',
        {
          Name: 'hq-cloud-api-dev',
        }
      );
    });

    it('creates ALB security group allowing HTTP and HTTPS inbound', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      // Should have a security group with port 80 and port 443 ingress rules
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for HQ Cloud API ALB',
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            IpProtocol: 'tcp',
            FromPort: 80,
            ToPort: 80,
            CidrIp: '0.0.0.0/0',
          }),
          Match.objectLike({
            IpProtocol: 'tcp',
            FromPort: 443,
            ToPort: 443,
            CidrIp: '0.0.0.0/0',
          }),
        ]),
      });
    });

    it('supports custom idle timeout', () => {
      const { stack } = createTestStack({ albIdleTimeoutSeconds: 7200 });
      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::LoadBalancer',
        {
          LoadBalancerAttributes: Match.arrayWith([
            Match.objectLike({
              Key: 'idle_timeout.timeout_seconds',
              Value: '7200',
            }),
          ]),
        }
      );
    });
  });

  describe('ALB Listener and Target Group', () => {
    it('creates HTTP listener on port 80', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::Listener',
        {
          Port: 80,
          Protocol: 'HTTP',
        }
      );
    });

    it('creates target group with health check on /api/health', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::TargetGroup',
        {
          Port: 3001,
          Protocol: 'HTTP',
          TargetType: 'ip',
          HealthCheckPath: '/api/health',
          HealthCheckIntervalSeconds: 30,
          HealthyThresholdCount: 2,
          UnhealthyThresholdCount: 3,
        }
      );
    });

    it('supports custom health check path and interval', () => {
      const { stack } = createTestStack({
        healthCheckPath: '/health',
        healthCheckInterval: 60,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::TargetGroup',
        {
          HealthCheckPath: '/health',
          HealthCheckIntervalSeconds: 60,
        }
      );
    });
  });

  describe('ECS Task Definition', () => {
    it('creates Fargate task definition with default CPU and memory', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        RequiresCompatibilities: ['FARGATE'],
        NetworkMode: 'awsvpc',
        Cpu: '512',
        Memory: '1024',
        Family: 'hq-cloud-api-dev',
      });
    });

    it('creates task definition with custom CPU and memory', () => {
      const { stack } = createTestStack({ cpu: 1024, memory: 2048 });
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Cpu: '1024',
        Memory: '2048',
      });
    });

    it('creates container with correct port mapping', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: 'api',
            Essential: true,
            PortMappings: [
              {
                ContainerPort: 3001,
                Protocol: 'tcp',
              },
            ],
          }),
        ]),
      });
    });

    it('sets non-secret environment variables', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: 'api',
            Environment: Match.arrayWith([
              { Name: 'NODE_ENV', Value: 'production' },
              { Name: 'PORT', Value: '3001' },
              { Name: 'S3_BUCKET_NAME', Value: 'hq-cloud-files-dev' },
              { Name: 'S3_REGION', Value: 'us-east-1' },
              { Name: 'ECS_SUBNETS', Value: 'subnet-abc123,subnet-def456' },
              { Name: 'ECS_SECURITY_GROUPS', Value: 'sg-0030602b7772b78b9' },
            ]),
          }),
        ]),
      });
    });

    it('injects secrets from Secrets Manager', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: 'api',
            Secrets: Match.arrayWith([
              Match.objectLike({ Name: 'CLERK_SECRET_KEY' }),
              Match.objectLike({ Name: 'CLERK_JWT_KEY' }),
              Match.objectLike({ Name: 'MONGODB_URI' }),
            ]),
          }),
        ]),
      });
    });

    it('does not inject CLAUDE_CREDENTIALS_JSON (API does not need it)', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      // Get the task definition and check secrets do not include CLAUDE_CREDENTIALS_JSON
      const taskDefs = template.findResources('AWS::ECS::TaskDefinition');
      const taskDef = Object.values(taskDefs)[0];
      const containerDefs = taskDef.Properties.ContainerDefinitions;
      const apiContainer = containerDefs.find(
        (c: Record<string, unknown>) => c.Name === 'api'
      );
      const secretNames = (
        apiContainer.Secrets as Array<{ Name: string }>
      ).map((s) => s.Name);

      expect(secretNames).not.toContain('CLAUDE_CREDENTIALS_JSON');
    });

    it('sets ECS_API_URL environment variable referencing ALB DNS', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      // ECS_API_URL should be set and reference the ALB DNS name
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: 'api',
            Environment: Match.arrayWith([
              Match.objectLike({
                Name: 'ECS_API_URL',
              }),
            ]),
          }),
        ]),
      });
    });
  });

  describe('ECS Service', () => {
    it('creates Fargate service with desired count of 1', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::Service', {
        LaunchType: 'FARGATE',
        DesiredCount: 1,
        ServiceName: 'hq-cloud-api-dev',
      });
    });

    it('creates service with public IP assignment', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::Service', {
        NetworkConfiguration: {
          AwsvpcConfiguration: Match.objectLike({
            AssignPublicIp: 'ENABLED',
          }),
        },
      });
    });

    it('supports custom desired count', () => {
      const { stack } = createTestStack({ desiredCount: 2 });
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::Service', {
        DesiredCount: 2,
      });
    });
  });

  describe('IAM Roles', () => {
    it('creates execution role with ECS task execution policy', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Role', {
        Description: 'Execution role for HQ Cloud API task',
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: { Service: 'ecs-tasks.amazonaws.com' },
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

    it('grants execution role secretsmanager:GetSecretValue', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

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

    it('grants task role ECS RunTask permissions for spawning sessions', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                'ecs:RunTask',
                'ecs:StopTask',
                'ecs:DescribeTasks',
                'ecs:ListTasks',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('grants task role iam:PassRole for ECS tasks', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'iam:PassRole',
              Effect: 'Allow',
              Condition: {
                StringEquals: {
                  'iam:PassedToService': 'ecs-tasks.amazonaws.com',
                },
              },
            }),
          ]),
        },
      });
    });
  });

  describe('Security Groups', () => {
    it('creates service security group allowing traffic from ALB', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      // The service security group should have an ingress rule from ALB SG on port 3001
      template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        IpProtocol: 'tcp',
        FromPort: 3001,
        ToPort: 3001,
        Description: 'Allow traffic from ALB',
      });
    });
  });

  describe('CloudWatch Logs', () => {
    it('creates log group with correct name', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/hq/api/dev',
        RetentionInDays: 30,
      });
    });
  });

  describe('Outputs', () => {
    it('outputs ALB DNS name', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasOutput('AlbDnsName', {});
    });

    it('outputs ALB URL', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasOutput('AlbUrl', {});
    });

    it('outputs service ARN', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasOutput('ServiceArn', {});
    });

    it('outputs task definition ARN', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasOutput('TaskDefinitionArn', {});
    });
  });

  describe('WebSocket support', () => {
    it('sets ALB idle timeout to 3600s for WebSocket support', () => {
      const { stack } = createTestStack();
      const template = Template.fromStack(stack);

      template.hasResourceProperties(
        'AWS::ElasticLoadBalancingV2::LoadBalancer',
        {
          LoadBalancerAttributes: Match.arrayWith([
            Match.objectLike({
              Key: 'idle_timeout.timeout_seconds',
              Value: '3600',
            }),
          ]),
        }
      );
    });
  });
});
