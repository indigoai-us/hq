/**
 * Repo config API — GitHub App credential brokering for team members
 *
 * Provides short-lived GitHub installation tokens scoped to specific repos.
 * Validates team membership via Cognito group check before issuing tokens.
 *
 * Endpoints:
 * - GET /api/teams/{id}/repo-config — returns a short-lived git credential
 * - GET /api/teams/{id}/github-status — returns GitHub App installation status
 */

import {
  CognitoIdentityProviderClient,
  GetGroupCommand,
  AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  generateAppJwt,
  getInstallationToken,
  listInstallations,
  getAppInfo,
} from "./github-app";

const cognito = new CognitoIdentityProviderClient({});
const s3 = new S3Client({});

// --- Types ---

interface TeamMetadata {
  name: string;
  createdBy: string;
  createdAt: string;
  admins: string[];
}

interface RepoConfig {
  owner: string; // GitHub org or user
  repo: string; // Repository name
  installationId: string; // GitHub App installation ID
}

// --- Helpers ---

function getUserId(event: any): string {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new Error("Unauthorized");
  return claims.sub;
}

function parseTeamMetadata(
  description: string | undefined
): TeamMetadata | null {
  if (!description) return null;
  try {
    return JSON.parse(description) as TeamMetadata;
  } catch {
    return null;
  }
}

function repoConfigKey(teamId: string): string {
  return `teams/${teamId}/repo-config.json`;
}

async function getRepoConfig(teamId: string): Promise<RepoConfig | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: repoConfigKey(teamId),
      })
    );
    const body = await result.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as RepoConfig;
  } catch (err: any) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Verify the user is a member of the specified team (Cognito group check)
 */
async function verifyTeamMembership(
  userId: string,
  teamId: string
): Promise<boolean> {
  const userGroups = await cognito.send(
    new AdminListGroupsForUserCommand({
      Username: userId,
      UserPoolId: Resource.HqUserPool.id,
    })
  );
  return (userGroups.Groups || []).some((g) => g.GroupName === teamId);
}

// --- Handlers ---

/**
 * Get a short-lived git credential for the team's repository
 * GET /api/teams/{id}/repo-config
 *
 * Returns an installation access token (valid ~1 hour) that can be used
 * for git clone/push/pull operations:
 *   git clone https://x-access-token:{token}@github.com/{owner}/{repo}.git
 *
 * Requires:
 * - Authenticated user (Cognito JWT)
 * - User must be a member of the team
 * - Team must have repo config set up (owner, repo, installationId)
 * - GitHub App secrets must be configured (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY)
 */
export const getRepoCredential: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID" }),
      };
    }

    // Validate team membership
    const isMember = await verifyTeamMembership(userId, teamId);
    if (!isMember) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Not a team member — only team members can access repo credentials",
        }),
      };
    }

    // Load repo config from S3
    const config = await getRepoConfig(teamId);
    if (!config) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error:
            "No repository configured for this team. An admin must set up the GitHub App installation first.",
        }),
      };
    }

    // Generate GitHub App JWT
    const appId = Resource.GitHubAppId.value;
    const privateKey = Resource.GitHubAppPrivateKey.value;

    if (!appId || !privateKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            "GitHub App credentials not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY as SST Secrets.",
        }),
      };
    }

    const jwt = generateAppJwt(appId, privateKey);

    // Request installation token scoped to the specific repo
    const tokenResponse = await getInstallationToken(
      jwt,
      config.installationId,
      {
        repositories: [config.repo],
        permissions: {
          contents: "write",
          administration: "write",
        },
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        token: tokenResponse.token,
        expiresAt: tokenResponse.expires_at,
        owner: config.owner,
        repo: config.repo,
        cloneUrl: `https://x-access-token:${tokenResponse.token}@github.com/${config.owner}/${config.repo}.git`,
      }),
    };
  } catch (err: any) {
    console.error("getRepoCredential error:", err);

    if (err.message === "Unauthorized") {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    // GitHub API errors
    if (err.message?.includes("GitHub API error")) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: "Failed to generate GitHub token",
          detail: err.message,
        }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
    };
  }
};

/**
 * Get GitHub App installation status for the team
 * GET /api/teams/{id}/github-status
 *
 * Returns whether the GitHub App is installed and provides an install link
 * if not. Admin-only endpoint for setup visibility.
 */
export const getGitHubStatus: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID" }),
      };
    }

    // Verify requester is admin
    const groupResult = await cognito.send(
      new GetGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );
    const metadata = parseTeamMetadata(groupResult.Group?.Description);
    if (!metadata?.admins.includes(userId)) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Only team admins can view GitHub App status",
        }),
      };
    }

    // Check for existing repo config
    const config = await getRepoConfig(teamId);

    // Try to get app info for the install link
    const appId = Resource.GitHubAppId.value;
    const privateKey = Resource.GitHubAppPrivateKey.value;

    let appInfo: { name: string; installations_count: number } | null = null;
    let installations: Array<{
      id: number;
      account: { login: string };
    }> | null = null;

    if (appId && privateKey) {
      try {
        const jwt = generateAppJwt(appId, privateKey);
        appInfo = await getAppInfo(jwt);
        installations = await listInstallations(jwt);
      } catch (err) {
        // Non-fatal — App info is supplementary
        console.warn("Failed to fetch GitHub App info:", err);
      }
    }

    const appName = appInfo?.name || "hq-team-sync";

    return {
      statusCode: 200,
      body: JSON.stringify({
        configured: !!config,
        repoConfig: config
          ? { owner: config.owner, repo: config.repo }
          : null,
        app: {
          name: appName,
          installUrl: `https://github.com/apps/${appName}/installations/new`,
          installationsCount: appInfo?.installations_count ?? null,
        },
        installations: installations
          ? installations.map((i) => ({
              id: i.id,
              account: i.account.login,
            }))
          : null,
      }),
    };
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Team not found" }),
      };
    }
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
    };
  }
};

/**
 * Set repo configuration for a team (admin only)
 * POST /api/teams/{id}/repo-config
 * Body: { owner: string, repo: string, installationId: string }
 *
 * Links a team to a specific GitHub repository and installation.
 */
export const setRepoConfig: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID" }),
      };
    }

    // Verify requester is admin
    const groupResult = await cognito.send(
      new GetGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );
    const metadata = parseTeamMetadata(groupResult.Group?.Description);
    if (!metadata?.admins.includes(userId)) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Only team admins can configure repository settings",
        }),
      };
    }

    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const { owner, repo, installationId } = body;

    if (!owner || typeof owner !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '"owner" is required (GitHub org or user)' }),
      };
    }
    if (!repo || typeof repo !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '"repo" is required (repository name)' }),
      };
    }
    if (!installationId || typeof installationId !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: '"installationId" is required (GitHub App installation ID)',
        }),
      };
    }

    const config: RepoConfig = {
      owner: owner.trim(),
      repo: repo.trim(),
      installationId: installationId.trim(),
    };

    // Validate the installation works before saving
    const appId = Resource.GitHubAppId.value;
    const privateKey = Resource.GitHubAppPrivateKey.value;

    if (appId && privateKey) {
      try {
        const jwt = generateAppJwt(appId, privateKey);
        await getInstallationToken(jwt, config.installationId, {
          repositories: [config.repo],
        });
      } catch (err: any) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "Failed to validate GitHub App installation — check installationId and repo name",
            detail: err.message,
          }),
        };
      }
    }

    // Save to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: repoConfigKey(teamId),
        Body: JSON.stringify(config, null, 2),
        ContentType: "application/json",
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        teamId,
        owner: config.owner,
        repo: config.repo,
        status: "configured",
      }),
    };
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Team not found" }),
      };
    }
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
    };
  }
};
