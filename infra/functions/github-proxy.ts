/**
 * GitHub Proxy Lambda — fetches GitHub compare (diff) data for a submission branch
 * using the GitHub App installation token for the team's configured repo.
 *
 * This proxy avoids CORS issues and keeps the GitHub App private key server-side.
 *
 * GET /api/teams/{id}/github-diff?branch={branchName}
 *
 * Response: CompareResult — files changed with patch data
 */

import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { generateAppJwt, getInstallationToken } from "./github-app";

const s3 = new S3Client({});
const cognito = new CognitoIdentityProviderClient({});

// --- Types ---

interface RepoConfig {
  owner: string;
  repo: string;
  installationId: string;
}

interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface CompareResult {
  baseBranch: string;
  headBranch: string;
  aheadBy: number;
  behindBy: number;
  files: DiffFile[];
}

// --- Helpers ---

function getUserId(event: any): string {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new Error("Unauthorized");
  return claims.sub;
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

async function getInstallationTokenForRepo(
  config: RepoConfig
): Promise<string> {
  const appId = Resource.GitHubAppId.value;
  const privateKey = Resource.GitHubAppPrivateKey.value;

  if (!appId || !privateKey) {
    throw new Error(
      "GitHub App credentials not configured. Set GitHubAppId and GitHubAppPrivateKey as SST Secrets."
    );
  }

  const jwt = generateAppJwt(appId, privateKey);
  const tokenResponse = await getInstallationToken(jwt, config.installationId, {
    repositories: [config.repo],
    permissions: {
      contents: "read",
    },
  });

  return tokenResponse.token;
}

// --- Handler ---

/**
 * Proxy GitHub compare API — returns file diffs for a branch vs. main
 * GET /api/teams/{id}/github-diff?branch={branchName}
 *
 * Requires team membership. Uses the team's GitHub App installation token,
 * so the App private key never leaves the Lambda environment.
 */
export const getGitHubDiff: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID" }),
      };
    }

    const branchName = event.queryStringParameters?.branch;
    if (!branchName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing "branch" query parameter' }),
      };
    }

    // Verify team membership
    const isMember = await verifyTeamMembership(userId, teamId);
    if (!isMember) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Not a team member" }),
      };
    }

    // Load repo config
    const repoConfig = await getRepoConfig(teamId);
    if (!repoConfig) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "No repository configured for this team",
        }),
      };
    }

    // Get GitHub installation token (read-only for diff)
    const token = await getInstallationTokenForRepo(repoConfig);

    // Call GitHub compare API: GET /repos/{owner}/{repo}/compare/{base}...{head}
    // Uses three-dot compare (base...head) which shows commits reachable from head but not base
    const { owner, repo } = repoConfig;
    const base = "main";
    const head = encodeURIComponent(branchName);
    const compareUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${base}...${head}`;

    const compareResponse = await fetch(compareUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "HQ-Team-Sync",
      },
    });

    if (!compareResponse.ok) {
      const errorText = await compareResponse.text();

      if (compareResponse.status === 404) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: `Branch "${branchName}" not found on ${owner}/${repo}`,
            detail: errorText,
          }),
        };
      }

      return {
        statusCode: 502,
        body: JSON.stringify({
          error: `GitHub API error (${compareResponse.status})`,
          detail: errorText,
        }),
      };
    }

    const compareData = (await compareResponse.json()) as {
      base_commit?: { sha: string };
      ahead_by: number;
      behind_by: number;
      files?: Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        changes: number;
        patch?: string;
      }>;
    };

    const result: CompareResult = {
      baseBranch: base,
      headBranch: branchName,
      aheadBy: compareData.ahead_by ?? 0,
      behindBy: compareData.behind_by ?? 0,
      files: (compareData.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
      })),
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error("getGitHubDiff error:", err);

    if (err.message === "Unauthorized") {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    if (err.name === "ResourceNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }
    if (err.message?.includes("GitHub App credentials not configured")) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message }),
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
