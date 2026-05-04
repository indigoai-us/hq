/**
 * Unit tests for `hq cloud demote company <slug>` (cloud-demote.ts).
 *
 * Mirrors the cloud-provision test layout: tmp HQ root per test, helpers
 * seed manifests + company yaml + .hq/config.json, then the orchestrator
 * runs with an injected `findCompanyBySlug`.
 *
 * Coverage:
 *   - flipCompanyYamlCloudOff — atomic mutation, preserves other keys
 *   - stripManifestCloudForSlug — removes cloud_uid + bucket_name only
 *   - demoteCompany — full orchestrator (verify + side-effects + JSON shape)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as yaml from "js-yaml";

import {
  ProvisionError,
  manifestPath,
  companyDirPath,
  companyConfigPath,
  type VaultEntity,
} from "./cloud-provision.js";
import {
  demoteCompany,
  flipCompanyYamlCloudOff,
  stripManifestCloudForSlug,
  type DemoteResult,
} from "./cloud-demote.js";

// ── Test fixtures ────────────────────────────────────────────────────────────

let tmpRoot: string;

function seedManifest(
  root: string,
  companies: Record<string, Record<string, unknown> | null> = {
    acme: {
      name: "Acme",
      cloud_uid: "cmp_old",
      bucket_name: "hq-vault-cmp-old",
      status: "active",
    },
  },
): void {
  const mPath = manifestPath(root);
  fs.mkdirSync(path.dirname(mPath), { recursive: true });
  fs.writeFileSync(mPath, yaml.dump({ companies }));
}

function seedCompanyDir(root: string, slug: string, yamlBody?: string): void {
  const dir = companyDirPath(root, slug);
  fs.mkdirSync(dir, { recursive: true });
  if (yamlBody !== undefined) {
    fs.writeFileSync(path.join(dir, "company.yaml"), yamlBody);
  }
}

function seedCompanyConfig(root: string, slug: string): void {
  const cPath = companyConfigPath(root, slug);
  fs.mkdirSync(path.dirname(cPath), { recursive: true });
  fs.writeFileSync(
    cPath,
    JSON.stringify(
      {
        companyUid: "cmp_old",
        companySlug: slug,
        bucketName: "hq-vault-cmp-old",
        vaultApiUrl: "https://v",
      },
      null,
      2,
    ),
  );
}

function readManifest(root: string): { companies?: Record<string, unknown> } {
  return yaml.load(fs.readFileSync(manifestPath(root), "utf-8")) as {
    companies?: Record<string, unknown>;
  };
}

function readCompanyYaml(root: string, slug: string): Record<string, unknown> {
  return yaml.load(
    fs.readFileSync(path.join(companyDirPath(root, slug), "company.yaml"), "utf-8"),
  ) as Record<string, unknown>;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hq-demote-test-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── flipCompanyYamlCloudOff ──────────────────────────────────────────────────

describe("flipCompanyYamlCloudOff", () => {
  it("flips cloud: true → false and preserves other keys", () => {
    seedCompanyDir(tmpRoot, "acme", "cloud: true\nname: Acme\nfoo: bar\n");
    const changed = flipCompanyYamlCloudOff(tmpRoot, "acme");
    expect(changed).toBe(true);
    const after = readCompanyYaml(tmpRoot, "acme");
    expect(after.cloud).toBe(false);
    expect(after.name).toBe("Acme");
    expect(after.foo).toBe("bar");
  });

  it("is idempotent when cloud is already false", () => {
    seedCompanyDir(tmpRoot, "acme", "cloud: false\nname: Acme\n");
    const changed = flipCompanyYamlCloudOff(tmpRoot, "acme");
    expect(changed).toBe(false);
    expect(readCompanyYaml(tmpRoot, "acme").cloud).toBe(false);
  });

  it("inserts cloud: false when the field is missing", () => {
    seedCompanyDir(tmpRoot, "acme", "name: Acme\n");
    const changed = flipCompanyYamlCloudOff(tmpRoot, "acme");
    expect(changed).toBe(true);
    expect(readCompanyYaml(tmpRoot, "acme").cloud).toBe(false);
  });

  it("returns false when company.yaml does not exist", () => {
    seedCompanyDir(tmpRoot, "acme"); // no yaml
    const changed = flipCompanyYamlCloudOff(tmpRoot, "acme");
    expect(changed).toBe(false);
  });

  it("does not leave a .tmp file behind on success", () => {
    seedCompanyDir(tmpRoot, "acme", "cloud: true\n");
    flipCompanyYamlCloudOff(tmpRoot, "acme");
    const dir = companyDirPath(tmpRoot, "acme");
    const tmps = fs.readdirSync(dir).filter((f) => f.includes(".tmp."));
    expect(tmps).toEqual([]);
  });
});

// ── stripManifestCloudForSlug ────────────────────────────────────────────────

describe("stripManifestCloudForSlug", () => {
  it("removes cloud_uid + bucket_name from the slug entry", () => {
    seedManifest(tmpRoot);
    const changed = stripManifestCloudForSlug(tmpRoot, "acme");
    expect(changed).toBe(true);
    const m = readManifest(tmpRoot);
    const entry = m.companies?.acme as Record<string, unknown>;
    expect(entry.cloud_uid).toBeUndefined();
    expect(entry.bucket_name).toBeUndefined();
    // Other fields preserved.
    expect(entry.name).toBe("Acme");
    expect(entry.status).toBe("active");
  });

  it("preserves other companies untouched", () => {
    seedManifest(tmpRoot, {
      acme: { cloud_uid: "cmp_a", bucket_name: "b-a" },
      voyage: { cloud_uid: "cmp_v", bucket_name: "b-v" },
    });
    stripManifestCloudForSlug(tmpRoot, "acme");
    const m = readManifest(tmpRoot);
    const voyage = m.companies?.voyage as Record<string, unknown>;
    expect(voyage.cloud_uid).toBe("cmp_v");
    expect(voyage.bucket_name).toBe("b-v");
  });

  it("is idempotent — second call reports no change", () => {
    seedManifest(tmpRoot, { acme: { name: "Acme" } });
    expect(stripManifestCloudForSlug(tmpRoot, "acme")).toBe(false);
  });

  it("returns false when the manifest does not exist", () => {
    // No seed.
    expect(stripManifestCloudForSlug(tmpRoot, "acme")).toBe(false);
  });

  it("returns false when the slug is missing from the manifest", () => {
    seedManifest(tmpRoot, { other: { cloud_uid: "x" } });
    expect(stripManifestCloudForSlug(tmpRoot, "acme")).toBe(false);
  });
});

// ── demoteCompany orchestrator ───────────────────────────────────────────────

function tombstonedEntity(slug: string): VaultEntity {
  return {
    uid: "cmp_old",
    type: "company",
    slug,
    name: slug,
    bucketName: "hq-vault-cmp-old",
    status: "active",
    // @ts-expect-error — `deleted` is added on hq-pro side; VaultEntity
    // doesn't declare it, but the verify path reads it dynamically.
    deleted: true,
  };
}

function liveEntity(slug: string): VaultEntity {
  return {
    uid: "cmp_old",
    type: "company",
    slug,
    name: slug,
    bucketName: "hq-vault-cmp-old",
    status: "active",
  };
}

describe("demoteCompany — happy path", () => {
  it("removes config, flips yaml, strips manifest, returns full result", async () => {
    seedManifest(tmpRoot);
    seedCompanyDir(tmpRoot, "acme", "cloud: true\nname: Acme\n");
    seedCompanyConfig(tmpRoot, "acme");

    const result: DemoteResult = await demoteCompany({
      slug: "acme",
      hqRoot: tmpRoot,
      vaultApiUrl: "https://v",
      vaultClient: {
        findCompanyBySlug: async () => tombstonedEntity("acme"),
        // unused on the demote path, but the type requires it
        createCompanyEntity: async () => {
          throw new Error("must not call createCompanyEntity from demote");
        },
      },
      resolveAccessToken: async () => "tok",
    });

    expect(result).toEqual<DemoteResult>({
      ok: true,
      company_slug: "acme",
      config_removed: true,
      yaml_flipped: true,
      manifest_stripped: true,
      cloud_was_deleted: true,
    });

    // Side-effects landed.
    expect(fs.existsSync(companyConfigPath(tmpRoot, "acme"))).toBe(false);
    expect(readCompanyYaml(tmpRoot, "acme").cloud).toBe(false);
    const entry = readManifest(tmpRoot).companies?.acme as Record<string, unknown>;
    expect(entry.cloud_uid).toBeUndefined();
    expect(entry.bucket_name).toBeUndefined();
  });

  it("is idempotent — re-running on an already-demoted company is a no-op", async () => {
    // Already in post-demote state.
    seedManifest(tmpRoot, { acme: { name: "Acme" } });
    seedCompanyDir(tmpRoot, "acme", "cloud: false\nname: Acme\n");

    const result = await demoteCompany({
      slug: "acme",
      hqRoot: tmpRoot,
      vaultApiUrl: "https://v",
      vaultClient: {
        findCompanyBySlug: async () => tombstonedEntity("acme"),
        createCompanyEntity: async () => {
          throw new Error("unused");
        },
      },
      resolveAccessToken: async () => "tok",
    });

    expect(result.ok).toBe(true);
    expect(result.config_removed).toBe(false);
    expect(result.yaml_flipped).toBe(false);
    expect(result.manifest_stripped).toBe(false);
  });
});

describe("demoteCompany — safety check", () => {
  it("refuses to demote when the cloud entity is NOT deleted (no --force)", async () => {
    seedManifest(tmpRoot);
    seedCompanyDir(tmpRoot, "acme", "cloud: true\nname: Acme\n");
    seedCompanyConfig(tmpRoot, "acme");

    await expect(
      demoteCompany({
        slug: "acme",
        hqRoot: tmpRoot,
        vaultApiUrl: "https://v",
        vaultClient: {
          findCompanyBySlug: async () => liveEntity("acme"),
          createCompanyEntity: async () => {
            throw new Error("unused");
          },
        },
        resolveAccessToken: async () => "tok",
      }),
    ).rejects.toMatchObject({
      code: 2,
      message: expect.stringMatching(/not.*deleted/i),
    });

    // No side-effects.
    expect(fs.existsSync(companyConfigPath(tmpRoot, "acme"))).toBe(true);
    expect(readCompanyYaml(tmpRoot, "acme").cloud).toBe(true);
  });

  it("refuses to demote when the cloud entity does not exist (no --force)", async () => {
    seedManifest(tmpRoot);
    seedCompanyDir(tmpRoot, "acme", "cloud: true\nname: Acme\n");
    seedCompanyConfig(tmpRoot, "acme");

    await expect(
      demoteCompany({
        slug: "acme",
        hqRoot: tmpRoot,
        vaultApiUrl: "https://v",
        vaultClient: {
          findCompanyBySlug: async () => null,
          createCompanyEntity: async () => {
            throw new Error("unused");
          },
        },
        resolveAccessToken: async () => "tok",
      }),
    ).rejects.toMatchObject({ code: 2 });
  });

  it("--force skips the verify and demotes anyway, recording cloud_was_deleted=null", async () => {
    seedManifest(tmpRoot);
    seedCompanyDir(tmpRoot, "acme", "cloud: true\nname: Acme\n");
    seedCompanyConfig(tmpRoot, "acme");

    const find = vi.fn(async () => liveEntity("acme"));
    const result = await demoteCompany({
      slug: "acme",
      hqRoot: tmpRoot,
      vaultApiUrl: "https://v",
      force: true,
      vaultClient: {
        findCompanyBySlug: find,
        createCompanyEntity: async () => {
          throw new Error("unused");
        },
      },
      resolveAccessToken: async () => "tok",
    });

    expect(result.ok).toBe(true);
    expect(result.cloud_was_deleted).toBeNull();
    // --force MUST skip the network call entirely.
    expect(find).not.toHaveBeenCalled();
  });

  it("validateSlug rejects bad slugs with code 2", async () => {
    await expect(
      demoteCompany({
        slug: "personal", // reserved
        hqRoot: tmpRoot,
        vaultApiUrl: "https://v",
        force: true,
        vaultClient: {
          findCompanyBySlug: async () => null,
          createCompanyEntity: async () => {
            throw new Error("unused");
          },
        },
        resolveAccessToken: async () => "tok",
      }),
    ).rejects.toBeInstanceOf(ProvisionError);
  });

  it("--force on a slug missing from the manifest throws code 2 (no silent no-op)", async () => {
    seedManifest(tmpRoot, { other: { name: "Other" } });
    seedCompanyDir(tmpRoot, "acme", "cloud: true\n");
    await expect(
      demoteCompany({
        slug: "acme",
        hqRoot: tmpRoot,
        vaultApiUrl: "https://v",
        force: true,
      }),
    ).rejects.toMatchObject({
      code: 2,
      message: expect.stringMatching(/not found.*manifest/i),
    });
  });

  it("--force when company directory is missing throws code 2 (no silent no-op)", async () => {
    seedManifest(tmpRoot); // seeds acme entry
    // No seedCompanyDir — directory is missing.
    await expect(
      demoteCompany({
        slug: "acme",
        hqRoot: tmpRoot,
        vaultApiUrl: "https://v",
        force: true,
      }),
    ).rejects.toMatchObject({
      code: 2,
      message: expect.stringMatching(/does not exist/i),
    });
  });
});
