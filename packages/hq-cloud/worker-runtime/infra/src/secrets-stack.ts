/**
 * Secrets Manager Stack for HQ Cloud
 *
 * Creates an AWS Secrets Manager secret for storing sensitive
 * configuration values (Clerk keys, MongoDB URI, Claude credentials).
 *
 * Secret values are NOT set by CDK — they are populated manually
 * via AWS CLI after stack deployment:
 *
 *   aws secretsmanager put-secret-value \
 *     --secret-id hq-cloud/dev/api-config \
 *     --secret-string '{"CLERK_SECRET_KEY":"...","CLERK_JWT_KEY":"...","MONGODB_URI":"...","CLAUDE_CREDENTIALS_JSON":"..."}'
 */

import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface HqSecretsStackProps extends cdk.StackProps {
  /**
   * Secret name in Secrets Manager
   * @default 'hq-cloud/dev/api-config'
   */
  readonly secretName?: string;

  /**
   * Environment name
   * @default 'dev'
   */
  readonly envName?: string;

  /**
   * Description for the secret
   */
  readonly description?: string;
}

/**
 * Known secret keys stored in the secret JSON
 */
export const SECRET_KEYS = [
  'CLERK_SECRET_KEY',
  'CLERK_JWT_KEY',
  'MONGODB_URI',
  'CLAUDE_CREDENTIALS_JSON',
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

export class HqSecretsStack extends cdk.Stack {
  /**
   * The Secrets Manager secret
   */
  public readonly secret: secretsmanager.Secret;

  /**
   * The secret name
   */
  public readonly secretName: string;

  constructor(scope: Construct, id: string, props?: HqSecretsStackProps) {
    super(scope, id, props);

    const envName = props?.envName ?? 'dev';
    this.secretName = props?.secretName ?? `hq-cloud/${envName}/api-config`;

    this.secret = new secretsmanager.Secret(this, 'ApiConfigSecret', {
      secretName: this.secretName,
      description:
        props?.description ??
        `HQ Cloud API configuration secrets (${envName}). Contains: ${SECRET_KEYS.join(', ')}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // Generate a placeholder initial value so the secret exists
      // Real values are set via: aws secretsmanager put-secret-value
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          CLERK_SECRET_KEY: 'PLACEHOLDER_SET_VIA_CLI',
          CLERK_JWT_KEY: 'PLACEHOLDER_SET_VIA_CLI',
          MONGODB_URI: 'PLACEHOLDER_SET_VIA_CLI',
          CLAUDE_CREDENTIALS_JSON: 'PLACEHOLDER_SET_VIA_CLI',
        }),
        generateStringKey: '_generated',
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'SecretArn', {
      value: this.secret.secretArn,
      description: 'HQ Cloud API Config Secret ARN',
      exportName: `HqCloudSecretArn-${envName}`,
    });

    new cdk.CfnOutput(this, 'SecretName', {
      value: this.secretName,
      description: 'HQ Cloud API Config Secret Name',
      exportName: `HqCloudSecretName-${envName}`,
    });
  }
}
