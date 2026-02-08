import {
  S3Client,
  CreateBucketCommand,
  PutBucketVersioningCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketCorsCommand,
  PutPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { BucketLocationConstraint, CreateBucketCommandInput } from '@aws-sdk/client-s3';
import type {
  S3BucketConfig,
  BucketOperationResult,
  UserS3Path,
  HQFolder,
} from './types.js';
import { HQ_FOLDER_STRUCTURE } from './types.js';
import { buildBucketConfig, validateBucketConfig } from './config.js';
import { buildAdminPolicy, toAwsPolicyDocument } from './policies.js';
import type { Logger } from 'pino';

/**
 * Manages S3 bucket lifecycle: creation, configuration, and user space provisioning.
 */
export class S3BucketManager {
  private readonly client: S3Client;
  private readonly config: S3BucketConfig;
  private readonly logger: Logger;

  constructor(logger: Logger, configOverride?: Partial<S3BucketConfig>) {
    const baseConfig = buildBucketConfig();
    this.config = { ...baseConfig, ...configOverride };
    this.logger = logger.child({ component: 's3-bucket-manager' });

    this.client = new S3Client({
      region: this.config.region,
    });
  }

  /** Get the current bucket configuration */
  getConfig(): S3BucketConfig {
    return { ...this.config };
  }

  /**
   * Check if the bucket already exists.
   */
  async bucketExists(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucketName })
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create and configure the S3 bucket with all required settings.
   *
   * Idempotent: if the bucket exists, it will update configuration.
   */
  async createBucket(): Promise<BucketOperationResult> {
    const errors = validateBucketConfig(this.config);
    if (errors.length > 0) {
      return {
        success: false,
        bucketName: this.config.bucketName,
        region: this.config.region,
        arn: '',
        error: `Validation errors: ${errors.join('; ')}`,
      };
    }

    const bucketArn = `arn:aws:s3:::${this.config.bucketName}`;

    try {
      const exists = await this.bucketExists();

      if (!exists) {
        this.logger.info(
          { bucket: this.config.bucketName, region: this.config.region },
          'Creating S3 bucket'
        );

        const createParams: CreateBucketCommandInput = {
          Bucket: this.config.bucketName,
        };

        // LocationConstraint is not needed for us-east-1
        if (this.config.region !== 'us-east-1') {
          createParams.CreateBucketConfiguration = {
            LocationConstraint: this.config.region as BucketLocationConstraint,
          };
        }

        await this.client.send(new CreateBucketCommand(createParams));
      } else {
        this.logger.info(
          { bucket: this.config.bucketName },
          'Bucket already exists, updating configuration'
        );
      }

      // Apply all configuration in parallel
      await Promise.all([
        this.enableVersioning(),
        this.configureEncryption(),
        this.configureLifecycle(),
        this.configureCors(),
        this.configurePublicAccessBlock(),
      ]);

      // Apply bucket policy after public access block is set
      await this.applyBucketPolicy();

      this.logger.info(
        { bucket: this.config.bucketName, arn: bucketArn },
        'S3 bucket configured successfully'
      );

      return {
        success: true,
        bucketName: this.config.bucketName,
        region: this.config.region,
        arn: bucketArn,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { bucket: this.config.bucketName, error: message },
        'Failed to create/configure S3 bucket'
      );
      return {
        success: false,
        bucketName: this.config.bucketName,
        region: this.config.region,
        arn: bucketArn,
        error: message,
      };
    }
  }

  /**
   * Provision a user's HQ space in the bucket.
   * Creates the folder structure markers: {userId}/hq/{folder}/
   */
  async provisionUserSpace(userId: string): Promise<UserS3Path> {
    const prefix = `${userId}/hq`;
    const uri = `s3://${this.config.bucketName}/${prefix}/`;

    this.logger.info({ userId, prefix }, 'Provisioning user HQ space');

    // Create folder markers for the HQ structure
    const folderPromises = HQ_FOLDER_STRUCTURE.map(
      (folder: HQFolder) =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.config.bucketName,
            Key: `${prefix}/${folder}`,
            Body: '',
            ContentType: 'application/x-directory',
            Metadata: {
              'created-by': 'hq-cloud-file-sync',
              'user-id': userId,
            },
          })
        )
    );

    await Promise.all(folderPromises);

    this.logger.info(
      { userId, foldersCreated: HQ_FOLDER_STRUCTURE.length },
      'User HQ space provisioned'
    );

    return { userId, prefix, uri };
  }

  /**
   * Build the S3 path for a user's file.
   */
  getUserPath(userId: string, localPath: string): string {
    // Normalize path separators and remove leading slashes
    const normalized = localPath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${userId}/hq/${normalized}`;
  }

  /**
   * Build the full S3 URI for a user's file.
   */
  getUserUri(userId: string, localPath: string): string {
    return `s3://${this.config.bucketName}/${this.getUserPath(userId, localPath)}`;
  }

  // ─── Private configuration methods ───────────────────────────────

  private async enableVersioning(): Promise<void> {
    await this.client.send(
      new PutBucketVersioningCommand({
        Bucket: this.config.bucketName,
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      })
    );
    this.logger.debug('Versioning enabled');
  }

  private async configureEncryption(): Promise<void> {
    const rule =
      this.config.encryption.algorithm === 'aws:kms'
        ? {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms' as const,
              KMSMasterKeyID: this.config.encryption.kmsKeyArn,
            },
            BucketKeyEnabled: this.config.encryption.bucketKeyEnabled,
          }
        : {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256' as const,
            },
            BucketKeyEnabled: this.config.encryption.bucketKeyEnabled,
          };

    await this.client.send(
      new PutBucketEncryptionCommand({
        Bucket: this.config.bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [rule],
        },
      })
    );
    this.logger.debug(
      { algorithm: this.config.encryption.algorithm },
      'Encryption configured'
    );
  }

  private async configureLifecycle(): Promise<void> {
    const rules = this.config.lifecycleRules.map((rule) => ({
      ID: rule.id,
      Status: rule.enabled ? ('Enabled' as const) : ('Disabled' as const),
      Filter: { Prefix: rule.prefix },
      NoncurrentVersionTransitions: rule.transitions.map((t) => ({
        NoncurrentDays: t.days,
        StorageClass: t.storageClass,
      })),
      NoncurrentVersionExpiration: rule.noncurrentVersionExpiration
        ? {
            NoncurrentDays: rule.noncurrentVersionExpiration,
            NewerNoncurrentVersions: rule.noncurrentVersionsToRetain,
          }
        : undefined,
      AbortIncompleteMultipartUpload: rule.abortIncompleteMultipartUploadDays
        ? { DaysAfterInitiation: rule.abortIncompleteMultipartUploadDays }
        : undefined,
    }));

    await this.client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: this.config.bucketName,
        LifecycleConfiguration: { Rules: rules },
      })
    );
    this.logger.debug(
      { ruleCount: rules.length },
      'Lifecycle rules configured'
    );
  }

  private async configureCors(): Promise<void> {
    const corsRules = this.config.corsRules.map((rule) => ({
      AllowedOrigins: rule.allowedOrigins,
      AllowedMethods: rule.allowedMethods,
      AllowedHeaders: rule.allowedHeaders,
      ExposeHeaders: rule.exposedHeaders,
      MaxAgeSeconds: rule.maxAgeSeconds,
    }));

    await this.client.send(
      new PutBucketCorsCommand({
        Bucket: this.config.bucketName,
        CORSConfiguration: { CORSRules: corsRules },
      })
    );
    this.logger.debug('CORS configured');
  }

  private async configurePublicAccessBlock(): Promise<void> {
    await this.client.send(
      new PutPublicAccessBlockCommand({
        Bucket: this.config.bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: this.config.publicAccessBlock.blockPublicAcls,
          IgnorePublicAcls: this.config.publicAccessBlock.ignorePublicAcls,
          BlockPublicPolicy: this.config.publicAccessBlock.blockPublicPolicy,
          RestrictPublicBuckets: this.config.publicAccessBlock.restrictPublicBuckets,
        },
      })
    );
    this.logger.debug('Public access block configured');
  }

  private async applyBucketPolicy(): Promise<void> {
    const policy = buildAdminPolicy(this.config.bucketName);
    const policyDocument = toAwsPolicyDocument(policy);

    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.config.bucketName,
        Policy: JSON.stringify(policyDocument),
      })
    );
    this.logger.debug('Bucket policy applied');
  }
}
