/**
 * S3 Mount Manager for worker containers.
 *
 * Manages FUSE-based S3 filesystem mounts using s3fs or goofys.
 * Provides automatic backend detection, mounting, unmounting,
 * health checks, and fallback to AWS CLI sync.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, access, constants, writeFile, rm } from 'node:fs/promises';
import type { Logger } from 'pino';
import type {
  S3MountConfig,
  MountState,
  MountOperationResult,
  BackendAvailability,
  MountBackend,
} from './types.js';
import { buildMountConfig, validateMountConfig } from './config.js';
import { buildCacheArgs } from './cache-config.js';
import { AwsCliFallback } from './aws-cli-fallback.js';

const execFileAsync = promisify(execFile);

/** Options for creating an S3MountManager */
export interface S3MountManagerOptions {
  /** Configuration overrides */
  config?: Partial<S3MountConfig>;

  /** Custom command executor (for testing) */
  execCommand?: typeof execFileAsync;

  /** Custom filesystem operations (for testing) */
  fsOps?: FsOperations;
}

/** Filesystem operations interface (for testability) */
export interface FsOperations {
  mkdir: typeof mkdir;
  access: typeof access;
  writeFile: typeof writeFile;
  rm: typeof rm;
}

const defaultFsOps: FsOperations = {
  mkdir,
  access,
  writeFile,
  rm,
};

/**
 * Manages S3 filesystem mounts in worker containers.
 *
 * Usage:
 *   const manager = new S3MountManager(logger);
 *   const result = await manager.mount();
 *   // ... use mounted filesystem at /hq ...
 *   await manager.unmount();
 */
export class S3MountManager {
  private readonly config: S3MountConfig;
  private readonly logger: Logger;
  private readonly exec: typeof execFileAsync;
  private readonly fs: FsOperations;
  private state: MountState;
  private fallback: AwsCliFallback | null = null;

  constructor(logger: Logger, options?: S3MountManagerOptions) {
    this.config = buildMountConfig(options?.config);
    this.logger = logger.child({ component: 's3-mount-manager' });
    this.exec = options?.execCommand ?? execFileAsync;
    this.fs = options?.fsOps ?? defaultFsOps;

    this.state = {
      status: 'unmounted',
      backend: null,
      mountPoint: this.config.mountPoint,
      s3Uri: this.buildS3Uri(),
      mountedAt: null,
      lastError: null,
      fallbackActive: false,
      pid: null,
    };
  }

  /** Get the current mount configuration */
  getConfig(): S3MountConfig {
    return { ...this.config };
  }

  /** Get the current mount state */
  getState(): MountState {
    return { ...this.state };
  }

  /**
   * Mount the S3 bucket to the local filesystem.
   *
   * Attempts to mount using the preferred backend. If it fails and
   * fallback is enabled, switches to AWS CLI sync mode.
   */
  async mount(): Promise<MountOperationResult> {
    const startTime = Date.now();

    // Validate config
    const errors = validateMountConfig(this.config);
    if (errors.length > 0) {
      return this.failResult(
        `Configuration errors: ${errors.join('; ')}`,
        startTime
      );
    }

    // Check if already mounted
    if (this.state.status === 'mounted') {
      return {
        success: true,
        state: this.getState(),
        message: 'Already mounted',
        durationMs: Date.now() - startTime,
      };
    }

    this.state.status = 'mounting';
    this.logger.info(
      { mountPoint: this.config.mountPoint, backend: this.config.preferredBackend },
      'Attempting S3 mount'
    );

    // Check backend availability
    const availability = await this.checkBackendAvailability();

    // Try preferred backend first
    const backend = this.selectBackend(availability);

    if (backend) {
      const result = await this.mountWithBackend(backend, startTime);
      if (result.success) {
        return result;
      }

      this.logger.warn(
        { backend, error: result.message },
        'Primary mount backend failed'
      );

      // Try alternate backend
      const alternate = backend === 's3fs' ? 'goofys' : 's3fs';
      const alternateAvailable =
        alternate === 's3fs' ? availability.s3fsAvailable : availability.goofysAvailable;

      if (alternateAvailable) {
        const altResult = await this.mountWithBackend(alternate, startTime);
        if (altResult.success) {
          return altResult;
        }
        this.logger.warn(
          { backend: alternate, error: altResult.message },
          'Alternate mount backend also failed'
        );
      }
    }

    // Fall back to AWS CLI sync
    if (this.config.enableFallback && availability.awsCliAvailable) {
      return this.activateFallback(startTime);
    }

    return this.failResult(
      'No mount backend available and fallback is disabled',
      startTime
    );
  }

  /**
   * Unmount the S3 filesystem.
   */
  async unmount(): Promise<MountOperationResult> {
    const startTime = Date.now();

    if (this.state.status === 'unmounted') {
      return {
        success: true,
        state: this.getState(),
        message: 'Already unmounted',
        durationMs: Date.now() - startTime,
      };
    }

    if (this.state.fallbackActive) {
      this.fallback = null;
      this.state.status = 'unmounted';
      this.state.fallbackActive = false;
      this.state.mountedAt = null;
      this.state.pid = null;
      return {
        success: true,
        state: this.getState(),
        message: 'Fallback sync deactivated',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      this.logger.info(
        { mountPoint: this.config.mountPoint },
        'Unmounting S3 filesystem'
      );

      await this.exec('fusermount', ['-u', this.config.mountPoint]);

      this.state.status = 'unmounted';
      this.state.backend = null;
      this.state.mountedAt = null;
      this.state.pid = null;

      this.logger.info('S3 filesystem unmounted successfully');

      return {
        success: true,
        state: this.getState(),
        message: 'Unmounted successfully',
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Try lazy unmount as fallback
      try {
        await this.exec('fusermount', ['-uz', this.config.mountPoint]);
        this.state.status = 'unmounted';
        this.state.backend = null;
        this.state.mountedAt = null;
        this.state.pid = null;

        return {
          success: true,
          state: this.getState(),
          message: 'Unmounted with lazy unmount',
          durationMs: Date.now() - startTime,
        };
      } catch (lazyErr) {
        const lazyMessage = lazyErr instanceof Error ? lazyErr.message : String(lazyErr);
        this.state.status = 'error';
        this.state.lastError = `Unmount failed: ${message}; lazy unmount also failed: ${lazyMessage}`;

        return this.failResult(this.state.lastError, startTime);
      }
    }
  }

  /**
   * Check if the mount is healthy by verifying the mount point is accessible.
   */
  async isHealthy(): Promise<boolean> {
    if (this.state.status !== 'mounted' && !this.state.fallbackActive) {
      return false;
    }

    if (this.state.fallbackActive) {
      return true; // Fallback is always "healthy" if active
    }

    try {
      await this.fs.access(this.config.mountPoint, constants.R_OK | constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check availability of mount backends.
   */
  async checkBackendAvailability(): Promise<BackendAvailability> {
    const [s3fs, goofys, awsCli, fuse] = await Promise.all([
      this.checkCommand('s3fs', ['--version']),
      this.checkCommand('goofys', ['--version']),
      this.checkCommand('aws', ['--version']),
      this.checkFuseAvailability(),
    ]);

    const availability: BackendAvailability = {
      s3fsAvailable: s3fs.available && fuse,
      s3fsVersion: s3fs.version,
      goofysAvailable: goofys.available && fuse,
      goofysVersion: goofys.version,
      awsCliAvailable: awsCli.available,
      awsCliVersion: awsCli.version,
      fuseAvailable: fuse,
    };

    this.logger.debug({ availability }, 'Backend availability check');
    return availability;
  }

  /**
   * Get the AWS CLI fallback instance (creates one if needed).
   */
  getFallback(): AwsCliFallback | null {
    return this.fallback;
  }

  // ─── Private methods ───────────────────────────────────────────

  private buildS3Uri(): string {
    const prefix = this.config.prefix ? `/${this.config.prefix}` : '';
    return `s3://${this.config.bucketName}${prefix}`;
  }

  private selectBackend(availability: BackendAvailability): MountBackend | null {
    if (
      this.config.preferredBackend === 'goofys' &&
      availability.goofysAvailable
    ) {
      return 'goofys';
    }

    if (
      this.config.preferredBackend === 's3fs' &&
      availability.s3fsAvailable
    ) {
      return 's3fs';
    }

    // Try any available backend
    if (availability.goofysAvailable) {
      return 'goofys';
    }
    if (availability.s3fsAvailable) {
      return 's3fs';
    }

    return null;
  }

  private async mountWithBackend(
    backend: MountBackend,
    startTime: number
  ): Promise<MountOperationResult> {
    try {
      // Ensure mount point exists
      await this.ensureMountPoint();

      // Ensure cache directory exists if caching enabled
      if (this.config.cache.enabled) {
        await this.fs.mkdir(this.config.cache.cacheDir, { recursive: true });
      }

      const args = backend === 's3fs'
        ? this.buildS3fsArgs()
        : this.buildGoofysArgs();

      this.logger.info(
        { backend, args: args.join(' ') },
        'Executing mount command'
      );

      const command = backend === 's3fs' ? 's3fs' : 'goofys';
      await this.exec(command, args);

      // Verify mount succeeded by checking mount point accessibility directly
      // (cannot use isHealthy here because state is still 'mounting')
      const accessible = await this.checkMountPointAccessible();
      if (!accessible) {
        // Give it a moment and retry the check
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const retryAccessible = await this.checkMountPointAccessible();
        if (!retryAccessible) {
          return this.failResult(
            `Mount command succeeded but mount point is not accessible`,
            startTime
          );
        }
      }

      this.state.status = 'mounted';
      this.state.backend = backend;
      this.state.mountedAt = new Date().toISOString();
      this.state.lastError = null;

      this.logger.info(
        { backend, mountPoint: this.config.mountPoint },
        'S3 filesystem mounted successfully'
      );

      return {
        success: true,
        state: this.getState(),
        message: `Mounted via ${backend}`,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.failResult(
        `${backend} mount failed: ${message}`,
        startTime
      );
    }
  }

  private async activateFallback(startTime: number): Promise<MountOperationResult> {
    this.logger.info('Activating AWS CLI sync fallback');

    try {
      // Ensure the local directory exists
      await this.ensureMountPoint();

      this.fallback = new AwsCliFallback(this.logger, {
        execCommand: this.exec,
        fsOps: this.fs,
      });

      // Do an initial pull
      const syncResult = await this.fallback.sync({
        s3Uri: this.buildS3Uri(),
        localPath: this.config.mountPoint,
        direction: 'pull',
        deleteRemoved: false,
        excludePatterns: ['.s3fs*', '.cache/*'],
        includePatterns: [],
        maxConcurrentRequests: this.config.mountOptions.parallelCount,
        multipartEnabled: true,
        multipartChunkSizeMb: this.config.mountOptions.multipartThresholdMb,
        dryRun: false,
      });

      if (!syncResult.success) {
        return this.failResult(
          `Fallback sync failed: ${syncResult.error ?? 'unknown error'}`,
          startTime
        );
      }

      this.state.status = 'fallback';
      this.state.backend = null;
      this.state.mountedAt = new Date().toISOString();
      this.state.fallbackActive = true;
      this.state.lastError = null;

      this.logger.info(
        { filesSynced: syncResult.filesSynced },
        'AWS CLI fallback activated with initial sync'
      );

      return {
        success: true,
        state: this.getState(),
        message: `Fallback active: synced ${syncResult.filesSynced} files`,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.failResult(
        `Fallback activation failed: ${message}`,
        startTime
      );
    }
  }

  private buildS3fsArgs(): string[] {
    const args: string[] = [];
    const options: string[] = [];

    // Bucket with optional prefix
    const source = this.config.prefix
      ? `${this.config.bucketName}:/${this.config.prefix}`
      : this.config.bucketName;
    args.push(source);
    args.push(this.config.mountPoint);

    // Region
    options.push(`url=https://s3.${this.config.region}.amazonaws.com`);
    options.push(`endpoint=${this.config.region}`);

    // Credentials
    if (this.config.credentials.useIamRole) {
      options.push('iam_role=auto');
    } else if (this.config.credentials.credentialsFile) {
      options.push(`passwd_file=${this.config.credentials.credentialsFile}`);
    }

    // Permission modes
    options.push(`mp_umask=0022`);
    if (this.config.mountOptions.allowOther) {
      options.push('allow_other');
    }

    // Performance options
    options.push(`retries=${this.config.mountOptions.retries}`);
    options.push(`connect_timeout=${this.config.mountOptions.connectTimeout}`);
    options.push(`readwrite_timeout=${this.config.mountOptions.readTimeout}`);
    options.push(`parallel_count=${this.config.mountOptions.parallelCount}`);
    options.push(
      `multipart_size=${this.config.mountOptions.multipartThresholdMb}`
    );

    // SSE
    if (this.config.mountOptions.sseEnabled) {
      options.push('use_sse');
    }

    // Cache args
    const cacheArgs = buildCacheArgs('s3fs', this.config.cache);
    options.push(...cacheArgs);

    // Extra options
    options.push(...this.config.mountOptions.extraOptions);

    // Combine into -o flag
    if (options.length > 0) {
      args.push('-o', options.join(','));
    }

    return args;
  }

  private buildGoofysArgs(): string[] {
    const args: string[] = [];

    // Region
    args.push('--region', this.config.region);

    // Permission modes
    args.push('--file-mode', `0${this.config.mountOptions.fileMode.toString(8)}`);
    args.push('--dir-mode', `0${this.config.mountOptions.dirMode.toString(8)}`);

    if (this.config.mountOptions.uid !== undefined) {
      args.push('--uid', String(this.config.mountOptions.uid));
    }
    if (this.config.mountOptions.gid !== undefined) {
      args.push('--gid', String(this.config.mountOptions.gid));
    }

    // Cache args
    const cacheArgs = buildCacheArgs('goofys', this.config.cache);
    args.push(...cacheArgs);

    // SSE
    if (this.config.mountOptions.sseEnabled) {
      args.push('--sse');
    }

    // Bucket source with optional prefix
    const source = this.config.prefix
      ? `${this.config.bucketName}:${this.config.prefix}`
      : this.config.bucketName;
    args.push(source);

    // Mount point
    args.push(this.config.mountPoint);

    return args;
  }

  private async ensureMountPoint(): Promise<void> {
    try {
      await this.fs.access(this.config.mountPoint, constants.F_OK);
    } catch {
      await this.fs.mkdir(this.config.mountPoint, { recursive: true });
    }
  }

  private async checkMountPointAccessible(): Promise<boolean> {
    try {
      await this.fs.access(this.config.mountPoint, constants.R_OK | constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async checkCommand(
    command: string,
    args: string[]
  ): Promise<{ available: boolean; version: string | null }> {
    try {
      const { stdout, stderr } = await this.exec(command, args);
      const output = (stdout || stderr || '').trim();
      return { available: true, version: output || null };
    } catch {
      return { available: false, version: null };
    }
  }

  private async checkFuseAvailability(): Promise<boolean> {
    try {
      await this.fs.access('/dev/fuse', constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private failResult(
    message: string,
    startTime: number
  ): MountOperationResult {
    this.state.status = 'error';
    this.state.lastError = message;
    this.logger.error({ error: message }, 'Mount operation failed');

    return {
      success: false,
      state: this.getState(),
      message,
      durationMs: Date.now() - startTime,
    };
  }
}
