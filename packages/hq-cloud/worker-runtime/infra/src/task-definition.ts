/**
 * ECS Fargate Task Definition for HQ Worker Runtime
 *
 * AWS CDK construct that creates the Fargate task definition with:
 * - CPU/memory configuration
 * - IAM roles for S3 access
 * - VPC networking
 * - Environment variable injection from spawn requests
 */

import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { DEFAULT_TASK_CONFIG } from '../../types/infra/index.js';
import type { HealthCheckConfig, S3AccessConfig } from '../../types/infra/index.js';

/**
 * Properties for creating the HQ Worker Task Definition
 */
export interface HqWorkerTaskDefinitionProps {
  /**
   * ECR repository URI for the worker image
   */
  readonly imageUri: string;

  /**
   * Image tag to use (defaults to 'latest')
   */
  readonly imageTag?: string;

  /**
   * CPU size in vCPU units (256 = 0.25 vCPU, 512 = 0.5 vCPU)
   * @default 512 (0.5 vCPU)
   */
  readonly cpu?: number;

  /**
   * Memory size in MiB
   * @default 1024 (1 GB)
   */
  readonly memory?: number;

  /**
   * S3 bucket ARN for worker file sync
   */
  readonly s3BucketArn: string;

  /**
   * Optional S3 path prefix for worker access
   */
  readonly s3PathPrefix?: string;

  /**
   * CloudWatch log group name
   * @default '/hq/workers'
   */
  readonly logGroupName?: string;

  /**
   * Log retention in days
   * @default 30
   */
  readonly logRetentionDays?: number;

  /**
   * Enable container insights
   * @default true
   */
  readonly enableContainerInsights?: boolean;

  /**
   * Additional IAM policies to attach to task role
   */
  readonly additionalPolicies?: iam.PolicyStatement[];

  /**
   * Custom environment variables to add to all tasks
   */
  readonly defaultEnvironment?: Record<string, string>;

  /**
   * Health check configuration override
   */
  readonly healthCheck?: Partial<HealthCheckConfig>;

  /**
   * ARN of the Secrets Manager secret containing sensitive config.
   * When provided, the execution role gets secretsmanager:GetSecretValue
   * permission and secrets are injected into the container via valueFrom.
   *
   * Expected secret keys: CLERK_SECRET_KEY, CLERK_JWT_KEY, MONGODB_URI, CLAUDE_CREDENTIALS_JSON
   */
  readonly secretsArn?: string;

  /**
   * Map of container env var name -> secret JSON key for secrets injection.
   * Only used when secretsArn is provided.
   * @default All four keys: CLERK_SECRET_KEY, CLERK_JWT_KEY, MONGODB_URI, CLAUDE_CREDENTIALS_JSON
   */
  readonly secretKeys?: Record<string, string>;
}

/**
 * CDK Construct for HQ Worker Runtime ECS Fargate Task Definition
 *
 * Creates a complete Fargate task definition with:
 * - Task execution role (for ECR, CloudWatch)
 * - Task role (for S3 access, application permissions)
 * - Container definition with health checks
 * - CloudWatch log configuration
 */
export class HqWorkerTaskDefinition extends Construct {
  /**
   * The ECS Fargate task definition
   */
  public readonly taskDefinition: ecs.FargateTaskDefinition;

  /**
   * The task execution role (used for pulling images, writing logs)
   */
  public readonly executionRole: iam.Role;

  /**
   * The task role (used by the application for S3 access, etc.)
   */
  public readonly taskRole: iam.Role;

  /**
   * The CloudWatch log group for container logs
   */
  public readonly logGroup: logs.LogGroup;

  /**
   * The container definition for the worker
   */
  public readonly container: ecs.ContainerDefinition;

  constructor(scope: Construct, id: string, props: HqWorkerTaskDefinitionProps) {
    super(scope, id);

    const cpu = props.cpu ?? DEFAULT_TASK_CONFIG.cpu;
    const memory = props.memory ?? DEFAULT_TASK_CONFIG.memory;
    const logGroupName = props.logGroupName ?? '/hq/workers';
    const logRetentionDays = props.logRetentionDays ?? 30;

    // Create CloudWatch Log Group
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName,
      retention: this.getLogRetention(logRetentionDays),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create Task Execution Role (for pulling images, writing logs)
    this.executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Task execution role for HQ worker containers',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    // Create Task Role (for application permissions - S3 access, etc.)
    this.taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Task role for HQ worker application permissions',
    });

    // Add S3 access policy for file sync
    this.addS3AccessPolicy({
      bucketArn: props.s3BucketArn,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      pathPrefix: props.s3PathPrefix,
    });

    // Add additional policies if provided
    if (props.additionalPolicies) {
      for (const policy of props.additionalPolicies) {
        this.taskRole.addToPolicy(policy);
      }
    }

    // Create the Fargate Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: memory,
      cpu,
      executionRole: this.executionRole,
      taskRole: this.taskRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    // Build the image reference
    const imageUri = props.imageTag
      ? `${props.imageUri}:${props.imageTag}`
      : `${props.imageUri}:latest`;

    // Build secrets map if secretsArn is provided
    const containerSecrets: Record<string, ecs.Secret> | undefined =
      props.secretsArn ? this.buildSecrets(props.secretsArn, props.secretKeys) : undefined;

    // Create the container definition
    // stopTimeout: 45s gives the container time for graceful sync (15s API grace + 30s SIGTERM handler)
    this.container = this.taskDefinition.addContainer('session', {
      image: ecs.ContainerImage.fromRegistry(imageUri),
      essential: true,
      logging: ecs.LogDriver.awsLogs({
        logGroup: this.logGroup,
        streamPrefix: 'session',
      }),
      healthCheck: this.buildHealthCheck(props.healthCheck),
      environment: props.defaultEnvironment ?? {},
      secrets: containerSecrets,
      stopTimeout: cdk.Duration.seconds(45),
    });

    // Grant execution role permission to read the secret
    if (props.secretsArn) {
      this.grantSecretRead(props.secretsArn, 'api-config');
    }

    // Add outputs
    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinition.taskDefinitionArn,
      description: 'HQ Worker Task Definition ARN',
      exportName: 'HqWorkerTaskDefinitionArn',
    });

    new cdk.CfnOutput(this, 'TaskRoleArn', {
      value: this.taskRole.roleArn,
      description: 'HQ Worker Task Role ARN',
      exportName: 'HqWorkerTaskRoleArn',
    });

    new cdk.CfnOutput(this, 'ExecutionRoleArn', {
      value: this.executionRole.roleArn,
      description: 'HQ Worker Execution Role ARN',
      exportName: 'HqWorkerExecutionRoleArn',
    });
  }

  /**
   * Build ECS secrets map from a Secrets Manager secret ARN.
   * Each entry maps an env var name to a specific JSON key in the secret.
   */
  private buildSecrets(
    secretArn: string,
    keyMap?: Record<string, string>
  ): Record<string, ecs.Secret> {
    // Default: inject all four standard secret keys
    const defaultKeys: Record<string, string> = {
      CLERK_SECRET_KEY: 'CLERK_SECRET_KEY',
      CLERK_JWT_KEY: 'CLERK_JWT_KEY',
      MONGODB_URI: 'MONGODB_URI',
      CLAUDE_CREDENTIALS_JSON: 'CLAUDE_CREDENTIALS_JSON',
    };

    const keys = keyMap ?? defaultKeys;
    const secret = secretsmanager.Secret.fromSecretCompleteArn(this, 'ImportedSecret', secretArn);

    const result: Record<string, ecs.Secret> = {};
    for (const [envVarName, jsonField] of Object.entries(keys)) {
      result[envVarName] = ecs.Secret.fromSecretsManager(secret, jsonField);
    }

    return result;
  }

  /**
   * Add S3 access policy to the task role
   */
  private addS3AccessPolicy(config: S3AccessConfig): void {
    // Policy for object operations
    const objectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: config.actions.filter((a) => a !== 's3:ListBucket'),
      resources: config.pathPrefix
        ? [`${config.bucketArn}/${config.pathPrefix}/*`]
        : [`${config.bucketArn}/*`],
    });

    // Separate policy for ListBucket (requires bucket-level resource)
    const listBucketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [config.bucketArn],
      conditions: config.pathPrefix
        ? {
            StringLike: {
              's3:prefix': [`${config.pathPrefix}/*`],
            },
          }
        : undefined,
    });

    this.taskRole.addToPolicy(objectPolicy);
    if (config.actions.includes('s3:ListBucket')) {
      this.taskRole.addToPolicy(listBucketPolicy);
    }
  }

  /**
   * Build health check configuration
   */
  private buildHealthCheck(
    override?: Partial<HealthCheckConfig>
  ): ecs.HealthCheck {
    return {
      command: override?.command ?? [
        'CMD-SHELL',
        '/usr/local/bin/healthcheck.sh || exit 1',
      ],
      interval: cdk.Duration.seconds(
        override?.interval ?? DEFAULT_TASK_CONFIG.healthCheckInterval
      ),
      timeout: cdk.Duration.seconds(
        override?.timeout ?? DEFAULT_TASK_CONFIG.healthCheckTimeout
      ),
      retries: override?.retries ?? DEFAULT_TASK_CONFIG.healthCheckRetries,
      startPeriod: cdk.Duration.seconds(
        override?.startPeriod ?? DEFAULT_TASK_CONFIG.healthCheckStartPeriod
      ),
    };
  }

  /**
   * Convert retention days to CDK log retention enum
   */
  private getLogRetention(days: number): logs.RetentionDays {
    const retentionMap: Record<number, logs.RetentionDays> = {
      1: logs.RetentionDays.ONE_DAY,
      3: logs.RetentionDays.THREE_DAYS,
      5: logs.RetentionDays.FIVE_DAYS,
      7: logs.RetentionDays.ONE_WEEK,
      14: logs.RetentionDays.TWO_WEEKS,
      30: logs.RetentionDays.ONE_MONTH,
      60: logs.RetentionDays.TWO_MONTHS,
      90: logs.RetentionDays.THREE_MONTHS,
      120: logs.RetentionDays.FOUR_MONTHS,
      150: logs.RetentionDays.FIVE_MONTHS,
      180: logs.RetentionDays.SIX_MONTHS,
      365: logs.RetentionDays.ONE_YEAR,
      400: logs.RetentionDays.THIRTEEN_MONTHS,
      545: logs.RetentionDays.EIGHTEEN_MONTHS,
      731: logs.RetentionDays.TWO_YEARS,
      1096: logs.RetentionDays.THREE_YEARS,
      1827: logs.RetentionDays.FIVE_YEARS,
      2192: logs.RetentionDays.SIX_YEARS,
      2557: logs.RetentionDays.SEVEN_YEARS,
      2922: logs.RetentionDays.EIGHT_YEARS,
      3288: logs.RetentionDays.NINE_YEARS,
      3653: logs.RetentionDays.TEN_YEARS,
    };
    return retentionMap[days] ?? logs.RetentionDays.ONE_MONTH;
  }

  /**
   * Add environment variables to the container
   * Called at task run time with spawn request data
   */
  public addEnvironmentVariables(env: Record<string, string>): void {
    for (const [name, value] of Object.entries(env)) {
      this.container.addEnvironment(name, value);
    }
  }

  /**
   * Grant read access to a secret for the container
   */
  public grantSecretRead(secretArn: string, _envVarName: string): void {
    // Add permission to read the secret
    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [secretArn],
      })
    );
  }
}

/**
 * Properties for the complete worker runtime stack
 */
export interface HqWorkerRuntimeStackProps extends cdk.StackProps {
  /**
   * VPC for the ECS cluster
   */
  readonly vpc?: ec2.IVpc;

  /**
   * ECR repository URI
   */
  readonly imageUri: string;

  /**
   * Image tag
   */
  readonly imageTag?: string;

  /**
   * S3 bucket ARN for file sync
   */
  readonly s3BucketArn: string;

  /**
   * Task CPU (vCPU units)
   */
  readonly cpu?: number;

  /**
   * Task memory (MiB)
   */
  readonly memory?: number;

  /**
   * ARN of the Secrets Manager secret for injecting sensitive config
   * into the session container task definition via valueFrom.
   */
  readonly secretsArn?: string;
}

/**
 * Complete CDK Stack for HQ Worker Runtime
 *
 * Creates all infrastructure needed to run workers:
 * - ECS Cluster
 * - Task Definition with IAM roles
 * - Security Groups
 * - VPC configuration
 */
export class HqWorkerRuntimeStack extends cdk.Stack {
  /**
   * The ECS cluster
   */
  public readonly cluster: ecs.Cluster;

  /**
   * The task definition construct
   */
  public readonly taskDefinition: HqWorkerTaskDefinition;

  /**
   * Security group for worker tasks
   */
  public readonly securityGroup: ec2.SecurityGroup;

  /**
   * VPC used by the cluster
   */
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: HqWorkerRuntimeStackProps) {
    super(scope, id, props);

    // Use provided VPC or create a new one
    // No NAT gateway — Fargate tasks use public subnets with assignPublicIp: ENABLED
    // for outbound internet via the free Internet Gateway. Saves ~$32/month.
    this.vpc =
      props.vpc ??
      new ec2.Vpc(this, 'WorkerVpc', {
        maxAzs: 2,
        natGateways: 0,
        subnetConfiguration: [
          {
            name: 'public',
            subnetType: ec2.SubnetType.PUBLIC,
            cidrMask: 24,
          },
        ],
      });

    // Free S3 VPC Gateway Endpoint — keeps S3 traffic off the internet
    if (!props.vpc) {
      new ec2.GatewayVpcEndpoint(this, 'S3Endpoint', {
        vpc: this.vpc,
        service: ec2.GatewayVpcEndpointAwsService.S3,
      });
    }

    // Create security group for worker tasks
    this.securityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for HQ worker Fargate tasks',
      allowAllOutbound: true,
    });

    // Create ECS cluster
    this.cluster = new ecs.Cluster(this, 'WorkerCluster', {
      vpc: this.vpc,
      clusterName: 'hq-cloud-dev',
      containerInsights: true,
    });

    // Create task definition
    this.taskDefinition = new HqWorkerTaskDefinition(this, 'TaskDef', {
      imageUri: props.imageUri,
      imageTag: props.imageTag,
      cpu: props.cpu,
      memory: props.memory,
      s3BucketArn: props.s3BucketArn,
      secretsArn: props.secretsArn,
      defaultEnvironment: {
        NODE_ENV: 'production',
        HQ_ROOT: '/hq',
      },
    });

    // Output the cluster ARN
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'HQ Worker ECS Cluster ARN',
      exportName: 'HqWorkerClusterArn',
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'HQ Worker ECS Cluster Name',
      exportName: 'HqWorkerClusterName',
    });

    new cdk.CfnOutput(this, 'SecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'HQ Worker Security Group ID',
      exportName: 'HqWorkerSecurityGroupId',
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'HQ Worker VPC ID',
      exportName: 'HqWorkerVpcId',
    });
  }

  /**
   * Get subnet IDs for running tasks (public subnets — use assignPublicIp: ENABLED)
   */
  public getSubnetIds(): string[] {
    return this.vpc.publicSubnets.map((s) => s.subnetId);
  }
}
