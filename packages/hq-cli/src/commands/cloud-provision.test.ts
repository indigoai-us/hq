/**
 * Unit tests for `hq cloud provision company <slug>` (cloud-provision.ts).
 *
 * Coverage targets:
 *   - validateSlug — pure validation
 *   - validateManifestAndDir — fs reads against tmp manifest + company dir
 *   - patchManifest — atomic YAML mutation, preserves siblings, idempotent
 *   - writeCompanyConfig — atomic JSON write, creates parent .hq/, idempotent
 *   - createDefaultVaultClient — HTTP surface with mocked global fetch
 *   - provisionCompany — full orchestrator with all dependencies injected
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";

import {
  ProvisionError,
  type ProvisionResult,
  type VaultClient,
  type VaultEntity,
  companyConfigPath,
  companyDirPath,
  createDefaultVaultClient,
  manifestPath,
  patchManifest,
  provisionCompany,
  validateManifestAndDir,
  validateSlug,
  writeCompanyConfig,
} from "./cloud-provision.js";

// ── Test fixtures ────────────────────────────────────────────────────────────

let tmpRoot: string;

function seedManifest(
  root: string,
  companies: Record<string, Record<string, unknown> | null> = {
    indigo: { status: "active" },
  },
): void {
  const mPath = manifestPath(root);
  fs.mkdirSync(path.dirname(mPath), { recursive: true });
  fs.writeFileSync(mPath, yaml.dump({ companies }));
}

function seedCompanyDir(root: string, slug: string): void {
  fs.mkdirSync(companyDirPath(root, slug), { recursive: true });
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hq-cloud-provision-test-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── validateSlug ─────────────────────────────────────────────────────────────

describe("validateSlug", () => {
  it("accepts a valid slug", () => {
    expect(() => validateSlug("indigo")).not.toThrow();
    expect(() => validateSlug("acme-co")).not.toThrow();
    expect(() => validateSlug("acme_co")).not.toThrow();
    expect(() => validateSlug("acme.co")).not.toThrow();
    expect(() => validateSlug("ACME123")).not.toThrow();
  });

  it("rejects an empty slug with code 2", () => {
    expect(() => validateSlug("")).toThrowError(ProvisionError);
    try {
      validateSlug("");
    } catch (e) {
      expect(e).toBeInstanceOf(ProvisionError);
      expect((e as ProvisionError).code).toBe(2);
    }
  });

  it("rejects whitespace-only slug", () => {
    expect(() => validateSlug("   ")).toThrowError(ProvisionError);
  });

  it("rejects slugs with invalid characters", () => {
    expect(() => validateSlug("acme co")).toThrowError(/Invalid slug/);
    expect(() => validateSlug("acme/co")).toThrowError(/Invalid slug/);
    expect(() => validateSlug("acme!")).toThrowError(/Invalid slug/);
    expect(() => validateSlug("acme$co")).toThrowError(/Invalid slug/);
  });

  it('rejects the reserved "personal" slug', () => {
    expect(() => validateSlug("personal")).toThrowError(/reserved/);
    try {
      validateSlug("personal");
    } catch (e) {
      expect((e as ProvisionError).code).toBe(2);
    }
  });
});

// ── validateManifestAndDir ───────────────────────────────────────────────────

describe("validateManifestAndDir", () => {
  it("returns parsed manifest on the happy path", () => {
    seedManifest(tmpRoot, { indigo: { status: "active" } });
    seedCompanyDir(tmpRoot, "indigo");
    const { manifest } = validateManifestAndDir(tmpRoot, "indigo");
    expect(manifest.companies?.indigo).toEqual({ status: "active" });
  });

  it("throws code 2 if manifest.yaml is missing", () => {
    seedCompanyDir(tmpRoot, "indigo");
    try {
      validateManifestAndDir(tmpRoot, "indigo");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProvisionError);
      expect((e as ProvisionError).code).toBe(2);
      expect((e as ProvisionError).message).toMatch(/manifest\.yaml not found/);
    }
  });

  it("throws code 2 if manifest is malformed (no .companies)", () => {
    const mPath = manifestPath(tmpRoot);
    fs.mkdirSync(path.dirname(mPath), { recursive: true });
    fs.writeFileSync(mPath, "not_companies: 'oops'\n");
    seedCompanyDir(tmpRoot, "indigo");
    expect(() => validateManifestAndDir(tmpRoot, "indigo")).toThrowError(
      /malformed/,
    );
  });

  it("throws code 2 if slug is missing from manifest", () => {
    seedManifest(tmpRoot, { other: { status: "active" } });
    seedCompanyDir(tmpRoot, "indigo");
    try {
      validateManifestAndDir(tmpRoot, "indigo");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as ProvisionError).code).toBe(2);
      expect((e as ProvisionError).message).toMatch(/not found under \.companies/);
    }
  });

  it("throws code 2 if company is status: archived", () => {
    seedManifest(tmpRoot, { indigo: { status: "archived" } });
    seedCompanyDir(tmpRoot, "indigo");
    expect(() => validateManifestAndDir(tmpRoot, "indigo")).toThrowError(
      /archived/,
    );
  });

  it("throws code 2 if company directory is missing", () => {
    seedManifest(tmpRoot, { indigo: { status: "active" } });
    // Note: NOT calling seedCompanyDir
    expect(() => validateManifestAndDir(tmpRoot, "indigo")).toThrowError(
      /does not exist/,
    );
  });

  it("accepts a manifest entry that is null (no fields)", () => {
    seedManifest(tmpRoot, { indigo: null });
    seedCompanyDir(tmpRoot, "indigo");
    expect(() => validateManifestAndDir(tmpRoot, "indigo")).not.toThrow();
  });
});

// ── patchManifest ────────────────────────────────────────────────────────────

describe("patchManifest", () => {
  beforeEach(() => {
    seedManifest(tmpRoot, {
      indigo: { status: "active", existing_field: "kept" },
      other: { status: "active", cloud_uid: "cmp_other" },
    });
  });

  it("writes cloud_uid + bucket_name under the target slug", () => {
    patchManifest(tmpRoot, "indigo", "cmp_01H", "hq-vault-cmp-01H");
    const after = yaml.load(
      fs.readFileSync(manifestPath(tmpRoot), "utf-8"),
    ) as { companies: Record<string, Record<string, unknown>> };
    expect(after.companies.indigo.cloud_uid).toBe("cmp_01H");
    expect(after.companies.indigo.bucket_name).toBe("hq-vault-cmp-01H");
  });

  it("preserves sibling fields on the target entry", () => {
    patchManifest(tmpRoot, "indigo", "cmp_01H", "hq-vault-cmp-01H");
    const after = yaml.load(
      fs.readFileSync(manifestPath(tmpRoot), "utf-8"),
    ) as { companies: Record<string, Record<string, unknown>> };
    expect(after.companies.indigo.status).toBe("active");
    expect(after.companies.indigo.existing_field).toBe("kept");
  });

  it("preserves other companies untouched", () => {
    patchManifest(tmpRoot, "indigo", "cmp_01H", "hq-vault-cmp-01H");
    const after = yaml.load(
      fs.readFileSync(manifestPath(tmpRoot), "utf-8"),
    ) as { companies: Record<string, Record<string, unknown>> };
    expect(after.companies.other).toEqual({
      status: "active",
      cloud_uid: "cmp_other",
    });
  });

  it("is idempotent — same inputs produce identical bytes", () => {
    patchManifest(tmpRoot, "indigo", "cmp_01H", "hq-vault-cmp-01H");
    const first = fs.readFileSync(manifestPath(tmpRoot), "utf-8");
    patchManifest(tmpRoot, "indigo", "cmp_01H", "hq-vault-cmp-01H");
    const second = fs.readFileSync(manifestPath(tmpRoot), "utf-8");
    expect(second).toBe(first);
  });

  it("does not leave a .tmp file behind on success", () => {
    patchManifest(tmpRoot, "indigo", "cmp_01H", "hq-vault-cmp-01H");
    const dir = fs.readdirSync(path.dirname(manifestPath(tmpRoot)));
    expect(dir.filter((f) => f.includes(".tmp."))).toEqual([]);
  });

  it("creates the .companies entry if the slug had a null value", () => {
    seedManifest(tmpRoot, { newco: null });
    patchManifest(tmpRoot, "newco", "cmp_NEW", "hq-vault-cmp-NEW");
    const after = yaml.load(
      fs.readFileSync(manifestPath(tmpRoot), "utf-8"),
    ) as { companies: Record<string, Record<string, unknown>> };
    expect(after.companies.newco).toEqual({
      cloud_uid: "cmp_NEW",
      bucket_name: "hq-vault-cmp-NEW",
    });
  });
});

// ── writeCompanyConfig ───────────────────────────────────────────────────────

describe("writeCompanyConfig", () => {
  beforeEach(() => {
    seedCompanyDir(tmpRoot, "indigo");
  });

  it("writes valid JSON with all four fields", () => {
    writeCompanyConfig(tmpRoot, "indigo", {
      companyUid: "cmp_01H",
      companySlug: "indigo",
      bucketName: "hq-vault-cmp-01H",
      vaultApiUrl: "https://vault.example.com",
    });
    const cPath = companyConfigPath(tmpRoot, "indigo");
    const parsed = JSON.parse(fs.readFileSync(cPath, "utf-8"));
    expect(parsed).toEqual({
      companyUid: "cmp_01H",
      companySlug: "indigo",
      bucketName: "hq-vault-cmp-01H",
      vaultApiUrl: "https://vault.example.com",
    });
  });

  it("creates the parent .hq/ directory if missing", () => {
    const hqDir = path.join(companyDirPath(tmpRoot, "indigo"), ".hq");
    expect(fs.existsSync(hqDir)).toBe(false);
    writeCompanyConfig(tmpRoot, "indigo", {
      companyUid: "cmp_01H",
      companySlug: "indigo",
      bucketName: "b",
      vaultApiUrl: "u",
    });
    expect(fs.existsSync(hqDir)).toBe(true);
  });

  it("is idempotent — same inputs produce identical bytes", () => {
    const config = {
      companyUid: "cmp_01H",
      companySlug: "indigo",
      bucketName: "b",
      vaultApiUrl: "u",
    };
    writeCompanyConfig(tmpRoot, "indigo", config);
    const first = fs.readFileSync(companyConfigPath(tmpRoot, "indigo"), "utf-8");
    writeCompanyConfig(tmpRoot, "indigo", config);
    const second = fs.readFileSync(companyConfigPath(tmpRoot, "indigo"), "utf-8");
    expect(second).toBe(first);
  });

  it("does not leave a .tmp file behind on success", () => {
    writeCompanyConfig(tmpRoot, "indigo", {
      companyUid: "cmp_01H",
      companySlug: "indigo",
      bucketName: "b",
      vaultApiUrl: "u",
    });
    const hqDir = path.join(companyDirPath(tmpRoot, "indigo"), ".hq");
    const entries = fs.readdirSync(hqDir);
    expect(entries.filter((f) => f.includes(".tmp."))).toEqual([]);
  });
});

// ── createDefaultVaultClient ─────────────────────────────────────────────────

describe("createDefaultVaultClient", () => {
  const apiUrl = "https://vault.example.com";
  const token = "test-token";

  it("findCompanyBySlug returns the entity on 200", async () => {
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      bucketName: "hq-vault-cmp-01H",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ entity }), { status: 200 }),
    );
    const client = createDefaultVaultClient(apiUrl, token);
    const out = await client.findCompanyBySlug("indigo");
    expect(out).toEqual(entity);
  });

  it("findCompanyBySlug returns null on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not found", { status: 404 }),
    );
    const client = createDefaultVaultClient(apiUrl, token);
    expect(await client.findCompanyBySlug("missing")).toBeNull();
  });

  it("findCompanyBySlug throws ProvisionError code 1 on 500", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("kaboom", { status: 500, statusText: "Server Error" }),
    );
    const client = createDefaultVaultClient(apiUrl, token);
    try {
      await client.findCompanyBySlug("indigo");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProvisionError);
      expect((e as ProvisionError).code).toBe(1);
      expect((e as ProvisionError).message).toMatch(/500/);
    }
  });

  it("findCompanyBySlug throws code 1 if 200 has no entity body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const client = createDefaultVaultClient(apiUrl, token);
    await expect(client.findCompanyBySlug("indigo")).rejects.toThrowError(
      /no entity body/,
    );
  });

  it("createCompanyEntity returns the entity on 201", async () => {
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      bucketName: "hq-vault-cmp-01H",
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entity }), { status: 201 }),
      );
    const client = createDefaultVaultClient(apiUrl, token);
    const out = await client.createCompanyEntity({
      slug: "indigo",
      name: "Indigo",
    });
    expect(out).toEqual(entity);
    // Verify request shape
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe(`${apiUrl}/v1/entities`);
    expect((call[1] as RequestInit)?.method).toBe("POST");
    const body = JSON.parse(((call[1] as RequestInit)?.body as string) ?? "{}");
    expect(body).toEqual({ type: "company", slug: "indigo", name: "Indigo" });
  });

  it("createCompanyEntity throws code 1 on 409 conflict", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("conflict", { status: 409, statusText: "Conflict" }),
    );
    const client = createDefaultVaultClient(apiUrl, token);
    try {
      await client.createCompanyEntity({ slug: "indigo", name: "Indigo" });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as ProvisionError).code).toBe(1);
      expect((e as ProvisionError).message).toMatch(/409/);
    }
  });

  it("createCompanyEntity sends ownerUid when provided", async () => {
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      bucketName: "b",
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entity }), { status: 201 }),
      );
    const client = createDefaultVaultClient(apiUrl, token);
    await client.createCompanyEntity({
      slug: "indigo",
      name: "Indigo",
      ownerUid: "person_01H",
    });
    const body = JSON.parse(
      ((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body as string) ?? "{}",
    );
    expect(body.ownerUid).toBe("person_01H");
  });
});

// ── provisionCompany (orchestrator) ──────────────────────────────────────────

describe("provisionCompany", () => {
  const vaultApiUrl = "https://vault.example.com";
  const accessToken = "test-token";

  function setupValid(): void {
    seedManifest(tmpRoot, { indigo: { status: "active" } });
    seedCompanyDir(tmpRoot, "indigo");
  }

  function makeVaultClient(overrides: Partial<VaultClient> = {}): VaultClient {
    return {
      findCompanyBySlug: vi.fn().mockResolvedValue(null),
      createCompanyEntity: vi.fn(),
      ...overrides,
    };
  }

  it("happy path — entity not found → POST → manifest + config + sync", async () => {
    setupValid();
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      bucketName: "hq-vault-cmp-01H",
      kmsKeyId: "key-123",
    };
    const vaultClient = makeVaultClient({
      findCompanyBySlug: vi.fn().mockResolvedValue(null),
      createCompanyEntity: vi.fn().mockResolvedValue(entity),
    });
    const runInitialSync = vi
      .fn()
      .mockResolvedValue({ filesUploaded: 7, bytesUploaded: 1024 });

    const result = await provisionCompany({
      slug: "indigo",
      name: "Indigo",
      hqRoot: tmpRoot,
      vaultApiUrl,
      vaultClient,
      resolveAccessToken: async () => accessToken,
      runInitialSync,
      log: () => {},
    });

    expect(result).toEqual<ProvisionResult>({
      ok: true,
      company_slug: "indigo",
      cloud_uid: "cmp_01H",
      bucket_name: "hq-vault-cmp-01H",
      vault_api_url: vaultApiUrl,
      kms_key_id: "key-123",
      created_entity: true,
      manifest_patched: true,
      config_written: true,
      initial_sync: { ok: true, files_uploaded: 7, bytes_uploaded: 1024 },
    });
    // Manifest was actually patched on disk
    const m = yaml.load(fs.readFileSync(manifestPath(tmpRoot), "utf-8")) as {
      companies: Record<string, Record<string, unknown>>;
    };
    expect(m.companies.indigo.cloud_uid).toBe("cmp_01H");
    expect(m.companies.indigo.bucket_name).toBe("hq-vault-cmp-01H");
    // Config was written
    const c = JSON.parse(
      fs.readFileSync(companyConfigPath(tmpRoot, "indigo"), "utf-8"),
    );
    expect(c.companyUid).toBe("cmp_01H");
    // POST happened
    expect(vaultClient.createCompanyEntity).toHaveBeenCalledOnce();
  });

  it("idempotent path — entity found → no POST → still patches + syncs → created_entity=false", async () => {
    setupValid();
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      bucketName: "hq-vault-cmp-01H",
      kmsKeyId: null,
    };
    const vaultClient = makeVaultClient({
      findCompanyBySlug: vi.fn().mockResolvedValue(entity),
      createCompanyEntity: vi.fn(),
    });
    const result = await provisionCompany({
      slug: "indigo",
      hqRoot: tmpRoot,
      vaultApiUrl,
      vaultClient,
      resolveAccessToken: async () => accessToken,
      runInitialSync: async () => ({ filesUploaded: 0, bytesUploaded: 0 }),
      log: () => {},
    });
    expect(result.created_entity).toBe(false);
    expect(result.kms_key_id).toBeNull();
    expect(vaultClient.createCompanyEntity).not.toHaveBeenCalled();
  });

  it("throws code 1 when entity has no bucketName (incomplete provisioning)", async () => {
    setupValid();
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      // bucketName intentionally absent
    };
    const vaultClient = makeVaultClient({
      findCompanyBySlug: vi.fn().mockResolvedValue(entity),
    });
    try {
      await provisionCompany({
        slug: "indigo",
        hqRoot: tmpRoot,
        vaultApiUrl,
        vaultClient,
        resolveAccessToken: async () => accessToken,
        runInitialSync: async () => ({ filesUploaded: 0, bytesUploaded: 0 }),
        log: () => {},
      });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProvisionError);
      expect((e as ProvisionError).code).toBe(1);
      expect((e as ProvisionError).partial?.cloud_uid).toBe("cmp_01H");
      expect((e as ProvisionError).partial?.manifest_patched).toBe(false);
    }
  });

  it("throws code 3 when initial sync fails — manifest + config STILL written", async () => {
    setupValid();
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      bucketName: "hq-vault-cmp-01H",
    };
    const vaultClient = makeVaultClient({
      findCompanyBySlug: vi.fn().mockResolvedValue(null),
      createCompanyEntity: vi.fn().mockResolvedValue(entity),
    });
    const runInitialSync = vi
      .fn()
      .mockRejectedValue(new Error("S3 timeout"));

    try {
      await provisionCompany({
        slug: "indigo",
        hqRoot: tmpRoot,
        vaultApiUrl,
        vaultClient,
        resolveAccessToken: async () => accessToken,
        runInitialSync,
        log: () => {},
      });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProvisionError);
      expect((e as ProvisionError).code).toBe(3);
      expect((e as ProvisionError).partial?.manifest_patched).toBe(true);
      expect((e as ProvisionError).partial?.config_written).toBe(true);
      expect((e as ProvisionError).partial?.initial_sync?.ok).toBe(false);
      expect((e as ProvisionError).partial?.initial_sync?.error).toMatch(
        /S3 timeout/,
      );
    }
    // Manifest WAS written despite the sync failure (matches partial=true)
    const m = yaml.load(fs.readFileSync(manifestPath(tmpRoot), "utf-8")) as {
      companies: Record<string, Record<string, unknown>>;
    };
    expect(m.companies.indigo.cloud_uid).toBe("cmp_01H");
  });

  it("throws code 2 on invalid slug before any vault call", async () => {
    seedCompanyDir(tmpRoot, "indigo"); // dir exists but slug is invalid
    const vaultClient = makeVaultClient();
    try {
      await provisionCompany({
        slug: "personal",
        hqRoot: tmpRoot,
        vaultApiUrl,
        vaultClient,
        resolveAccessToken: async () => accessToken,
        runInitialSync: async () => ({ filesUploaded: 0, bytesUploaded: 0 }),
        log: () => {},
      });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as ProvisionError).code).toBe(2);
      expect(vaultClient.findCompanyBySlug).not.toHaveBeenCalled();
    }
  });

  it("uses slug as the entity name when --name is omitted", async () => {
    setupValid();
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "indigo",
      bucketName: "b",
    };
    const createSpy = vi.fn().mockResolvedValue(entity);
    const vaultClient = makeVaultClient({
      findCompanyBySlug: vi.fn().mockResolvedValue(null),
      createCompanyEntity: createSpy,
    });
    await provisionCompany({
      slug: "indigo",
      // name omitted on purpose
      hqRoot: tmpRoot,
      vaultApiUrl,
      vaultClient,
      resolveAccessToken: async () => accessToken,
      runInitialSync: async () => ({ filesUploaded: 0, bytesUploaded: 0 }),
      log: () => {},
    });
    expect(createSpy).toHaveBeenCalledWith({
      slug: "indigo",
      name: "indigo",
      ownerUid: undefined,
    });
  });

  it("skipInitialSync=true — runner is NOT called; result has initial_sync.skipped", async () => {
    setupValid();
    const entity: VaultEntity = {
      uid: "cmp_01H",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      bucketName: "hq-vault-cmp-01H",
    };
    const vaultClient = makeVaultClient({
      findCompanyBySlug: vi.fn().mockResolvedValue(null),
      createCompanyEntity: vi.fn().mockResolvedValue(entity),
    });
    const runInitialSync = vi.fn();

    const result = await provisionCompany({
      slug: "indigo",
      hqRoot: tmpRoot,
      vaultApiUrl,
      vaultClient,
      resolveAccessToken: async () => accessToken,
      runInitialSync,
      skipInitialSync: true,
      log: () => {},
    });

    expect(runInitialSync).not.toHaveBeenCalled();
    expect(result.initial_sync).toEqual({ skipped: true });
    expect(result.ok).toBe(true);
    expect(result.cloud_uid).toBe("cmp_01H");
    expect(result.manifest_patched).toBe(true);
    expect(result.config_written).toBe(true);
  });

  it("skipInitialSync=true — manifest + .hq/config.json are STILL written", async () => {
    setupValid();
    const entity: VaultEntity = {
      uid: "cmp_SKIP",
      type: "company",
      slug: "indigo",
      name: "Indigo",
      bucketName: "hq-vault-cmp-SKIP",
    };
    const vaultClient = makeVaultClient({
      findCompanyBySlug: vi.fn().mockResolvedValue(null),
      createCompanyEntity: vi.fn().mockResolvedValue(entity),
    });
    await provisionCompany({
      slug: "indigo",
      hqRoot: tmpRoot,
      vaultApiUrl,
      vaultClient,
      resolveAccessToken: async () => accessToken,
      runInitialSync: vi.fn(),
      skipInitialSync: true,
      log: () => {},
    });
    // Manifest patched on disk
    const m = yaml.load(fs.readFileSync(manifestPath(tmpRoot), "utf-8")) as {
      companies: Record<string, Record<string, unknown>>;
    };
    expect(m.companies.indigo.cloud_uid).toBe("cmp_SKIP");
    expect(m.companies.indigo.bucket_name).toBe("hq-vault-cmp-SKIP");
    // .hq/config.json written
    const c = JSON.parse(
      fs.readFileSync(companyConfigPath(tmpRoot, "indigo"), "utf-8"),
    );
    expect(c.companyUid).toBe("cmp_SKIP");
    expect(c.bucketName).toBe("hq-vault-cmp-SKIP");
  });
});
