/**
 * AWS CLI sync fallback for when S3 FUSE mounts are unavailable.
 *
 * Uses `aws s3 sync` to synchronize files between S3 and local filesystem.
 * This is the fallback strategy when neither s3fs nor goofys can mount.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, access, constants } from 'node:fs/promises';
import type { Logger } from 'pino';
import type {
  SyncOperationConfig,
  SyncOperationResult,
  SyncDirection,
} from './types.js';
import type { FsOperations } from './s3-mount-manager.js';

const execFileAsync = promisify(execFile);

/** Options for creating an AwsCliFallback */
export interface AwsCliFallbackOptions {
  /** Custom command executor (for testing) */
  execCommand?: typeof execFileAsync;

  /** Custom filesystem operations (for testing) */
  fsOps?: FsOperations;
}

const defaultFsOps: FsOperations = {
  mkdir,
  access,
  writeFile: async () => { /* noop for default */ },
  rm: async () => { /* noop for default */ },
} as unknown as FsOperations;

/**
 * AWS CLI sync fallback for S3 file access.
 *
 * When FUSE-based mounts are not available (no FUSE device, no s3fs/goofys
 * installed, or mount failures), this class provides file access through
 * periodic `aws s3 sync` operations.
 */
export class AwsCliFallback {
  private readonly logger: Logger;
  private readonly exec: typeof execFileAsync;
  private readonly fs: FsOperations;

  constructor(logger: Logger, options?: AwsCliFallbackOptions) {
    this.logger = logger.child({ component: 'aws-cli-fallback' });
    this.exec = options?.execCommand ?? execFileAsync;
    this.fs = options?.fsOps ?? defaultFsOps;
  }

  /**
   * Perform an S3 sync operation.
   */
  async sync(config: SyncOperationConfig): Promise<SyncOperationResult> {
    const startTime = Date.now();

    try {
      // Ensure local directory exists for pull operations
      if (config.direction === 'pull' || config.direction === 'bidirectional') {
        await this.ensureDirectory(config.localPath);
      }

      if (config.direction === 'bidirectional') {
        return this.bidirectionalSync(config, startTime);
      }

      const args = this.buildSyncArgs(config);
      const { stdout } = await this.exec('aws', args, {
        maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
      });

      const parsed = this.parseOutput(stdout);

      this.logger.info(
        {
          direction: config.direction,
          filesSynced: parsed.filesSynced,
          bytesTransferred: parsed.bytesTransferred,
        },
        'S3 sync completed'
      );

      return {
        success: true,
        filesSynced: parsed.filesSynced,
        bytesTransferred: parsed.bytesTransferred,
        filesDeleted: parsed.filesDeleted,
        durationMs: Date.now() - startTime,
        output: stdout,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { direction: config.direction, error: message },
        'S3 sync failed'
      );

      return {
        success: false,
        filesSynced: 0,
        bytesTransferred: 0,
        filesDeleted: 0,
        durationMs: Date.now() - startTime,
        error: message,
        output: '',
      };
    }
  }

  /**
   * Pull files from S3 to local filesystem.
   * Convenience method for common pull operations.
   */
  async pull(
    s3Uri: string,
    localPath: string,
    options?: Partial<Omit<SyncOperationConfig, 's3Uri' | 'localPath' | 'direction'>>
  ): Promise<SyncOperationResult> {
    return this.sync({
      s3Uri,
      localPath,
      direction: 'pull',
      deleteRemoved: options?.deleteRemoved ?? false,
      excludePatterns: options?.excludePatterns ?? [],
      includePatterns: options?.includePatterns ?? [],
      maxConcurrentRequests: options?.maxConcurrentRequests ?? 10,
      multipartEnabled: options?.multipartEnabled ?? true,
      multipartChunkSizeMb: options?.multipartChunkSizeMb ?? 8,
      dryRun: options?.dryRun ?? false,
    });
  }

  /**
   * Push files from local filesystem to S3.
   * Convenience method for common push operations.
   */
  async push(
    localPath: string,
    s3Uri: string,
    options?: Partial<Omit<SyncOperationConfig, 's3Uri' | 'localPath' | 'direction'>>
  ): Promise<SyncOperationResult> {
    return this.sync({
      s3Uri,
      localPath,
      direction: 'push',
      deleteRemoved: options?.deleteRemoved ?? false,
      excludePatterns: options?.excludePatterns ?? [],
      includePatterns: options?.includePatterns ?? [],
      maxConcurrentRequests: options?.maxConcurrentRequests ?? 10,
      multipartEnabled: options?.multipartEnabled ?? true,
      multipartChunkSizeMb: options?.multipartChunkSizeMb ?? 8,
      dryRun: options?.dryRun ?? false,
    });
  }

  /**
   * Check if the AWS CLI is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.exec('aws', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private methods ───────────────────────────────────────────

  private buildSyncArgs(config: SyncOperationConfig): string[] {
    const args = ['s3', 'sync'];

    // Source and destination based on direction
    if (config.direction === 'pull') {
      args.push(config.s3Uri, config.localPath);
    } else {
      args.push(config.localPath, config.s3Uri);
    }

    // Delete removed files
    if (config.deleteRemoved) {
      args.push('--delete');
    }

    // Exclude patterns
    for (const pattern of config.excludePatterns) {
      args.push('--exclude', pattern);
    }

    // Include patterns
    for (const pattern of config.includePatterns) {
      args.push('--include', pattern);
    }

    // Dry run
    if (config.dryRun) {
      args.push('--dryrun');
    }

    return args;
  }

  private async bidirectionalSync(
    config: SyncOperationConfig,
    startTime: number
  ): Promise<SyncOperationResult> {
    // Pull first (remote -> local)
    const pullResult = await this.sync({
      ...config,
      direction: 'pull',
    });

    if (!pullResult.success) {
      return pullResult;
    }

    // Push (local -> remote)
    const pushResult = await this.sync({
      ...config,
      direction: 'push',
    });

    if (!pushResult.success) {
      return pushResult;
    }

    return {
      success: true,
      filesSynced: pullResult.filesSynced + pushResult.filesSynced,
      bytesTransferred: pullResult.bytesTransferred + pushResult.bytesTransferred,
      filesDeleted: pullResult.filesDeleted + pushResult.filesDeleted,
      durationMs: Date.now() - startTime,
      output: `Pull: ${pullResult.output}\nPush: ${pushResult.output}`,
    };
  }

  private parseOutput(output: string): {
    filesSynced: number;
    bytesTransferred: number;
    filesDeleted: number;
  } {
    const lines = output.split('\n').filter(Boolean);
    let filesSynced = 0;
    let bytesTransferred = 0;
    let filesDeleted = 0;

    for (const line of lines) {
      if (line.startsWith('upload:') || line.startsWith('download:')) {
        filesSynced++;
        // Try to extract size from output like "upload: ./file.txt to s3://bucket/file.txt (1.2 KiB)"
        const sizeMatch = /\(([0-9.]+)\s*(Bytes|KiB|MiB|GiB)\)/.exec(line);
        if (sizeMatch?.[1] && sizeMatch[2]) {
          const size = parseFloat(sizeMatch[1]);
          const unit = sizeMatch[2];
          bytesTransferred += this.convertToBytes(size, unit);
        }
      } else if (line.startsWith('delete:')) {
        filesDeleted++;
      }
    }

    return { filesSynced, bytesTransferred, filesDeleted };
  }

  private convertToBytes(size: number, unit: string): number {
    switch (unit) {
      case 'Bytes':
        return Math.floor(size);
      case 'KiB':
        return Math.floor(size * 1024);
      case 'MiB':
        return Math.floor(size * 1024 * 1024);
      case 'GiB':
        return Math.floor(size * 1024 * 1024 * 1024);
      default:
        return 0;
    }
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      await this.fs.access(path, constants.F_OK);
    } catch {
      await this.fs.mkdir(path, { recursive: true });
    }
  }
}

/**
 * Build default sync configuration for a user's HQ directory.
 */
export function buildDefaultSyncConfig(
  bucketName: string,
  userId: string,
  localPath: string,
  direction: SyncDirection = 'pull'
): SyncOperationConfig {
  return {
    s3Uri: `s3://${bucketName}/${userId}/hq`,
    localPath,
    direction,
    deleteRemoved: false,
    excludePatterns: [
      '.git/*',
      '.git/**',
      'node_modules/*',
      'node_modules/**',
      '.s3fs*',
      '*.tmp',
      '*.swp',
    ],
    includePatterns: [],
    maxConcurrentRequests: 10,
    multipartEnabled: true,
    multipartChunkSizeMb: 8,
    dryRun: false,
  };
}
