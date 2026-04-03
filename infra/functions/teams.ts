/**
 * Team operations API — CRUD for teams using Cognito User Pool Groups
 * Team metadata stored in group Description field as JSON
 */

import {
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  GetGroupCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { Resource } from "sst";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";

const cognito = new CognitoIdentityProviderClient({});

interface TeamMetadata {
  name: string;
  createdBy: string;
  createdAt: string;
  admins: string[];
}

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

function generateTeamId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = randomUUID().slice(0, 8);
  return `team-${slug}-${suffix}`;
}

/**
 * Create a new team — creates Cognito group with JSON metadata
 * POST /api/teams { name: string }
 */
export const createTeam: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const body = JSON.parse(event.body || "{}");
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Team name is required" }),
      };
    }

    const teamId = generateTeamId(name.trim());
    const metadata: TeamMetadata = {
      name: name.trim(),
      createdBy: userId,
      createdAt: new Date().toISOString(),
      admins: [userId],
    };

    await cognito.send(
      new CreateGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
        Description: JSON.stringify(metadata),
      })
    );

    // Add creator to the group
    await cognito.send(
      new AdminAddUserToGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
        Username: userId,
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        teamId,
        name: metadata.name,
        role: "admin",
      }),
    };
  } catch (err) {
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

/**
 * Get team details
 * GET /api/teams/{id}
 */
export const getTeam: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    getUserId(event); // Verify auth
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID" }) };
    }

    const result = await cognito.send(
      new GetGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );

    const metadata = parseTeamMetadata(result.Group?.Description);
    if (!metadata) {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        teamId,
        name: metadata.name,
        createdBy: metadata.createdBy,
        createdAt: metadata.createdAt,
      }),
    };
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }
    return {
      statusCode: err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

/**
 * List teams for the authenticated user
 * GET /api/teams
 */
export const listTeams: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);

    const result = await cognito.send(
      new AdminListGroupsForUserCommand({
        Username: userId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );

    const teams = (result.Groups || []).map((group) => {
      const metadata = parseTeamMetadata(group.Description);
      return {
        teamId: group.GroupName,
        name: metadata?.name || group.GroupName,
        createdAt: metadata?.createdAt || group.CreationDate?.toISOString(),
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ teams }),
    };
  } catch (err) {
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

/**
 * List members of a team
 * GET /api/teams/{id}/members
 */
export const listMembers: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const userId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID" }) };
    }

    // Verify requester is a member
    const userGroups = await cognito.send(
      new AdminListGroupsForUserCommand({
        Username: userId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );
    const isMember = (userGroups.Groups || []).some((g) => g.GroupName === teamId);
    if (!isMember) {
      return { statusCode: 403, body: JSON.stringify({ error: "Not a team member" }) };
    }

    // Get team metadata for admin list
    const groupResult = await cognito.send(
      new GetGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );
    const metadata = parseTeamMetadata(groupResult.Group?.Description);
    const admins = metadata?.admins || [];

    // List group members
    const result = await cognito.send(
      new ListUsersInGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );

    const members = (result.Users || []).map((user) => {
      const sub = user.Attributes?.find((a) => a.Name === "sub")?.Value || user.Username || "";
      const email = user.Attributes?.find((a) => a.Name === "email")?.Value || "";
      return {
        userId: sub,
        email,
        role: admins.includes(sub) ? "admin" : "member",
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ members }),
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
 * Add a member to a team (admin only)
 * POST /api/teams/{id}/members { userId: string }
 */
export const addMember: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const requesterId = getUserId(event);
    const teamId = event.pathParameters?.id;
    if (!teamId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID" }) };
    }

    const body = JSON.parse(event.body || "{}");
    const { userId } = body;
    if (!userId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing userId" }) };
    }

    // Verify requester is admin
    const groupResult = await cognito.send(
      new GetGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
      })
    );
    const metadata = parseTeamMetadata(groupResult.Group?.Description);
    if (!metadata?.admins.includes(requesterId)) {
      return { statusCode: 403, body: JSON.stringify({ error: "Only team admins can add members" }) };
    }

    await cognito.send(
      new AdminAddUserToGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
        Username: userId,
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ userId, teamId, status: "added" }),
    };
  } catch (err: any) {
    if (err.name === "ResourceNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "Team not found" }) };
    }
    if (err.name === "UserNotFoundException") {
      return { statusCode: 404, body: JSON.stringify({ error: "User not found" }) };
    }
    return {
      statusCode: err instanceof Error && err.message === "Unauthorized" ? 401 : 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
    };
  }
};

/**
 * Remove a member from a team (admin only, or self-removal)
 * DELETE /api/teams/{id}/members/{userId}
 */
export const removeMember: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const requesterId = getUserId(event);
    const teamId = event.pathParameters?.id;
    const targetUserId = event.pathParameters?.userId;
    if (!teamId || !targetUserId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing team ID or user ID" }) };
    }

    // Allow self-removal or admin removal
    if (requesterId !== targetUserId) {
      const groupResult = await cognito.send(
        new GetGroupCommand({
          GroupName: teamId,
          UserPoolId: Resource.HqUserPool.id,
        })
      );
      const metadata = parseTeamMetadata(groupResult.Group?.Description);
      if (!metadata?.admins.includes(requesterId)) {
        return { statusCode: 403, body: JSON.stringify({ error: "Only team admins can remove members" }) };
      }
    }

    await cognito.send(
      new AdminRemoveUserFromGroupCommand({
        GroupName: teamId,
        UserPoolId: Resource.HqUserPool.id,
        Username: targetUserId,
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ userId: targetUserId, teamId, status: "removed" }),
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
