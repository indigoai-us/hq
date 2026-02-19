interface Config {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;
  corsOrigin: string | string[] | boolean;
  wsHeartbeatInterval: number;
  wsPingTimeout: number;
  clerkSecretKey: string;
  clerkJwtKey: string;
  mongodbUri: string;
  hqDir: string;
  skipAuth: boolean;
  s3BucketName: string;
  s3Region: string;
  // ECS session orchestration
  ecsClusterArn: string;
  ecsSessionTaskDefinitionArn: string;
  ecsSubnets: string[];
  ecsSecurityGroups: string[];
  ecsApiUrl: string;
  anthropicApiKey: string;
  claudeCredentialsJson: string;
  tokenEncryptionKey: string;
  clerkPublishableKey: string;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config: Config = {
  port: getEnvNumber('PORT', 3001),
  host: getEnv('HOST', '0.0.0.0'),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  logLevel: getEnv('LOG_LEVEL', 'info'),
  corsOrigin: getEnv('CORS_ORIGIN', '*') === '*' ? true : getEnv('CORS_ORIGIN', '*').split(','),
  wsHeartbeatInterval: getEnvNumber('WS_HEARTBEAT_INTERVAL', 30000),
  wsPingTimeout: getEnvNumber('WS_PING_TIMEOUT', 10000),
  clerkSecretKey: getEnv('CLERK_SECRET_KEY', ''),
  clerkJwtKey: getEnv('CLERK_JWT_KEY', '').replace(/\\n/g, '\n'),
  mongodbUri: getEnv('MONGODB_URI', ''),
  hqDir: getEnv('HQ_DIR', process.platform === 'win32' ? 'C:\\hq' : '/hq'),
  skipAuth: getEnv('SKIP_AUTH', '') === 'true',
  s3BucketName: getEnv('S3_BUCKET_NAME', `hq-cloud-files-${getEnv('NODE_ENV', 'development')}`),
  s3Region: getEnv('S3_REGION', 'us-east-1'),
  // ECS session orchestration
  ecsClusterArn: getEnv('ECS_CLUSTER_ARN', ''),
  ecsSessionTaskDefinitionArn: getEnv('ECS_SESSION_TASK_DEFINITION_ARN', ''),
  ecsSubnets: getEnv('ECS_SUBNETS', '').split(',').filter(Boolean),
  ecsSecurityGroups: getEnv('ECS_SECURITY_GROUPS', '').split(',').filter(Boolean),
  ecsApiUrl: getEnv('ECS_API_URL', ''),
  anthropicApiKey: getEnv('ANTHROPIC_API_KEY', ''),
  claudeCredentialsJson: getEnv('CLAUDE_CREDENTIALS_JSON', ''),
  tokenEncryptionKey: getEnv('TOKEN_ENCRYPTION_KEY', ''),
  clerkPublishableKey: getEnv('CLERK_PUBLISHABLE_KEY', 'pk_live_Y2xlcmsuZ2V0aW5kaWdvLmFpJA'),
};
