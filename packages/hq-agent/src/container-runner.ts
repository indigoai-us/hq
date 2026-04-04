/**
 * container-runner.ts — spawns and monitors Docker containers via CLI.
 *
 * Uses child_process.execFile to run `docker run ...` for security
 * (avoids shell injection vs exec with a shell string).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { config } from './config.js';
import { runtime } from './container-runtime.js';
import { validateAllMounts } from './mount-security.js';
import type { ContainerRunOptions, ContainerResult } from './types.js';

const execFileAsync = promisify(execFile);

export { ContainerRunOptions, ContainerResult };

/** Generate a unique container name for this run, including team slug. */
function containerName(teamId: string, groupId: string, messageId: number): string {
  const rand = crypto.randomBytes(4).toString('hex');
  // Sanitise for Docker naming (only alphanum and dash)
  const safeTeam = teamId.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 15);
  const safeGroup = groupId.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 25);
  return `hq-${safeTeam}-${safeGroup}-${messageId}-${rand}`;
}

/** Build docker run argument list (no shell string — safe for execFile). */
export function buildDockerArgs(
  name: string,
  options: ContainerRunOptions,
  allowedBases: string[]
): string[] {
  // Validate all mount source paths before building args
  const hostPaths = options.mounts.map((m) => m.src);
  validateAllMounts(hostPaths, allowedBases);

  const args: string[] = ['run', '--rm', '--name', name];

  // Resource limits for safety
  args.push('--memory', '512m');
  args.push('--cpus', '0.5');
  // Agent containers need outbound network for Anthropic API calls.
  // Default Docker bridge network provides this with no inbound exposure.
  // args.push('--network', 'none');

  // Mount volumes
  for (const mount of options.mounts) {
    const roFlag = mount.readOnly ? ':ro' : '';
    args.push('-v', `${mount.src}:${mount.dst}${roFlag}`);
  }

  // Environment variables
  for (const [key, value] of Object.entries(options.env)) {
    args.push('-e', `${key}=${value}`);
  }

  args.push(options.image);

  return args;
}

/**
 * Run a Docker container and wait for it to complete.
 *
 * @param options - Container run configuration.
 * @param allowedBases - Directories that mount sources must be within.
 * @returns ContainerResult with exit code, stdout, stderr, and timedOut flag.
 */
export async function runContainer(
  options: ContainerRunOptions,
  allowedBases?: string[]
): Promise<ContainerResult> {
  const bases = allowedBases ?? [
    path.resolve(config.DATA_DIR),
    os.tmpdir(),
  ];

  const teamId = options.env.TEAM_ID ?? config.TEAM_ID;
  const name = containerName(teamId, options.groupId, options.messageId);
  const args = buildDockerArgs(name, options, bases);

  runtime.register({
    containerId: name,
    groupId: options.groupId,
    messageId: options.messageId,
    sessionId: options.sessionId,
    startedAt: Date.now(),
    timeoutMs: options.timeoutMs,
  });

  try {
    const result = await execFileAsync('docker', args, {
      timeout: options.timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB stdout/stderr buffer
    });

    runtime.deregister(name);

    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: false,
    };
  } catch (err: unknown) {
    runtime.deregister(name);

    const error = err as NodeJS.ErrnoException & {
      code?: string | number;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };

    const timedOut = error.killed === true || error.code === 'ETIMEDOUT';

    // If container is still running after timeout, attempt cleanup
    if (timedOut) {
      try {
        await execFileAsync('docker', ['kill', name], { timeout: 5000 });
      } catch {
        // Best-effort; container may have already stopped
      }
    }

    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? (error instanceof Error ? error.message : String(error)),
      timedOut,
    };
  }
}
