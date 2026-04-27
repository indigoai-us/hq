/**
 * Unit tests for hq sync command (VLT-5 US-002).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { clearContextCache } from "../context.js";
import type { VaultServiceConfig } from "../types.js";

// Mock s3 module at the top level
vi.mock("../s3.js", async () => {
  const { vi: innerVi } = await import("vitest");
  const innerFs = await import("fs");
  const innerPath = await import("path");

  const remoteFiles = [
    { key: "docs/handoff.md", size: 42, lastModified: new Date(), etag: '"abc123"' },
    { key: "knowledge/readme.md", size: 100, lastModified: new Date(), etag: '"def456"' },
  ];

  return {
    uploadFile: innerVi.fn().mockResolvedValue({ versionId: "vMOCK" }),
    downloadFile: innerVi.fn().mockImplementation(async (_ctx: unknown, _key: string, localPath: string) => {
      const dir = innerPath.dirname(localPath);
      if (!innerFs.existsSync(dir)) innerFs.mkdirSync(dir, { recursive: true });
      innerFs.writeFileSync(localPath, "mock file content");
      return { versionId: "vMOCK" };
    }),
    downloadFileBytes: innerVi.fn().mockResolvedValue({
      bytes: Buffer.from("mock cloud content"),
      versionId: "vMOCK",
    }),
    listRemoteFiles: innerVi.fn().mockResolvedValue(remoteFiles),
    listObjectVersions: innerVi.fn().mockResolvedValue([]),
    deleteRemoteFile: innerVi.fn().mockResolvedValue(undefined),
    headRemoteFile: innerVi.fn().mockResolvedValue(null),
    isPreconditionFailed: innerVi.fn().mockReturnValue(false),
  };
});

import { sync } from "./sync.js";
import * as s3Module from "../s3.js";
import {
  downloadFileBytes,
  headRemoteFile,
  listObjectVersions,
} from "../s3.js";

const mockConfig: VaultServiceConfig = {
  apiUrl: "https://vault-api.test",
  authToken: "test-jwt-token",
  region: "us-east-1",
};

const mockEntity = {
  uid: "cmp_01ABCDEF",
  slug: "acme",
  bucketName: "hq-vault-acme-123",
  status: "active",
};

const mockVendResponse = {
  credentials: {
    accessKeyId: "ASIA_TEST_KEY",
    secretAccessKey: "test-secret",
    sessionToken: "test-session-token",
    expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  },
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
};

function setupFetchMock() {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const urlStr = String(url);
    if (urlStr.includes("/entity/by-slug/") || /\/entity\/cmp_/.test(urlStr)) {
      return { ok: true, status: 200, json: async () => ({ entity: mockEntity }), text: async () => "" };
    }
    if (urlStr.includes("/sts/vend")) {
      return { ok: true, status: 200, json: async () => mockVendResponse, text: async () => "" };
    }
    return { ok: false, status: 404, text: async () => "Not found" };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sync", () => {
  let tmpDir: string;
  let stateDir: string;
  let journalPath: string;

  beforeEach(() => {
    clearContextCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-sync-test-"));
    // Journal moved to ~/.hq/sync-journal.{slug}.json (ADR-0001 Phase 5).
    // Redirect to a tmp dir via HQ_STATE_DIR so the test doesn't pollute the
    // user's real ~/.hq. mockEntity.slug is "acme".
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-state-test-"));
    process.env.HQ_STATE_DIR = stateDir;
    journalPath = path.join(stateDir, "sync-journal.acme.json");
    setupFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
    delete process.env.HQ_STATE_DIR;
  });

  it("downloads remote files under companies/{slug}/ so two companies don't collide", async () => {
    const result = await sync({
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesDownloaded).toBe(2);
    expect(result.aborted).toBe(false);
    // Scoped under companies/{slug}/
    expect(fs.existsSync(path.join(tmpDir, "companies", "acme", "docs", "handoff.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "companies", "acme", "knowledge", "readme.md"))).toBe(true);
    // NOT at hqRoot (pre-fix behavior would have written here and clobbered across companies)
    expect(fs.existsSync(path.join(tmpDir, "docs", "handoff.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "knowledge", "readme.md"))).toBe(false);
  });

  it("scopes by resolved ctx.slug even when caller passes a UID", async () => {
    // mockEntity.slug is "acme" regardless of the ref used; verify resolved
    // slug drives the local path, not the caller's ref.
    const result = await sync({
      company: "cmp_01ABCDEF",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesDownloaded).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, "companies", "acme", "docs", "handoff.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "companies", "cmp_01ABCDEF", "docs", "handoff.md"))).toBe(false);
  });

  it("throws when no company specified and no active company", async () => {
    await expect(
      sync({ vaultConfig: mockConfig, hqRoot: tmpDir }),
    ).rejects.toThrow(/No company specified/);
  });

  it("uses active company from .hq/config.json", async () => {
    fs.mkdirSync(path.join(tmpDir, ".hq"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".hq", "config.json"),
      JSON.stringify({ activeCompany: "acme" }),
    );

    const result = await sync({ vaultConfig: mockConfig, hqRoot: tmpDir });
    expect(result.filesDownloaded).toBe(2);
  });

  it("detects conflicts with local changes and keeps local on --on-conflict keep", async () => {
    const companyDocs = path.join(tmpDir, "companies", "acme", "docs");
    fs.mkdirSync(companyDocs, { recursive: true });
    fs.writeFileSync(path.join(companyDocs, "handoff.md"), "local version");

    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "docs/handoff.md": {
            hash: "old-hash-from-last-sync",
            size: 20,
            syncedAt: new Date(Date.now() - 3600000).toISOString(),
            direction: "down",
          },
        },
      }),
    );

    const result = await sync({
      company: "acme",
      onConflict: "keep",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.conflicts).toBe(1);
    expect(result.filesSkipped).toBeGreaterThanOrEqual(1);
    expect(fs.readFileSync(path.join(companyDocs, "handoff.md"), "utf-8")).toBe("local version");
  });

  it("aborts on --on-conflict abort", async () => {
    const companyDocs = path.join(tmpDir, "companies", "acme", "docs");
    fs.mkdirSync(companyDocs, { recursive: true });
    fs.writeFileSync(path.join(companyDocs, "handoff.md"), "local version");

    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "docs/handoff.md": {
            hash: "old-hash",
            size: 20,
            syncedAt: new Date(Date.now() - 3600000).toISOString(),
            direction: "down",
          },
        },
      }),
    );

    const result = await sync({
      company: "acme",
      onConflict: "abort",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.aborted).toBe(true);
  });

  it("journalSlug: 'personal' routes journal I/O to sync-journal.personal.json", async () => {
    const result = await sync({
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      journalSlug: "personal",
    });

    expect(result.filesDownloaded).toBe(2);
    // Journal written to personal slug, not ctx.slug ("acme")
    const personalJournalPath = path.join(stateDir, "sync-journal.personal.json");
    expect(fs.existsSync(personalJournalPath)).toBe(true);
    // The acme journal must NOT have been written
    expect(fs.existsSync(journalPath)).toBe(false);
  });

  it("personalMode: true skips companies/* keys and downloads root keys to hqRoot", async () => {
    vi.mocked(s3Module.listRemoteFiles).mockResolvedValueOnce([
      { key: "companies/foo/bar.md", size: 50, lastModified: new Date(), etag: '"xyz789"' },
      { key: "docs/readme.md",       size: 30, lastModified: new Date(), etag: '"abc000"' },
    ]);

    const result = await sync({
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      personalMode: true,
    });

    // Exact counts (regression-tight)
    expect(result.filesSkipped).toBe(1);
    expect(result.filesDownloaded).toBe(1);

    // companies/* must NOT land anywhere
    expect(fs.existsSync(path.join(tmpDir, "companies", "acme", "companies", "foo", "bar.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "companies", "foo", "bar.md"))).toBe(false);

    // docs/readme.md MUST land at <hqRoot>/docs/readme.md (NOT <hqRoot>/companies/<slug>/docs/readme.md)
    expect(fs.existsSync(path.join(tmpDir, "docs", "readme.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "companies", "acme", "docs", "readme.md"))).toBe(false);
  });

  it("overwrites local on --on-conflict overwrite", async () => {
    const companyDocs = path.join(tmpDir, "companies", "acme", "docs");
    fs.mkdirSync(companyDocs, { recursive: true });
    fs.writeFileSync(path.join(companyDocs, "handoff.md"), "local version");

    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "docs/handoff.md": {
            hash: "old-hash",
            size: 20,
            syncedAt: new Date(Date.now() - 3600000).toISOString(),
            direction: "down",
          },
        },
      }),
    );

    const result = await sync({
      company: "acme",
      onConflict: "overwrite",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.conflicts).toBe(1);
    expect(result.filesDownloaded).toBeGreaterThanOrEqual(1);
    // File should be overwritten with mock content
    expect(fs.readFileSync(path.join(companyDocs, "handoff.md"), "utf-8")).toBe("mock file content");
  });

  it("lineage pull divergence writes conflict file, leaves local untouched", async () => {
    const companyDocs = path.join(tmpDir, "companies", "acme", "docs");
    fs.mkdirSync(companyDocs, { recursive: true });
    const localPath = path.join(companyDocs, "handoff.md");
    const localContent = "LOCAL — what was here before sync ran";
    fs.writeFileSync(localPath, localContent);

    const { hashFile } = await import("../journal.js");
    const localHash = hashFile(localPath);

    // Lineage-active journal entry — local hash matches journal hash (no
    // local edits), parent pointer is "vPARENT".
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date(Date.now() - 60_000).toISOString(),
        files: {
          "docs/handoff.md": {
            hash: localHash,
            size: localContent.length,
            syncedAt: new Date(Date.now() - 60_000).toISOString(),
            direction: "down",
            s3VersionId: "vPARENT",
          },
        },
      }),
    );

    // Cloud has advanced past our parent, AND our parent is NOT in the
    // recent version chain → divergence.
    vi.mocked(headRemoteFile).mockResolvedValueOnce({
      lastModified: new Date(Date.now()),
      etag: '"cloud-etag"',
      size: 99,
      versionId: "vCLOUD",
    });
    vi.mocked(listObjectVersions).mockResolvedValueOnce([
      "vCLOUD",
      "vSOMEONE_ELSE",
      // vPARENT is missing — diverged
    ]);
    vi.mocked(downloadFileBytes).mockResolvedValueOnce({
      bytes: Buffer.from("CLOUD — different lineage from another machine"),
      versionId: "vCLOUD",
    });

    const events: Array<{ type: string; path?: string; conflictPath?: string }> = [];
    const result = await sync({
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onEvent: (e) => {
        events.push(
          e.type === "conflict-detected"
            ? { type: e.type, path: e.path, conflictPath: e.conflictPath }
            : { type: e.type, path: e.path },
        );
      },
    });

    // Only one of the two mock remote files conflicts — handoff.md.
    // The other (knowledge/readme.md) has no journal entry → fast-path
    // download.
    expect(result.conflicts).toBe(1);

    // Local handoff.md is preserved exactly — never overwritten.
    expect(fs.readFileSync(localPath, "utf-8")).toBe(localContent);

    // Cloud's bytes landed in a `.conflict-` file.
    const conflictEvent = events.find((e) => e.type === "conflict-detected");
    expect(conflictEvent).toBeDefined();
    const conflictAbs = path.join(tmpDir, conflictEvent!.conflictPath!);
    expect(fs.existsSync(conflictAbs)).toBe(true);
    expect(fs.readFileSync(conflictAbs, "utf-8")).toBe(
      "CLOUD — different lineage from another machine",
    );

    // Index entry recorded.
    const indexPath = path.join(tmpDir, ".hq-conflicts", "index.json");
    const idx = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    expect(idx.conflicts).toHaveLength(1);
    expect(idx.conflicts[0].side).toBe("pull");
    expect(idx.conflicts[0].lastKnownVersionId).toBe("vPARENT");
    expect(idx.conflicts[0].remoteVersionId).toBe("vCLOUD");
  });

  it("lineage pull fast-forward downloads cleanly when parent is in chain", async () => {
    const companyDocs = path.join(tmpDir, "companies", "acme", "docs");
    fs.mkdirSync(companyDocs, { recursive: true });
    const localPath = path.join(companyDocs, "handoff.md");
    const oldLocal = "OLD CONTENT — superseded by cloud";
    fs.writeFileSync(localPath, oldLocal);

    const { hashFile } = await import("../journal.js");
    const localHash = hashFile(localPath);

    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date(Date.now() - 60_000).toISOString(),
        files: {
          "docs/handoff.md": {
            hash: localHash,
            size: oldLocal.length,
            syncedAt: new Date(Date.now() - 60_000).toISOString(),
            direction: "down",
            s3VersionId: "vPARENT",
          },
        },
      }),
    );

    // Cloud advanced, but our parent IS in the version chain → fast-forward.
    vi.mocked(headRemoteFile).mockResolvedValueOnce({
      lastModified: new Date(Date.now()),
      etag: '"cloud-etag"',
      size: 99,
      versionId: "vCLOUD",
    });
    vi.mocked(listObjectVersions).mockResolvedValueOnce([
      "vCLOUD",
      "vPARENT", // our parent is in the chain — fast-forward, not divergence
    ]);

    const result = await sync({
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    // Local was overwritten with the cloud's content (mock writes "mock file content").
    expect(fs.readFileSync(localPath, "utf-8")).toBe("mock file content");
    expect(result.conflicts).toBe(0);
    // No .hq-conflicts dir created on a clean fast-forward.
    expect(fs.existsSync(path.join(tmpDir, ".hq-conflicts"))).toBe(false);

    // Journal stamped with the new VersionId.
    const journalAfter = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journalAfter.files["docs/handoff.md"].s3VersionId).toBe("vMOCK");
  });
});
