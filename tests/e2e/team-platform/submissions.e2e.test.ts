/**
 * E2E: Team platform — submissions lifecycle
 *
 * Tests the full submissions flow without live AWS or GitHub services.
 * Mocks Cognito, S3, and the GitHub App helpers, validates handler logic.
 *
 * Scenarios covered:
 * - Member creates a submission record
 * - Admin lists all submissions; member sees only their own
 * - Admin reviews (diff is fetched via repo config)
 * - Admin approves → branch merged via GitHub API → status set to approved
 * - Admin rejects → submission marked rejected with reason
 * - Double-review guard — approving an already-approved submission returns 409
 * - Non-admin cannot approve or reject
 * - Non-member cannot create or list submissions
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
  AdminListGroupsForUserCommand: function (input: any) {
    return { _type: "AdminListGroupsForUser", input };
  },
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
    GitHubAppId: { value: "test-app-id-123" },
    GitHubAppPrivateKey: { value: "test-private-key" },
  },
}));

// Mock GitHub App helpers — isolate from real JWT/RSA logic
vi.mock("../../../infra/functions/github-app.js", () => ({
  generateAppJwt: vi.fn(() => "mock-jwt-token"),
  getInstallationToken: vi.fn(async () => ({
    token: "mock-installation-token",
    expires_at: "2026-04-07T00:00:00Z",
  })),
  listInstallations: vi.fn(async () => []),
  getAppInfo: vi.fn(async () => ({ name: "hq-team-sync", installations_count: 1 })),
}));

// ── Import handlers after mocks are in place ─────────────────────────

import {
  createSubmission,
  listSubmissions,
  approveSubmission,
  rejectSubmission,
} from "../../../infra/functions/submissions.js";

// ── Helpers ──────────────────────────────────────────────────────────

const TEAM_ID = "team-platform-sub-abc12345";
const ADMIN_ID = "user-admin-001";
const MEMBER_ID = "user-member-002";
const OTHER_MEMBER_ID = "user-member-003";

const TEAM_METADATA = {
  name: "Platform Team",
  createdBy: ADMIN_ID,
  createdAt: "2026-04-01T00:00:00Z",
  admins: [ADMIN_ID],
};

const REPO_CONFIG = {
  owner: "indigoai-us",
  repo: "hq-test-content",
  installationId: "12345678",
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

function s3ObjectResponse(obj: object) {
  const str = JSON.stringify(obj);
  return {
    Body: { transformToString: async () => str },
  };
}

function s3NotFound() {
  const err = new Error("NoSuchKey");
  (err as any).name = "NoSuchKey";
  return err;
}

/** Builds a mock fetch for GitHub merge API */
function mockGitHubMerge(status: number, body: object) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("e2e: submissions lifecycle", () => {
  beforeEach(() => {
    cognitoMock.send.mockReset();
    s3Mock.send.mockReset();
    // Reset global fetch (used by approveSubmission for GitHub API)
    vi.stubGlobal("fetch", vi.fn());
  });

  // ── 1. Member creates a submission ──────────────────────────────

  describe("createSubmission — member registers a branch for review", () => {
    it("member can create a pending submission", async () => {
      // AdminListGroupsForUser — verify membership
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [{ GroupName: TEAM_ID }],
      });
      // GetObject — load existing submissions (empty)
      s3Mock.send.mockRejectedValueOnce(s3NotFound());
      // PutObject — save new submission
      s3Mock.send.mockResolvedValueOnce({});

      const { statusCode, data } = parseResponse(
        await createSubmission(
          makeEvent({
            userId: MEMBER_ID,
            body: {
              branchName: "feature/add-qa-worker",
              title: "Add QA testing worker",
              description: "Adds automated QA testing worker to shared workers",
            },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(201);
      expect(data.id).toMatch(/^sub_/);
      expect(data.userId).toBe(MEMBER_ID);
      expect(data.branchName).toBe("feature/add-qa-worker");
      expect(data.title).toBe("Add QA testing worker");
      expect(data.status).toBe("pending");
      expect(data.createdAt).toBeTruthy();
    });

    it("rejects submission with missing branchName (400)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [{ GroupName: TEAM_ID }],
      });

      const { statusCode, data } = parseResponse(
        await createSubmission(
          makeEvent({ userId: MEMBER_ID, body: { title: "Missing branch" } }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(400);
      expect(data.error).toMatch(/branchName/i);
    });

    it("rejects submission with missing title (400)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [{ GroupName: TEAM_ID }],
      });

      const { statusCode, data } = parseResponse(
        await createSubmission(
          makeEvent({
            userId: MEMBER_ID,
            body: { branchName: "feature/no-title" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(400);
      expect(data.error).toMatch(/title/i);
    });

    it("non-member cannot create a submission (403)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [], // not in any group
      });

      const { statusCode, data } = parseResponse(
        await createSubmission(
          makeEvent({
            userId: "user-outsider-999",
            body: { branchName: "feature/x", title: "X" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/not a team member/i);
    });
  });

  // ── 2. Admin lists all submissions / member sees only theirs ─────

  describe("listSubmissions — role-based visibility", () => {
    const existingSubmissions = {
      submissions: [
        {
          id: "sub_001_aaaaaa",
          userId: MEMBER_ID,
          branchName: "feature/add-qa-worker",
          title: "Add QA worker",
          description: "",
          status: "pending",
          createdAt: "2026-04-01T00:00:00Z",
          updatedAt: "2026-04-01T00:00:00Z",
        },
        {
          id: "sub_002_bbbbbb",
          userId: OTHER_MEMBER_ID,
          branchName: "feature/update-policies",
          title: "Update policies",
          description: "",
          status: "pending",
          createdAt: "2026-04-02T00:00:00Z",
          updatedAt: "2026-04-02T00:00:00Z",
        },
      ],
    };

    it("admin sees all submissions", async () => {
      // Membership check
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [{ GroupName: TEAM_ID }],
      });
      // isAdmin check
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      // Load submissions
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(existingSubmissions));

      const { statusCode, data } = parseResponse(
        await listSubmissions(
          makeEvent({ userId: ADMIN_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.submissions).toHaveLength(2);
    });

    it("member sees only their own submissions", async () => {
      // Membership check
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [{ GroupName: TEAM_ID }],
      });
      // isAdmin check — MEMBER is not admin
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(existingSubmissions));

      const { statusCode, data } = parseResponse(
        await listSubmissions(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.submissions).toHaveLength(1);
      expect(data.submissions[0].userId).toBe(MEMBER_ID);
    });
  });

  // ── 3. Admin approves a submission ──────────────────────────────

  describe("approveSubmission — admin merges branch via GitHub API", () => {
    const pendingIndex = {
      submissions: [
        {
          id: "sub_001_aaaaaa",
          userId: MEMBER_ID,
          branchName: "feature/add-qa-worker",
          title: "Add QA worker",
          description: "",
          status: "pending",
          createdAt: "2026-04-01T00:00:00Z",
          updatedAt: "2026-04-01T00:00:00Z",
        },
      ],
    };

    it("admin approves pending submission → merged + status approved", async () => {
      // isAdmin
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      // GetObject — submissions
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(pendingIndex));
      // GetObject — repo config
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(REPO_CONFIG));
      // PutObject — save updated submissions
      s3Mock.send.mockResolvedValueOnce({});

      // Mock GitHub merge API — success
      vi.stubGlobal(
        "fetch",
        mockGitHubMerge(201, { sha: "abc123def456" })
      );

      const { statusCode, data } = parseResponse(
        await approveSubmission(
          makeEvent({
            userId: ADMIN_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_aaaaaa" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.submission.status).toBe("approved");
      expect(data.submission.id).toBe("sub_001_aaaaaa");
      expect(data.merge.sha).toBe("abc123def456");
      expect(data.merge.repo).toBe("indigoai-us/hq-test-content");
    });

    it("returns 409 when approving an already-approved submission", async () => {
      const alreadyApproved = {
        submissions: [
          { ...pendingIndex.submissions[0], status: "approved" },
        ],
      };

      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(alreadyApproved));
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(REPO_CONFIG));

      const { statusCode, data } = parseResponse(
        await approveSubmission(
          makeEvent({
            userId: ADMIN_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_aaaaaa" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(409);
      expect(data.error).toMatch(/already approved/i);
    });

    it("returns 400 when no repo config is set up", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(pendingIndex));
      // No repo config
      s3Mock.send.mockRejectedValueOnce(s3NotFound());

      const { statusCode, data } = parseResponse(
        await approveSubmission(
          makeEvent({
            userId: ADMIN_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_aaaaaa" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(400);
      expect(data.error).toMatch(/no repository configured/i);
    });

    it("returns 400 when branch not found on GitHub (404 from merge API)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(pendingIndex));
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(REPO_CONFIG));
      s3Mock.send.mockResolvedValueOnce({});

      vi.stubGlobal(
        "fetch",
        mockGitHubMerge(404, { message: "Not Found" })
      );

      const { statusCode, data } = parseResponse(
        await approveSubmission(
          makeEvent({
            userId: ADMIN_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_aaaaaa" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(400);
      expect(data.error).toMatch(/not found/i);
    });

    it("non-admin cannot approve submissions (403)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });

      const { statusCode, data } = parseResponse(
        await approveSubmission(
          makeEvent({
            userId: MEMBER_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_aaaaaa" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/admin/i);
    });
  });

  // ── 4. Admin rejects a submission ───────────────────────────────

  describe("rejectSubmission — admin declines with optional reason", () => {
    const pendingIndex = {
      submissions: [
        {
          id: "sub_001_cccccc",
          userId: MEMBER_ID,
          branchName: "feature/bad-change",
          title: "Problematic change",
          description: "",
          status: "pending",
          createdAt: "2026-04-01T00:00:00Z",
          updatedAt: "2026-04-01T00:00:00Z",
        },
      ],
    };

    it("admin rejects with a reason → status rejected + rejectionReason set", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(pendingIndex));
      s3Mock.send.mockResolvedValueOnce({});

      const { statusCode, data } = parseResponse(
        await rejectSubmission(
          makeEvent({
            userId: ADMIN_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_cccccc" },
            body: { reason: "Path changes not aligned with current entitlement structure" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.submission.status).toBe("rejected");
      expect(data.submission.rejectionReason).toMatch(/entitlement structure/i);
    });

    it("admin rejects without a reason → status rejected, no rejectionReason", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(pendingIndex));
      s3Mock.send.mockResolvedValueOnce({});

      const { statusCode, data } = parseResponse(
        await rejectSubmission(
          makeEvent({
            userId: ADMIN_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_cccccc" },
            body: {},
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.submission.status).toBe("rejected");
      expect(data.submission.rejectionReason).toBeUndefined();
    });

    it("returns 409 when rejecting an already-rejected submission", async () => {
      const alreadyRejected = {
        submissions: [
          { ...pendingIndex.submissions[0], status: "rejected" },
        ],
      };

      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(alreadyRejected));

      const { statusCode, data } = parseResponse(
        await rejectSubmission(
          makeEvent({
            userId: ADMIN_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_cccccc" },
            body: {},
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(409);
      expect(data.error).toMatch(/already rejected/i);
    });

    it("returns 404 for unknown submission ID", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(pendingIndex));

      const { statusCode, data } = parseResponse(
        await rejectSubmission(
          makeEvent({
            userId: ADMIN_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_ghost_000000" },
            body: {},
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(404);
      expect(data.error).toMatch(/not found/i);
    });

    it("non-admin cannot reject submissions (403)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });

      const { statusCode, data } = parseResponse(
        await rejectSubmission(
          makeEvent({
            userId: MEMBER_ID,
            pathParameters: { id: TEAM_ID, subId: "sub_001_cccccc" },
            body: {},
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/admin/i);
    });
  });
});
