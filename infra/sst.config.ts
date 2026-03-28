/// <reference path="./.sst/platform/config.d.ts" />

/**
 * HQ Cloud Infrastructure
 *
 * Resources:
 * - Cognito user pool for authentication
 * - S3 bucket (shared, user-prefixed) for HQ file storage
 * - API Gateway for PWA access to S3
 * - Lambda functions for auth, file ops, user provisioning
 * - CloudFront for PWA static hosting
 */

export default $config({
  app(input) {
    return {
      name: "hq-cloud",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    // --- Auth ---
    const userPool = new sst.aws.CognitoUserPool("HqUserPool", {
      usernames: ["email"],
    });

    const userPoolClient = userPool.addClient("HqWebClient");

    // --- Storage ---
    const bucket = new sst.aws.Bucket("HqStorage", {
      access: "cloudfront",
    });

    // --- API ---
    const api = new sst.aws.ApiGatewayV2("HqApi");

    // File operations
    api.route("GET /api/files", {
      handler: "functions/files.list",
      link: [bucket, userPool],
    });

    api.route("GET /api/files/{path+}", {
      handler: "functions/files.get",
      link: [bucket, userPool],
    });

    api.route("PUT /api/files/{path+}", {
      handler: "functions/files.put",
      link: [bucket, userPool],
    });

    api.route("DELETE /api/files/{path+}", {
      handler: "functions/files.remove",
      link: [bucket, userPool],
    });

    // Auth endpoints
    api.route("POST /api/auth/refresh", {
      handler: "functions/auth.refresh",
      link: [userPool, bucket],
    });

    api.route("GET /api/auth/credentials", {
      handler: "functions/auth.getCredentials",
      link: [userPool, bucket],
    });

    // --- PWA ---
    const web = new sst.aws.StaticSite("HqWeb", {
      path: "../apps/web",
      build: {
        command: "npm run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: api.url,
        VITE_USER_POOL_ID: userPool.id,
        VITE_USER_POOL_CLIENT_ID: userPoolClient.id,
        VITE_REGION: "us-east-1",
      },
      domain: {
        name: "hq.indigoai.com",
      },
    });

    return {
      api: api.url,
      web: web.url,
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      bucketName: bucket.name,
    };
  },
});
