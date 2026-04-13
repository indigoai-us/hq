/**
 * Shares API — peer-to-peer content sharing via named branches
 *
 * Share flow:
 * 1. Sender runs /share {path} --with {email} — which pushes a branch named
 *    shared/{sender-email}/{filename} to the team repo
 * 2. Sender creates a share record via POST /api/teams/{id}/shares
 * 3. Recipient's next /team-sync detects incoming shared branches and offers
 *    to install the alternate alongside their existing team content
 * 4. Alternates are installed with a .alt.{author} suffix to avoid conflicts
 *
 * Shares stored in S3 at teams/{teamId}/shares.json (append-only log).
 */

import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

const cognito = new CognitoIdentityProviderClient({});
const s3 = new S3Client({});

// --- Types ---

interface Share {
  id: string;
  sender: string; // Cognito user ID of the sender
  senderEmail: string; // Email address of the sender
  recipient: string; // Email address of the recipient
  path: string; // File path being shared (relative to HQ root)
  branchName: string; // Branch name: shared/{sender-email}/{filename}
  status: "active" | "installed" | "declined";
  createdAt: string;
  updatedAt: string;
}

interface SharesIndex {
  shares: Share[];
}

// --- Helpers ---

function getUserId(event: any): string {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new Error("Unauthorized");
  return claims.sub;
}

function getUserEmail(event: any): string | null {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  return claims?.email ?? null;
}

function sharesKey(teamId: string): string {
  return `teams/${teamId}/shares.json`;
}

function generateId(): string {
  return `shr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getShares(teamId: string): Promise<SharesIndex> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: sharesKey(teamId),
      })
    );
    const body = await result.Body?.transformToString();
    if (!body) return { shares: [] };
    return JSON.parse(body) as SharesIndex;
  } catch (err: any) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return { shares: [] };
    }
    throw err;
  }
}

async function putShares(
  teamId: string,
  index: SharesIndex
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.HqStorage.name,
      Key: sharesKey(teamId),
      Body: JSON.stringify(index, null, 2),
      ContentType: "application/json",
    })
  );
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

/**
 * Derive the branch name for a shared file.
 * Format: shared/{sender-email}/{filename}
 * Email characters that are invalid in branch names are replaced with hyphens.
 */
function deriveBranchName(senderEmail: string, filePath: string): string {
  const safeSender = senderEmail
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, "-");
  const filename = filePath.split("/").pop() || filePath;
  const safeFilename = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return `shared/${safeSender}/${safeFilename}`;
}

// --- Handlers ---

/**
 * Create a share record
 * POST /api/teams/{id}/shares
 * Body: { recipient: string, path: string, branchName?: string }
 *
 * Any team member can create a share targeting another person's email.
 * The branch should already exist on the team's GitHub repo (pushed by /share command).
 * If branchName is not provided, it is derived from the sender's email and the file path.
 */
export const createShare: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const senderEmail = getUserEmail(event);
    const teamId = event.pathParameters?.id;

    if (!teamId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID" }),
      };
    }

    if (!senderEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Sender email not available in auth token — cannot create share record",
        }),
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

    // Parse and validate body
    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const { recipient, path: filePath, branchName: providedBranch } = body;

    if (!recipient || typeof recipient !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '"recipient" is required (email address)' }),
      };
    }
    if (!filePath || typeof filePath !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '"path" is required (file path being shared)' }),
      };
    }

    // Prevent sharing with yourself
    if (recipient.toLowerCase() === senderEmail.toLowerCase()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Cannot share content with yourself" }),
      };
    }

    const branchName =
      typeof providedBranch === "string" && providedBranch.trim()
        ? providedBranch.trim()
        : deriveBranchName(senderEmail, filePath);

    const now = new Date().toISOString();
    const share: Share = {
      id: generateId(),
      sender: userId,
      senderEmail: senderEmail.toLowerCase(),
      recipient: recipient.toLowerCase().trim(),
      path: filePath.trim(),
      branchName,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    // Append to shares index
    const index = await getShares(teamId);
    index.shares.push(share);
    await putShares(teamId, index);

    return {
      statusCode: 201,
      body: JSON.stringify(share),
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
 * List shares for the current user
 * GET /api/teams/{id}/shares
 * Query: ?direction=incoming|outgoing (default: both)
 *
 * Returns incoming shares (recipient = current user email) and
 * outgoing shares (sender = current user) — or both.
 */
export const listShares: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const senderEmail = getUserEmail(event);
    const teamId = event.pathParameters?.id;

    if (!teamId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID" }),
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

    const direction = event.queryStringParameters?.direction; // "incoming" | "outgoing" | undefined
    const index = await getShares(teamId);

    const userEmail = senderEmail?.toLowerCase() ?? "";

    let incoming: Share[] = [];
    let outgoing: Share[] = [];

    if (!direction || direction === "incoming") {
      incoming = index.shares.filter(
        (s) => s.recipient === userEmail
      );
    }

    if (!direction || direction === "outgoing") {
      outgoing = index.shares.filter(
        (s) => s.sender === userId || s.senderEmail === userEmail
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        incoming,
        outgoing,
        total: incoming.length + outgoing.length,
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
 * Update a share's status (installed or declined)
 * PUT /api/teams/{id}/shares/{shareId}/status
 * Body: { status: "installed" | "declined" }
 *
 * Only the recipient can update the status of an incoming share.
 */
export const updateShareStatus: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const senderEmail = getUserEmail(event);
    const teamId = event.pathParameters?.id;
    const shareId = event.pathParameters?.shareId;

    if (!teamId || !shareId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing team ID or share ID" }),
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

    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const { status } = body;
    if (status !== "installed" && status !== "declined") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: '"status" must be "installed" or "declined"',
        }),
      };
    }

    const index = await getShares(teamId);
    const share = index.shares.find((s) => s.id === shareId);

    if (!share) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Share not found" }),
      };
    }

    // Only the recipient can update status
    const userEmail = senderEmail?.toLowerCase() ?? "";
    if (share.recipient !== userEmail) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Only the recipient can update share status",
        }),
      };
    }

    share.status = status;
    share.updatedAt = new Date().toISOString();
    await putShares(teamId, index);

    return {
      statusCode: 200,
      body: JSON.stringify({ share }),
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
