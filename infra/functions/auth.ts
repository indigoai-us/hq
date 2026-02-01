/**
 * Auth API — token refresh and temporary credential provisioning
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
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

    // Get temporary S3 credentials via STS
    // The assumed role should have scoped S3 access to user's prefix
    const stsResult = await sts.send(
      new AssumeRoleCommand({
        RoleArn: process.env.S3_ACCESS_ROLE_ARN,
        RoleSessionName: "hq-cli-session",
        DurationSeconds: 3600, // 1 hour
        // Policy scoping would be added here for per-user isolation
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        userId: claims.sub,
        bucket: Resource.HqStorage.name,
        region: "us-east-1",
        prefix: `users/${claims.sub}/hq/`,
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
