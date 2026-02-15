/**
 * Tests for Secrets Manager Stack
 */

import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HqSecretsStack, SECRET_KEYS } from '../secrets-stack.js';

describe('HqSecretsStack', () => {
  it('creates Secrets Manager secret with correct name', () => {
    const app = new cdk.App();
    const stack = new HqSecretsStack(app, 'TestSecrets', { envName: 'dev' });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'hq-cloud/dev/api-config',
    });
  });

  it('uses custom secret name when provided', () => {
    const app = new cdk.App();
    const stack = new HqSecretsStack(app, 'TestSecrets', {
      secretName: 'my-custom/secret',
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'my-custom/secret',
    });
  });

  it('uses environment name in default secret name', () => {
    const app = new cdk.App();
    const stack = new HqSecretsStack(app, 'TestSecrets', { envName: 'staging' });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'hq-cloud/staging/api-config',
    });
  });

  it('has a description mentioning all secret keys', () => {
    const app = new cdk.App();
    const stack = new HqSecretsStack(app, 'TestSecrets');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: Match.stringLikeRegexp('CLERK_SECRET_KEY'),
    });

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: Match.stringLikeRegexp('MONGODB_URI'),
    });

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: Match.stringLikeRegexp('CLAUDE_CREDENTIALS_JSON'),
    });
  });

  it('generates placeholder initial secret value', () => {
    const app = new cdk.App();
    const stack = new HqSecretsStack(app, 'TestSecrets');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: Match.objectLike({
        SecretStringTemplate: Match.stringLikeRegexp('CLERK_SECRET_KEY'),
        GenerateStringKey: '_generated',
      }),
    });
  });

  it('retains the secret on stack deletion', () => {
    const app = new cdk.App();
    const stack = new HqSecretsStack(app, 'TestSecrets');
    const template = Template.fromStack(stack);

    // Check that the secret resource has RETAIN deletion policy
    const secrets = template.findResources('AWS::SecretsManager::Secret');
    const secretLogicalIds = Object.keys(secrets);
    expect(secretLogicalIds.length).toBe(1);

    const secretResource = secrets[secretLogicalIds[0]];
    expect(secretResource.DeletionPolicy).toBe('Retain');
    expect(secretResource.UpdateReplacePolicy).toBe('Retain');
  });

  it('has outputs for secret ARN and name', () => {
    const app = new cdk.App();
    const stack = new HqSecretsStack(app, 'TestSecrets', { envName: 'dev' });
    const template = Template.fromStack(stack);

    template.hasOutput('SecretArn', {});
    template.hasOutput('SecretName', {});
  });

  it('exports SECRET_KEYS constant with all expected keys', () => {
    expect(SECRET_KEYS).toContain('CLERK_SECRET_KEY');
    expect(SECRET_KEYS).toContain('CLERK_JWT_KEY');
    expect(SECRET_KEYS).toContain('MONGODB_URI');
    expect(SECRET_KEYS).toContain('CLAUDE_CREDENTIALS_JSON');
    expect(SECRET_KEYS.length).toBe(4);
  });

  it('exposes the secret name property', () => {
    const app = new cdk.App();
    const stack = new HqSecretsStack(app, 'TestSecrets', { envName: 'dev' });
    expect(stack.secretName).toBe('hq-cloud/dev/api-config');
  });
});
