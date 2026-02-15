/**
 * Tests for ECR Stack
 */

import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HqEcrStack } from '../ecr-stack.js';

describe('HqEcrStack', () => {
  describe('worker-runtime repository', () => {
    it('creates ECR repository with correct name', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'hq-cloud/worker-runtime',
      });
    });

    it('enables scan on push', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'hq-cloud/worker-runtime',
        ImageScanningConfiguration: { ScanOnPush: true },
      });
    });

    it('has lifecycle policy to keep last 10 images', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'hq-cloud/worker-runtime',
        LifecyclePolicy: {
          LifecyclePolicyText: Match.stringLikeRegexp('"countNumber":10'),
        },
      });
    });

    it('has outputs for repository URI and ARN', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr', { envName: 'dev' });
      const template = Template.fromStack(stack);

      template.hasOutput('RepositoryUri', {});
      template.hasOutput('RepositoryArn', {});
    });
  });

  describe('API repository', () => {
    it('creates API ECR repository with correct name', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'hq-cloud/api',
      });
    });

    it('enables scan on push for API repo', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'hq-cloud/api',
        ImageScanningConfiguration: { ScanOnPush: true },
      });
    });

    it('has lifecycle policy to keep last 10 images for API repo', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'hq-cloud/api',
        LifecyclePolicy: {
          LifecyclePolicyText: Match.stringLikeRegexp('"countNumber":10'),
        },
      });
    });

    it('has outputs for API repository URI and ARN', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr', { envName: 'dev' });
      const template = Template.fromStack(stack);

      template.hasOutput('ApiRepositoryUri', {});
      template.hasOutput('ApiRepositoryArn', {});
    });

    it('supports custom API repository name', () => {
      const app = new cdk.App();
      const stack = new HqEcrStack(app, 'TestEcr', {
        apiRepositoryName: 'custom/api-repo',
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'custom/api-repo',
      });
    });
  });

  it('creates exactly two ECR repositories', () => {
    const app = new cdk.App();
    const stack = new HqEcrStack(app, 'TestEcr');
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::ECR::Repository', 2);
  });
});
