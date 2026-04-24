/**
 * company-discovery unit tests (US-003).
 *
 * Uses a tmp HQ root on real disk (the module only does `readdir` + `readFile`
 * which are too trivial to be worth mocking — a tmp dir keeps the tests
 * honest about the yaml parser + path shape). Vault is stubbed by a minimal
 * `CompanyDiscoveryVaultClient` shape rather than a full VaultClient — same
 * pattern `sync-runner.test.ts` uses for `VaultClientSurface`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { listAllCompanies } from "./company-discovery.js";
import type { CompanyDiscoveryVaultClient } from "./company-discovery.js";
import type { Membership, EntityInfo } from "../vault-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturingStderr {
  write: (chunk: string) => boolean;
  raw: () => string;
}

function makeStderr(): CapturingStderr {
  let buf = "";
  return {
    write: (chunk: string) => {
      buf += chunk;
      return true;
    },
    raw: () => buf,
  };
}

/**
 * Minimal vault stub. Mirrors the `makeVaultStub` pattern in
 * `sync-runner.test.ts` but trimmed to the two methods company-discovery
 * actually calls.
 */
function makeVaultStub(
  opts: {
    memberships?: Array<Pick<Membership, "companyUid">>;
    entities?: Record<string, Partial<EntityInfo>>;
    entityGetError?: (uid: string) => Error | null;
  } = {},
): CompanyDiscoveryVaultClient {
  const memberships = opts.memberships ?? [];
  const entities = opts.entities ?? {};
  return {
    listMyMemberships: () => Promise.resolve(memberships as Membership[]),
    entity: {
      get: (uid: string) => {
        const err = opts.entityGetError?.(uid);
        if (err) return Promise.reject(err);
        const e = entities[uid];
        if (!e) {
          // Default — tests that don't care about names just need a slug.
          return Promise.resolve({
            uid,
            slug: uid,
            type: "company",
            status: "active",
          } as EntityInfo);
        }
        return Promise.resolve({
          uid,
          type: "company",
          status: "active",
          slug: uid,
          ...e,
        } as EntityInfo);
      },
    },
  };
}

async function writeCompanyYaml(
  companiesDir: string,
  slug: string,
  fields: {
    name: string;
    slug?: string;
    cloud?: boolean;
    cloudCompanyUid?: string;
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  const dir = path.join(companiesDir, slug);
  await mkdir(dir, { recursive: true });
  const body: string[] = [`name: ${fields.name}`];
  body.push(`slug: ${fields.slug ?? slug}`);
  if (fields.cloud !== undefined) body.push(`cloud: ${fields.cloud}`);
  if (fields.cloudCompanyUid)
    body.push(`cloudCompanyUid: ${fields.cloudCompanyUid}`);
  for (const [k, v] of Object.entries(fields.extra ?? {})) {
    body.push(`${k}: ${JSON.stringify(v)}`);
  }
  await writeFile(path.join(dir, "company.yaml"), body.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// tmp dir lifecycle
// ---------------------------------------------------------------------------

let hqRoot: string;

beforeEach(async () => {
  hqRoot = await mkdtemp(path.join(tmpdir(), "hq-cloud-discovery-"));
});

afterEach(async () => {
  await rm(hqRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("listAllCompanies", () => {
  it("returns [] when hqRoot has no companies/ dir and vault has no memberships", async () => {
    const stderr = makeStderr();
    const result = await listAllCompanies({
      hqRoot,
      vaultClient: makeVaultStub(),
      stderr,
    });
    expect(result).toEqual([]);
    expect(stderr.raw()).toBe("");
  });

  it("returns [] when hqRoot path does not exist at all", async () => {
    const result = await listAllCompanies({
      hqRoot: path.join(hqRoot, "does-not-exist"),
      vaultClient: makeVaultStub(),
    });
    expect(result).toEqual([]);
  });

  it("tags every company as 'local' when vault memberships are empty", async () => {
    const companiesDir = path.join(hqRoot, "companies");
    await writeCompanyYaml(companiesDir, "acme", { name: "Acme" });
    await writeCompanyYaml(companiesDir, "beta", {
      name: "Beta",
      cloud: false,
    });

    const result = await listAllCompanies({
      hqRoot,
      vaultClient: makeVaultStub(),
    });

    // Order is directory-order on disk; don't assume alphabetical. Sort for
    // stable comparison.
    const sorted = [...result].sort((a, b) => a.slug.localeCompare(b.slug));
    expect(sorted).toEqual([
      { slug: "acme", name: "Acme", source: "local" },
      { slug: "beta", name: "Beta", source: "local" },
    ]);
  });

  it("tags every company as 'aws' when hqRoot has no companies but vault has memberships", async () => {
    const vault = makeVaultStub({
      memberships: [{ companyUid: "U-acme" }, { companyUid: "U-beta" }],
      entities: {
        "U-acme": { slug: "acme", name: "Acme Corp" },
        "U-beta": { slug: "beta", name: "Beta Ltd" },
      },
    });

    const result = await listAllCompanies({ hqRoot, vaultClient: vault });
    expect(result).toEqual([
      { slug: "acme", name: "Acme Corp", uid: "U-acme", source: "aws" },
      { slug: "beta", name: "Beta Ltd", uid: "U-beta", source: "aws" },
    ]);
  });

  it("tags matching (uid) entries as 'both' and unmatched on each side as 'local' / 'aws'", async () => {
    // Local: acme (no cloud), beta (cloudCompanyUid=U-beta)
    // AWS:   U-beta (beta), U-gamma (gamma)
    // Expected: acme -> local, beta -> both, gamma -> aws
    const companiesDir = path.join(hqRoot, "companies");
    await writeCompanyYaml(companiesDir, "acme", { name: "Acme" });
    await writeCompanyYaml(companiesDir, "beta", {
      name: "Beta",
      cloud: true,
      cloudCompanyUid: "U-beta",
    });

    const vault = makeVaultStub({
      memberships: [{ companyUid: "U-beta" }, { companyUid: "U-gamma" }],
      entities: {
        "U-beta": { slug: "beta", name: "Beta" },
        "U-gamma": { slug: "gamma", name: "Gamma" },
      },
    });

    const result = await listAllCompanies({ hqRoot, vaultClient: vault });

    // Pull by slug for order-independent assertions.
    const bySlug = new Map(result.map((e) => [e.slug, e]));
    expect(bySlug.get("acme")).toEqual({
      slug: "acme",
      name: "Acme",
      source: "local",
    });
    expect(bySlug.get("beta")).toEqual({
      slug: "beta",
      name: "Beta",
      uid: "U-beta",
      source: "both",
    });
    expect(bySlug.get("gamma")).toEqual({
      slug: "gamma",
      name: "Gamma",
      uid: "U-gamma",
      source: "aws",
    });
    expect(result).toHaveLength(3);
  });

  it("tags conflicting-uid row as 'local' and logs mismatch to stderr", async () => {
    const companiesDir = path.join(hqRoot, "companies");
    await writeCompanyYaml(companiesDir, "acme", {
      name: "Acme",
      cloud: true,
      cloudCompanyUid: "U-old",
    });

    const vault = makeVaultStub({
      memberships: [{ companyUid: "U-new" }],
      entities: {
        "U-new": { slug: "acme", name: "Acme Cloud" },
      },
    });

    const stderr = makeStderr();
    const result = await listAllCompanies({
      hqRoot,
      vaultClient: vault,
      stderr,
    });

    // The local row is tagged 'local' (not 'both') because the uids diverge.
    const local = result.find((e) => e.source === "local");
    expect(local).toEqual({ slug: "acme", name: "Acme", source: "local" });
    // The AWS row is still surfaced separately as 'aws'.
    const aws = result.find((e) => e.source === "aws");
    expect(aws).toEqual({
      slug: "acme",
      name: "Acme Cloud",
      uid: "U-new",
      source: "aws",
    });
    expect(result).toHaveLength(2);

    // stderr captures the anomaly — test is lenient on exact wording but
    // pins on 'uid mismatch' so downstream grep-based monitors still catch it.
    expect(stderr.raw()).toContain("uid mismatch");
    expect(stderr.raw()).toContain("acme");
    expect(stderr.raw()).toContain("U-old");
    expect(stderr.raw()).toContain("U-new");
  });

  it("silently skips dirs without a company.yaml", async () => {
    const companiesDir = path.join(hqRoot, "companies");
    await mkdir(path.join(companiesDir, "stray"), { recursive: true });
    await writeCompanyYaml(companiesDir, "acme", { name: "Acme" });

    const stderr = makeStderr();
    const result = await listAllCompanies({
      hqRoot,
      vaultClient: makeVaultStub(),
      stderr,
    });
    expect(result).toEqual([
      { slug: "acme", name: "Acme", source: "local" },
    ]);
    // No noise on stderr for the benign stray dir.
    expect(stderr.raw()).toBe("");
  });

  it("silently skips dirs whose company.yaml is malformed", async () => {
    const companiesDir = path.join(hqRoot, "companies");
    await mkdir(path.join(companiesDir, "broken"), { recursive: true });
    // Deliberately-broken YAML (unterminated flow mapping).
    await writeFile(
      path.join(companiesDir, "broken", "company.yaml"),
      "name: {broken\n",
    );
    await writeCompanyYaml(companiesDir, "acme", { name: "Acme" });

    const result = await listAllCompanies({
      hqRoot,
      vaultClient: makeVaultStub(),
    });
    expect(result).toEqual([
      { slug: "acme", name: "Acme", source: "local" },
    ]);
  });

  it("skips company.yaml entries missing required fields (name/slug)", async () => {
    const companiesDir = path.join(hqRoot, "companies");
    await mkdir(path.join(companiesDir, "halfbaked"), { recursive: true });
    // Valid yaml but no `slug` — we require both name and slug.
    await writeFile(
      path.join(companiesDir, "halfbaked", "company.yaml"),
      "name: Halfbaked\n",
    );
    await writeCompanyYaml(companiesDir, "acme", { name: "Acme" });

    const result = await listAllCompanies({
      hqRoot,
      vaultClient: makeVaultStub(),
    });
    expect(result).toEqual([
      { slug: "acme", name: "Acme", source: "local" },
    ]);
  });

  it("ignores files (not dirs) that sit directly in companies/", async () => {
    const companiesDir = path.join(hqRoot, "companies");
    await mkdir(companiesDir, { recursive: true });
    await writeFile(path.join(companiesDir, "README.md"), "# hi\n");
    await writeCompanyYaml(companiesDir, "acme", { name: "Acme" });

    const result = await listAllCompanies({
      hqRoot,
      vaultClient: makeVaultStub(),
    });
    expect(result).toEqual([
      { slug: "acme", name: "Acme", source: "local" },
    ]);
  });

  it("degrades to uid-as-slug when entity.get throws for an AWS row", async () => {
    const vault = makeVaultStub({
      memberships: [{ companyUid: "U-ghost" }],
      entityGetError: (uid) =>
        uid === "U-ghost" ? new Error("entity deleted") : null,
    });

    const result = await listAllCompanies({ hqRoot, vaultClient: vault });
    expect(result).toEqual([
      { slug: "U-ghost", name: "U-ghost", uid: "U-ghost", source: "aws" },
    ]);
  });
});
