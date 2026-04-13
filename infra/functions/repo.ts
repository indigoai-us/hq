/**
 * Repo config API — GitHub App credential brokering for team members
 *
 * Provides short-lived GitHub installation tokens scoped to specific repos.
 * Validates team membership via Cognito group check before issuing tokens.
 *
 * Endpoints:
 * - GET /api/teams/{id}/repo-config — returns a short-lived git credential
 * - POST /api/teams/{id}/repo — provisions a new GitHub repo for a team
 * - GET /api/teams/{id}/github-status — returns GitHub App installation status
 */

import {
  CognitoIdentityProviderClient,
  GetGroupCommand,
  UpdateGroupCommand,
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

// --- HQ content .gitignore for provisioned repos ---

const HQ_GITIGNORE = `# HQ content repository
# Auto-generated by HQ Cloud repo provisioning

# OS files
.DS_Store
Thumbs.db

# Editor files
*.swp
*.swo
*~
.vscode/settings.json

# Dependencies (if any tooling is added)
node_modules/
.npm/

# Environment files
.env
.env.*
`;

const HQ_README_TEMPLATE = (teamName: string, repoName: string) => `# ${repoName}

Shared HQ content repository for **${teamName}**.

## Structure

\`\`\`
skills/          # Team skills
workers/         # Worker definitions
policies/        # Governance policies
commands/        # Custom commands
knowledge/       # Shared knowledge bases
\`\`\`

## Getting Started

Team members can clone this repo using HQ CLI:

\`\`\`bash
hq sync
\`\`\`

Content entitlements are managed by your team admin.

---

*Provisioned by [HQ Cloud](https://hq.getindigo.ai)*
`;

/**
 * Provision a new GitHub repo for a team (admin only)
 * POST /api/teams/{id}/repo
 *
 * Creates a private GitHub repo on the admin's org using a GitHub App
 * installation token. Initializes with README and .gitignore for HQ content.
 * Updates team metadata with repoUrl, repoOrg, and installationId.
 *
 * Body: { org: string, repoName?: string, installationId: string }
 *
 * If the GitHub App isn't installed on the target org, returns 409 with
 * an installation URL the admin can visit.
 */
export const provisionRepo: APIGatewayProxyHandlerV2 = async (event) => {
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
    if (!metadata) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Team not found or invalid metadata" }),
      };
    }
    if (!metadata.admins.includes(userId)) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Only team admins can provision repositories",
        }),
      };
    }

    // Parse request body
    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const { org, repoName, installationId } = body;

    if (!org || typeof org !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: '"org" is required (GitHub organization or user account)',
        }),
      };
    }

    if (!installationId || typeof installationId !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            '"installationId" is required (GitHub App installation ID for the target org)',
        }),
      };
    }

    // Resolve repo name — use provided name or derive from team name
    const resolvedRepoName =
      repoName && typeof repoName === "string"
        ? repoName.trim()
        : `hq-${metadata.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")}`;

    // Validate GitHub App secrets are configured
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

    // Verify the installation exists and belongs to the target org
    let installations: Array<{
      id: number;
      account: { login: string };
    }>;
    try {
      installations = await listInstallations(jwt);
    } catch (err: any) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: "Failed to list GitHub App installations",
          detail: err.message,
        }),
      };
    }

    const installation = installations.find(
      (i) => String(i.id) === installationId
    );
    if (!installation) {
      // Installation ID doesn't match any known installation — maybe not installed
      const appInfo = await getAppInfo(jwt).catch(() => null);
      const appName = appInfo?.name || "hq-team-sync";
      return {
        statusCode: 409,
        body: JSON.stringify({
          error:
            "GitHub App installation not found. The app may not be installed on the target organization.",
          installUrl: `https://github.com/apps/${appName}/installations/new`,
          hint: `Install the "${appName}" GitHub App on the "${org}" organization, then retry with the new installation ID.`,
        }),
      };
    }

    // Verify the installation account matches the requested org
    if (
      installation.account.login.toLowerCase() !== org.trim().toLowerCase()
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Installation ${installationId} belongs to "${installation.account.login}", not "${org}". Provide the correct installationId for the "${org}" organization.`,
        }),
      };
    }

    // Get an installation access token scoped to repo creation
    let tokenResponse: { token: string; expires_at: string };
    try {
      tokenResponse = await getInstallationToken(jwt, installationId, {
        permissions: {
          contents: "write",
          administration: "write",
        },
      });
    } catch (err: any) {
      // Token generation failed — likely the app isn't installed or lacks permissions
      const appInfo = await getAppInfo(jwt).catch(() => null);
      const appName = appInfo?.name || "hq-team-sync";
      return {
        statusCode: 409,
        body: JSON.stringify({
          error:
            "Failed to generate GitHub installation token. The app may not be installed or lacks required permissions.",
          installUrl: `https://github.com/apps/${appName}/installations/new`,
          detail: err.message,
        }),
      };
    }

    // Create the repository via GitHub API (using installation token)
    const createRepoResponse = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(org.trim())}/repos`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${tokenResponse.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "HQ-Team-Sync",
        },
        body: JSON.stringify({
          name: resolvedRepoName,
          description: `HQ shared content for ${metadata.name}`,
          private: true,
          auto_init: false, // We'll create the initial commit ourselves
          has_issues: false,
          has_projects: false,
          has_wiki: false,
        }),
      }
    );

    if (!createRepoResponse.ok) {
      const errorText = await createRepoResponse.text();

      // If the org endpoint fails (e.g., personal account), try user repos endpoint
      if (createRepoResponse.status === 404) {
        const userRepoResponse = await fetch(
          "https://api.github.com/user/repos",
          {
            method: "POST",
            headers: {
              Authorization: `token ${tokenResponse.token}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "HQ-Team-Sync",
            },
            body: JSON.stringify({
              name: resolvedRepoName,
              description: `HQ shared content for ${metadata.name}`,
              private: true,
              auto_init: false,
              has_issues: false,
              has_projects: false,
              has_wiki: false,
            }),
          }
        );

        if (!userRepoResponse.ok) {
          const userErrorText = await userRepoResponse.text();
          return {
            statusCode: 502,
            body: JSON.stringify({
              error: `Failed to create repository on GitHub (${userRepoResponse.status})`,
              detail: userErrorText,
            }),
          };
        }
      } else if (createRepoResponse.status === 422) {
        // 422 usually means repo already exists
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: `Repository "${org}/${resolvedRepoName}" already exists`,
            detail: errorText,
          }),
        };
      } else {
        return {
          statusCode: 502,
          body: JSON.stringify({
            error: `Failed to create repository on GitHub (${createRepoResponse.status})`,
            detail: errorText,
          }),
        };
      }
    }

    // Initialize the repo with README and .gitignore via the Contents API
    // Create .gitignore first (as initial commit)
    const gitignoreResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(org.trim())}/${encodeURIComponent(resolvedRepoName)}/contents/.gitignore`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${tokenResponse.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "HQ-Team-Sync",
        },
        body: JSON.stringify({
          message: "Initial commit: add .gitignore",
          content: Buffer.from(HQ_GITIGNORE).toString("base64"),
        }),
      }
    );

    if (!gitignoreResponse.ok) {
      console.warn(
        "Failed to create .gitignore:",
        await gitignoreResponse.text()
      );
    }

    // Create README.md
    const readmeResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(org.trim())}/${encodeURIComponent(resolvedRepoName)}/contents/README.md`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${tokenResponse.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "HQ-Team-Sync",
        },
        body: JSON.stringify({
          message: "Add README",
          content: Buffer.from(
            HQ_README_TEMPLATE(metadata.name, resolvedRepoName)
          ).toString("base64"),
        }),
      }
    );

    if (!readmeResponse.ok) {
      console.warn("Failed to create README:", await readmeResponse.text());
    }

    // Save repo config to S3
    const config: RepoConfig = {
      owner: org.trim(),
      repo: resolvedRepoName,
      installationId: installationId.trim(),
    };

    await s3.send(
      new PutObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: repoConfigKey(teamId),
        Body: JSON.stringify(config, null, 2),
        ContentType: "application/json",
      })
    );

    // Update Cognito group metadata with repoUrl, repoOrg, installationId
    const updatedMetadata = {
      ...metadata,
      repoUrl: `https://github.com/${org.trim()}/${resolvedRepoName}`,
      repoOrg: org.trim(),
      installationId: installationId.trim(),
    };

    await cognito.send(
      new UpdateGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
        Description: JSON.stringify(updatedMetadata),
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        teamId,
        repoUrl: `https://github.com/${org.trim()}/${resolvedRepoName}`,
        repoOrg: org.trim(),
        repoName: resolvedRepoName,
        installationId: installationId.trim(),
        status: "provisioned",
      }),
    };
  } catch (err: any) {
    console.error("provisionRepo error:", err);

    if (err.message === "Unauthorized") {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }
    if (err.name === "ResourceNotFoundException") {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Team not found" }),
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
