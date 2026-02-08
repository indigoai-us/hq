import type { S3BucketPolicy } from './types.js';

/**
 * IAM policy builders for S3 bucket access control.
 *
 * Access model:
 * - Each user gets their own prefix: {userId}/hq/
 * - Users can only access their own prefix
 * - Worker containers get scoped access to the user who spawned them
 * - Admin role gets full bucket access for maintenance
 */

/**
 * Build a user-scoped IAM policy allowing read/write to their HQ prefix.
 * Used for sync agent authentication.
 */
export function buildUserPolicy(bucketName: string, userId: string): S3BucketPolicy {
  const bucketArn = `arn:aws:s3:::${bucketName}`;
  const userPrefix = `${userId}/hq`;

  return {
    version: '2012-10-17',
    statements: [
      {
        sid: 'AllowListBucket',
        effect: 'Allow',
        principal: '*',
        actions: ['s3:ListBucket'],
        resources: [bucketArn],
        conditions: {
          StringLike: {
            's3:prefix': [`${userPrefix}/*`],
          },
        },
      },
      {
        sid: 'AllowUserReadWrite',
        effect: 'Allow',
        principal: '*',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:GetObjectVersion',
          's3:ListBucketVersions',
        ],
        resources: [`${bucketArn}/${userPrefix}/*`],
      },
      {
        sid: 'DenyOtherPrefixes',
        effect: 'Deny',
        principal: '*',
        actions: ['s3:*'],
        resources: [`${bucketArn}/*`],
        conditions: {
          StringNotLike: {
            's3:prefix': [`${userPrefix}/*`],
          },
        },
      },
    ],
  };
}

/**
 * Build a worker-scoped IAM policy for container access.
 * Workers get read/write to the user's HQ prefix via temporary credentials.
 */
export function buildWorkerPolicy(bucketName: string, userId: string): S3BucketPolicy {
  const bucketArn = `arn:aws:s3:::${bucketName}`;
  const userPrefix = `${userId}/hq`;

  return {
    version: '2012-10-17',
    statements: [
      {
        sid: 'WorkerListBucket',
        effect: 'Allow',
        principal: '*',
        actions: ['s3:ListBucket', 's3:ListBucketVersions'],
        resources: [bucketArn],
        conditions: {
          StringLike: {
            's3:prefix': [`${userPrefix}/*`],
          },
        },
      },
      {
        sid: 'WorkerReadWrite',
        effect: 'Allow',
        principal: '*',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:GetObjectVersion',
          's3:GetObjectTagging',
          's3:PutObjectTagging',
        ],
        resources: [`${bucketArn}/${userPrefix}/*`],
      },
    ],
  };
}

/**
 * Build an admin policy for bucket management operations.
 * Used by infrastructure automation and maintenance scripts.
 */
export function buildAdminPolicy(bucketName: string): S3BucketPolicy {
  const bucketArn = `arn:aws:s3:::${bucketName}`;

  return {
    version: '2012-10-17',
    statements: [
      {
        sid: 'AdminFullAccess',
        effect: 'Allow',
        principal: '*',
        actions: ['s3:*'],
        resources: [bucketArn, `${bucketArn}/*`],
      },
    ],
  };
}

/**
 * Build a read-only sharing policy for a specific set of paths.
 * Used when a user shares files/folders with another user.
 */
export function buildSharePolicy(
  bucketName: string,
  ownerUserId: string,
  sharedPaths: string[]
): S3BucketPolicy {
  const bucketArn = `arn:aws:s3:::${bucketName}`;
  const resources = sharedPaths.map(
    (path) => `${bucketArn}/${ownerUserId}/hq/${path}*`
  );

  return {
    version: '2012-10-17',
    statements: [
      {
        sid: 'ShareReadAccess',
        effect: 'Allow',
        principal: '*',
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources,
      },
    ],
  };
}

/**
 * Convert a policy to AWS IAM policy JSON format.
 * Maps our internal representation to the AWS policy document structure.
 */
export function toAwsPolicyDocument(
  policy: S3BucketPolicy
): Record<string, unknown> {
  return {
    Version: policy.version,
    Statement: policy.statements.map((stmt) => {
      const statement: Record<string, unknown> = {
        Sid: stmt.sid,
        Effect: stmt.effect,
        Principal: stmt.principal,
        Action: stmt.actions,
        Resource: stmt.resources,
      };
      if (stmt.conditions) {
        statement['Condition'] = stmt.conditions;
      }
      return statement;
    }),
  };
}
