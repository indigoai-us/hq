/**
 * API ECS Service Stack for HQ Cloud
 *
 * Creates an ECS Fargate service for the API behind an Application Load Balancer:
 * - ACM certificate for custom domain with DNS validation via Route53
 * - Route53 A record aliasing the custom domain to the ALB
 * - ALB with HTTPS listener (port 443) forwarding to API target group on port 3001
 * - HTTP listener (port 80) redirecting to HTTPS
 * - ALB security group allowing inbound HTTP (80) and HTTPS (443)
 * - ECS Fargate service with desired count of 1
 * - API task definition using hq-cloud/api ECR image
 * - Secrets injection from Secrets Manager (CLERK_SECRET_KEY, CLERK_JWT_KEY, MONGODB_URI)
 * - Non-secret env vars set directly (S3_BUCKET_NAME, S3_REGION, ECS_* vars)
 * - Health check on /api/health with 30s interval
 * - WebSocket support via 1-hour idle timeout on ALB
 * - Uses existing VPC and public subnets with assignPublicIp: ENABLED
 */

import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * Properties for the HQ API Service Stack
 */
export interface HqApiServiceStackProps extends cdk.StackProps {
  /**
   * Environment name
   * @default 'dev'
   */
  readonly envName?: string;

  /**
   * The VPC to deploy the service into
   */
  readonly vpc: ec2.IVpc;

  /**
   * The ECS cluster to deploy the service into
   */
  readonly cluster: ecs.ICluster;

  /**
   * The ECR repository for the API image
   */
  readonly apiRepository: ecr.IRepository;

  /**
   * Image tag to use for the API container
   * @default 'latest'
   */
  readonly apiImageTag?: string;

  /**
   * The Secrets Manager secret for sensitive config
   */
  readonly secret: secretsmanager.ISecret;

  /**
   * S3 bucket name for worker file sync
   */
  readonly s3BucketName: string;

  /**
   * S3 region
   * @default 'us-east-1'
   */
  readonly s3Region?: string;

  /**
   * ARN of the session task definition (for spawning worker containers)
   */
  readonly sessionTaskDefinitionArn: string;

  /**
   * Comma-separated subnet IDs for spawning worker tasks
   */
  readonly ecsSubnets: string;

  /**
   * Comma-separated security group IDs for spawning worker tasks
   */
  readonly ecsSecurityGroups: string;

  /**
   * CPU size for the API task
   * @default 512 (0.5 vCPU)
   */
  readonly cpu?: number;

  /**
   * Memory size for the API task in MiB
   * @default 1024 (1 GB)
   */
  readonly memory?: number;

  /**
   * Desired number of API tasks
   * @default 1
   */
  readonly desiredCount?: number;

  /**
   * API container port
   * @default 3001
   */
  readonly containerPort?: number;

  /**
   * Custom domain name for the API (e.g. 'api.hq.getindigo.ai').
   * When provided, creates an ACM certificate, Route53 A record,
   * HTTPS listener on port 443, and HTTP->HTTPS redirect on port 80.
   * When omitted, falls back to HTTP-only with ALB DNS name.
   */
  readonly domainName?: string;

  /**
   * Route53 hosted zone domain name (e.g. 'getindigo.ai').
   * Required when domainName is provided.
   */
  readonly hostedZoneDomain?: string;

  /**
   * ALB idle timeout in seconds (long for WebSocket support)
   * @default 3600 (1 hour)
   */
  readonly albIdleTimeoutSeconds?: number;

  /**
   * Health check path for the ALB target group
   * @default '/api/health'
   */
  readonly healthCheckPath?: string;

  /**
   * Health check interval in seconds
   * @default 30
   */
  readonly healthCheckInterval?: number;

  /**
   * Secret keys to inject from Secrets Manager.
   * Maps container env var name to the JSON key in the secret.
   * @default { CLERK_SECRET_KEY, CLERK_JWT_KEY, MONGODB_URI }
   */
  readonly secretKeys?: Record<string, string>;

  /**
   * Additional environment variables for the API container
   */
  readonly additionalEnvironment?: Record<string, string>;
}

/**
 * CDK Stack for the HQ Cloud API ECS Fargate Service with ALB
 */
export class HqApiServiceStack extends cdk.Stack {
  /**
   * The Application Load Balancer
   */
  public readonly alb: elbv2.ApplicationLoadBalancer;

  /**
   * The ALB security group
   */
  public readonly albSecurityGroup: ec2.SecurityGroup;

  /**
   * The ECS Fargate service
   */
  public readonly service: ecs.FargateService;

  /**
   * The API task definition
   */
  public readonly taskDefinition: ecs.FargateTaskDefinition;

  /**
   * The ALB DNS name (URL to reach the API)
   */
  public readonly albDnsName: string;

  /**
   * The public API URL (custom domain with HTTPS if configured, else ALB DNS with HTTP)
   */
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: HqApiServiceStackProps) {
    super(scope, id, props);

    const envName = props.envName ?? 'dev';
    const cpu = props.cpu ?? 512;
    const memory = props.memory ?? 1024;
    const desiredCount = props.desiredCount ?? 1;
    const containerPort = props.containerPort ?? 3001;
    const albIdleTimeoutSeconds = props.albIdleTimeoutSeconds ?? 3600;
    const healthCheckPath = props.healthCheckPath ?? '/api/health';
    const healthCheckInterval = props.healthCheckInterval ?? 30;
    const s3Region = props.s3Region ?? 'us-east-1';
    const domainName = props.domainName;
    const hostedZoneDomain = props.hostedZoneDomain;

    // Validate: if domainName is provided, hostedZoneDomain must also be provided
    if (domainName && !hostedZoneDomain) {
      throw new Error(
        'hostedZoneDomain is required when domainName is provided'
      );
    }

    // --- ALB Security Group ---
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for HQ Cloud API ALB',
      allowAllOutbound: true,
    });

    // Allow inbound HTTP (port 80)
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow inbound HTTP'
    );

    // Allow inbound HTTPS (port 443)
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow inbound HTTPS'
    );

    // --- Application Load Balancer ---
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ApiAlb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: this.albSecurityGroup,
      idleTimeout: cdk.Duration.seconds(albIdleTimeoutSeconds),
      loadBalancerName: `hq-cloud-api-${envName}`,
    });

    this.albDnsName = this.alb.loadBalancerDnsName;

    // --- DNS + HTTPS (when custom domain is configured) ---
    let certificate: acm.ICertificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (domainName && hostedZoneDomain) {
      // Look up the existing Route53 hosted zone
      hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: hostedZoneDomain,
      });

      // Create ACM certificate with DNS validation
      certificate = new acm.Certificate(this, 'ApiCertificate', {
        domainName,
        validation: acm.CertificateValidation.fromDns(hostedZone),
        certificateName: `hq-cloud-api-${envName}`,
      });
    }

    // --- API Task Definition ---
    // Execution role (for pulling images, writing logs, reading secrets)
    const executionRole = new iam.Role(this, 'ApiExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Execution role for HQ Cloud API task',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    // Grant execution role permission to read secrets
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.secret.secretArn],
      })
    );

    // Task role (for application permissions — ECS RunTask for spawning sessions)
    const taskRole = new iam.Role(this, 'ApiTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Task role for HQ Cloud API application permissions',
    });

    // Grant API the ability to run ECS tasks (spawn worker sessions)
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:RunTask',
          'ecs:StopTask',
          'ecs:DescribeTasks',
          'ecs:ListTasks',
        ],
        resources: ['*'],
      })
    );

    // Grant API the ability to pass roles to ECS tasks
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'ecs-tasks.amazonaws.com',
          },
        },
      })
    );

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      memoryLimitMiB: memory,
      cpu,
      executionRole,
      taskRole,
      family: `hq-cloud-api-${envName}`,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    // CloudWatch log group
    const logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/hq/api/${envName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Build secrets map for the container
    const defaultSecretKeys: Record<string, string> = {
      CLERK_SECRET_KEY: 'CLERK_SECRET_KEY',
      CLERK_JWT_KEY: 'CLERK_JWT_KEY',
      MONGODB_URI: 'MONGODB_URI',
    };
    const secretKeys = props.secretKeys ?? defaultSecretKeys;

    const containerSecrets: Record<string, ecs.Secret> = {};
    for (const [envVarName, jsonField] of Object.entries(secretKeys)) {
      containerSecrets[envVarName] = ecs.Secret.fromSecretsManager(
        props.secret,
        jsonField
      );
    }

    // Build environment variables
    const environment: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: String(containerPort),
      S3_BUCKET_NAME: props.s3BucketName,
      S3_REGION: s3Region,
      ECS_CLUSTER_ARN: props.cluster.clusterArn,
      ECS_SESSION_TASK_DEFINITION_ARN: props.sessionTaskDefinitionArn,
      ECS_SUBNETS: props.ecsSubnets,
      ECS_SECURITY_GROUPS: props.ecsSecurityGroups,
      ...props.additionalEnvironment,
    };

    // Add API container
    const container = this.taskDefinition.addContainer('api', {
      image: ecs.ContainerImage.fromEcrRepository(
        props.apiRepository,
        props.apiImageTag ?? 'latest'
      ),
      essential: true,
      logging: ecs.LogDriver.awsLogs({
        logGroup,
        streamPrefix: 'api',
      }),
      environment,
      secrets: containerSecrets,
      portMappings: [
        {
          containerPort,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    // --- ECS Service Security Group ---
    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      'ApiServiceSecurityGroup',
      {
        vpc: props.vpc,
        description: 'Security group for HQ Cloud API ECS service',
        allowAllOutbound: true,
      }
    );

    // Allow traffic from ALB to the API container port
    serviceSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(containerPort),
      'Allow traffic from ALB'
    );

    // --- ECS Fargate Service ---
    this.service = new ecs.FargateService(this, 'ApiService', {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount,
      assignPublicIp: true,
      securityGroups: [serviceSecurityGroup],
      serviceName: `hq-cloud-api-${envName}`,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // --- ALB Target Group & Listeners ---
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
      vpc: props.vpc,
      port: containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: healthCheckPath,
        interval: cdk.Duration.seconds(healthCheckInterval),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Register the ECS service as the target
    this.service.attachToApplicationTargetGroup(targetGroup);

    if (certificate) {
      // HTTPS listener on port 443 with ACM certificate — primary traffic path
      this.alb.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        sslPolicy: elbv2.SslPolicy.TLS13_RES,
        defaultTargetGroups: [targetGroup],
      });

      // HTTP listener on port 80 — permanent redirect to HTTPS (301)
      this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          permanent: true,
        }),
      });
    } else {
      // No custom domain — HTTP-only listener forwarding to target group
      this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultTargetGroups: [targetGroup],
      });
    }

    // --- Route53 A record (when custom domain is configured) ---
    if (domainName && hostedZone) {
      new route53.ARecord(this, 'ApiAliasRecord', {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.LoadBalancerTarget(this.alb)
        ),
        comment: `HQ Cloud API (${envName})`,
      });
    }

    // --- ECS_API_URL environment variable ---
    // This is a self-referencing URL — session containers use it to connect back.
    // When a custom domain is configured, use HTTPS with the domain name.
    // Otherwise, fall back to HTTP with the ALB DNS name.
    if (domainName) {
      this.apiUrl = `https://${domainName}`;
      container.addEnvironment('ECS_API_URL', `https://${domainName}`);
    } else {
      this.apiUrl = `http://${this.alb.loadBalancerDnsName}`;
      container.addEnvironment(
        'ECS_API_URL',
        `http://${this.alb.loadBalancerDnsName}`
      );
    }

    // --- Outputs ---
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'HQ Cloud API ALB DNS Name',
      exportName: `HqCloudApiAlbDns-${envName}`,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      description: 'HQ Cloud API URL (custom domain if configured)',
      exportName: `HqCloudApiUrl-${envName}`,
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: this.service.serviceArn,
      description: 'HQ Cloud API ECS Service ARN',
      exportName: `HqCloudApiServiceArn-${envName}`,
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinition.taskDefinitionArn,
      description: 'HQ Cloud API Task Definition ARN',
      exportName: `HqCloudApiTaskDefArn-${envName}`,
    });

    if (domainName) {
      new cdk.CfnOutput(this, 'CustomDomain', {
        value: domainName,
        description: 'HQ Cloud API Custom Domain',
        exportName: `HqCloudApiDomain-${envName}`,
      });

      if (certificate) {
        new cdk.CfnOutput(this, 'CertificateArn', {
          value: (certificate as acm.Certificate).certificateArn,
          description: 'ACM Certificate ARN for the API domain',
          exportName: `HqCloudApiCertArn-${envName}`,
        });
      }
    }
  }
}
