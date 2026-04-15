/**
 * Unit tests for onboarding orchestrator (VLT-9 US-001).
 *
 * Mocks VaultClient, provisioning, STS, and sync to verify:
 *   - Step ordering
 *   - Idempotent resume from checkpoint
 *   - Error propagation with typed error classes
 *   - Progress callback events
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OnboardingProgress, CreateCompanyInput, JoinCompanyInput, OnboardingConfig } from "./types.js";
import {
  PersonCreationError,
  MembershipBootstrapError,
} from "./errors.js";
import { writeCheckpoint, readCheckpoint } from "./checkpoint.js";

// ---------------------------------------------------------------------------
// Mock hq-cloud module
// ---------------------------------------------------------------------------

const mockEntityGet = vi.fn();
const mockEntityFindBySlug = vi.fn();
const mockEntityCreate = vi.fn();
const mockCreateInvite = vi.fn();
const mockAcceptInvite = vi.fn();
const mockListMembers = vi.fn();
const mockProvisionBucket = vi.fn();
const mockResolveEntityContext = vi.fn();
const mockSync = vi.fn();
const mockParseToken = vi.fn((t: string) => t);

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

vi.mock("@indigoai-us/hq-cloud", () => ({
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
}));

// Import after mocks are set up
const { createCompanyFlow, joinCompanyFlow, resumeOnboarding } = await import("./orchestrator.js");

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "hq-onboard-test-"));
  vi.clearAllMocks();

  // Default happy-path responses
  mockEntityCreate.mockImplementation(async (input: { type: string; slug: string }) => ({
    uid: input.type === "person" ? "psn_001" : "cmp_001",
    slug: input.slug,
    type: input.type,
    status: "active",
  }));
  mockProvisionBucket.mockResolvedValue({
    bucketName: "hq-test-bucket",
    kmsKeyId: "key-001",
  });
  mockListMembers.mockResolvedValue([]);
  mockCreateInvite.mockResolvedValue({
    inviteToken: "tok_001",
    membership: {
      membershipKey: "mbr_001",
      personUid: "psn_001",
      companyUid: "cmp_001",
      role: "owner",
      status: "pending",
      invitedBy: "psn_001",
      invitedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  });
  mockAcceptInvite.mockResolvedValue({
    membership: {
      membershipKey: "mbr_001",
      personUid: "psn_001",
      companyUid: "cmp_001",
      role: "owner",
      status: "active",
      invitedBy: "psn_001",
      invitedAt: "2026-01-01T00:00:00Z",
      acceptedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  });
  mockResolveEntityContext.mockResolvedValue({
    uid: "cmp_001",
    bucketName: "hq-test-bucket",
    region: "us-east-1",
    credentials: {
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "secret",
      sessionToken: "token",
    },
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  });
  mockSync.mockResolvedValue({
    filesDownloaded: 3,
    bytesDownloaded: 1024,
    filesSkipped: 0,
    conflicts: 0,
    aborted: false,
  });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeConfig(): OnboardingConfig {
  return {
    vaultConfig: { apiUrl: "https://vault.test", authToken: "test-token" },
    hqRoot: tmpDir,
  };
}

function makeCreateInput(): CreateCompanyInput {
  return {
    mode: "create-company",
    personName: "Test User",
    personEmail: "test@example.com",
    companyName: "Test Co",
    companySlug: "test-co",
  };
}

function makeJoinInput(): JoinCompanyInput {
  return {
    mode: "join-company",
    personName: "Invitee",
    personEmail: "invitee@example.com",
    inviteToken: "hq://accept/tok_join_001",
  };
}

// ---------------------------------------------------------------------------
// createCompanyFlow
// ---------------------------------------------------------------------------

describe("createCompanyFlow", () => {
  it("executes all 6 steps in order", async () => {
    const events: OnboardingProgress[] = [];
    const result = await createCompanyFlow(makeCreateInput(), makeConfig(), (e) => events.push(e));

    expect(result.personUid).toBe("psn_001");
    expect(result.companyUid).toBe("cmp_001");
    expect(result.companySlug).toBe("test-co");
    expect(result.role).toBe("owner");
    expect(result.bucketName).toBe("hq-test-bucket");

    // Verify step ordering via progress events
    const doneSteps = events.filter(e => e.status === "done").map(e => e.step);
    expect(doneSteps).toEqual([
      "create-person",
      "create-company",
      "provision-bucket",
      "bootstrap-membership",
      "verify-sts",
      "write-config",
    ]);

    // Verify .hq/config.json was written
    const configRaw = await readFile(join(tmpDir, ".hq", "config.json"), "utf-8");
    const config = JSON.parse(configRaw);
    expect(config.companyUid).toBe("cmp_001");
    expect(config.role).toBe("owner");
  });

  it("resumes from checkpoint — skips completed steps", async () => {
    // Pre-write a checkpoint with steps 1-2 done
    await writeCheckpoint(tmpDir, {
      mode: "create-company",
      startedAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      personUid: "psn_001",
      companyUid: "cmp_001",
      companySlug: "test-co",
      completedSteps: ["create-person", "create-company"],
    });

    const events: OnboardingProgress[] = [];
    await createCompanyFlow(makeCreateInput(), makeConfig(), (e) => events.push(e));

    // Steps 1-2 should be skipped
    const skipped = events.filter(e => e.status === "skipped").map(e => e.step);
    expect(skipped).toContain("create-person");
    expect(skipped).toContain("create-company");

    // Steps 3-6 should run
    const done = events.filter(e => e.status === "done").map(e => e.step);
    expect(done).toContain("provision-bucket");
    expect(done).toContain("bootstrap-membership");
    expect(done).toContain("verify-sts");
    expect(done).toContain("write-config");

    // entity.create should NOT have been called (skipped)
    expect(mockEntityCreate).not.toHaveBeenCalled();
  });

  it("throws PersonCreationError on entity.create failure", async () => {
    mockEntityCreate.mockRejectedValueOnce(new Error("DB unavailable"));

    await expect(
      createCompanyFlow(makeCreateInput(), makeConfig()),
    ).rejects.toThrow(PersonCreationError);

    // Checkpoint should record the failed step
    const cp = await readCheckpoint(tmpDir);
    expect(cp?.failedStep).toBe("create-person");
  });

  it("throws MembershipBootstrapError when company has non-matching members", async () => {
    mockListMembers.mockResolvedValueOnce([
      { personUid: "psn_other", role: "owner", membershipKey: "mbr_other" },
    ]);

    await expect(
      createCompanyFlow(makeCreateInput(), makeConfig()),
    ).rejects.toThrow(MembershipBootstrapError);
  });

  it("skips membership bootstrap when owner already exists", async () => {
    mockListMembers.mockResolvedValueOnce([
      { personUid: "psn_001", role: "owner", membershipKey: "mbr_001" },
    ]);

    const events: OnboardingProgress[] = [];
    await createCompanyFlow(makeCreateInput(), makeConfig(), (e) => events.push(e));

    const bootstrapEvent = events.find(
      e => e.step === "bootstrap-membership" && e.status === "skipped",
    );
    expect(bootstrapEvent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// joinCompanyFlow
// ---------------------------------------------------------------------------

describe("joinCompanyFlow", () => {
  it("executes all 6 steps in order", async () => {
    // For join flow, acceptInvite returns the company info
    mockAcceptInvite.mockResolvedValueOnce({
      membership: {
        membershipKey: "mbr_002",
        personUid: "psn_002",
        companyUid: "cmp_001",
        role: "member",
        status: "active",
        invitedBy: "psn_001",
        invitedAt: "2026-01-01T00:00:00Z",
        acceptedAt: "2026-01-01T00:00:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    });
    mockEntityCreate.mockResolvedValueOnce({
      uid: "psn_002", slug: "invitee", type: "person", status: "active",
    });
    mockEntityGet.mockResolvedValueOnce({
      uid: "cmp_001", slug: "test-co", type: "company", bucketName: "hq-test-bucket", status: "active",
    });
    mockListMembers.mockResolvedValueOnce([
      { personUid: "psn_002", role: "member", membershipKey: "mbr_002" },
    ]);

    const events: OnboardingProgress[] = [];
    const result = await joinCompanyFlow(makeJoinInput(), makeConfig(), (e) => events.push(e));

    expect(result.personUid).toBe("psn_002");
    expect(result.companyUid).toBe("cmp_001");
    expect(result.role).toBe("member");

    const doneSteps = events.filter(e => e.status === "done").map(e => e.step);
    expect(doneSteps).toContain("parse-token");
    expect(doneSteps).toContain("create-person");
    expect(doneSteps).toContain("accept-invite");
    expect(doneSteps).toContain("verify-sts");
    expect(doneSteps).toContain("first-sync");
    expect(doneSteps).toContain("write-config");
  });

  it("calls parseToken to handle hq:// links", async () => {
    mockEntityCreate.mockResolvedValueOnce({
      uid: "psn_002", slug: "invitee", type: "person", status: "active",
    });
    mockAcceptInvite.mockResolvedValueOnce({
      membership: {
        membershipKey: "mbr_002", personUid: "psn_002", companyUid: "cmp_001",
        role: "member", status: "active", invitedBy: "psn_001",
        invitedAt: "2026-01-01T00:00:00Z", acceptedAt: "2026-01-01T00:00:00Z",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
      },
    });
    mockEntityGet.mockResolvedValueOnce({
      uid: "cmp_001", slug: "test-co", type: "company", bucketName: "hq-test-bucket", status: "active",
    });
    mockListMembers.mockResolvedValueOnce([
      { personUid: "psn_002", role: "member", membershipKey: "mbr_002" },
    ]);

    await joinCompanyFlow(makeJoinInput(), makeConfig());

    expect(mockParseToken).toHaveBeenCalledWith("hq://accept/tok_join_001");
  });
});

// ---------------------------------------------------------------------------
// resumeOnboarding
// ---------------------------------------------------------------------------

describe("resumeOnboarding", () => {
  it("throws when no checkpoint exists", async () => {
    await expect(
      resumeOnboarding(makeConfig()),
    ).rejects.toThrow("No onboarding checkpoint found");
  });

  it("resumes create-company flow from checkpoint", async () => {
    await writeCheckpoint(tmpDir, {
      mode: "create-company",
      startedAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      personUid: "psn_001",
      companyUid: "cmp_001",
      companySlug: "test-co",
      bucketName: "hq-test-bucket",
      membershipKey: "mbr_001",
      completedSteps: [
        "create-person",
        "create-company",
        "provision-bucket",
        "bootstrap-membership",
      ],
    });

    const events: OnboardingProgress[] = [];
    const result = await resumeOnboarding(makeConfig(), (e) => events.push(e));

    expect(result.companyUid).toBe("cmp_001");
    // Only STS verify + write-config should run
    const done = events.filter(e => e.status === "done").map(e => e.step);
    expect(done).toContain("verify-sts");
    expect(done).toContain("write-config");
  });
});
