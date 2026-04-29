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
    uploadFile: innerVi.fn().mockResolvedValue(undefined),
    downloadFile: innerVi.fn().mockImplementation(async (_ctx: unknown, _key: string, localPath: string) => {
      const dir = innerPath.dirname(localPath);
      if (!innerFs.existsSync(dir)) innerFs.mkdirSync(dir, { recursive: true });
      innerFs.writeFileSync(localPath, "mock file content");
    }),
    listRemoteFiles: innerVi.fn().mockResolvedValue(remoteFiles),
    deleteRemoteFile: innerVi.fn().mockResolvedValue(undefined),
    headRemoteFile: innerVi.fn().mockResolvedValue(null),
  };
});

import { sync } from "./sync.js";
import * as s3Module from "../s3.js";

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
    expect(result.conflictPaths).toEqual(["docs/handoff.md"]);
    expect(result.filesSkipped).toBeGreaterThanOrEqual(1);
    expect(fs.readFileSync(path.join(companyDocs, "handoff.md"), "utf-8")).toBe("local version");
  });

  it("emits a conflict event with path + resolution on hash mismatch", async () => {
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
            hash: "stale-hash",
            size: 20,
            syncedAt: new Date(Date.now() - 3600000).toISOString(),
            direction: "down",
          },
        },
      }),
    );

    const events: unknown[] = [];
    await sync({
      company: "acme",
      onConflict: "keep",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onEvent: (e) => events.push(e),
    });

    const conflicts = events.filter(
      (e): e is { type: "conflict"; path: string; direction: "pull"; resolution: string } =>
        typeof e === "object" && e !== null && (e as { type?: string }).type === "conflict",
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      type: "conflict",
      path: "docs/handoff.md",
      direction: "pull",
      resolution: "keep",
    });
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

  it("stamps journal.lastSync on every successful run, even when nothing transferred", async () => {
    // First run downloads both remote files and stamps lastSync.
    await sync({ company: "acme", vaultConfig: mockConfig, hqRoot: tmpDir });
    const firstStamp = JSON.parse(fs.readFileSync(journalPath, "utf-8")).lastSync as string;
    expect(firstStamp).not.toBe("");

    // Second run: same remote, same local — Stage-2 plan is all-skip, so
    // updateEntry never fires. lastSync must still advance, otherwise the
    // menubar shows a stale "Last sync · X ago".
    await new Promise((r) => setTimeout(r, 5));
    const result = await sync({ company: "acme", vaultConfig: mockConfig, hqRoot: tmpDir });
    expect(result.filesDownloaded).toBe(0);
    const secondStamp = JSON.parse(fs.readFileSync(journalPath, "utf-8")).lastSync as string;
    expect(new Date(secondStamp).getTime()).toBeGreaterThan(new Date(firstStamp).getTime());
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

  it("does NOT flag a pull conflict when only local changed since last sync", async () => {
    // Regression: previously, any local edit to a file that also existed on
    // S3 produced a pull conflict because the predicate only checked
    // `journalEntry.hash !== localHash`. With `--on-conflict keep` this
    // silently dropped local edits during the round-trip. With remoteEtag
    // matching the journal, the remote is known unchanged and the pull
    // phase should leave the local edit alone for the push phase to upload.
    const companyDocs = path.join(tmpDir, "companies", "acme", "docs");
    fs.mkdirSync(companyDocs, { recursive: true });
    fs.writeFileSync(path.join(companyDocs, "handoff.md"), "local edit");

    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "docs/handoff.md": {
            hash: "stale-hash-from-pre-edit",
            size: 20,
            syncedAt: new Date(Date.now() - 3600000).toISOString(),
            direction: "down",
            // Matches the listRemoteFiles mock's etag for handoff.md.
            remoteEtag: "abc123",
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

    expect(result.conflicts).toBe(0);
    expect(result.conflictPaths).toEqual([]);
    // Local edit must be preserved (not clobbered by download)
    expect(fs.readFileSync(path.join(companyDocs, "handoff.md"), "utf-8")).toBe("local edit");
  });

  it("records remoteEtag from listRemoteFiles on the journal entry after download", async () => {
    await sync({
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journal.files["docs/handoff.md"].remoteEtag).toBe("abc123");
    expect(journal.files["knowledge/readme.md"].remoteEtag).toBe("def456");
  });

  // ── Stage-1 plan event ─────────────────────────────────────────────────

  it("emits a plan event before any progress events", async () => {
    const events: { type: string }[] = [];
    await sync({
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onEvent: (e) => events.push({ type: e.type }),
    });

    // Plan must be the first event so consumers can use its totals as
    // the progress denominator before any per-file events arrive.
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("plan");
    const planIndex = events.findIndex((e) => e.type === "plan");
    const firstProgressIndex = events.findIndex((e) => e.type === "progress");
    expect(firstProgressIndex).toBeGreaterThan(planIndex);
  });

  it("plan event totals reflect the upcoming Stage-2 work (all-new case)", async () => {
    // Both mock remote files are new locally → both counted as downloads,
    // bytes summed from listRemoteFiles, no conflicts, no skips.
    const planEvents: unknown[] = [];
    await sync({
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onEvent: (e) => {
        if (e.type === "plan") {
          planEvents.push(e);
        }
      },
    });

    expect(planEvents).toHaveLength(1);
    expect(planEvents[0]).toMatchObject({
      type: "plan",
      filesToDownload: 2,
      bytesToDownload: 142, // 42 + 100 from the s3 mock
      filesToUpload: 0, // sync() never plans uploads
      bytesToUpload: 0,
      filesToSkip: 0,
      filesToConflict: 0,
    });
  });

  it("plan event counts a 3-way conflict separately from downloads", async () => {
    // Local edit + journal-tracked + remote ETag drifted → conflict.
    const companyDocs = path.join(tmpDir, "companies", "acme", "docs");
    fs.mkdirSync(companyDocs, { recursive: true });
    fs.writeFileSync(path.join(companyDocs, "handoff.md"), "local edit");

    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "docs/handoff.md": {
            hash: "stale-hash-from-pre-edit",
            size: 20,
            syncedAt: new Date(Date.now() - 3600000).toISOString(),
            direction: "down",
            // Mismatched ETag — listRemoteFiles mock returns "abc123",
            // we record a stale one so remoteChanged is true.
            remoteEtag: "stale-remote-etag",
          },
        },
      }),
    );

    const planEvents: Array<{
      type: string;
      filesToDownload?: number;
      filesToConflict?: number;
      filesToSkip?: number;
    }> = [];
    await sync({
      company: "acme",
      onConflict: "keep",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onEvent: (e) => {
        if (e.type === "plan") planEvents.push(e);
      },
    });

    expect(planEvents).toHaveLength(1);
    // Conflict is counted separately; only the new file is in toDownload.
    expect(planEvents[0]).toMatchObject({
      filesToDownload: 1,
      filesToConflict: 1,
      filesToSkip: 0,
    });
  });
});
