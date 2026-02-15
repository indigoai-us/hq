/**
 * Session Orchestrator
 *
 * Manages ECS Fargate tasks for Claude Code sessions.
 * Handles launching, stopping, and monitoring session containers.
 */

import { ECSClient, RunTaskCommand, StopTaskCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs';
import { config } from '../config.js';
import { updateSessionStatus } from '../data/sessions.js';
import { getUserSettings, getDecryptedClaudeToken } from '../data/user-settings.js';
import { getOrCreateRelay, getRelay, removeRelay, broadcastStartupPhase } from '../ws/index.js';
import {
  setConnectionTimeout,
  clearConnectionTimeout,
} from './connection-timeout.js';
import type { FastifyBaseLogger as Logger } from 'fastify';

// Re-export for consumers
export { clearConnectionTimeout, CONNECTION_TIMEOUT_MS } from './connection-timeout.js';

// --- Configuration ---

export interface EcsSessionConfig {
  clusterArn: string;
  taskDefinitionArn: string;
  subnets: string[];
  securityGroups: string[];
  containerName: string;
  assignPublicIp: boolean;
}

function getEcsConfig(): EcsSessionConfig {
  return {
    clusterArn: config.ecsClusterArn,
    taskDefinitionArn: config.ecsSessionTaskDefinitionArn,
    subnets: config.ecsSubnets,
    securityGroups: config.ecsSecurityGroups,
    containerName: 'session',
    assignPublicIp: true, // Public subnets, no NAT gateway
  };
}

// --- ECS Client ---

let ecsClient: ECSClient | null = null;

function getEcsClient(): ECSClient {
  if (!ecsClient) {
    ecsClient = new ECSClient({ region: config.s3Region });
  }
  return ecsClient;
}

// --- Launch Session ---

export interface LaunchSessionOptions {
  sessionId: string;
  userId: string;
  accessToken: string;
  prompt?: string;
  workerContext?: string;
  logger: Logger;
}

/**
 * Launch an ECS Fargate task for a Claude Code session.
 *
 * Steps:
 * 1. Look up user's S3 prefix from settings
 * 2. Create WebSocket relay (so container can connect when ready)
 * 3. Run ECS task with session environment variables
 * 4. Update session with ECS task ARN
 */
export async function launchSession(opts: LaunchSessionOptions): Promise<{
  taskArn: string;
}> {
  const { sessionId, userId, accessToken, prompt, workerContext, logger } = opts;
  const ecsConfig = getEcsConfig();

  if (!ecsConfig.clusterArn || !ecsConfig.taskDefinitionArn) {
    throw new Error('ECS not configured. Set ECS_CLUSTER_ARN and ECS_SESSION_TASK_DEFINITION_ARN.');
  }

  // Get user's S3 prefix and Claude token
  const settings = await getUserSettings(userId);
  const s3Prefix = settings?.s3Prefix ?? `${userId}/hq`;
  const userClaudeToken = await getDecryptedClaudeToken(userId);

  // Create relay so container can connect
  getOrCreateRelay(sessionId, userId, {
    initialPrompt: prompt,
    workerContext,
  });

  // Build API URL that the container will connect to
  const apiUrl = config.ecsApiUrl || `http://localhost:${config.port}`;

  // Launch ECS task
  const client = getEcsClient();
  const command = new RunTaskCommand({
    cluster: ecsConfig.clusterArn,
    taskDefinition: ecsConfig.taskDefinitionArn,
    launchType: 'FARGATE',
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: ecsConfig.subnets,
        securityGroups: ecsConfig.securityGroups,
        assignPublicIp: ecsConfig.assignPublicIp ? 'ENABLED' : 'DISABLED',
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: ecsConfig.containerName,
          environment: [
            { name: 'SESSION_ID', value: sessionId },
            { name: 'USER_ID', value: userId },
            { name: 'HQ_API_URL', value: apiUrl },
            { name: 'S3_BUCKET', value: config.s3BucketName },
            { name: 'S3_PREFIX', value: s3Prefix },
            { name: 'S3_REGION', value: config.s3Region },
            { name: 'CLAUDE_CODE_SESSION_ACCESS_TOKEN', value: accessToken },
            // Pass user's Claude OAuth token (per-user, from settings)
            ...(userClaudeToken ? [{ name: 'CLAUDE_CODE_OAUTH_TOKEN', value: userClaudeToken }] : []),
            // Fallback: API key from config (e.g. for service accounts)
            ...(!userClaudeToken && config.anthropicApiKey ? [{ name: 'ANTHROPIC_API_KEY', value: config.anthropicApiKey }] : []),
          ],
        },
      ],
    },
    tags: [
      { key: 'hq:sessionId', value: sessionId },
      { key: 'hq:userId', value: userId },
    ],
  });

  const result = await client.send(command);

  const task = result.tasks?.[0];
  if (!task?.taskArn) {
    const failure = result.failures?.[0];
    const reason = failure?.reason ?? 'Unknown ECS error';
    logger.error({ sessionId, reason, failure }, 'Failed to launch ECS task');

    // Broadcast failure to any listening browsers
    const failRelay = getRelay(sessionId);
    if (failRelay) {
      broadcastStartupPhase(failRelay, 'failed', { error: reason });
    }

    await updateSessionStatus(sessionId, 'errored', { error: reason });
    removeRelay(sessionId);
    throw new Error(`Failed to launch session: ${reason}`);
  }

  const taskArn = task.taskArn;
  logger.info({ sessionId, taskArn }, 'ECS task launched');

  // Update session with task ARN (stays in 'starting' until container connects)
  await updateSessionStatus(sessionId, 'starting', { ecsTaskArn: taskArn });

  // ECS task submitted — move to connecting phase
  const connectRelay = getRelay(sessionId);
  if (connectRelay) {
    broadcastStartupPhase(connectRelay, 'connecting');
  }

  // Start connection timeout — if container doesn't connect within 60s, mark errored
  startConnectionTimeout(sessionId, taskArn, logger);

  return { taskArn };
}

// --- Connection Timeout ---

/**
 * Start a timeout that marks the session as errored if the container
 * doesn't connect within CONNECTION_TIMEOUT_MS (3 minutes).
 * Containers need time for: ECS provisioning (~20s) + S3 file sync (can be 1000+ files)
 * + credential setup + Claude Code startup.
 */
function startConnectionTimeout(sessionId: string, taskArn: string, logger: Logger): void {
  setConnectionTimeout(sessionId, async () => {
    // Check if the relay has a Claude connection (meaning it connected in time)
    const relay = getRelay(sessionId);
    if (relay?.claudeSocket) {
      return; // Container connected, no timeout needed
    }

    logger.warn({ sessionId, taskArn }, 'Container connection timeout after 3 minutes');

    // Broadcast failure to browsers before DB update
    if (relay) {
      broadcastStartupPhase(relay, 'failed', {
        error: 'Container connection timeout: container did not connect within 3 minutes',
      });
    }

    await updateSessionStatus(sessionId, 'errored', {
      error: 'Container connection timeout: container did not connect within 3 minutes',
    });

    // Stop the ECS task since it's not going to connect
    try {
      const client = getEcsClient();
      const cfg = getEcsConfig();
      await client.send(
        new StopTaskCommand({
          cluster: cfg.clusterArn,
          task: taskArn,
          reason: 'Connection timeout',
        })
      );
    } catch {
      // Best-effort
    }

    removeRelay(sessionId);
  });
}

// --- Stop Session ---

export interface StopSessionOptions {
  sessionId: string;
  ecsTaskArn: string;
  logger: Logger;
}

/**
 * Stop an ECS Fargate task for a session.
 */
export async function stopSession(opts: StopSessionOptions): Promise<void> {
  const { sessionId, ecsTaskArn, logger } = opts;
  const ecsConfig = getEcsConfig();

  // Clear connection timeout if still pending
  clearConnectionTimeout(sessionId);

  if (!ecsConfig.clusterArn) {
    logger.warn({ sessionId }, 'ECS not configured, skipping task stop');
    return;
  }

  try {
    const client = getEcsClient();
    await client.send(
      new StopTaskCommand({
        cluster: ecsConfig.clusterArn,
        task: ecsTaskArn,
        reason: 'Session stopped by user',
      })
    );

    logger.info({ sessionId, ecsTaskArn }, 'ECS task stop requested');
  } catch (err) {
    // Task may already be stopped
    logger.warn({ sessionId, ecsTaskArn, error: (err as Error).message }, 'Failed to stop ECS task');
  }

  // Clean up relay
  removeRelay(sessionId);
}

// --- Describe Session Task ---

/**
 * Get the current ECS task status for a session.
 */
export async function describeSessionTask(
  ecsTaskArn: string
): Promise<{ status: string; stoppedReason?: string } | null> {
  const ecsConfig = getEcsConfig();
  if (!ecsConfig.clusterArn) return null;

  try {
    const client = getEcsClient();
    const result = await client.send(
      new DescribeTasksCommand({
        cluster: ecsConfig.clusterArn,
        tasks: [ecsTaskArn],
      })
    );

    const task = result.tasks?.[0];
    if (!task) return null;

    return {
      status: task.lastStatus ?? 'UNKNOWN',
      stoppedReason: task.stoppedReason ?? undefined,
    };
  } catch {
    return null;
  }
}

// --- Check if ECS is configured ---

/**
 * Returns true if ECS orchestration is fully configured.
 * When false, sessions are created but containers aren't launched automatically.
 */
export function isEcsConfigured(): boolean {
  const cfg = getEcsConfig();
  return !!(cfg.clusterArn && cfg.taskDefinitionArn && cfg.subnets.length > 0);
}

// --- Reset for testing ---

export function resetEcsClient(): void {
  ecsClient = null;
}
