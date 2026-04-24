/**
 * company-promote unit tests (US-004a).
 *
 * Uses a tmp HQ root on real disk — same pattern as company-discovery.test.ts —
 * because the atomic-write dance is the whole point and mocking fs would hide
 * that. Vault is stubbed via the narrow `CompanyPromoteVaultClient` surface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { promoteLocalCompany } from "./company-promote.js";
import type { CompanyPromoteVaultClient } from "./company-promote.js";
import type { EntityInfo, CreateEntityInput } from "../vault-client.js";
import { VaultNotFoundError } from "../vault-client.js";

// ---------------------------------------------------------------------------
// Vault stub
// ---------------------------------------------------------------------------

interface StubState {
  findBySlug: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  provisionBucket: ReturnType<typeof vi.fn>;
}

function makeVaultStub(opts: {
  existingEntity?: Partial<EntityInfo>;
  createResult?: Partial<EntityInfo>;
  provisionResult?: { bucketName: string; kmsKeyId: string };
  provisionError?: Error;
  /** Entity to return from entity.get — used when provisionBucket is reused. */
  reuseEntity?: Partial<EntityInfo>;
}): { client: CompanyPromoteVaultClient; state: StubState } {
  const findBySlug = vi.fn(async (type: string, slug: string) => {
    if (opts.existingEntity) {
      return {
        uid: "cmp_existing",
        slug,
        type,
        status: "active",
        ...opts.existingEntity,
      } as EntityInfo;
    }
    throw new VaultNotFoundError(`slug ${type}/${slug} not found`);
  });

  const create = vi.fn(async (input: CreateEntityInput) => {
    return {
      uid: "cmp_fresh",
      type: input.type,
      slug: input.slug,
      name: input.name,
      status: "active",
      ...opts.createResult,
    } as EntityInfo;
  });

  const get = vi.fn(async (uid: string) => {
    return {
      uid,
      slug: opts.reuseEntity?.slug ?? uid,
      type: "company",
      status: "active",
      ...opts.reuseEntity,
    } as EntityInfo;
  });

  const provisionBucket = vi.fn(async (_uid: string) => {
    if (opts.provisionError) throw opts.provisionError;
    return (
      opts.provisionResult ?? { bucketName: "bkt-fresh", kmsKeyId: "kms-fresh" }
    );
  });

  const client: CompanyPromoteVaultClient = {
    provisionBucket,
    entity: { get, findBySlug, create },
  };
  const state: StubState = { findBySlug, create, get, provisionBucket };
  return { client, state };
}

// ---------------------------------------------------------------------------
// tmp dir lifecycle
// ---------------------------------------------------------------------------

let hqRoot: string;
let companiesDir: string;

beforeEach(async () => {
  hqRoot = await mkdtemp(path.join(tmpdir(), "hq-cloud-promote-"));
  companiesDir = path.join(hqRoot, "companies");
  await mkdir(companiesDir, { recursive: true });
});

afterEach(async () => {
  await rm(hqRoot, { recursive: true, force: true });
});

async function writeCompanyDir(
  slug: string,
  yamlBody: string,
): Promise<string> {
  const dir = path.join(companiesDir, slug);
  await mkdir(dir, { recursive: true });
  const yamlPath = path.join(dir, "company.yaml");
  await writeFile(yamlPath, yamlBody, "utf-8");
  return yamlPath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("promoteLocalCompany", () => {
  it("creates entity + provisions bucket + rewrites yaml for a fresh slug", async () => {
    const yamlPath = await writeCompanyDir(
      "acme",
      "name: Acme\nslug: acme\n",
    );
    const { client, state } = makeVaultStub({
      createResult: { uid: "cmp_acme_new", slug: "acme" },
      provisionResult: { bucketName: "bkt-acme", kmsKeyId: "kms-acme" },
    });

    const result = await promoteLocalCompany({
      hqRoot,
      slug: "acme",
      vaultClient: client,
      displayName: "Acme Corp",
    });

    expect(result).toEqual({ uid: "cmp_acme_new", bucketName: "bkt-acme" });

    // findBySlug tried first, then create with displayName
    expect(state.findBySlug).toHaveBeenCalledWith("company", "acme");
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.create).toHaveBeenCalledWith({
      type: "company",
      slug: "acme",
      name: "Acme Corp",
    });
    expect(state.provisionBucket).toHaveBeenCalledWith("cmp_acme_new");
    // entity.get NOT called on happy path — only on provisionBucket-reuse
    expect(state.get).not.toHaveBeenCalled();

    const rewritten = await readFile(yamlPath, "utf-8");
    expect(rewritten).toContain("cloud: true");
    expect(rewritten).toContain("cloudCompanyUid: cmp_acme_new");
    expect(rewritten).toContain("name: Acme");
    expect(rewritten).toContain("slug: acme");
  });

  it("reuses existing entity when findBySlug returns one (idempotency)", async () => {
    await writeCompanyDir(
      "acme",
      "name: Acme\nslug: acme\n",
    );
    const { client, state } = makeVaultStub({
      existingEntity: { uid: "cmp_acme_existing", slug: "acme" },
      provisionResult: { bucketName: "bkt-acme", kmsKeyId: "kms-acme" },
    });

    const result = await promoteLocalCompany({
      hqRoot,
      slug: "acme",
      vaultClient: client,
    });

    expect(result).toEqual({
      uid: "cmp_acme_existing",
      bucketName: "bkt-acme",
    });
    expect(state.findBySlug).toHaveBeenCalledTimes(1);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.provisionBucket).toHaveBeenCalledWith("cmp_acme_existing");
  });

  it("reuses pre-provisioned bucket by re-fetching entity when provisionBucket throws", async () => {
    await writeCompanyDir(
      "acme",
      "name: Acme\nslug: acme\n",
    );
    const { client, state } = makeVaultStub({
      existingEntity: { uid: "cmp_acme_existing", slug: "acme" },
      provisionError: Object.assign(new Error("bucket already provisioned"), {
        statusCode: 409,
      }),
      reuseEntity: {
        uid: "cmp_acme_existing",
        slug: "acme",
        bucketName: "bkt-acme-old",
      },
    });

    const result = await promoteLocalCompany({
      hqRoot,
      slug: "acme",
      vaultClient: client,
    });

    expect(result).toEqual({
      uid: "cmp_acme_existing",
      bucketName: "bkt-acme-old",
    });
    // provisionBucket was attempted; then entity.get was used to recover
    expect(state.provisionBucket).toHaveBeenCalledTimes(1);
    expect(state.get).toHaveBeenCalledWith("cmp_acme_existing");
  });

  it("re-throws the provision error when entity has no bucketName after refetch", async () => {
    await writeCompanyDir(
      "acme",
      "name: Acme\nslug: acme\n",
    );
    const { client } = makeVaultStub({
      existingEntity: { uid: "cmp_acme_existing", slug: "acme" },
      provisionError: new Error("provisioning failed mid-flight"),
      reuseEntity: {
        uid: "cmp_acme_existing",
        slug: "acme",
        // no bucketName
      },
    });

    await expect(
      promoteLocalCompany({ hqRoot, slug: "acme", vaultClient: client }),
    ).rejects.toThrow(/provisioning failed mid-flight/);
  });

  it("preserves comments, key order, and unrelated keys on yaml rewrite", async () => {
    const yamlPath = await writeCompanyDir(
      "acme",
      [
        "# top-level comment",
        "name: Acme",
        "slug: acme",
        "# workers list",
        "workers:",
        "  - one",
        "  - two",
        "notes: keep-me",
        "",
      ].join("\n"),
    );
    const { client } = makeVaultStub({
      createResult: { uid: "cmp_acme_new", slug: "acme" },
      provisionResult: { bucketName: "bkt-acme", kmsKeyId: "kms-acme" },
    });

    await promoteLocalCompany({
      hqRoot,
      slug: "acme",
      vaultClient: client,
    });

    const rewritten = await readFile(yamlPath, "utf-8");
    // Comments preserved
    expect(rewritten).toContain("# top-level comment");
    expect(rewritten).toContain("# workers list");
    // Unrelated keys preserved
    expect(rewritten).toContain("notes: keep-me");
    expect(rewritten).toMatch(/workers:\s*\n\s*- one\s*\n\s*- two/);
    // Original keys still appear before injected keys (key order preserved)
    const nameIdx = rewritten.indexOf("name: Acme");
    const slugIdx = rewritten.indexOf("slug: acme");
    const cloudIdx = rewritten.indexOf("cloud: true");
    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(slugIdx).toBeGreaterThan(nameIdx);
    expect(cloudIdx).toBeGreaterThan(slugIdx);
    // New keys present
    expect(rewritten).toContain("cloud: true");
    expect(rewritten).toContain("cloudCompanyUid: cmp_acme_new");
  });

  it("leaves the original company.yaml intact when the rename fails after temp write", async () => {
    const originalBody = "name: Acme\nslug: acme\n# marker\n";
    const yamlPath = await writeCompanyDir("acme", originalBody);

    const { client } = makeVaultStub({
      createResult: { uid: "cmp_acme_new", slug: "acme" },
      provisionResult: { bucketName: "bkt-acme", kmsKeyId: "kms-acme" },
    });

    // Simulate rename failure by pre-creating a DIRECTORY where the tmp file
    // should land — writeFile will reject with EISDIR, which bails the flow
    // before the rename. The original file stays byte-identical.
    const tmpPath = `${yamlPath}.tmp`;
    await mkdir(tmpPath, { recursive: true });

    await expect(
      promoteLocalCompany({ hqRoot, slug: "acme", vaultClient: client }),
    ).rejects.toThrow();

    const after = await readFile(yamlPath, "utf-8");
    expect(after).toBe(originalBody);

    // Clean up the fake tmp dir so afterEach rm doesn't fight it
    await rm(tmpPath, { recursive: true, force: true });
  });

  it("surfaces non-404 findBySlug errors without attempting create", async () => {
    await writeCompanyDir("acme", "name: Acme\nslug: acme\n");
    const authError = Object.assign(new Error("auth failed"), {
      name: "VaultAuthError",
      statusCode: 401,
    });
    const findBySlug = vi.fn(async () => {
      throw authError;
    });
    const create = vi.fn();
    const provisionBucket = vi.fn();
    const get = vi.fn();
    const client: CompanyPromoteVaultClient = {
      provisionBucket,
      entity: { findBySlug, create, get },
    };

    await expect(
      promoteLocalCompany({ hqRoot, slug: "acme", vaultClient: client }),
    ).rejects.toThrow(/auth failed/);
    expect(create).not.toHaveBeenCalled();
    expect(provisionBucket).not.toHaveBeenCalled();
  });

  it("falls back to slug as displayName when not provided", async () => {
    await writeCompanyDir("acme", "name: Acme\nslug: acme\n");
    const { client, state } = makeVaultStub({
      createResult: { uid: "cmp_acme_new", slug: "acme" },
      provisionResult: { bucketName: "bkt-acme", kmsKeyId: "kms-acme" },
    });

    await promoteLocalCompany({
      hqRoot,
      slug: "acme",
      vaultClient: client,
    });

    expect(state.create).toHaveBeenCalledWith({
      type: "company",
      slug: "acme",
      name: "acme",
    });
  });

  it("creates a fresh company.yaml when none exists on disk", async () => {
    // Slug is promoted without a pre-existing company dir.
    const { client } = makeVaultStub({
      createResult: { uid: "cmp_fresh", slug: "fresh" },
      provisionResult: { bucketName: "bkt-fresh", kmsKeyId: "kms-fresh" },
    });
    // Pre-create the dir (installer normally would) but NOT the yaml.
    await mkdir(path.join(companiesDir, "fresh"), { recursive: true });

    const result = await promoteLocalCompany({
      hqRoot,
      slug: "fresh",
      vaultClient: client,
      displayName: "Fresh Co",
    });

    expect(result).toEqual({ uid: "cmp_fresh", bucketName: "bkt-fresh" });
    const written = await readFile(
      path.join(companiesDir, "fresh", "company.yaml"),
      "utf-8",
    );
    expect(written).toContain("slug: fresh");
    expect(written).toContain("cloud: true");
    expect(written).toContain("cloudCompanyUid: cmp_fresh");
    // No stray .tmp left behind
    const dirContents = await readdir(path.join(companiesDir, "fresh"));
    expect(dirContents).toEqual(["company.yaml"]);
  });

  it("treats err.name === 'VaultNotFoundError' as not-found (lenient check)", async () => {
    await writeCompanyDir("acme", "name: Acme\nslug: acme\n");
    // Stub throws a plain Error whose name matches — mirrors how some tests
    // mock the SDK (see packages/hq-onboarding tests).
    const findBySlug = vi.fn(async () => {
      throw Object.assign(new Error("not found"), {
        name: "VaultNotFoundError",
      });
    });
    const create = vi.fn(async (input: CreateEntityInput) => ({
      uid: "cmp_acme_new",
      type: input.type,
      slug: input.slug,
      name: input.name,
      status: "active",
    })) as unknown as CompanyPromoteVaultClient["entity"]["create"];
    const provisionBucket = vi.fn(async () => ({
      bucketName: "bkt-acme",
      kmsKeyId: "kms-acme",
    }));
    const get = vi.fn();
    const client: CompanyPromoteVaultClient = {
      provisionBucket,
      entity: { findBySlug, create, get },
    };

    const result = await promoteLocalCompany({
      hqRoot,
      slug: "acme",
      vaultClient: client,
    });
    expect(result.uid).toBe("cmp_acme_new");
    expect(create).toHaveBeenCalled();
  });

  it("rejects when slug is empty", async () => {
    const { client } = makeVaultStub({});
    await expect(
      promoteLocalCompany({ hqRoot, slug: "", vaultClient: client }),
    ).rejects.toThrow(/slug is required/);
  });
});
