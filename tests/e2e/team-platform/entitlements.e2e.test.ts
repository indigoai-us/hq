/**
 * E2E: Team platform — entitlements lifecycle
 *
 * Tests the full entitlements flow without live AWS services.
 * Mocks Cognito and S3 SDK calls, validates handler logic end-to-end.
 *
 * Scenarios covered:
 * - Admin creates entitlement packs and assigns them to a member
 * - Member queries their own entitlements (sees only assigned packs)
 * - Admin gets full manifest (sees all packs)
 * - Admin removes a pack from manifest → member's resolved packs shrink
 * - Non-admin is blocked from setting entitlements
 * - Role-based defaults (role:member) are resolved correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock AWS SDKs before importing handlers ──────────────────────────

const { cognitoMock, s3Mock } = vi.hoisted(() => ({
  cognitoMock: { send: vi.fn() },
  s3Mock: { send: vi.fn() },
}));

vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: function () { return cognitoMock; },
  GetGroupCommand: function (input: any) { return { _type: "GetGroup", input }; },
  ListUsersInGroupCommand: function (input: any) { return { _type: "ListUsersInGroup", input }; },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: function () { return s3Mock; },
  GetObjectCommand: function (input: any) { return { _type: "GetObject", input }; },
  PutObjectCommand: function (input: any) { return { _type: "PutObject", input }; },
}));

vi.mock("sst", () => ({
  Resource: {
    HqUserPool: { id: "us-east-1_TestPool" },
    HqStorage: { name: "test-hq-storage-bucket" },
  },
}));

// ── Import handlers after mocks are in place ─────────────────────────

import {
  setEntitlements,
  getEntitlementsManifest,
  getMyEntitlements,
} from "../../../infra/functions/entitlements.js";

// ── Helpers ──────────────────────────────────────────────────────────

const TEAM_ID = "team-platform-ent-abc12345";
const ADMIN_ID = "user-admin-001";
const MEMBER_ID = "user-member-002";

const TEAM_METADATA = {
  name: "Platform Team",
  createdBy: ADMIN_ID,
  createdAt: "2026-04-01T00:00:00Z",
  admins: [ADMIN_ID],
};

const SAMPLE_MANIFEST = {
  packs: {
    core: {
      paths: [".claude/commands/", ".claude/skills/"],
      description: "Core HQ commands and skills",
    },
    design: {
      paths: ["workers/public/frontend-designer.yaml"],
      description: "Design workers",
    },
    advanced: {
      paths: ["workers/public/security-scanner.yaml"],
      description: "Advanced security tooling",
    },
  },
  assignments: {
    [MEMBER_ID]: ["core", "design"],
    "role:member": ["core"],
  },
};

function makeEvent(overrides: Record<string, any> = {}): any {
  const { userId, body, pathParameters, ...rest } = overrides;
  return {
    requestContext: {
      authorizer: {
        jwt: { claims: { sub: userId ?? ADMIN_ID } },
      },
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    pathParameters: pathParameters ?? { id: TEAM_ID },
    ...rest,
  };
}

function parseResponse(result: any): { statusCode: number; data: any } {
  return {
    statusCode: result.statusCode,
    data: JSON.parse(result.body),
  };
}

/**
 * Returns a mock S3 GetObject response that streams the given object as JSON.
 */
function s3ObjectResponse(obj: object) {
  const str = JSON.stringify(obj);
  return {
    Body: {
      transformToString: async () => str,
    },
  };
}

function s3NotFound() {
  const err = new Error("NoSuchKey");
  (err as any).name = "NoSuchKey";
  return err;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("e2e: entitlements lifecycle", () => {
  beforeEach(() => {
    cognitoMock.send.mockReset();
    s3Mock.send.mockReset();
  });

  // ── 1. Admin sets entitlements ───────────────────────────────────

  describe("setEntitlements — admin creates packs and assigns to member", () => {
    it("admin can create packs and assign them", async () => {
      // GetGroup — verify admin status
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      // PutObject — save manifest
      s3Mock.send.mockResolvedValueOnce({});

      const { statusCode, data } = parseResponse(
        await setEntitlements(
          makeEvent({ body: SAMPLE_MANIFEST }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.teamId).toBe(TEAM_ID);
      expect(data.packs).toEqual(expect.arrayContaining(["core", "design", "advanced"]));
      expect(data.assignmentCount).toBe(2);
      expect(data.status).toBe("saved");

      // Verify PutObject was called with correct key and bucket
      const putCall = s3Mock.send.mock.calls.find(
        (c: any[]) => c[0]._type === "PutObject"
      );
      expect(putCall).toBeTruthy();
      expect(putCall![0].input.Bucket).toBe("test-hq-storage-bucket");
      expect(putCall![0].input.Key).toBe(`teams/${TEAM_ID}/entitlements.json`);
    });

    it("non-admin is blocked from setting entitlements (403)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: {
          GroupName: TEAM_ID,
          Description: JSON.stringify(TEAM_METADATA), // admins: [ADMIN_ID] only
        },
      });

      const { statusCode, data } = parseResponse(
        await setEntitlements(
          makeEvent({ userId: MEMBER_ID, body: SAMPLE_MANIFEST }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/admin/i);
    });

    it("rejects manifest with unknown pack reference in assignments (400)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });

      const badManifest = {
        packs: {
          core: { paths: [".claude/commands/"], description: "Core" },
        },
        assignments: {
          [MEMBER_ID]: ["core", "nonexistent-pack"],
        },
      };

      const { statusCode, data } = parseResponse(
        await setEntitlements(
          makeEvent({ body: badManifest }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(400);
      expect(data.error).toMatch(/nonexistent-pack/);
    });

    it("rejects manifest with missing paths array (400)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });

      const badManifest = {
        packs: {
          broken: { paths: [], description: "Empty paths" },
        },
        assignments: {},
      };

      const { statusCode, data } = parseResponse(
        await setEntitlements(
          makeEvent({ body: badManifest }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(400);
      expect(data.error).toMatch(/paths/i);
    });

    it("returns 401 for unauthenticated request", async () => {
      const event = { requestContext: {}, body: JSON.stringify(SAMPLE_MANIFEST), pathParameters: { id: TEAM_ID } };
      const { statusCode } = parseResponse(
        await setEntitlements(event as any, {} as any, () => {})
      );
      expect(statusCode).toBe(401);
    });
  });

  // ── 2. Admin gets full manifest ──────────────────────────────────

  describe("getEntitlementsManifest — admin retrieves all packs", () => {
    it("returns full manifest with all packs and assignments", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(SAMPLE_MANIFEST));

      const { statusCode, data } = parseResponse(
        await getEntitlementsManifest(
          makeEvent({ userId: ADMIN_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(Object.keys(data.packs)).toEqual(
        expect.arrayContaining(["core", "design", "advanced"])
      );
      expect(data.assignments[MEMBER_ID]).toEqual(["core", "design"]);
      expect(data.assignments["role:member"]).toEqual(["core"]);
    });

    it("returns empty manifest when none configured yet", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockRejectedValueOnce(s3NotFound());

      const { statusCode, data } = parseResponse(
        await getEntitlementsManifest(
          makeEvent({ userId: ADMIN_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.packs).toEqual({});
      expect(data.assignments).toEqual({});
    });
  });

  // ── 3. Member views their own entitlements ───────────────────────

  describe("getMyEntitlements — member sees only assigned packs", () => {
    it("member gets only their assigned packs (core + design, not advanced)", async () => {
      // GetGroup — for role determination
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      // GetObject — fetch manifest
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(SAMPLE_MANIFEST));

      const { statusCode, data } = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.role).toBe("member");
      // Member is assigned core + design directly
      expect(Object.keys(data.packs)).toEqual(
        expect.arrayContaining(["core", "design"])
      );
      // Advanced is NOT assigned to MEMBER_ID
      expect(Object.keys(data.packs)).not.toContain("advanced");
      // Paths are merged from all assigned packs
      expect(data.paths).toEqual(
        expect.arrayContaining([".claude/commands/", ".claude/skills/"])
      );
    });

    it("role-based defaults are included for users with no direct assignment", async () => {
      const NEW_MEMBER_ID = "user-new-member-003";
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(SAMPLE_MANIFEST));

      const { statusCode, data } = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: NEW_MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.role).toBe("member");
      // New member gets role:member default (core only)
      expect(Object.keys(data.packs)).toContain("core");
      expect(Object.keys(data.packs)).not.toContain("design");
      expect(Object.keys(data.packs)).not.toContain("advanced");
    });

    it("admin gets all paths via admin role resolution", async () => {
      const adminMetadata = { ...TEAM_METADATA };
      const adminManifest = {
        packs: SAMPLE_MANIFEST.packs,
        assignments: {
          ...SAMPLE_MANIFEST.assignments,
          "role:admin": ["core", "design", "advanced"],
        },
      };

      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(adminMetadata) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(adminManifest));

      const { statusCode, data } = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: ADMIN_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.role).toBe("admin");
      expect(Object.keys(data.packs)).toEqual(
        expect.arrayContaining(["core", "design", "advanced"])
      );
    });

    it("returns empty packs when no manifest exists yet", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockRejectedValueOnce(s3NotFound());

      const { statusCode, data } = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.packs).toEqual({});
      expect(data.paths).toEqual([]);
    });
  });

  // ── 4. Admin removes a pack → member's entitlements shrink ───────

  describe("entitlement removal — admin updates manifest to remove a pack", () => {
    it("removing a pack from manifest causes member to lose access", async () => {
      // Step 1: Set manifest with core + design for member
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce({}); // PutObject

      await setEntitlements(
        makeEvent({ body: SAMPLE_MANIFEST }),
        {} as any,
        () => {}
      );

      cognitoMock.send.mockReset();
      s3Mock.send.mockReset();

      // Step 2: Admin updates manifest — removes "design" pack entirely
      const reducedManifest = {
        packs: {
          core: SAMPLE_MANIFEST.packs.core,
          // design pack removed
        },
        assignments: {
          [MEMBER_ID]: ["core"], // design removed from assignment
          "role:member": ["core"],
        },
      };

      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce({});

      const updateResult = parseResponse(
        await setEntitlements(
          makeEvent({ body: reducedManifest }),
          {} as any,
          () => {}
        )
      );

      expect(updateResult.statusCode).toBe(200);
      expect(updateResult.data.packs).not.toContain("design");

      // Step 3: Member queries their entitlements — design is gone
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(reducedManifest));

      const memberResult = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(memberResult.statusCode).toBe(200);
      expect(Object.keys(memberResult.data.packs)).toContain("core");
      expect(Object.keys(memberResult.data.packs)).not.toContain("design");
      // Paths no longer include design worker
      expect(memberResult.data.paths).not.toContain(
        "workers/public/frontend-designer.yaml"
      );
    });

    it("path deduplication works when multiple packs share paths", async () => {
      const overlapManifest = {
        packs: {
          pack1: {
            paths: [".claude/commands/", "workers/public/"],
            description: "Pack 1",
          },
          pack2: {
            paths: [".claude/commands/", ".claude/skills/"],
            description: "Pack 2 — overlaps with pack1",
          },
        },
        assignments: {
          [MEMBER_ID]: ["pack1", "pack2"],
        },
      };

      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(overlapManifest));

      const { statusCode, data } = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      // Deduplicated — ".claude/commands/" should appear only once
      const commandsCount = data.paths.filter(
        (p: string) => p === ".claude/commands/"
      ).length;
      expect(commandsCount).toBe(1);
    });
  });
});
