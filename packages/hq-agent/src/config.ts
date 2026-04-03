import { config as loadDotenv } from 'dotenv';
loadDotenv();

export const config = {
  // Server
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  // Data
  DATA_DIR: process.env.DATA_DIR ?? './data',
  // HOST_DATA_DIR: the EC2 host path that maps to DATA_DIR inside this container.
  // Docker-in-Docker: bind-mount sources must use the outer host path, not the container path.
  // If not set, falls back to DATA_DIR (works for local dev without Docker-in-Docker).
  HOST_DATA_DIR: process.env.HOST_DATA_DIR ?? process.env.DATA_DIR ?? './data',

  // Container engine
  MAX_CONCURRENT_CONTAINERS: parseInt(process.env.MAX_CONCURRENT_CONTAINERS ?? '3', 10),
  CONTAINER_TIMEOUT_MS: parseInt(process.env.CONTAINER_TIMEOUT_MS ?? '1800000', 10),
  AGENT_IMAGE: process.env.AGENT_IMAGE ?? 'hq-cloud-agent:latest',

  // Channels
  TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED === 'true',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',
  SLACK_ENABLED: process.env.SLACK_ENABLED === 'true',
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN ?? '',
  SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN ?? '',
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET ?? '',

  // HQ sync
  HQ_REPO_URL: process.env.HQ_REPO_URL ?? '',
  HQ_SYNC_DIR: process.env.HQ_SYNC_DIR ?? './hq-sync',
  HQ_WEBHOOK_SECRET: process.env.HQ_WEBHOOK_SECRET ?? '',

  // S3 backup
  S3_BUCKET: process.env.S3_BUCKET ?? '',
  S3_PREFIX: process.env.S3_PREFIX ?? 'hq-cloud',
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? '', // Optional: for R2 or custom endpoint
  AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
  BACKUP_INTERVAL_MS: parseInt(process.env.BACKUP_INTERVAL_MS ?? '1800000', 10),

  // Claude
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  CLAUDE_MODEL: process.env.CLAUDE_MODEL ?? 'claude-opus-4-6',
};
