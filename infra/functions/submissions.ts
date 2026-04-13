/**
 * Submissions API — track team member content contributions for admin review
 *
 * Submission flow:
 * 1. Member pushes a branch to the team repo
 * 2. Member creates a submission record via POST /api/teams/{id}/submissions
 * 3. Admin reviews (git diff via GitHub API)
 * 4. Admin approves → merges branch via GitHub API, status → approved
 * 5. Admin rejects → status → rejected, branch left for member to revise
 *
 * Submissions stored in S3 at teams/{teamId}/submissions/index.json (append-only log).
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
import { generateAppJwt, getInstallationToken } from "./github-app";

const cognito = new CognitoIdentityProviderClient({});
const s3 = new S3Client({});

// --- Types ---

interface Submission {
  id: string;
  userId: string;
  branchName: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface SubmissionsIndex {
  submissions: Submission[];
}

interface TeamMetadata {
  name: string;
  createdBy: string;
  createdAt: string;
  admins: string[];
}

interface RepoConfig {
  owner: string;
  repo: string;
  installationId: string;
}

// --- Helpers ---

function getUserId(event: any): string {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new Error("Unauthorized");
  return claims.sub;
}

function parseTeamMetadata(description: string | undefined): TeamMetadata | null {
  if (!description) return null;
  try {
    return JSON.parse(description) as TeamMetadata;
  } catch {
    return null;
  }
}

function submissionsKey(teamId: string): string {
  return `teams/${teamId}/submissions/index.json`;
}

function repoConfigKey(teamId: string): string {
  return `teams/${teamId}/repo-config.json`;
}

function generateId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getSubmissions(teamId: string): Promise<SubmissionsIndex> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: submissionsKey(teamId),
      })
    );
    const body = await result.Body?.transformToString();
    if (!body) return { submissions: [] };
    return JSON.parse(body) as SubmissionsIndex;
  } catch (err: any) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return { submissions: [] };
    }
    throw err;
  }
}

async function putSubmissions(
  teamId: string,
  index: SubmissionsIndex
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.HqStorage.name,
      Key: submissionsKey(teamId),
      Body: JSON.stringify(index, null, 2),
      ContentType: "application/json",
    })
  );
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

async function isAdmin(userId: string, teamId: string): Promise<boolean> {
  const groupResult = await cognito.send(
    new GetGroupCommand({
      GroupName: teamId,
      UserPoolId: Resource.HqUserPool.id,
    })
  );
  const metadata = parseTeamMetadata(groupResult.Group?.Description);
  return metadata?.admins.includes(userId) ?? false;
}

/**
 * Get a GitHub installation token for the team's repo
 */
async function getGitHubToken(
  config: RepoConfig
): Promise<{ token: string }> {
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
      contents: "write",
    },
  });

  return { token: tokenResponse.token };
}

// --- Handlers ---

/**
 * Create a submission record for admin review
 * POST /api/teams/{id}/submissions
 * Body: { branchName: string, title: string, description?: string }
 *
 * Any team member can create a submission. The branch must already exist
 * on the team's GitHub repo.
 */
export const createSubmission: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID" }) };
    }

    // Verify team membership
    const isMember = await verifyTeamMembership(userId, teamId);
    if (!isMember) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Not a team member" }),
      };
    }

    // Parse and validate body
    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }

    const { branchName, title, description } = body;

    if (!branchName || typeof branchName !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '"branchName" is required' }),
      };
    }
    if (!title || typeof title !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '"title" is required' }),
      };
    }

    const now = new Date().toISOString();
    const submission: Submission = {
      id: generateId(),
      userId,
      branchName: branchName.trim(),
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    // Append to submissions index
    const index = await getSubmissions(teamId);
    index.submissions.push(submission);
    await putSubmissions(teamId, index);

    return {
      statusCode: 201,
      body: JSON.stringify(submission),
    };
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

/**
 * List submissions for a team
 * GET /api/teams/{id}/submissions
 *
 * Admin sees all submissions. Members see only their own.
 */
export const listSubmissions: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID" }) };
    }

    // Verify team membership
    const isMember = await verifyTeamMembership(userId, teamId);
    if (!isMember) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Not a team member" }),
      };
    }

    const index = await getSubmissions(teamId);
    const admin = await isAdmin(userId, teamId);

    // Admin sees all, member sees only their own
    const submissions = admin
      ? index.submissions
      : index.submissions.filter((s) => s.userId === userId);

    return {
      statusCode: 200,
      body: JSON.stringify({ submissions }),
    };
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

/**
 * Approve a submission — merges the branch via GitHub API
 * PUT /api/teams/{id}/submissions/{subId}/approve
 *
 * Admin only. Uses GitHub's merge API (POST /repos/{owner}/{repo}/merges)
 * to merge the submission branch into the default branch (main).
 */
export const approveSubmission: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    const subId = event.pathParameters?.subId;
    if (!teamId || !subId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID or submission ID" }),
      };
    }

    // Verify requester is admin
    const admin = await isAdmin(userId, teamId);
    if (!admin) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Only team admins can approve submissions" }),
      };
    }

    // Load submissions
    const index = await getSubmissions(teamId);
    const submission = index.submissions.find((s) => s.id === subId);
    if (!submission) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Submission not found" }),
      };
    }

    if (submission.status !== "pending") {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: `Submission is already ${submission.status}`,
        }),
      };
    }

    // Load repo config for GitHub API access
    const repoConfig = await getRepoConfig(teamId);
    if (!repoConfig) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "No repository configured for this team. Set up repo config first.",
        }),
      };
    }

    // Get GitHub installation token
    const { token } = await getGitHubToken(repoConfig);

    // Merge the branch via GitHub API
    const mergeResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repoConfig.owner)}/${encodeURIComponent(repoConfig.repo)}/merges`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "HQ-Team-Sync",
        },
        body: JSON.stringify({
          base: "main",
          head: submission.branchName,
          commit_message: `Merge submission: ${submission.title}\n\nSubmission ${submission.id} by ${submission.userId}`,
        }),
      }
    );

    if (!mergeResponse.ok) {
      const errorText = await mergeResponse.text();

      if (mergeResponse.status === 404) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Branch "${submission.branchName}" not found on ${repoConfig.owner}/${repoConfig.repo}`,
            detail: errorText,
          }),
        };
      }
      if (mergeResponse.status === 409) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: "Merge conflict — the branch cannot be automatically merged",
            detail: errorText,
          }),
        };
      }

      return {
        statusCode: 502,
        body: JSON.stringify({
          error: `GitHub merge failed (${mergeResponse.status})`,
          detail: errorText,
        }),
      };
    }

    const mergeResult = (await mergeResponse.json()) as { sha: string };

    // Update submission status
    submission.status = "approved";
    submission.updatedAt = new Date().toISOString();
    await putSubmissions(teamId, index);

    return {
      statusCode: 200,
      body: JSON.stringify({
        submission,
        merge: {
          sha: mergeResult.sha,
          repo: `${repoConfig.owner}/${repoConfig.repo}`,
        },
      }),
    };
  } catch (err: any) {
    console.error("approveSubmission error:", err);

    if (err.name === "ResourceNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }
    if (err.message?.includes("GitHub App credentials not configured")) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message }),
      };
    }
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
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

/**
 * Reject a submission with an optional reason
 * PUT /api/teams/{id}/submissions/{subId}/reject
 * Body: { reason?: string }
 *
 * Admin only. Marks the submission as rejected. The branch is left intact
 * for the member to revise and resubmit.
 */
export const rejectSubmission: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    const subId = event.pathParameters?.subId;
    if (!teamId || !subId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID or submission ID" }),
      };
    }

    // Verify requester is admin
    const admin = await isAdmin(userId, teamId);
    if (!admin) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Only team admins can reject submissions" }),
      };
    }

    // Parse body for optional reason
    let body: any = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      // Reason is optional, so invalid body is fine
    }

    // Load submissions
    const index = await getSubmissions(teamId);
    const submission = index.submissions.find((s) => s.id === subId);
    if (!submission) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Submission not found" }),
      };
    }

    if (submission.status !== "pending") {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: `Submission is already ${submission.status}`,
        }),
      };
    }

    // Update submission status
    submission.status = "rejected";
    submission.updatedAt = new Date().toISOString();
    if (body.reason && typeof body.reason === "string") {
      submission.rejectionReason = body.reason.trim();
    }
    await putSubmissions(teamId, index);

    return {
      statusCode: 200,
      body: JSON.stringify({ submission }),
    };
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};
