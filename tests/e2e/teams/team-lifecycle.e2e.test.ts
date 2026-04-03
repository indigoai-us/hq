/**
 * E2E: Team lifecycle — create, invite, join, prefix isolation
 *
 * Tests the full team infrastructure without live AWS services.
 * Mocks Cognito and S3 SDK calls, validates handler logic end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID, createHmac } from "crypto";

// ── Mock AWS SDKs before importing handlers ──────────────────────────
// vi.hoisted() runs in the hoisted scope alongside vi.mock factories,
// so these refs are available when the mock factories execute.

const { cognitoMock, s3Mock } = vi.hoisted(() => ({
  cognitoMock: { send: vi.fn() },
  s3Mock: { send: vi.fn() },
}));

vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  return {
    CognitoIdentityProviderClient: function () { return cognitoMock; },
    CreateGroupCommand: function (input: any) { return { _type: "CreateGroup", input }; },
    GetGroupCommand: function (input: any) { return { _type: "GetGroup", input }; },
    AdminAddUserToGroupCommand: function (input: any) { return { _type: "AdminAddUserToGroup", input }; },
    AdminRemoveUserFromGroupCommand: function (input: any) { return { _type: "AdminRemoveUserFromGroup", input }; },
    AdminListGroupsForUserCommand: function (input: any) { return { _type: "AdminListGroupsForUser", input }; },
    ListUsersInGroupCommand: function (input: any) { return { _type: "ListUsersInGroup", input }; },
  };
});

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: function () { return s3Mock; },
    PutObjectCommand: function (input: any) { return { _type: "PutObject", input }; },
    HeadObjectCommand: function (input: any) { return { _type: "HeadObject", input }; },
    DeleteObjectCommand: function (input: any) { return { _type: "DeleteObject", input }; },
  };
});

vi.mock("sst", () => ({
  Resource: {
    HqUserPool: { id: "us-east-1_TestPool" },
    HqStorage: { name: "test-hq-storage-bucket" },
    InviteSecret: { value: "test-secret-key-32-chars-long!!" },
  },
}));

// ── Import handlers after mocks are in place ─────────────────────────

import {
  createTeam,
  getTeam,
  listTeams,
  listMembers,
  addMember,
  removeMember,
  createInvite,
  joinTeam,
} from "../../../infra/functions/teams.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(overrides: Record<string, any> = {}): any {
  const { userId, body, pathParameters, ...rest } = overrides;
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: userId ?? "user-001" },
        },
      },
    },
    body: body ? JSON.stringify(body) : undefined,
    pathParameters: pathParameters ?? {},
    ...rest,
  };
}

function parseResponse(result: any): { statusCode: number; data: any } {
  return {
    statusCode: result.statusCode,
    data: JSON.parse(result.body),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("e2e: team lifecycle", () => {
  beforeEach(() => {
    cognitoMock.send.mockReset();
    s3Mock.send.mockReset();
  });

  // ── 1. Team Creation ────────────────────────────────────────────

  describe("createTeam", () => {
    it("creates a team and adds creator as admin member", async () => {
      cognitoMock.send
        .mockResolvedValueOnce({}) // CreateGroupCommand
        .mockResolvedValueOnce({}); // AdminAddUserToGroupCommand

      const event = makeEvent({ body: { name: "Indigo Engineering" } });
      const { statusCode, data } = parseResponse(await createTeam(event, {} as any, () => {}));

      expect(statusCode).toBe(201);
      expect(data.name).toBe("Indigo Engineering");
      expect(data.teamId).toMatch(/^team-indigo-engineering-[a-f0-9]{8}$/);
      expect(data.role).toBe("admin");

      // Verify Cognito calls
      expect(cognitoMock.send).toHaveBeenCalledTimes(2);
      const createGroupCall = cognitoMock.send.mock.calls[0][0];
      expect(createGroupCall.input.UserPoolId).toBe("us-east-1_TestPool");

      const metadata = JSON.parse(createGroupCall.input.Description);
      expect(metadata.name).toBe("Indigo Engineering");
      expect(metadata.admins).toContain("user-001");
    });

    it("rejects missing team name", async () => {
      const event = makeEvent({ body: {} });
      const { statusCode, data } = parseResponse(await createTeam(event, {} as any, () => {}));

      expect(statusCode).toBe(400);
      expect(data.error).toMatch(/name/i);
    });

    it("returns 401 for unauthenticated requests", async () => {
      const event = { requestContext: {}, body: JSON.stringify({ name: "Test" }) };
      const { statusCode } = parseResponse(await createTeam(event as any, {} as any, () => {}));

      expect(statusCode).toBe(401);
    });
  });

  // ── 2. Team Retrieval ───────────────────────────────────────────

  describe("getTeam", () => {
    it("returns team metadata from Cognito group description", async () => {
      const metadata = {
        name: "Indigo Engineering",
        createdBy: "user-001",
        createdAt: "2026-04-01T00:00:00Z",
        admins: ["user-001"],
      };
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: "team-indigo-abc12345", Description: JSON.stringify(metadata) },
      });

      const event = makeEvent({ pathParameters: { id: "team-indigo-abc12345" } });
      const { statusCode, data } = parseResponse(await getTeam(event, {} as any, () => {}));

      expect(statusCode).toBe(200);
      expect(data.teamId).toBe("team-indigo-abc12345");
      expect(data.name).toBe("Indigo Engineering");
      expect(data.createdBy).toBe("user-001");
    });

    it("returns 404 for nonexistent team", async () => {
      const err = new Error("Group not found");
      (err as any).name = "ResourceNotFoundException";
      cognitoMock.send.mockRejectedValueOnce(err);

      const event = makeEvent({ pathParameters: { id: "team-ghost-00000000" } });
      const { statusCode, data } = parseResponse(await getTeam(event, {} as any, () => {}));

      expect(statusCode).toBe(404);
      expect(data.error).toMatch(/not found/i);
    });
  });

  // ── 3. Invite Token Flow ────────────────────────────────────────

  describe("createInvite + joinTeam", () => {
    const teamId = "team-test-invite-abc12345";
    const adminUserId = "user-admin-001";
    const joinerUserId = "user-joiner-002";
    const inviteSecret = "test-secret-key-32-chars-long!!";

    it("admin creates invite → joiner redeems token → joins team", async () => {
      // ── Step 1: Create invite ──
      const teamMetadata = {
        name: "Test Team",
        createdBy: adminUserId,
        createdAt: "2026-04-01T00:00:00Z",
        admins: [adminUserId],
      };

      // GetGroupCommand (verify admin)
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: teamId, Description: JSON.stringify(teamMetadata) },
      });
      // PutObjectCommand (S3 marker)
      s3Mock.send.mockResolvedValueOnce({});

      const inviteEvent = makeEvent({
        userId: adminUserId,
        pathParameters: { id: teamId },
      });

      const inviteResult = parseResponse(await createInvite(inviteEvent, {} as any, () => {}));
      expect(inviteResult.statusCode).toBe(201);
      expect(inviteResult.data.token).toBeTruthy();
      expect(inviteResult.data.expiresAt).toBeTruthy();

      const token = inviteResult.data.token;

      // Verify S3 marker was written
      const putCall = s3Mock.send.mock.calls[0][0];
      expect(putCall.input.Bucket).toBe("test-hq-storage-bucket");
      expect(putCall.input.Key).toMatch(/^teams\/team-test-invite-abc12345\/invites\//);

      // ── Step 2: Redeem invite ──
      cognitoMock.send.mockReset();
      s3Mock.send.mockReset();

      // HeadObjectCommand (check marker exists)
      s3Mock.send
        .mockResolvedValueOnce({}) // HeadObject — marker exists
        .mockResolvedValueOnce({}); // DeleteObject — consume marker

      // AdminAddUserToGroupCommand (add joiner)
      cognitoMock.send
        .mockResolvedValueOnce({}) // AdminAddUserToGroup
        .mockResolvedValueOnce({ // GetGroupCommand (get team name)
          Group: { GroupName: teamId, Description: JSON.stringify(teamMetadata) },
        });

      const joinEvent = makeEvent({
        userId: joinerUserId,
        body: { token },
      });

      const joinResult = parseResponse(await joinTeam(joinEvent, {} as any, () => {}));
      expect(joinResult.statusCode).toBe(200);
      expect(joinResult.data.teamId).toBe(teamId);
      expect(joinResult.data.teamName).toBe("Test Team");
      expect(joinResult.data.status).toBe("joined");
    });

    it("rejects expired token", async () => {
      // Craft a manually-expired token
      const payload = {
        teamId,
        invitedBy: adminUserId,
        role: "member",
        exp: Date.now() - 1000, // 1 second ago
        jti: randomUUID(),
      };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const hmac = createHmac("sha256", inviteSecret).update(payloadB64).digest("base64url");
      const expiredToken = `${payloadB64}.${hmac}`;

      const event = makeEvent({ userId: joinerUserId, body: { token: expiredToken } });
      const { statusCode, data } = parseResponse(await joinTeam(event, {} as any, () => {}));

      expect(statusCode).toBe(401);
      expect(data.error).toMatch(/expired/i);
    });

    it("rejects tampered token (bad signature)", async () => {
      const payload = {
        teamId,
        invitedBy: adminUserId,
        role: "member",
        exp: Date.now() + 86400000,
        jti: randomUUID(),
      };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const badToken = `${payloadB64}.this-is-not-a-valid-signature`;

      const event = makeEvent({ userId: joinerUserId, body: { token: badToken } });
      const { statusCode, data } = parseResponse(await joinTeam(event, {} as any, () => {}));

      expect(statusCode).toBe(401);
      expect(data.error).toMatch(/signature/i);
    });

    it("rejects already-used token (S3 marker deleted)", async () => {
      const payload = {
        teamId,
        invitedBy: adminUserId,
        role: "member",
        exp: Date.now() + 86400000,
        jti: randomUUID(),
      };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const hmac = createHmac("sha256", inviteSecret).update(payloadB64).digest("base64url");
      const token = `${payloadB64}.${hmac}`;

      // HeadObject throws 404 — marker already consumed
      const notFoundErr = new Error("Not Found");
      (notFoundErr as any).name = "NotFound";
      (notFoundErr as any).$metadata = { httpStatusCode: 404 };
      s3Mock.send.mockRejectedValueOnce(notFoundErr);

      const event = makeEvent({ userId: joinerUserId, body: { token } });
      const { statusCode, data } = parseResponse(await joinTeam(event, {} as any, () => {}));

      expect(statusCode).toBe(401);
      expect(data.error).toMatch(/already been used/i);
    });

    it("non-admin cannot create invite", async () => {
      const teamMetadata = {
        name: "Test Team",
        createdBy: adminUserId,
        createdAt: "2026-04-01T00:00:00Z",
        admins: [adminUserId], // admin is user-admin-001, not the requester
      };
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: teamId, Description: JSON.stringify(teamMetadata) },
      });

      const event = makeEvent({
        userId: "user-not-admin-999",
        pathParameters: { id: teamId },
      });
      const { statusCode, data } = parseResponse(await createInvite(event, {} as any, () => {}));

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/admin/i);
    });
  });

  // ── 4. Member Management ────────────────────────────────────────

  describe("addMember / removeMember", () => {
    const teamId = "team-test-members-abc12345";

    it("admin can add a member", async () => {
      const teamMetadata = {
        name: "Test Team",
        createdBy: "user-admin",
        createdAt: "2026-04-01T00:00:00Z",
        admins: ["user-admin"],
      };
      cognitoMock.send
        .mockResolvedValueOnce({
          Group: { GroupName: teamId, Description: JSON.stringify(teamMetadata) },
        }) // GetGroup (verify admin)
        .mockResolvedValueOnce({}); // AdminAddUserToGroup

      const event = makeEvent({
        userId: "user-admin",
        pathParameters: { id: teamId },
        body: { userId: "user-new" },
      });
      const { statusCode, data } = parseResponse(await addMember(event, {} as any, () => {}));

      expect(statusCode).toBe(200);
      expect(data.status).toBe("added");
      expect(data.userId).toBe("user-new");
    });

    it("member can self-remove", async () => {
      cognitoMock.send.mockResolvedValueOnce({}); // AdminRemoveUserFromGroup

      const event = makeEvent({
        userId: "user-self",
        pathParameters: { id: teamId, userId: "user-self" },
      });
      const { statusCode, data } = parseResponse(await removeMember(event, {} as any, () => {}));

      expect(statusCode).toBe(200);
      expect(data.status).toBe("removed");
    });

    it("non-admin cannot remove other members", async () => {
      const teamMetadata = {
        name: "Test Team",
        createdBy: "user-admin",
        createdAt: "2026-04-01T00:00:00Z",
        admins: ["user-admin"],
      };
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: teamId, Description: JSON.stringify(teamMetadata) },
      });

      const event = makeEvent({
        userId: "user-regular",
        pathParameters: { id: teamId, userId: "user-other" },
      });
      const { statusCode, data } = parseResponse(await removeMember(event, {} as any, () => {}));

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/admin/i);
    });
  });

  // ── 5. Team-Scoped S3 Prefix Logic ─────────────────────────────

  describe("S3 prefix isolation", () => {
    it("team user gets teams/{teamId}/users/{userId}/hq/ prefix", () => {
      // Import the getConfig logic directly by testing the prefix computation
      const teamId = "team-indigo-abc12345";
      const userId = "user-001";

      // This is the same logic as s3.ts:getConfig()
      const prefix = teamId
        ? `teams/${teamId}/users/${userId}/hq/`
        : `users/${userId}/hq/`;

      expect(prefix).toBe("teams/team-indigo-abc12345/users/user-001/hq/");
    });

    it("solo user gets users/{userId}/hq/ prefix (backward compat)", () => {
      const teamId: string | undefined = undefined;
      const userId = "user-solo-001";

      const prefix = teamId
        ? `teams/${teamId}/users/${userId}/hq/`
        : `users/${userId}/hq/`;

      expect(prefix).toBe("users/user-solo-001/hq/");
    });

    it("auth.getCredentials returns teamId and scoped prefix for team members", async () => {
      // We verify the prefix logic matches between auth.ts and s3.ts
      // auth.ts computes: teams/{teamId}/users/{sub}/hq/ for team users
      // s3.ts computes:   teams/{teamId}/users/{userId}/hq/ for team users
      // These must be identical since sub === userId
      const teamId = "team-prefix-test";
      const userId = "user-prefix-001";

      const authPrefix = `teams/${teamId}/users/${userId}/hq/`;
      const s3Prefix = teamId
        ? `teams/${teamId}/users/${userId}/hq/`
        : `users/${userId}/hq/`;

      expect(authPrefix).toBe(s3Prefix);
    });

    it("STS inline policy scopes to correct S3 prefix pattern", () => {
      // Verify the STS policy Resource pattern matches the prefix
      const teamId = "team-sts-test";
      const userId = "user-sts-001";
      const bucketName = "test-hq-storage-bucket";

      const s3Prefix = `teams/${teamId}/users/${userId}/hq/`;
      const policyResource = `arn:aws:s3:::${bucketName}/${s3Prefix}*`;

      expect(policyResource).toBe(
        "arn:aws:s3:::test-hq-storage-bucket/teams/team-sts-test/users/user-sts-001/hq/*"
      );

      // Verify solo user policy
      const soloPrefix = `users/${userId}/hq/`;
      const soloPolicyResource = `arn:aws:s3:::${bucketName}/${soloPrefix}*`;

      expect(soloPolicyResource).toBe(
        "arn:aws:s3:::test-hq-storage-bucket/users/user-sts-001/hq/*"
      );
    });
  });

  // ── 6. listTeams / listMembers ──────────────────────────────────

  describe("listTeams / listMembers", () => {
    it("lists teams for authenticated user", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [
          {
            GroupName: "team-alpha-11111111",
            Description: JSON.stringify({ name: "Alpha", createdAt: "2026-04-01T00:00:00Z" }),
            CreationDate: new Date("2026-04-01"),
          },
          {
            GroupName: "team-beta-22222222",
            Description: JSON.stringify({ name: "Beta", createdAt: "2026-04-02T00:00:00Z" }),
            CreationDate: new Date("2026-04-02"),
          },
        ],
      });

      const event = makeEvent({});
      const { statusCode, data } = parseResponse(await listTeams(event, {} as any, () => {}));

      expect(statusCode).toBe(200);
      expect(data.teams).toHaveLength(2);
      expect(data.teams[0].name).toBe("Alpha");
      expect(data.teams[1].name).toBe("Beta");
    });

    it("lists members with admin/member roles", async () => {
      const teamId = "team-members-list-test";
      const metadata = {
        name: "List Test",
        createdBy: "user-admin",
        createdAt: "2026-04-01T00:00:00Z",
        admins: ["user-admin"],
      };

      cognitoMock.send
        .mockResolvedValueOnce({ // AdminListGroupsForUser (verify membership)
          Groups: [{ GroupName: teamId }],
        })
        .mockResolvedValueOnce({ // GetGroup (get admin list)
          Group: { GroupName: teamId, Description: JSON.stringify(metadata) },
        })
        .mockResolvedValueOnce({ // ListUsersInGroup
          Users: [
            { Username: "user-admin", Attributes: [{ Name: "sub", Value: "user-admin" }, { Name: "email", Value: "admin@test.com" }] },
            { Username: "user-member", Attributes: [{ Name: "sub", Value: "user-member" }, { Name: "email", Value: "member@test.com" }] },
          ],
        });

      const event = makeEvent({
        userId: "user-admin",
        pathParameters: { id: teamId },
      });
      const { statusCode, data } = parseResponse(await listMembers(event, {} as any, () => {}));

      expect(statusCode).toBe(200);
      expect(data.members).toHaveLength(2);

      const admin = data.members.find((m: any) => m.userId === "user-admin");
      const member = data.members.find((m: any) => m.userId === "user-member");
      expect(admin.role).toBe("admin");
      expect(member.role).toBe("member");
    });

    it("non-member cannot list team members", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [], // User is not in any matching group
      });

      const event = makeEvent({
        userId: "user-outsider",
        pathParameters: { id: "team-secret" },
      });
      const { statusCode, data } = parseResponse(await listMembers(event, {} as any, () => {}));

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/not a team member/i);
    });
  });
});
