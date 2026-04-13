/**
 * E2E: Team platform — member onboarding and sparse checkout simulation
 *
 * Tests the end-to-end onboarding flow without live AWS or GitHub services.
 * Mocks Cognito, S3, and GitHub App helpers.
 *
 * Scenarios covered:
 * - Admin provisions repo for a team (setRepoConfig)
 * - Admin sets entitlements (packs + assignments)
 * - Member joins team and fetches repo credentials
 * - Simulated sparse checkout: member's entitlement paths drive which files
 *   would be included in a git sparse-checkout config
 * - Entitlement change: admin updates manifest → member's next sync path list changes
 * - Non-member cannot fetch repo credentials
 * - Repo config is absent → member gets 404 with actionable error
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
  UpdateGroupCommand: function (input: any) { return { _type: "UpdateGroup", input }; },
  AdminListGroupsForUserCommand: function (input: any) {
    return { _type: "AdminListGroupsForUser", input };
  },
  ListUsersInGroupCommand: function (input: any) {
    return { _type: "ListUsersInGroup", input };
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

// Mock GitHub App helpers
vi.mock("../../../infra/functions/github-app.js", () => ({
  generateAppJwt: vi.fn(() => "mock-jwt-token"),
  getInstallationToken: vi.fn(async () => ({
    token: "ghs_mock_installation_token",
    expires_at: "2026-04-07T01:00:00Z",
  })),
  listInstallations: vi.fn(async () => [
    { id: 12345678, account: { login: "indigoai-us" } },
  ]),
  getAppInfo: vi.fn(async () => ({
    name: "hq-team-sync",
    installations_count: 1,
  })),
}));

// ── Import handlers after mocks are in place ─────────────────────────

import { setRepoConfig, getRepoCredential } from "../../../infra/functions/repo.js";
import { setEntitlements, getMyEntitlements } from "../../../infra/functions/entitlements.js";

// ── Helpers ──────────────────────────────────────────────────────────

const TEAM_ID = "team-platform-onb-abc12345";
const ADMIN_ID = "user-admin-001";
const MEMBER_ID = "user-member-002";
const NEW_MEMBER_ID = "user-new-member-003";

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

const BASE_MANIFEST = {
  packs: {
    core: {
      paths: [".claude/commands/", ".claude/skills/", "workers/public/"],
      description: "Core HQ content",
    },
    policies: {
      paths: [".claude/policies/"],
      description: "Governance policies",
    },
    advanced: {
      paths: ["knowledge/public/ai-security-framework/"],
      description: "Advanced knowledge",
    },
  },
  assignments: {
    [MEMBER_ID]: ["core", "policies"],
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

/**
 * Simulates what the HQ CLI would generate for a git sparse-checkout config
 * based on a list of entitlement paths. Validates the contract between the
 * API response and what the CLI would pass to `git sparse-checkout set`.
 */
function buildSparseCheckoutConfig(paths: string[]): string {
  const header = "/*\n!/*\n"; // start with deny-all, then allow specific paths
  const allowLines = paths.map((p) => `/${p}`).join("\n");
  return header + allowLines;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("e2e: member onboarding and sparse checkout simulation", () => {
  beforeEach(() => {
    cognitoMock.send.mockReset();
    s3Mock.send.mockReset();
  });

  // ── 1. Admin provisions repo for team ───────────────────────────

  describe("setRepoConfig — admin links team to GitHub repository", () => {
    it("admin can configure a repo for the team", async () => {
      // GetGroup — verify admin
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      // PutObject — save repo config
      s3Mock.send.mockResolvedValueOnce({});

      const { statusCode, data } = parseResponse(
        await setRepoConfig(
          makeEvent({
            userId: ADMIN_ID,
            body: {
              owner: REPO_CONFIG.owner,
              repo: REPO_CONFIG.repo,
              installationId: REPO_CONFIG.installationId,
            },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.teamId).toBe(TEAM_ID);
      expect(data.owner).toBe(REPO_CONFIG.owner);
      expect(data.repo).toBe(REPO_CONFIG.repo);
      expect(data.status).toBe("configured");

      // Verify S3 write
      const putCall = s3Mock.send.mock.calls.find(
        (c: any[]) => c[0]._type === "PutObject"
      );
      expect(putCall).toBeTruthy();
      expect(putCall![0].input.Key).toBe(`teams/${TEAM_ID}/repo-config.json`);
    });

    it("non-admin cannot configure repo (403)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });

      const { statusCode, data } = parseResponse(
        await setRepoConfig(
          makeEvent({
            userId: MEMBER_ID,
            body: {
              owner: "someone",
              repo: "some-repo",
              installationId: "99999999",
            },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/admin/i);
    });

    it("returns 400 when installationId is missing", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });

      const { statusCode, data } = parseResponse(
        await setRepoConfig(
          makeEvent({
            userId: ADMIN_ID,
            body: { owner: "indigoai-us", repo: "hq-test-content" },
          }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(400);
      expect(data.error).toMatch(/installationId/i);
    });
  });

  // ── 2. Admin sets entitlements for the team ──────────────────────

  describe("setEntitlements — admin assigns content packs", () => {
    it("admin configures packs with path patterns for sparse checkout", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce({});

      const { statusCode, data } = parseResponse(
        await setEntitlements(
          makeEvent({ userId: ADMIN_ID, body: BASE_MANIFEST }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.packs).toEqual(
        expect.arrayContaining(["core", "policies", "advanced"])
      );
    });
  });

  // ── 3. Member fetches repo credentials ──────────────────────────

  describe("getRepoCredential — member gets short-lived git token", () => {
    it("team member receives installation token and clone URL", async () => {
      // Membership check
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [{ GroupName: TEAM_ID }],
      });
      // GetObject — repo config
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(REPO_CONFIG));

      const { statusCode, data } = parseResponse(
        await getRepoCredential(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.token).toBe("ghs_mock_installation_token");
      expect(data.owner).toBe(REPO_CONFIG.owner);
      expect(data.repo).toBe(REPO_CONFIG.repo);
      expect(data.cloneUrl).toMatch(
        /^https:\/\/x-access-token:ghs_mock_installation_token@github\.com\//
      );
      expect(data.expiresAt).toBeTruthy();
    });

    it("non-member is denied repo credentials (403)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [], // not in the group
      });

      const { statusCode, data } = parseResponse(
        await getRepoCredential(
          makeEvent({ userId: "user-outsider-999" }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(403);
      expect(data.error).toMatch(/not a team member/i);
    });

    it("returns 404 when no repo is configured (prompts admin action)", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [{ GroupName: TEAM_ID }],
      });
      s3Mock.send.mockRejectedValueOnce(s3NotFound());

      const { statusCode, data } = parseResponse(
        await getRepoCredential(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(404);
      expect(data.error).toMatch(/no repository configured/i);
    });
  });

  // ── 4. Sparse checkout simulation ───────────────────────────────

  describe("sparse checkout simulation — entitlement paths drive git config", () => {
    it("member's entitlement paths produce a valid sparse-checkout config", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(BASE_MANIFEST));

      const { statusCode, data } = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      expect(data.paths.length).toBeGreaterThan(0);

      // Build what the CLI would pass to `git sparse-checkout set`
      const sparseConfig = buildSparseCheckoutConfig(data.paths);

      // Member has core + policies — verify those paths are in sparse config
      expect(sparseConfig).toContain("/.claude/commands/");
      expect(sparseConfig).toContain("/.claude/skills/");
      expect(sparseConfig).toContain("/.claude/policies/");
      expect(sparseConfig).toContain("/workers/public/");
      // Advanced is NOT assigned to this member
      expect(sparseConfig).not.toContain("/knowledge/public/ai-security-framework/");
    });

    it("new member with no direct assignment gets role:member defaults", async () => {
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(BASE_MANIFEST));

      const { statusCode, data } = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: NEW_MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      const sparseConfig = buildSparseCheckoutConfig(data.paths);

      // New member gets role:member → core only
      expect(sparseConfig).toContain("/.claude/commands/");
      expect(sparseConfig).toContain("/workers/public/");
      // policies not assigned via role:member
      expect(sparseConfig).not.toContain("/.claude/policies/");
    });
  });

  // ── 5. Entitlement change → next sync removes files ─────────────

  describe("entitlement change — admin removes pack from manifest", () => {
    it("after admin removes a pack, member's path list no longer includes it", async () => {
      // Step 1: verify member has core + policies (from BASE_MANIFEST)
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(BASE_MANIFEST));

      const before = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(before.statusCode).toBe(200);
      expect(before.data.paths).toContain(".claude/policies/");

      // Step 2: Admin updates manifest — removes "policies" from member's assignment
      const reducedManifest = {
        packs: {
          core: BASE_MANIFEST.packs.core,
          // policies pack still exists in definition but removed from member assignment
          policies: BASE_MANIFEST.packs.policies,
        },
        assignments: {
          [MEMBER_ID]: ["core"], // policies removed
          "role:member": ["core"],
        },
      };

      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce({});

      await setEntitlements(
        makeEvent({ userId: ADMIN_ID, body: reducedManifest }),
        {} as any,
        () => {}
      );

      // Step 3: Member queries entitlements again — policies paths gone
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(reducedManifest));

      const after = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(after.statusCode).toBe(200);
      expect(after.data.paths).not.toContain(".claude/policies/");
      expect(after.data.paths).toContain(".claude/commands/");

      // Sparse checkout config for next sync would not include policies
      const sparseConfig = buildSparseCheckoutConfig(after.data.paths);
      expect(sparseConfig).not.toContain("/.claude/policies/");
    });

    it("removing a pack entirely from packs object removes it from all paths", async () => {
      const manifestWithoutCore = {
        packs: {
          policies: BASE_MANIFEST.packs.policies,
          // core removed entirely
        },
        assignments: {
          [MEMBER_ID]: ["policies"],
          "role:member": [],
        },
      };

      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(manifestWithoutCore));

      const { statusCode, data } = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );

      expect(statusCode).toBe(200);
      // Core paths are gone
      expect(data.paths).not.toContain(".claude/commands/");
      expect(data.paths).not.toContain("workers/public/");
      // Policies paths remain
      expect(data.paths).toContain(".claude/policies/");
    });
  });

  // ── 6. Full onboarding sequence ──────────────────────────────────

  describe("full onboarding sequence — team setup to credential fetch", () => {
    it("completes admin setup + member onboarding end-to-end", async () => {
      // --- Phase 1: Admin configures repo ---
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce({});

      const repoSetup = parseResponse(
        await setRepoConfig(
          makeEvent({
            userId: ADMIN_ID,
            body: {
              owner: REPO_CONFIG.owner,
              repo: REPO_CONFIG.repo,
              installationId: REPO_CONFIG.installationId,
            },
          }),
          {} as any,
          () => {}
        )
      );
      expect(repoSetup.statusCode).toBe(200);

      // --- Phase 2: Admin sets entitlements ---
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce({});

      const entSetup = parseResponse(
        await setEntitlements(
          makeEvent({ userId: ADMIN_ID, body: BASE_MANIFEST }),
          {} as any,
          () => {}
        )
      );
      expect(entSetup.statusCode).toBe(200);

      // --- Phase 3: Member joins and fetches repo credentials ---
      cognitoMock.send.mockResolvedValueOnce({
        Groups: [{ GroupName: TEAM_ID }],
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(REPO_CONFIG));

      const creds = parseResponse(
        await getRepoCredential(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );
      expect(creds.statusCode).toBe(200);
      expect(creds.data.token).toBeTruthy();
      expect(creds.data.cloneUrl).toMatch(/github\.com/);

      // --- Phase 4: Member fetches their entitlements for sparse checkout ---
      cognitoMock.send.mockResolvedValueOnce({
        Group: { GroupName: TEAM_ID, Description: JSON.stringify(TEAM_METADATA) },
      });
      s3Mock.send.mockResolvedValueOnce(s3ObjectResponse(BASE_MANIFEST));

      const entitlements = parseResponse(
        await getMyEntitlements(
          makeEvent({ userId: MEMBER_ID }),
          {} as any,
          () => {}
        )
      );
      expect(entitlements.statusCode).toBe(200);
      expect(entitlements.data.paths.length).toBeGreaterThan(0);

      // Build sparse-checkout config from paths
      const sparseConfig = buildSparseCheckoutConfig(entitlements.data.paths);
      expect(sparseConfig).toContain("/.claude/commands/");
      expect(sparseConfig).toContain("/.claude/policies/");
      expect(sparseConfig).not.toContain("/knowledge/public/ai-security-framework/");
    });
  });
});
