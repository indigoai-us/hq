/**
 * Infrastructure types for HQ Worker Runtime
 *
 * Defines interfaces for ECS Fargate task definitions and related configurations.
 */

/**
 * CPU size options for Fargate tasks
 * Measured in vCPU units (256 = 0.25 vCPU, 512 = 0.5 vCPU, etc.)
 */
export type FargateCpuSize = 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384;

/**
 * Memory size options for Fargate tasks (in MiB)
 * Must be compatible with CPU size per Fargate specs
 */
export type FargateMemorySize =
  | 512
  | 1024
  | 2048
  | 3072
  | 4096
  | 5120
  | 6144
  | 7168
  | 8192
  | 16384
  | 30720
  | 61440
  | 122880;

/**
 * Environment variable definition
 */
export interface EnvironmentVariable {
  /** Variable name */
  name: string;
  /** Variable value (plain text) */
  value: string;
}

/**
 * Secret environment variable reference
 * References secrets from AWS Secrets Manager or SSM Parameter Store
 */
export interface SecretEnvironmentVariable {
  /** Variable name */
  name: string;
  /** ARN of the secret in Secrets Manager or SSM Parameter Store */
  valueFrom: string;
}

/**
 * Log configuration for container
 */
export interface LogConfiguration {
  /** Log driver to use */
  logDriver: 'awslogs' | 'splunk' | 'fluentd' | 'json-file';
  /** Driver-specific options */
  options?: Record<string, string>;
}

/**
 * AWS CloudWatch Logs configuration
 */
export interface AwsLogsConfiguration extends LogConfiguration {
  logDriver: 'awslogs';
  options: {
    'awslogs-group': string;
    'awslogs-region': string;
    'awslogs-stream-prefix': string;
    'awslogs-create-group'?: string;
  };
}

/**
 * Health check configuration for container
 */
export interface HealthCheckConfig {
  /** Command to run for health check */
  command: string[];
  /** Interval between checks in seconds */
  interval: number;
  /** Timeout for each check in seconds */
  timeout: number;
  /** Number of retries before marking unhealthy */
  retries: number;
  /** Startup period before health checks begin in seconds */
  startPeriod: number;
}

/**
 * Port mapping configuration
 */
export interface PortMapping {
  /** Container port */
  containerPort: number;
  /** Host port (usually same as container port for awsvpc) */
  hostPort?: number;
  /** Protocol */
  protocol: 'tcp' | 'udp';
}

/**
 * VPC networking configuration for Fargate tasks
 */
export interface VpcNetworkConfig {
  /** VPC ID */
  vpcId: string;
  /** Subnet IDs for task placement */
  subnetIds: string[];
  /** Security group IDs */
  securityGroupIds: string[];
  /** Whether to assign public IP */
  assignPublicIp: boolean;
}

/**
 * Container definition within a task
 */
export interface ContainerDefinition {
  /** Container name */
  name: string;
  /** Docker image URI (ECR, Docker Hub, etc.) */
  image: string;
  /** Whether this is the essential container */
  essential: boolean;
  /** CPU units for this container (optional, inherits from task) */
  cpu?: number;
  /** Memory limit in MiB (hard limit) */
  memory?: number;
  /** Memory reservation in MiB (soft limit) */
  memoryReservation?: number;
  /** Port mappings */
  portMappings?: PortMapping[];
  /** Environment variables */
  environment?: EnvironmentVariable[];
  /** Secret environment variables */
  secrets?: SecretEnvironmentVariable[];
  /** Entry point override */
  entryPoint?: string[];
  /** Command override */
  command?: string[];
  /** Working directory */
  workingDirectory?: string;
  /** Health check configuration */
  healthCheck?: HealthCheckConfig;
  /** Log configuration */
  logConfiguration?: LogConfiguration;
  /** Disable networking */
  disableNetworking?: boolean;
  /** Read-only root filesystem */
  readonlyRootFilesystem?: boolean;
  /** User to run as */
  user?: string;
  /** Linux capabilities to add/drop */
  linuxParameters?: {
    capabilities?: {
      add?: string[];
      drop?: string[];
    };
    initProcessEnabled?: boolean;
  };
}

/**
 * IAM role permissions for S3 access
 */
export interface S3AccessConfig {
  /** S3 bucket ARN for worker file sync */
  bucketArn: string;
  /** Allowed actions (e.g., s3:GetObject, s3:PutObject) */
  actions: string[];
  /** Optional path prefix within bucket */
  pathPrefix?: string;
}

/**
 * IAM role configuration for task execution and task role
 */
export interface TaskIamConfig {
  /** Task execution role ARN (for pulling images, writing logs) */
  executionRoleArn?: string;
  /** Task role ARN (for application permissions like S3 access) */
  taskRoleArn?: string;
  /** S3 access configuration for worker file sync */
  s3Access?: S3AccessConfig;
  /** Additional managed policy ARNs to attach */
  additionalPolicyArns?: string[];
}

/**
 * ECS Fargate Task Definition configuration
 */
export interface TaskDefinitionConfig {
  /** Task definition family name */
  family: string;
  /** Task-level CPU (in vCPU units: 256, 512, 1024, etc.) */
  cpu: FargateCpuSize;
  /** Task-level memory (in MiB) */
  memory: FargateMemorySize;
  /** Container definitions */
  containerDefinitions: ContainerDefinition[];
  /** IAM configuration */
  iam: TaskIamConfig;
  /** Network mode (always 'awsvpc' for Fargate) */
  networkMode: 'awsvpc';
  /** Fargate platform version */
  platformVersion?: 'LATEST' | '1.4.0' | '1.3.0';
  /** Task tags */
  tags?: Record<string, string>;
  /** Ephemeral storage in GiB (21-200, default 21) */
  ephemeralStorage?: number;
}

/**
 * Input from spawn request for creating a task
 */
export interface SpawnTaskInput {
  /** Spawn tracking ID */
  trackingId: string;
  /** Worker ID from HQ registry */
  workerId: string;
  /** Skill to execute */
  skill: string;
  /** Skill parameters */
  parameters: Record<string, unknown>;
  /** HQ API URL for worker communication */
  hqApiUrl: string;
  /** HQ API key for worker authentication */
  hqApiKey: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Resource tier override (small/medium/large). If omitted, resolved from worker type defaults. */
  resourceTier?: ResourceTier;
}

/**
 * Environment variables derived from spawn request
 */
export interface SpawnEnvironment {
  /** HQ API URL */
  HQ_API_URL: string;
  /** HQ API Key (should be passed as secret) */
  HQ_API_KEY: string;
  /** Worker ID */
  WORKER_ID: string;
  /** Skill to execute */
  WORKER_SKILL: string;
  /** Skill parameters as JSON */
  WORKER_PARAMS: string;
  /** Spawn tracking ID */
  SPAWN_TRACKING_ID: string;
  /** Node environment */
  NODE_ENV: string;
}

/**
 * Resolved task definition with all values populated
 */
export interface ResolvedTaskDefinition {
  /** AWS Task Definition ARN */
  taskDefinitionArn: string;
  /** Task family */
  family: string;
  /** Revision number */
  revision: number;
  /** Container definitions */
  containerDefinitions: ContainerDefinition[];
  /** CPU */
  cpu: string;
  /** Memory */
  memory: string;
  /** Status */
  status: 'ACTIVE' | 'INACTIVE' | 'DELETE_IN_PROGRESS';
}

/**
 * Worker runtime infrastructure configuration
 * Contains all settings needed to deploy the worker runtime
 */
export interface WorkerRuntimeInfraConfig {
  /** AWS region */
  region: string;
  /** ECR repository URI for worker image */
  ecrRepositoryUri: string;
  /** Image tag to use */
  imageTag: string;
  /** Default task definition configuration */
  taskDefinition: TaskDefinitionConfig;
  /** VPC networking configuration */
  vpc: VpcNetworkConfig;
  /** ECS cluster name */
  clusterName: string;
  /** CloudWatch log group */
  logGroupName: string;
  /** S3 bucket for worker file sync */
  s3BucketName: string;
}

/**
 * Resource tier names for worker scaling
 *
 * Tiers define pre-configured CPU/memory combinations:
 * - small:  0.5 vCPU / 1 GB  (default, suitable for most workers)
 * - medium: 1 vCPU   / 2 GB  (code workers, moderate workloads)
 * - large:  2 vCPU   / 4 GB  (heavy computation, large repos)
 */
export type ResourceTier = 'small' | 'medium' | 'large';

/**
 * Resource tier specification mapping tier name to Fargate resources
 */
export interface ResourceTierSpec {
  /** Tier name */
  tier: ResourceTier;
  /** CPU in Fargate vCPU units */
  cpu: FargateCpuSize;
  /** Memory in MiB */
  memory: FargateMemorySize;
  /** Human-readable description */
  description: string;
}

/**
 * Pre-defined resource tier specifications
 */
export const RESOURCE_TIERS: Record<ResourceTier, ResourceTierSpec> = {
  small: {
    tier: 'small',
    cpu: 512,
    memory: 1024,
    description: '0.5 vCPU / 1 GB',
  },
  medium: {
    tier: 'medium',
    cpu: 1024,
    memory: 2048,
    description: '1 vCPU / 2 GB',
  },
  large: {
    tier: 'large',
    cpu: 2048,
    memory: 4096,
    description: '2 vCPU / 4 GB',
  },
} as const;

/**
 * Default resource tier
 */
export const DEFAULT_RESOURCE_TIER: ResourceTier = 'small';

/**
 * Default configuration values
 */
export const DEFAULT_TASK_CONFIG = {
  /** Default CPU: 0.5 vCPU (512 units) */
  cpu: 512 as FargateCpuSize,
  /** Default memory: 1GB (1024 MiB) */
  memory: 1024 as FargateMemorySize,
  /** Default platform version */
  platformVersion: 'LATEST' as const,
  /** Default ephemeral storage in GiB */
  ephemeralStorage: 21,
  /** Default health check interval */
  healthCheckInterval: 30,
  /** Default health check timeout */
  healthCheckTimeout: 10,
  /** Default health check retries */
  healthCheckRetries: 3,
  /** Default health check start period */
  healthCheckStartPeriod: 60,
} as const;

/**
 * Helper to convert spawn request to environment variables
 */
export function spawnInputToEnvironment(
  input: SpawnTaskInput,
  nodeEnv: string = 'production'
): SpawnEnvironment {
  return {
    HQ_API_URL: input.hqApiUrl,
    HQ_API_KEY: input.hqApiKey,
    WORKER_ID: input.workerId,
    WORKER_SKILL: input.skill,
    WORKER_PARAMS: JSON.stringify(input.parameters),
    SPAWN_TRACKING_ID: input.trackingId,
    NODE_ENV: nodeEnv,
  };
}

/**
 * Helper to convert environment object to container environment array
 */
export function environmentToContainerEnv(
  env: Record<string, string>
): EnvironmentVariable[] {
  return Object.entries(env).map(([name, value]) => ({ name, value }));
}
