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
import type { ShareResult, ShareOptions } from "../cli/share.js";
import type {
  Membership,
  EntityInfo,
  PendingInviteByEmail,
} from "../vault-client.js";
import { VaultAuthError } from "../vault-client.js";

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

function defaultShareResult(overrides: Partial<ShareResult> = {}): ShareResult {
  return {
    filesUploaded: 0,
    bytesUploaded: 0,
    filesSkipped: 0,
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
    listPersons?: () => Promise<EntityInfo[]>;
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
      listByType:
        opts.listPersons ??
        (() => Promise.resolve([])),
    },
  };
}

interface TestDeps extends RunnerDeps {
  stdout: CapturingWriter;
  stderr: CapturingWriter;
}

function makeDeps(overrides: Partial<RunnerDeps> = {}): TestDeps {
  const stdout = makeWriter();
  const stderr = makeWriter();
  // Spread overrides first so our CapturingWriter stdout/stderr always
  // survive in the returned shape. Tests cannot override those — capturing
  // is the whole point of the helper. vi.fn() wraps defaults so tests can
  // still call .toHaveBeenCalled() / .toHaveBeenCalledTimes() on the returned
  // deps without each override re-wrapping.
  return {
    getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
    createVaultClient: vi.fn().mockImplementation(() => makeVaultStub()),
    sync: vi.fn().mockResolvedValue(defaultSyncResult()),
    ...overrides,
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
      { uid: "cmp_a", slug: "acme" },
      { uid: "cmp_b", slug: "beta" },
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
    expect(plan.companies).toEqual([{ uid: "cmp_ghost", slug: "cmp_ghost" }]);
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
      { uid: "cmp_a", slug: "acme", name: "Acme Corp" },
      { uid: "cmp_b", slug: "beta" },
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
    expect(plan.companies).toEqual([{ uid: "cmp_empty", slug: "cmp_empty" }]);
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
    // Pull-only run: upload counters are 0.
    expect(complete).toEqual({
      type: "complete",
      company: "acme",
      filesDownloaded: result.filesDownloaded,
      bytesDownloaded: result.bytesDownloaded,
      filesSkipped: result.filesSkipped,
      conflicts: result.conflicts,
      aborted: result.aborted,
      filesUploaded: 0,
      bytesUploaded: 0,
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
      filesUploaded: 0,
      bytesUploaded: 0,
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
// --direction flag
// ---------------------------------------------------------------------------

describe("--direction", () => {
  it("rejects invalid --direction value", async () => {
    const deps = makeDeps();
    const code = await runRunner(
      ["--companies", "--direction", "sideways"],
      deps,
    );
    expect(code).toBe(1);
    expect(deps.stderr.raw()).toContain("pull|push|both");
  });

  it("defaults to pull: share is not called, sync is", async () => {
    const shareSpy = vi.fn();
    const syncSpy = vi.fn().mockResolvedValue(defaultSyncResult());
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: syncSpy,
      share: shareSpy,
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it("direction=push: share is called, sync is not", async () => {
    const shareSpy = vi.fn().mockResolvedValue(defaultShareResult());
    const syncSpy = vi.fn();
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: syncSpy,
      share: shareSpy,
    });

    const code = await runRunner(
      ["--companies", "--direction", "push"],
      deps,
    );
    expect(code).toBe(0);
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("direction=both: push runs first, then pull", async () => {
    const callOrder: string[] = [];
    const shareSpy = vi.fn().mockImplementation(async () => {
      callOrder.push("share");
      return defaultShareResult({ filesUploaded: 2, bytesUploaded: 200 });
    });
    const syncSpy = vi.fn().mockImplementation(async () => {
      callOrder.push("sync");
      return defaultSyncResult({ filesDownloaded: 3, bytesDownloaded: 300 });
    });
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: syncSpy,
      share: shareSpy,
    });

    const code = await runRunner(
      ["--companies", "--direction", "both"],
      deps,
    );
    expect(code).toBe(0);
    expect(callOrder).toEqual(["share", "sync"]);

    const complete = deps.stdout
      .events()
      .find((e) => e.type === "complete") as Extract<RunnerEvent, { type: "complete" }>;
    expect(complete).toMatchObject({
      company: "acme",
      filesUploaded: 2,
      bytesUploaded: 200,
      filesDownloaded: 3,
      bytesDownloaded: 300,
    });
  });

  it("direction=both: pull is skipped when push aborts on conflict", async () => {
    const shareSpy = vi
      .fn()
      .mockResolvedValue(defaultShareResult({ aborted: true }));
    const syncSpy = vi.fn();
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: syncSpy,
      share: shareSpy,
    });

    const code = await runRunner(
      ["--companies", "--direction", "both"],
      deps,
    );
    expect(code).toBe(0);
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).not.toHaveBeenCalled();

    const complete = deps.stdout
      .events()
      .find((e) => e.type === "complete") as Extract<RunnerEvent, { type: "complete" }>;
    expect(complete.aborted).toBe(true);
  });

  it("direction=push: passes skipUnchanged and company root path to share()", async () => {
    const shareSpy = vi.fn().mockResolvedValue(defaultShareResult());
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: vi.fn(),
      share: shareSpy,
    });

    await runRunner(
      [
        "--companies",
        "--direction",
        "push",
        "--hq-root",
        "/tmp/fake-hq",
      ],
      deps,
    );
    const opts = (shareSpy.mock.calls[0] as [ShareOptions])[0];
    expect(opts.skipUnchanged).toBe(true);
    expect(opts.paths).toEqual(["/tmp/fake-hq/companies/acme"]);
    expect(opts.company).toBe("cmp_a");
    expect(opts.hqRoot).toBe("/tmp/fake-hq");
  });

  it("direction=both: all-complete sums uploaded and downloaded across companies", async () => {
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
      share: vi
        .fn<(opts: ShareOptions) => Promise<ShareResult>>()
        .mockResolvedValueOnce(
          defaultShareResult({ filesUploaded: 1, bytesUploaded: 50 }),
        )
        .mockResolvedValueOnce(
          defaultShareResult({ filesUploaded: 2, bytesUploaded: 75 }),
        ),
    });

    const code = await runRunner(
      ["--companies", "--direction", "both"],
      deps,
    );
    expect(code).toBe(0);
    const all = deps.stdout
      .events()
      .find((e) => e.type === "all-complete") as Extract<RunnerEvent, { type: "all-complete" }>;
    expect(all).toEqual({
      type: "all-complete",
      companiesAttempted: 2,
      filesDownloaded: 7,
      bytesDownloaded: 350,
      filesUploaded: 3,
      bytesUploaded: 125,
      errors: [],
    });
  });

  it("direction=push: share progress events are tagged with the company slug", async () => {
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
        }),
      sync: vi.fn(),
      share: vi.fn().mockImplementation(async (opts: ShareOptions) => {
        opts.onEvent?.({
          type: "progress",
          path: "docs/a.md",
          bytes: 100,
        });
        return defaultShareResult({ filesUploaded: 1, bytesUploaded: 100 });
      }),
    });

    await runRunner(["--companies", "--direction", "push"], deps);
    const progress = deps.stdout
      .events()
      .filter((e): e is Extract<RunnerEvent, { type: "progress" }> =>
        e.type === "progress",
      );
    expect(progress).toEqual([
      { type: "progress", company: "acme", path: "docs/a.md", bytes: 100 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Personal slot fanout (A/B/C)
// ---------------------------------------------------------------------------

describe("personal slot fanout", () => {
  const olderPerson: EntityInfo = {
    uid: "prs_older",
    slug: "older-person",
    type: "person",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    bucketName: "hq-vault-prs-older",
  } as unknown as EntityInfo;

  const newerPerson: EntityInfo = {
    uid: "prs_newer",
    slug: "newer-person",
    type: "person",
    status: "active",
    createdAt: "2026-06-01T00:00:00Z",
    bucketName: "hq-vault-prs-newer",
  } as unknown as EntityInfo;

  it("A: fanout-plan ends with personal slot using canonical-sort-selected person (older createdAt wins)", async () => {
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
          // Return persons in reversed order (newer first) to test canonical sort
          listPersons: () => Promise.resolve([newerPerson, olderPerson]),
        }),
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);

    const planEvent = deps.stdout
      .events()
      .find((e) => e.type === "fanout-plan") as Extract<RunnerEvent, { type: "fanout-plan" }>;
    expect(planEvent).toBeDefined();

    const lastEntry = planEvent.companies[planEvent.companies.length - 1];
    expect(lastEntry.slug).toBe("personal");
    expect(lastEntry.uid).toBe("prs_older");
    expect((lastEntry as Record<string, unknown>).bucketName).toBe("hq-vault-prs-older");
    expect((lastEntry as Record<string, unknown>).personalMode).toBe(true);
    expect((lastEntry as Record<string, unknown>).journalSlug).toBe("personal");
  });

  it("B: syncFn invoked with personalMode: true + journalSlug: 'personal' for personal slot", async () => {
    const syncSpy = vi.fn().mockResolvedValue(defaultSyncResult());
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
          listPersons: () => Promise.resolve([newerPerson, olderPerson]),
        }),
      sync: syncSpy,
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);

    const personalCall = (syncSpy.mock.calls as Array<[SyncOptions]>).find(
      (c) => c[0].company?.startsWith("prs_"),
    );
    expect(personalCall).toBeDefined();
    const personalArgs = personalCall![0];
    expect(personalArgs.personalMode).toBe(true);
    expect(personalArgs.journalSlug).toBe("personal");
  });

  it("C: company slots' syncFn args do NOT contain personalMode or journalSlug", async () => {
    const syncSpy = vi.fn().mockResolvedValue(defaultSyncResult());
    const deps = makeDeps({
      createVaultClient: () =>
        makeVaultStub({
          memberships: [{ companyUid: "cmp_a" }],
          entityGet: (uid: string) =>
            Promise.resolve({ uid, slug: "acme" } as unknown as EntityInfo),
          listPersons: () => Promise.resolve([olderPerson]),
        }),
      sync: syncSpy,
    });

    const code = await runRunner(["--companies"], deps);
    expect(code).toBe(0);

    const companyCalls = (syncSpy.mock.calls as Array<[SyncOptions]>).filter(
      (c) => c[0].company?.startsWith("cmp_"),
    );
    expect(companyCalls.length).toBeGreaterThan(0);
    for (const [args] of companyCalls) {
      const keys = Object.keys(args);
      expect(keys).not.toContain("personalMode");
      expect(keys).not.toContain("journalSlug");
    }
  });
});

// ---------------------------------------------------------------------------
// Re-initialize for each test (mock state hygiene)
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});
