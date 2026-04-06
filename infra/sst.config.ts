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
    const bucket = new sst.aws.Bucket("HqStorage");

    const inviteSecret = new sst.Secret("InviteSecret");

    // GitHub App secrets for credential brokering (US-009)
    // Set via: npx sst secret set GitHubAppId <app-id>
    // Set via: npx sst secret set GitHubAppPrivateKey -- "$(cat private-key.pem)"
    const githubAppId = new sst.Secret("GitHubAppId");
    const githubAppPrivateKey = new sst.Secret("GitHubAppPrivateKey");

    // IAM role for user-scoped S3 credentials (assumed via STS by auth Lambda)
    const s3AccessRoleArn = "arn:aws:iam::804849608251:role/hq-cloud-s3-access";

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

    // Auth endpoints — need STS AssumeRole for credential scoping
    api.route("POST /api/auth/refresh", {
      handler: "functions/auth.refresh",
      link: [userPool, bucket],
      environment: {
        S3_ACCESS_ROLE_ARN: s3AccessRoleArn,
      },
      permissions: [
        {
          actions: ["sts:AssumeRole"],
          resources: [s3AccessRoleArn],
        },
      ],
    });

    api.route("GET /api/auth/credentials", {
      handler: "functions/auth.getCredentials",
      link: [userPool, bucket],
    });

    // Team operations
    api.route("POST /api/teams", {
      handler: "functions/teams.createTeam",
      link: [userPool],
    });

    api.route("GET /api/teams", {
      handler: "functions/teams.listTeams",
      link: [userPool],
    });

    api.route("GET /api/teams/{id}", {
      handler: "functions/teams.getTeam",
      link: [userPool],
    });

    api.route("GET /api/teams/{id}/members", {
      handler: "functions/teams.listMembers",
      link: [userPool],
    });

    api.route("POST /api/teams/{id}/members", {
      handler: "functions/teams.addMember",
      link: [userPool],
    });

    api.route("DELETE /api/teams/{id}/members/{userId}", {
      handler: "functions/teams.removeMember",
      link: [userPool],
    });

    // Team entitlements
    api.route("POST /api/teams/{id}/entitlements", {
      handler: "functions/entitlements.setEntitlements",
      link: [userPool, bucket],
    });

    api.route("GET /api/teams/{id}/entitlements", {
      handler: "functions/entitlements.getEntitlementsManifest",
      link: [userPool, bucket],
    });

    api.route("GET /api/teams/{id}/entitlements/mine", {
      handler: "functions/entitlements.getMyEntitlements",
      link: [userPool, bucket],
    });

    // Repo provisioning and GitHub App credential brokering (US-009, US-002)
    api.route("POST /api/teams/{id}/repo", {
      handler: "functions/repo.provisionRepo",
      link: [userPool, bucket, githubAppId, githubAppPrivateKey],
    });

    api.route("GET /api/teams/{id}/repo-config", {
      handler: "functions/repo.getRepoCredential",
      link: [userPool, bucket, githubAppId, githubAppPrivateKey],
    });

    api.route("POST /api/teams/{id}/repo-config", {
      handler: "functions/repo.setRepoConfig",
      link: [userPool, bucket, githubAppId, githubAppPrivateKey],
    });

    api.route("GET /api/teams/{id}/github-status", {
      handler: "functions/repo.getGitHubStatus",
      link: [userPool, bucket, githubAppId, githubAppPrivateKey],
    });

    // Team submissions (content contribution review)
    api.route("POST /api/teams/{id}/submissions", {
      handler: "functions/submissions.createSubmission",
      link: [userPool, bucket],
    });

    api.route("GET /api/teams/{id}/submissions", {
      handler: "functions/submissions.listSubmissions",
      link: [userPool, bucket],
    });

    api.route("PUT /api/teams/{id}/submissions/{subId}/approve", {
      handler: "functions/submissions.approveSubmission",
      link: [userPool, bucket, githubAppId, githubAppPrivateKey],
    });

    api.route("PUT /api/teams/{id}/submissions/{subId}/reject", {
      handler: "functions/submissions.rejectSubmission",
      link: [userPool, bucket],
    });

    // Team invite operations
    api.route("POST /api/teams/{id}/invites", {
      handler: "functions/teams.createInvite",
      link: [userPool, bucket, inviteSecret],
    });

    api.route("POST /api/teams/join", {
      handler: "functions/teams.joinTeam",
      link: [userPool, bucket, inviteSecret],
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
      // domain: { name: "hq.getindigo.ai" },  // TODO: re-enable after initial deploy succeeds
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
