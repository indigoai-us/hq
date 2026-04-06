/**
 * Entitlements API — content pack definitions and user/role assignments
 *
 * Entitlements define which content packs (named groups of file path patterns)
 * each team member is entitled to. Stored in S3 at teams/{teamId}/entitlements.json.
 * Used by the CLI to configure git sparse-checkout for team content distribution.
 */

import {
  CognitoIdentityProviderClient,
  GetGroupCommand,
  ListUsersInGroupCommand,
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

interface Pack {
  paths: string[];
  description: string;
}

interface EntitlementsManifest {
  packs: Record<string, Pack>;
  assignments: Record<string, string[]>; // userId or "role:member" → pack names
}

interface TeamMetadata {
  name: string;
  createdBy: string;
  createdAt: string;
  admins: string[];
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

function entitlementsKey(teamId: string): string {
  return `teams/${teamId}/entitlements.json`;
}

async function getEntitlements(teamId: string): Promise<EntitlementsManifest | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: Resource.HqStorage.name,
        Key: entitlementsKey(teamId),
      })
    );
    const body = await result.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as EntitlementsManifest;
  } catch (err: any) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

async function putEntitlements(
  teamId: string,
  manifest: EntitlementsManifest
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.HqStorage.name,
      Key: entitlementsKey(teamId),
      Body: JSON.stringify(manifest, null, 2),
      ContentType: "application/json",
    })
  );
}

function validateManifest(body: any): { valid: true; manifest: EntitlementsManifest } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const { packs, assignments } = body;

  // Validate packs
  if (!packs || typeof packs !== "object" || Array.isArray(packs)) {
    return { valid: false, error: "\"packs\" must be an object" };
  }

  for (const [packName, pack] of Object.entries(packs)) {
    if (!packName || typeof packName !== "string") {
      return { valid: false, error: "Pack names must be non-empty strings" };
    }
    const p = pack as any;
    if (!p || typeof p !== "object") {
      return { valid: false, error: `Pack "${packName}" must be an object` };
    }
    if (!Array.isArray(p.paths) || p.paths.length === 0) {
      return { valid: false, error: `Pack "${packName}" must have a non-empty "paths" array` };
    }
    if (!p.paths.every((path: any) => typeof path === "string" && path.length > 0)) {
      return { valid: false, error: `Pack "${packName}" paths must be non-empty strings` };
    }
    if (typeof p.description !== "string") {
      return { valid: false, error: `Pack "${packName}" must have a "description" string` };
    }
  }

  // Validate assignments
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
    return { valid: false, error: "\"assignments\" must be an object" };
  }

  const packNames = new Set(Object.keys(packs));

  for (const [key, assignedPacks] of Object.entries(assignments)) {
    if (!key || typeof key !== "string") {
      return { valid: false, error: "Assignment keys must be non-empty strings" };
    }
    if (!Array.isArray(assignedPacks)) {
      return { valid: false, error: `Assignments for "${key}" must be an array of pack names` };
    }
    for (const packRef of assignedPacks as any[]) {
      if (typeof packRef !== "string") {
        return { valid: false, error: `Assignment values for "${key}" must be strings` };
      }
      if (!packNames.has(packRef)) {
        return { valid: false, error: `Assignment "${key}" references unknown pack "${packRef}"` };
      }
    }
  }

  return {
    valid: true,
    manifest: { packs: packs as Record<string, Pack>, assignments: assignments as Record<string, string[]> },
  };
}

/**
 * Resolve entitlements for a specific user: returns their assigned packs
 * with merged paths from both direct userId assignments and role-based defaults.
 */
function resolveUserEntitlements(
  manifest: EntitlementsManifest,
  userId: string,
  role: string
): { packs: Record<string, Pack>; paths: string[] } {
  const assignedPackNames = new Set<string>();

  // Direct user assignment
  const userPacks = manifest.assignments[userId];
  if (userPacks) {
    for (const p of userPacks) assignedPackNames.add(p);
  }

  // Role-based defaults (e.g., "role:member")
  const rolePacks = manifest.assignments[`role:${role}`];
  if (rolePacks) {
    for (const p of rolePacks) assignedPackNames.add(p);
  }

  const resolvedPacks: Record<string, Pack> = {};
  const allPaths: string[] = [];

  for (const packName of assignedPackNames) {
    const pack = manifest.packs[packName];
    if (pack) {
      resolvedPacks[packName] = pack;
      allPaths.push(...pack.paths);
    }
  }

  // Deduplicate paths
  const uniquePaths = [...new Set(allPaths)];

  return { packs: resolvedPacks, paths: uniquePaths };
}

// --- Handlers ---

/**
 * Create or update the entitlements manifest for a team (admin only)
 * POST /api/teams/{id}/entitlements
 * Body: { packs: { name: { paths: [], description: "" } }, assignments: { userId: [packNames] } }
 */
export const setEntitlements: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID" }) };
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
      return { statusCode: 403, body: JSON.stringify({ error: "Only team admins can manage entitlements" }) };
    }

    // Parse and validate body
    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }

    const validation = validateManifest(body);
    if (!validation.valid) {
      return { statusCode: 400, body: JSON.stringify({ error: validation.error }) };
    }

    // Write to S3
    await putEntitlements(teamId, validation.manifest);

    return {
      statusCode: 200,
      body: JSON.stringify({
        teamId,
        packs: Object.keys(validation.manifest.packs),
        assignmentCount: Object.keys(validation.manifest.assignments).length,
        status: "saved",
      }),
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
 * Get the full entitlements manifest for a team (any team member)
 * GET /api/teams/{id}/entitlements
 */
export const getEntitlementsManifest: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    getUserId(event); // Verify auth
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID" }) };
    }

    // Verify team exists
    await cognito.send(
      new GetGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );

    const manifest = await getEntitlements(teamId);
    if (!manifest) {
      return {
        statusCode: 200,
        body: JSON.stringify({ packs: {}, assignments: {} }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(manifest),
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
 * Get entitlements for the authenticated user — resolves packs from both
 * direct assignments and role-based defaults
 * GET /api/teams/{id}/entitlements/mine
 */
export const getMyEntitlements: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID" }) };
    }

    // Get team metadata to determine user's role
    const groupResult = await cognito.send(
      new GetGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );
    const metadata = parseTeamMetadata(groupResult.Group?.Description);
    if (!metadata) {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }

    const role = metadata.admins.includes(userId) ? "admin" : "member";

    const manifest = await getEntitlements(teamId);
    if (!manifest) {
      return {
        statusCode: 200,
        body: JSON.stringify({ packs: {}, paths: [], role }),
      };
    }

    const resolved = resolveUserEntitlements(manifest, userId, role);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...resolved,
        role,
      }),
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
