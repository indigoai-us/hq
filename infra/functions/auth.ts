/**
 * Auth API — token refresh and temporary credential provisioning
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

const cognito = new CognitoIdentityProviderClient({});
const sts = new STSClient({});

/**
 * Refresh Cognito tokens and return temporary AWS credentials
 * for direct S3 access from the CLI
 */
export const refresh: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { refreshToken } = body;

    if (!refreshToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing refreshToken" }),
      };
    }

    // Refresh Cognito tokens
    const authResult = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: Resource.HqWebClient.id,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      })
    );

    const idToken = authResult.AuthenticationResult?.IdToken;
    if (!idToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Token refresh failed" }),
      };
    }

    // Look up team membership for STS policy scoping
    // Decode userId from the refreshed ID token (JWT sub claim)
    const tokenParts = idToken.split('.');
    const tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    const userId = tokenPayload.sub;

    let teamId: string | undefined;
    try {
      const groups = await cognito.send(
        new AdminListGroupsForUserCommand({
          Username: userId,
          UserPoolId: Resource.HqUserPool.id,
        })
      );
      if (groups.Groups && groups.Groups.length > 0) {
        teamId = groups.Groups[0].GroupName;
      }
    } catch {
      // Solo user
    }

    const s3Prefix = teamId
      ? `teams/${teamId}/users/${userId}/hq/`
      : `users/${userId}/hq/`;

    // Get temporary S3 credentials via STS
    const stsResult = await sts.send(
      new AssumeRoleCommand({
        RoleArn: process.env.S3_ACCESS_ROLE_ARN,
        RoleSessionName: "hq-cli-session",
        DurationSeconds: 3600,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
              Resource: `arn:aws:s3:::${Resource.HqStorage.name}/${s3Prefix}*`,
            },
            {
              Effect: "Allow",
              Action: ["s3:ListBucket"],
              Resource: `arn:aws:s3:::${Resource.HqStorage.name}`,
              Condition: {
                StringLike: { "s3:prefix": [`${s3Prefix}*`] },
              },
            },
          ],
        }),
      })
    );

    const creds = stsResult.Credentials;
    if (!creds) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to get credentials" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretAccessKey,
        sessionToken: creds.SessionToken,
        expiration: creds.Expiration?.toISOString(),
        ...(teamId ? { teamId } : {}),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
    };
  }
};

/**
 * Get current user info and bucket assignment
 */
export const getCredentials: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const claims = event.requestContext?.authorizer?.jwt?.claims as any;
    if (!claims?.sub) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    // Look up user's team membership from Cognito groups
    let teamId: string | undefined;
    try {
      const groups = await cognito.send(
        new AdminListGroupsForUserCommand({
          Username: claims.sub,
          UserPoolId: Resource.HqUserPool.id,
        })
      );
      if (groups.Groups && groups.Groups.length > 0) {
        teamId = groups.Groups[0].GroupName;
      }
    } catch {
      // No team membership — solo user
    }

    const prefix = teamId
      ? `teams/${teamId}/users/${claims.sub}/hq/`
      : `users/${claims.sub}/hq/`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        userId: claims.sub,
        bucket: Resource.HqStorage.name,
        region: "us-east-1",
        prefix,
        ...(teamId ? { teamId } : {}),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
    };
  }
};
