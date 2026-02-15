/**
 * S3 Stack for HQ Cloud file storage
 *
 * Creates an S3 bucket for worker file sync with:
 * - Versioning enabled
 * - Server-side encryption (S3-managed keys)
 * - Lifecycle rules for cost management
 * - DESTROY removal policy for dev environments
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface HqS3StackProps extends cdk.StackProps {
  /**
   * Bucket name
   * @default 'hq-cloud-files-dev'
   */
  readonly bucketName?: string;

  /**
   * Environment name
   * @default 'dev'
   */
  readonly envName?: string;
}

export class HqS3Stack extends cdk.Stack {
  /**
   * The S3 bucket for worker file storage
   */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: HqS3StackProps) {
    super(scope, id, props);

    const envName = props?.envName ?? 'dev';
    const bucketName = props?.bucketName ?? `hq-cloud-files-${envName}`;

    this.bucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'expire-incomplete-multipart',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'expire-noncurrent-versions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
        {
          id: 'transition-infrequent-access',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'HQ Cloud Files S3 Bucket ARN',
      exportName: `HqCloudFilesBucketArn-${envName}`,
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'HQ Cloud Files S3 Bucket Name',
      exportName: `HqCloudFilesBucketName-${envName}`,
    });
  }
}
