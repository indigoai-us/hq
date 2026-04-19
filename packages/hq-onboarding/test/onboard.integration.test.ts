/**
 * Integration test for /onboard CLI flow (VLT-9 US-002).
 *
 * Runs a full create-company flow against a mock vault-service,
 * verifying CLI output, checkpoint, and config.json creation.
 * Skipped unless RUN_E2E=true (integration tests touch real AWS).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runOnboardCli } from "../src/cli/onboard.js";
import type { OnboardCliOptions } from "../src/cli/onboard.js";

// ---------------------------------------------------------------------------
// Mock hq-cloud — vi.hoisted() ensures mocks are available at vi.mock time
// ---------------------------------------------------------------------------

const {
  mockEntityGet,
  mockEntityFindBySlug,
  mockEntityCreate,
  mockCreateInvite,
  mockAcceptInvite,
  mockListMembers,
  mockProvisionBucket,
  mockResolveEntityContext,
  mockSync,
  mockParseToken,
} = vi.hoisted(() => ({
  mockEntityGet: vi.fn(),
  mockEntityFindBySlug: vi.fn(),
  mockEntityCreate: vi.fn(),
  mockCreateInvite: vi.fn(),
  mockAcceptInvite: vi.fn(),
  mockListMembers: vi.fn(),
  mockProvisionBucket: vi.fn(),
  mockResolveEntityContext: vi.fn(),
  mockSync: vi.fn(),
  mockParseToken: vi.fn((t: string) => t),
}));

vi.mock("@indigoai-us/hq-cloud", () => {
  class MockVaultClient {
    entity = {
      get: mockEntityGet,
      findBySlug: mockEntityFindBySlug,
      create: mockEntityCreate,
    };
    createInvite = mockCreateInvite;
    acceptInvite = mockAcceptInvite;
    listMembersOfCompany = mockListMembers;
    provisionBucket = mockProvisionBucket;
  }

  return {
    VaultClient: MockVaultClient,
    VaultConflictError: class extends Error {
      statusCode = 409;
      constructor(msg = "conflict") { super(msg); this.name = "VaultConflictError"; }
    },
    VaultNotFoundError: class extends Error {
      statusCode = 404;
      constructor(msg = "not found") { super(msg); this.name = "VaultNotFoundError"; }
    },
    resolveEntityContext: (...args: unknown[]) => mockResolveEntityContext(...args),
    sync: (...args: unknown[]) => mockSync(...args),
    parseToken: (t: string) => mockParseToken(t),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;
let logs: string[];

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "hq-onboard-int-"));
  logs = [];
  vi.clearAllMocks();

  // Happy-path mocks
  mockEntityFindBySlug.mockRejectedValue(
    Object.assign(new Error("not found"), { name: "VaultNotFoundError", statusCode: 404 }),
  );
  mockEntityCreate.mockImplementation(async (input: { type: string; slug: string }) => ({
    uid: input.type === "person" ? "psn_int_001" : "cmp_int_001",
    slug: input.slug,
    type: input.type,
    status: "active",
  }));
  mockProvisionBucket.mockResolvedValue({
    bucketName: "hq-int-test-bucket",
    kmsKeyId: "key-int-001",
  });
  mockListMembers.mockResolvedValue([]);
  mockCreateInvite.mockResolvedValue({
    inviteToken: "tok_int_001",
    membership: {
      membershipKey: "mbr_int_001",
      personUid: "psn_int_001",
      companyUid: "cmp_int_001",
      role: "owner",
      status: "pending",
      invitedBy: "psn_int_001",
      invitedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  });
  mockAcceptInvite.mockResolvedValue({
    membership: {
      membershipKey: "mbr_int_001",
      personUid: "psn_int_001",
      companyUid: "cmp_int_001",
      role: "owner",
      status: "active",
      invitedBy: "psn_int_001",
      invitedAt: "2026-01-01T00:00:00Z",
      acceptedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  });
  mockResolveEntityContext.mockResolvedValue({
    uid: "cmp_int_001",
    bucketName: "hq-int-test-bucket",
    region: "us-east-1",
    credentials: {
      accessKeyId: "AKIA_INT_TEST",
      secretAccessKey: "secret",
      sessionToken: "token",
    },
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeOptions(overrides: Partial<OnboardCliOptions> = {}): OnboardCliOptions {
  return {
    mode: "create-company",
    personName: "Integration Test",
    personEmail: "int-test@example.com",
    companyName: "Int Test Co",
    companySlug: "int-test-co",
    vaultConfig: { apiUrl: "https://vault.test", authToken: "test-token" },
    hqRoot: tmpDir,
    log: (msg: string) => logs.push(msg),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runOnboardCli", () => {
  it("create-company flow completes end-to-end", async () => {
    const result = await runOnboardCli(makeOptions());

    expect(result.success).toBe(true);
    expect(result.result?.companyUid).toBe("cmp_int_001");
    expect(result.result?.role).toBe("owner");

    // Verify .hq/config.json was written
    const configRaw = await readFile(join(tmpDir, ".hq", "config.json"), "utf-8");
    const config = JSON.parse(configRaw);
    expect(config.companySlug).toBe("int-test-co");

    // Verify progress was logged
    const progressLines = logs.filter(l => l.includes("Step"));
    expect(progressLines.length).toBeGreaterThanOrEqual(6);

    // Verify summary was logged
    const summaryLine = logs.find(l => l.includes("HQ Onboarding Complete"));
    expect(summaryLine).toBeDefined();
  });

  it("dry-run prints plan without creating resources", async () => {
    const result = await runOnboardCli(makeOptions({ mode: "dry-run" }));

    expect(result.success).toBe(true);
    expect(mockEntityCreate).not.toHaveBeenCalled();

    const dryRunLine = logs.find(l => l.includes("DRY RUN"));
    expect(dryRunLine).toBeDefined();
  });

  it("resume without checkpoint returns error", async () => {
    const result = await runOnboardCli(makeOptions({ mode: "resume" }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("No checkpoint found");
  });

  it("slug collision returns error without creating resources", async () => {
    // First findBySlug should succeed (slug exists)
    mockEntityFindBySlug.mockResolvedValueOnce({
      uid: "cmp_existing", slug: "int-test-co", type: "company", status: "active",
    });

    const result = await runOnboardCli(makeOptions());

    expect(result.success).toBe(false);
    expect(result.error).toContain("already taken");
    expect(mockEntityCreate).not.toHaveBeenCalled();
  });
});
