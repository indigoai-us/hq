/**
 * Tests for S3 Stack
 */

import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HqS3Stack } from '../s3-stack.js';

describe('HqS3Stack', () => {
  it('creates S3 bucket with correct name', () => {
    const app = new cdk.App();
    const stack = new HqS3Stack(app, 'TestS3', { envName: 'dev' });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'hq-cloud-files-dev',
    });
  });

  it('enables versioning', () => {
    const app = new cdk.App();
    const stack = new HqS3Stack(app, 'TestS3');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  it('enables S3-managed encryption', () => {
    const app = new cdk.App();
    const stack = new HqS3Stack(app, 'TestS3');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          }),
        ]),
      },
    });
  });

  it('blocks all public access', () => {
    const app = new cdk.App();
    const stack = new HqS3Stack(app, 'TestS3');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('has lifecycle rules', () => {
    const app = new cdk.App();
    const stack = new HqS3Stack(app, 'TestS3');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ Id: 'expire-incomplete-multipart', Status: 'Enabled' }),
          Match.objectLike({ Id: 'expire-noncurrent-versions', Status: 'Enabled' }),
          Match.objectLike({ Id: 'transition-infrequent-access', Status: 'Enabled' }),
        ]),
      },
    });
  });

  it('has outputs for bucket ARN and name', () => {
    const app = new cdk.App();
    const stack = new HqS3Stack(app, 'TestS3', { envName: 'dev' });
    const template = Template.fromStack(stack);

    template.hasOutput('BucketArn', {});
    template.hasOutput('BucketName', {});
  });
});
