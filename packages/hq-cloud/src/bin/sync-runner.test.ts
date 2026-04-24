/**
 * Unit tests for hq-sync-runner (ADR-0001).
 *
 * The runner is designed around `RunnerDeps` — every side effect is
 * injectable, so tests assert on captured ndjson output rather than mocking
 * modules. That keeps each test honest about what the runner does vs what
 * its collaborators do.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRunner } from "./sync-runner.js";
import type {
  RunnerEvent,
  RunnerDeps,
  VaultClientSurface,
} from "./sync-runner.js";
import type { SyncResult, SyncOptions } from "../cli/sync.js";
import type {
  Membership,
  EntityInfo,
  PendingInviteByEmail,
} from "../vault-client.js";
import { VaultAuthError } from "../vault-client.js";
import type { CompanyEntry } from "../lib/company-discovery.js";

// ---------------------------------------------------------------------------
// Capturing writer — collects writes so we can assert on the ndjson stream
// ---------------------------------------------------------------------------

interface CapturingWriter {
  write: (chunk: string) => boolean;
  lines: () => string[];
  events: () => RunnerEvent[];
  raw: () => string;
}

function makeWriter(): CapturingWriter {
  let buf = "";
  return {
    write: (chunk: string) => {
      buf += chunk;
      return true;
    },
    lines: () => buf.split("\n").filter((l) => l.length > 0),
    events: () =>
      buf
        .split("\n")
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as RunnerEvent),
    raw: () => buf,
  };
}

// ---------------------------------------------------------------------------
// Default stub factory — tests override individual fields
// ---------------------------------------------------------------------------

function defaultSyncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    filesDownloaded: 0,
    bytesDownloaded: 0,
    filesSkipped: 0,
    conflicts: 0,
    aborted: false,
    ...overrides,
  };
}

/**
 * Produce a minimal VaultClientSurface stub. Tests pass in the memberships
 * they want `listMyMemberships` to return, plus the sequence of `entity.get`
 * resolutions. Defaults cover the "no memberships" path.
 */
function makeVaultStub(
  opts: {
    memberships?: Array<Pick<Membership, "companyUid">>;
    entityGet?: (uid: string) => Promise<EntityInfo>;
    pendingInvites?: Array<Record<string, unknown>>;
    ensurePerson?: (hints: {
      ownerSub: string;
      displayName: string;
    }) => Promise<EntityInfo>;
    claim?: (personUid: string) => Promise<void>;
  } = {},
): VaultClientSurface {
  const memberships = opts.memberships ?? [];
  const pending = opts.pendingInvites ?? [];
  return {
    listMyMemberships: () => Promise.resolve(memberships as Membership[]),
    listMyPendingInvitesByEmail: () =>
      Promise.resolve(pending as unknown as PendingInviteByEmail[]),
    claimPendingInvitesByEmail:
      opts.claim ?? (() => Promise.resolve(undefined)),
    ensureMyPersonEntity:
      opts.ensurePerson ??
      (() =>
        Promise.resolve({
          uid: "ent_person_default",
          type: "person",
          slug: "default-person",
          status: "active",
        } as unknown as EntityInfo)),
    entity: {
      get:
        opts.entityGet ??
        ((uid: string) =>
          Promise.resolve({
            uid,
            type: "company",
            slug: uid,
            bucketName: `bucket-${uid}`,
            status: "active",
          } as unknown as EntityInfo)),
    },
  };
}

interface TestDeps extends RunnerDeps {
  stdout: CapturingWriter;
  stderr: CapturingWriter;
}

/**
 * Test-default `listAllCompanies`: ignore `hqRoot` (tests don't seed on-disk
 * companies), drive everything off the vault stub so pre-US-003 assertions
 * about AWS-only fanout still hold. Mirrors the real function's AWS branch.
 */
async function testListAllCompaniesFromVault(
  vault: VaultClientSurface,
): Promise<CompanyEntry[]> {
  const memberships = await vault.listMyMemberships();
  const rows: CompanyEntry[] = [];
  for (const m of memberships) {
    let slug = m.companyUid;
    let name: string | undefined;
    try {
      const info = await vault.entity.get(m.companyUid);
      slug = info.slug || m.companyUid;
      name = info.name;
    } catch {
      // Best-effort — keep UID.
    }
    // CompanyEntry requires `name` to be a string — fall back to slug when
    // the entity didn't supply one, matching the real company-discovery
    // behavior for AWS-only rows that can't find a matching local yaml.
    rows.push({
      uid: m.companyUid,
      slug,
      name: name ?? slug,
      source: "aws",
    });
  }
  return rows;
}

function makeDeps(overrides: Partial<RunnerDeps> = {}): TestDeps {
  const stdout = makeWriter();
  const stderr = makeWriter();
  // Spread overrides first so our CapturingWriter stdout/stderr always
  // survive in the returned shape. Tests cannot override those — capturing
  // is the whole point of the helper. vi.fn() wraps defaults so tests can
  // still call .toHaveBeenCalled() / .toHaveBeenCalledTimes() on the returned
  // deps without each override re-wrapping.
  //
  // `listAllCompanies` default talks to whichever vault stub
  // `createVaultClient` produced — matches the pre-US-003 behavior where
  // the runner called `listMyMemberships` + `entity.get` directly. Tests
  // that want to assert on local-vs-aws tagging override this explicitly.
  let cachedClient: VaultClientSurface | null = null;
  const baseCreateVault =
    overrides.createVaultClient ?? (() => makeVaultStub());
  const wrappedCreateVault = vi.fn().mockImplementation((...args: unknown[]) => {
    cachedClient = (baseCreateVault as (...a: unknown[]) => VaultClientSurface)(
      ...args,
    );
    return cachedClient;
  });
  // Pull overrides apart so we can wrap the vault factory without the later
  // `...overrides` spread clobbering our wrapper.
  const { createVaultClient: _omit1, listAllCompanies: overrideListAll, ...restOverrides } =
    overrides;
  return {
    getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
    sync: vi.fn().mockResolvedValue(defaultSyncResult()),
    ...restOverrides,
    createVaultClient: wrappedCreateVault,
    listAllCompanies:
      overrideListAll ??
      vi.fn().mockImplementation(async () => {
        if (!cachedClient) cachedClient = makeVaultStub();
        return testListAllCompaniesFromVault(cachedClient);
      }),
    stdout,
    stderr,
  };
}

// ---------------------------------------------------------------------------
// argv parsing
// ---------------------------------------------------------------------------

describe("argv parsing", () => {
  it("rejects missing mode with exit 1", async () => {
    const deps = makeDeps();
    const code = await runRunner([], deps);
    expect(code).toBe(1);
    expect(deps.stderr.raw()).toContain("--companies or --company");
    expect(deps.stdout.events()).toEqual([]);
  });

  it("rejects --companies + --company together", async () => {
    const deps = makeDeps();
    const code = await runRunner(["--companies", "--company", "acme"], deps);
    expect(code).toBe(1);
    expect(deps.stderr.raw()).toContain("not both");
    expect(deps.stdout.events()).toEqual([]);
  });

  it("rejects unknown flags", async () => {
    const deps = makeDeps();
    const code = await runRunner(["--companies", "--wat"], deps);
    expect(code).toBe(1);
    expect(deps.stderr.raw()).toContain("Unknown argument: --wat");
  });

  it("rejects invalid --on-conflict value", async () => {
    const deps = makeDeps();
    const code = await runRunner(
      ["--companies", "--on-conflict", "nuke"],
      deps,
    );
    expect(code).toBe(1);
    expect(deps.stderr.raw()).toContain("abort|overwrite|keep");
  });

  it("accepts --json as a silent no-op (ndjson is the only mode)", async () => {
    const deps = makeDeps({
      createVaultClient: () => makeVaultStub({ memberships: [] }),
    });
    const code = await runRunner(["--companies", "--json"], deps);
    expect(code).toBe(0);
    // Empty memberships → setup-needed, not a parse error
    expect(deps.stdout.events()).toEqual([{ type: "setup-needed" }]);
  });
});

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

describe("auth", () => {
  it("emits auth-error and returns 0 when token fetch fails", async () => {
    const deps = makeDeps({
      getAccessToken: vi.fn().mockRejectedValue(new Error("no cached tokens")),
    });
    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    expect(deps.stdout.events()).toEqual([
      { type: "auth-error", message: "no cached tokens" },
    ]);
  });

  it("emits auth-error when VaultAuthError thrown during discovery", async () => {
    const deps = makeDeps({
      createVaultClient: () => ({
        ...makeVaultStub(),
        listMyMemberships: () =>
          Promise.reject(new VaultAuthError("token expired")),
      }),
    });
    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    expect(deps.stdout.events()).toEqual([
      { type: "auth-error", message: "token expired" },
    ]);
  });

  it("emits error event and returns 1 on non-auth discovery failure", async () => {
    const deps = makeDeps({
      createVaultClient: () => ({
        ...makeVaultStub(),
        listMyMemberships: () => Promise.reject(new Error("network down")),
      }),
    });
    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(1);
    const events = deps.stdout.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      message: "network down",
      path: "(discovery)",
    });
  });
});

// ---------------------------------------------------------------------------
// claim-dance (first sign-in)
// ---------------------------------------------------------------------------

describe("claim-dance", () => {
  const claims = {
    sub: "sub-abc",
    email: "stefan@getindigo.ai",
    name: "Stefan Johnson",
  };

  it("claims pending invites + ensures person before listing memberships", async () => {
    const ensureSpy = vi.fn().mockResolvedValue({
      uid: "ent_person_stefan",
      type: "person",
      slug: "stefan-johnson",
      status: "active",
    });
    const claimSpy = vi.fn().mockResolvedValue(undefined);
    // First listMyMemberships returns the just-claimed row.
    let listCalls = 0;
    const stub = makeVaultStub({
      pendingInvites: [
        {
          membershipKey: "inv_1",
          companyUid: "cmp_indigo",
          role: "owner",
          invitedBy: "sub-admin",
          invitedAt: "2026-04-20T00:00:00Z",
        },
      ],
      ensurePerson: ensureSpy as unknown as VaultClientSurface["ensureMyPersonEntity"],
      claim: claimSpy as unknown as VaultClientSurface["claimPendingInvitesByEmail"],
    });
    stub.listMyMemberships = () => {
      listCalls++;
      return Promise.resolve([{ companyUid: "cmp_indigo" }] as Membership[]);
    };

    const deps = makeDeps({
      createVaultClient: () => stub,
      getIdTokenClaims: () => claims,
    });
    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    expect(ensureSpy).toHaveBeenCalledWith({
      ownerSub: "sub-abc",
      displayName: "Stefan Johnson",
    });
    expect(claimSpy).toHaveBeenCalledWith("ent_person_stefan");
    expect(listCalls).toBe(1);
    // setup-needed must NOT fire — the user has memberships after the claim.
    expect(deps.stdout.events().some((e) => e.type === "setup-needed")).toBe(
      false,
    );
  });

  it("skips ensurePerson + claim when no pending invites exist", async () => {
    const ensureSpy = vi.fn();
    const claimSpy = vi.fn();
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          pendingInvites: [],
          ensurePerson:
            ensureSpy as unknown as VaultClientSurface["ensureMyPersonEntity"],
          claim: claimSpy as unknown as VaultClientSurface["claimPendingInvitesByEmail"],
        }),
      getIdTokenClaims: () => claims,
    });
    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    expect(ensureSpy).not.toHaveBeenCalled();
    expect(claimSpy).not.toHaveBeenCalled();
    // No memberships, no invites — truly empty → setup-needed is correct here.
    expect(deps.stdout.events()).toEqual([{ type: "setup-needed" }]);
  });

  it("skips claim-dance entirely when no idToken claims are available", async () => {
    const pendingSpy = vi.fn().mockResolvedValue([]);
    const stub = makeVaultStub();
    stub.listMyPendingInvitesByEmail =
      pendingSpy as unknown as VaultClientSurface["listMyPendingInvitesByEmail"];
    const deps = makeDeps({
      createVaultClient: () => stub,
      getIdTokenClaims: () => null,
    });
    await runRunner(["--companies"], deps);
    expect(pendingSpy).not.toHaveBeenCalled();
  });

  it("does not fail the run when claim-dance throws (best-effort)", async () => {
    const stub = makeVaultStub({
      memberships: [{ companyUid: "cmp_a" }],
    });
    stub.listMyPendingInvitesByEmail = () =>
      Promise.reject(new Error("vault 500"));
    const deps = makeDeps({
      createVaultClient: () => stub,
      getIdTokenClaims: () => claims,
    });
    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    // Sync proceeds as usual for the existing membership.
    expect(deps.sync).toHaveBeenCalledTimes(1);
    expect(deps.stderr.raw()).toContain("claim-dance skipped");
  });

  it("falls back to given_name + family_name when name claim is absent", async () => {
    const ensureSpy = vi.fn().mockResolvedValue({
      uid: "ent_person_x",
      type: "person",
      slug: "x",
      status: "active",
    });
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          pendingInvites: [
            {
              membershipKey: "inv_1",
              companyUid: "cmp_x",
              role: "owner",
              invitedBy: "sub-admin",
              invitedAt: "2026-04-20T00:00:00Z",
            },
          ],
          ensurePerson:
            ensureSpy as unknown as VaultClientSurface["ensureMyPersonEntity"],
        }),
      getIdTokenClaims: () => ({
        sub: "sub-xyz",
        given_name: "Ada",
        family_name: "Lovelace",
      }),
    });
    await runRunner(["--companies"], deps);
    expect(ensureSpy).toHaveBeenCalledWith({
      ownerSub: "sub-xyz",
      displayName: "Ada Lovelace",
    });
  });
});

// ---------------------------------------------------------------------------
// target resolution
// ---------------------------------------------------------------------------

describe("target resolution", () => {
  it("emits setup-needed when --companies returns no memberships", async () => {
    const deps = makeDeps();
    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    expect(deps.stdout.events()).toEqual([{ type: "setup-needed" }]);
    // sync should NOT have been called — no targets
    expect(deps.sync).not.toHaveBeenCalled();
  });

  it("single-company mode skips listMyMemberships and syncs the named UID", async () => {
    const listSpy = vi.fn();
    const deps = makeDeps({
      createVaultClient: () => ({
        ...makeVaultStub({
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
        listMyMemberships: listSpy as unknown as () => Promise<Membership[]>,
      }),
    });
    const code = await runRunner(["--company", "cmp_abc"], deps);
    expect(code).toBe(0);
    expect(listSpy).not.toHaveBeenCalled();
    expect(deps.sync).toHaveBeenCalledTimes(1);
    const call = (deps.sync as ReturnType<typeof vi.fn>).mock.calls[0][0] as SyncOptions;
    expect(call.company).toBe("cmp_abc");
  });
});

// ---------------------------------------------------------------------------
// fanout-plan
// ---------------------------------------------------------------------------

describe("fanout-plan", () => {
  it("resolves slugs from entity.get before fanning out", async () => {
    const slugByUid: Record<string, string> = {
      cmp_a: "acme",
      cmp_b: "beta",
    };
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }, { companyUid: "cmp_b" }],
          entityGet: (uid: string) =>
            Promise.resolve({
              uid,
              slug: slugByUid[uid] ?? uid,
            } as unknown as EntityInfo),
        }),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const plan = deps.stdout
      .events()
      .find((e) => e.type === "fanout-plan") as Extract<RunnerEvent, { type: "fanout-plan" }>;
    expect(plan).toBeDefined();
    expect(plan.companies).toEqual([
      { uid: "cmp_a", slug: "acme", name: "acme", source: "aws" },
      { uid: "cmp_b", slug: "beta", name: "beta", source: "aws" },
    ]);
  });

  it("degrades to UID when entity.get throws (best-effort slug resolution)", async () => {
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_ghost" }],
          entityGet: () => Promise.reject(new Error("entity deleted")),
        }),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const plan = deps.stdout
      .events()
      .find((e) => e.type === "fanout-plan") as Extract<RunnerEvent, { type: "fanout-plan" }>;
    expect(plan.companies).toEqual([
      {
        uid: "cmp_ghost",
        slug: "cmp_ghost",
        name: "cmp_ghost",
        source: "aws",
      },
    ]);
  });

  it("includes entity.name on plan entries when available", async () => {
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }, { companyUid: "cmp_b" }],
          entityGet: (uid: string) =>
            Promise.resolve({
              uid,
              slug: uid === "cmp_a" ? "acme" : "beta",
              name: uid === "cmp_a" ? "Acme Corp" : undefined,
            } as unknown as EntityInfo),
        }),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const plan = deps.stdout
      .events()
      .find((e) => e.type === "fanout-plan") as Extract<RunnerEvent, { type: "fanout-plan" }>;
    expect(plan.companies).toEqual([
      { uid: "cmp_a", slug: "acme", name: "Acme Corp", source: "aws" },
      { uid: "cmp_b", slug: "beta", name: "beta", source: "aws" },
    ]);
  });

  it("degrades to UID when entity.get returns falsy slug", async () => {
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_empty" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "" } as unknown as EntityInfo),
        }),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const plan = deps.stdout
      .events()
      .find((e) => e.type === "fanout-plan") as Extract<RunnerEvent, { type: "fanout-plan" }>;
    expect(plan.companies).toEqual([
      {
        uid: "cmp_empty",
        slug: "cmp_empty",
        name: "cmp_empty",
        source: "aws",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// per-company event tagging
// ---------------------------------------------------------------------------

describe("per-company fanout", () => {
  it("tags per-file progress events with the company slug", async () => {
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: vi.fn().mockImplementation(async (opts: SyncOptions) => {
        opts.onEvent?.({ type: "progress", path: "notes.md", bytes: 42 });
        opts.onEvent?.({
          type: "progress",
          path: "shared/doc.md",
          bytes: 1024,
          message: "draft update",
        });
        return defaultSyncResult({ filesDownloaded: 2, bytesDownloaded: 1066 });
      }),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const progressEvents = deps.stdout
      .events()
      .filter((e): e is Extract<RunnerEvent, { type: "progress" }> =>
        e.type === "progress",
      );
    expect(progressEvents).toEqual([
      { type: "progress", company: "acme", path: "notes.md", bytes: 42 },
      {
        type: "progress",
        company: "acme",
        path: "shared/doc.md",
        bytes: 1024,
        message: "draft update",
      },
    ]);
  });

  it("tags per-file error events with the company slug", async () => {
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: vi.fn().mockImplementation(async (opts: SyncOptions) => {
        opts.onEvent?.({
          type: "error",
          path: "locked.md",
          message: "access denied",
        });
        return defaultSyncResult({ filesSkipped: 1 });
      }),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const errs = deps.stdout
      .events()
      .filter((e): e is Extract<RunnerEvent, { type: "error" }> =>
        e.type === "error",
      );
    expect(errs).toEqual([
      {
        type: "error",
        company: "acme",
        path: "locked.md",
        message: "access denied",
      },
    ]);
  });

  it("emits complete event per company with the SyncResult spread", async () => {
    const result = defaultSyncResult({
      filesDownloaded: 3,
      bytesDownloaded: 999,
      filesSkipped: 1,
      conflicts: 0,
      aborted: false,
    });
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: vi.fn().mockResolvedValue(result),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const complete = deps.stdout
      .events()
      .find((e) => e.type === "complete") as Extract<RunnerEvent, { type: "complete" }>;
    expect(complete).toEqual({
      type: "complete",
      company: "acme",
      ...result,
    });
  });

  it("passes --on-conflict and --hq-root through to sync()", async () => {
    const syncSpy = vi.fn().mockResolvedValue(defaultSyncResult());
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: syncSpy,
    });

    const code = await runRunner(
      [
        "--companies",
        "--on-conflict",
        "overwrite",
        "--hq-root",
        "/tmp/fake-hq",
      ],
      deps,
    );
    expect(code).toBe(0);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    const opts = syncSpy.mock.calls[0][0] as SyncOptions;
    expect(opts.onConflict).toBe("overwrite");
    expect(opts.hqRoot).toBe("/tmp/fake-hq");
  });

  it("continues the fanout when one company's sync throws", async () => {
    const slugs: Record<string, string> = { cmp_a: "acme", cmp_b: "beta" };
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }, { companyUid: "cmp_b" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: slugs[uid] ?? uid } as unknown as EntityInfo),
        }),
      sync: vi
        .fn<(opts: SyncOptions) => Promise<SyncResult>>()
        .mockImplementationOnce(async () => {
          throw new Error("acme blew up");
        })
        .mockImplementationOnce(async () =>
          defaultSyncResult({ filesDownloaded: 1, bytesDownloaded: 500 }),
        ),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0); // whole fanout still returns 0

    const events = deps.stdout.events();
    // Error event for acme (company-level) with path sentinel "(company)"
    const companyErr = events.find(
      (e): e is Extract<RunnerEvent, { type: "error" }> =>
        e.type === "error" && e.company === "acme",
    );
    expect(companyErr).toMatchObject({
      type: "error",
      company: "acme",
      path: "(company)",
      message: "acme blew up",
    });
    // But beta still completed
    const betaComplete = events.find(
      (e): e is Extract<RunnerEvent, { type: "complete" }> =>
        e.type === "complete" && e.company === "beta",
    );
    expect(betaComplete).toBeDefined();
    expect(betaComplete?.filesDownloaded).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// all-complete aggregate
// ---------------------------------------------------------------------------

describe("all-complete aggregate", () => {
  it("sums filesDownloaded and bytesDownloaded across all companies", async () => {
    const slugs: Record<string, string> = { cmp_a: "acme", cmp_b: "beta" };
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }, { companyUid: "cmp_b" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: slugs[uid] ?? uid } as unknown as EntityInfo),
        }),
      sync: vi
        .fn<(opts: SyncOptions) => Promise<SyncResult>>()
        .mockResolvedValueOnce(
          defaultSyncResult({ filesDownloaded: 3, bytesDownloaded: 100 }),
        )
        .mockResolvedValueOnce(
          defaultSyncResult({ filesDownloaded: 4, bytesDownloaded: 250 }),
        ),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const all = deps.stdout
      .events()
      .find((e) => e.type === "all-complete") as Extract<RunnerEvent, { type: "all-complete" }>;
    expect(all).toEqual({
      type: "all-complete",
      companiesAttempted: 2,
      filesDownloaded: 7,
      bytesDownloaded: 350,
      errors: [],
    });
  });

  it("collects company-level errors into the all-complete errors array", async () => {
    const slugs: Record<string, string> = { cmp_a: "acme", cmp_b: "beta" };
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }, { companyUid: "cmp_b" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: slugs[uid] ?? uid } as unknown as EntityInfo),
        }),
      sync: vi
        .fn<(opts: SyncOptions) => Promise<SyncResult>>()
        .mockRejectedValueOnce(new Error("acme failed"))
        .mockResolvedValueOnce(defaultSyncResult()),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    const all = deps.stdout
      .events()
      .find((e) => e.type === "all-complete") as Extract<RunnerEvent, { type: "all-complete" }>;
    expect(all.companiesAttempted).toBe(2);
    expect(all.errors).toEqual([
      { company: "acme", message: "acme failed" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// ndjson stream shape (belt-and-suspenders)
// ---------------------------------------------------------------------------

describe("ndjson stream shape", () => {
  it("emits one JSON object per line, terminated by newline", async () => {
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: vi.fn().mockImplementation(async (opts: SyncOptions) => {
        opts.onEvent?.({ type: "progress", path: "x.md", bytes: 1 });
        return defaultSyncResult({ filesDownloaded: 1, bytesDownloaded: 1 });
      }),
    });

    await runRunner(["--companies"], deps);
    const raw = deps.stdout.raw();
    expect(raw.endsWith("\n")).toBe(true);
    // Every line must parse as JSON
    const lines = raw.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    // Expected shape: fanout-plan, progress, complete, all-complete
    expect(lines).toHaveLength(4);
    const types = lines.map((l) => (JSON.parse(l) as RunnerEvent).type);
    expect(types).toEqual([
      "fanout-plan",
      "progress",
      "complete",
      "all-complete",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Re-initialize for each test (mock state hygiene)
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});
