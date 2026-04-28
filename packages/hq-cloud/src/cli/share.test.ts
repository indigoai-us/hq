/**
 * Unit tests for hq share command (VLT-5 US-002).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { clearContextCache } from "../context.js";
import type { VaultServiceConfig } from "../types.js";

// Mock s3 module at the top level. uploadFile resolves to a synthetic ETag
// so share() can record it on the journal entry — the real PutObject
// response shape is `{ ETag: '"<hex>"' }`.
vi.mock("../s3.js", () => ({
  uploadFile: vi.fn().mockResolvedValue({ etag: '"upload-etag"' }),
  downloadFile: vi.fn().mockResolvedValue(undefined),
  listRemoteFiles: vi.fn().mockResolvedValue([]),
  deleteRemoteFile: vi.fn().mockResolvedValue(undefined),
  headRemoteFile: vi.fn().mockResolvedValue(null),
}));

import { share } from "./share.js";
import { headRemoteFile, uploadFile } from "../s3.js";

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
    if (urlStr.includes("/entity/by-slug/")) {
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

describe("share", () => {
  let tmpDir: string;
  let stateDir: string;

  beforeEach(() => {
    clearContextCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-share-test-"));
    // Redirect per-company journal into tmp so share() doesn't write to the
    // real ~/.hq during tests (ADR-0001 Phase 5).
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-state-test-"));
    process.env.HQ_STATE_DIR = stateDir;
    setupFetchMock();
    vi.mocked(headRemoteFile).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    // clearAllMocks wipes the default ETag impl set in vi.mock(), so
    // re-prime it for the next test.
    vi.mocked(uploadFile).mockResolvedValue({ etag: '"upload-etag"' });
    vi.mocked(headRemoteFile).mockResolvedValue(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
    delete process.env.HQ_STATE_DIR;
  });

  it("shares a single file keyed relative to the company root", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "test.md");
    fs.writeFileSync(testFile, "# Hello World");

    const result = await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
    expect(result.aborted).toBe(false);
    // Remote key must be company-relative, not hqRoot-relative
    expect(uploadFile).toHaveBeenCalledWith(expect.anything(), testFile, "test.md");
  });

  it("respects ignore rules", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(path.join(companyRoot, ".git"), { recursive: true });
    fs.writeFileSync(path.join(companyRoot, ".git", "config"), "git config");
    fs.writeFileSync(path.join(companyRoot, "readme.md"), "readme");

    const result = await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
  });

  it("shares a directory of files", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(path.join(companyRoot, "docs"), { recursive: true });
    fs.writeFileSync(path.join(companyRoot, "docs", "a.md"), "doc a");
    fs.writeFileSync(path.join(companyRoot, "docs", "b.md"), "doc b");

    const result = await share({
      paths: [path.join(companyRoot, "docs")],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(2);
  });

  it("keys nested paths relative to the company root, not hqRoot", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(path.join(companyRoot, "knowledge"), { recursive: true });
    const nested = path.join(companyRoot, "knowledge", "crawl.json");
    fs.writeFileSync(nested, "{}");

    await share({
      paths: [nested],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    // Key is "knowledge/crawl.json", not "companies/acme/knowledge/crawl.json"
    expect(uploadFile).toHaveBeenCalledWith(expect.anything(), nested, "knowledge/crawl.json");
  });

  it("skips files outside the company folder with a warning", async () => {
    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // File at hqRoot, outside companies/acme/
    const outsideFile = path.join(tmpDir, "stray.md");
    fs.writeFileSync(outsideFile, "stray");

    const result = await share({
      paths: [outsideFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(0);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/outside company folder/i),
    );
    warnSpy.mockRestore();
  });

  it("throws when no company specified and no active company", async () => {
    fs.writeFileSync(path.join(tmpDir, "test.md"), "test");

    await expect(
      share({
        paths: [path.join(tmpDir, "test.md")],
        vaultConfig: mockConfig,
        hqRoot: tmpDir,
      }),
    ).rejects.toThrow(/No company specified/);
  });

  it("resolves active company from .hq/config.json", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".hq"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".hq", "config.json"), JSON.stringify({ activeCompany: "acme" }));
    fs.writeFileSync(path.join(companyRoot, "test.md"), "test");

    const result = await share({
      paths: [path.join(companyRoot, "test.md")],
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
  });

  it("skipUnchanged=true skips files whose local hash matches the journal", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "unchanged.md");
    fs.writeFileSync(testFile, "stable content");

    // Precompute the hash of the file so the journal matches exactly.
    const { hashFile } = await import("../journal.js");
    const hash = hashFile(testFile);

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "unchanged.md": {
            hash,
            size: 15,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
        },
      }),
    );

    const result = await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      skipUnchanged: true,
    });

    expect(result.filesUploaded).toBe(0);
    expect(result.filesSkipped).toBe(1);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("skipUnchanged=true still uploads files whose hash differs from the journal", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "changed.md");
    fs.writeFileSync(testFile, "new content");

    // Journal has a stale hash for this path — simulating "local has been
    // edited since the last push".
    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "changed.md": {
            hash: "stale-hash-from-previous-sync",
            size: 10,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
        },
      }),
    );

    const result = await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      skipUnchanged: true,
    });

    expect(result.filesUploaded).toBe(1);
    expect(uploadFile).toHaveBeenCalledWith(expect.anything(), testFile, "changed.md");
  });

  it("populates conflictPaths and emits a conflict event when both local and remote drifted from journal", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "drifted.md");
    fs.writeFileSync(testFile, "local edit");

    // Stale hash → local diverged. Remote ETag in head response differs
    // from the one stored in the journal → remote also moved. Both sides
    // changed since last sync = real conflict.
    vi.mocked(headRemoteFile).mockResolvedValueOnce({
      lastModified: new Date(),
      etag: '"remote-new-etag"',
      size: 99,
    });

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "drifted.md": {
            hash: "stale-hash",
            size: 10,
            syncedAt: new Date().toISOString(),
            direction: "up",
            remoteEtag: "remote-old-etag",
          },
        },
      }),
    );

    const events: unknown[] = [];
    const result = await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onConflict: "keep",
      onEvent: (e) => events.push(e),
    });

    expect(result.conflictPaths).toEqual(["drifted.md"]);
    const conflicts = events.filter(
      (e): e is { type: "conflict"; path: string; direction: "push"; resolution: string } =>
        typeof e === "object" && e !== null && (e as { type?: string }).type === "conflict",
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      type: "conflict",
      path: "drifted.md",
      direction: "push",
      resolution: "keep",
    });
  });

  it("uploads (no conflict) when only the local side changed since last sync", async () => {
    // Regression for hq-cloud#<conflict-detection>: a local edit to a file
    // that exists on S3 used to trigger a push conflict because the
    // detector compared `journalEntry.hash !== localHash` without checking
    // the remote. Combined with `--on-conflict keep`, this silently dropped
    // every edit to any pre-existing file.
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "edited.md");
    fs.writeFileSync(testFile, "edited locally");

    const syncedAt = new Date(Date.now() - 60_000).toISOString();
    vi.mocked(headRemoteFile).mockResolvedValueOnce({
      lastModified: new Date(Date.parse(syncedAt) - 30_000),
      etag: '"unchanged-remote"',
      size: 5,
    });

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: syncedAt,
        files: {
          "edited.md": {
            hash: "stale-hash-for-old-content",
            size: 5,
            syncedAt,
            direction: "down",
            remoteEtag: "unchanged-remote",
          },
        },
      }),
    );

    const events: unknown[] = [];
    const result = await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onConflict: "keep",
      onEvent: (e) => events.push(e),
    });

    expect(result.conflictPaths).toEqual([]);
    expect(result.filesUploaded).toBe(1);
    expect(events.some((e): e is { type: string } =>
      typeof e === "object" && e !== null && (e as { type?: string }).type === "conflict",
    )).toBe(false);
  });

  it("falls back to lastModified vs syncedAt when journal entry has no remoteEtag (legacy)", async () => {
    // Legacy entries from before the remoteEtag field existed should be
    // treated as "remote unchanged" iff lastModified <= syncedAt.
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "legacy.md");
    fs.writeFileSync(testFile, "edited locally");

    const syncedAt = new Date().toISOString();
    vi.mocked(headRemoteFile).mockResolvedValueOnce({
      lastModified: new Date(Date.parse(syncedAt) - 5_000),
      etag: '"some-etag"',
      size: 5,
    });

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: syncedAt,
        files: {
          "legacy.md": {
            hash: "stale-hash",
            size: 5,
            syncedAt,
            direction: "down",
            // no remoteEtag — pre-fix journal
          },
        },
      }),
    );

    const result = await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onConflict: "keep",
    });

    expect(result.conflictPaths).toEqual([]);
    expect(result.filesUploaded).toBe(1);
  });

  it("records the upload's ETag on the journal entry", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "fresh.md");
    fs.writeFileSync(testFile, "new file");

    vi.mocked(uploadFile).mockResolvedValueOnce({ etag: '"new-upload-etag"' });

    await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journal.files["fresh.md"].remoteEtag).toBe("new-upload-etag");
  });

  it("skipUnchanged=false (default) uploads even when hash matches", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "unchanged.md");
    fs.writeFileSync(testFile, "stable content");

    const { hashFile } = await import("../journal.js");
    const hash = hashFile(testFile);

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "unchanged.md": {
            hash,
            size: 15,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
        },
      }),
    );

    const result = await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      // skipUnchanged omitted — preserves `hq share <file>` semantics
    });

    expect(result.filesUploaded).toBe(1);
    expect(uploadFile).toHaveBeenCalled();
  });

  it("onEvent receives progress events instead of console output", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    fs.writeFileSync(path.join(companyRoot, "a.md"), "aaa");
    fs.writeFileSync(path.join(companyRoot, "b.md"), "bbb");

    const events: Array<{ type: string; path: string; bytes?: number }> = [];
    const result = await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onEvent: (e) => {
        // Only file-level events carry `.path`. The Stage-1 `plan` event is
        // surfaced separately and tested in its own block.
        if (e.type === "plan") return;
        events.push({
          type: e.type,
          path: e.path,
          ...(e.type === "progress" ? { bytes: e.bytes } : {}),
        });
      },
    });

    expect(result.filesUploaded).toBe(2);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === "progress")).toBe(true);
    expect(events.map((e) => e.path).sort()).toEqual(["a.md", "b.md"]);
  });

  // ── Stage-1 plan event ─────────────────────────────────────────────────

  it("emits a plan event before any progress events", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    fs.writeFileSync(path.join(companyRoot, "a.md"), "alpha");
    fs.writeFileSync(path.join(companyRoot, "b.md"), "beta");

    const events: { type: string }[] = [];
    await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onEvent: (e) => events.push({ type: e.type }),
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("plan");
    const planIndex = events.findIndex((e) => e.type === "plan");
    const firstProgressIndex = events.findIndex((e) => e.type === "progress");
    expect(firstProgressIndex).toBeGreaterThan(planIndex);
  });

  it("plan event reports filesToUpload = candidates and bytesToUpload = sum of file sizes", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    fs.writeFileSync(path.join(companyRoot, "a.md"), "alpha"); // 5 bytes
    fs.writeFileSync(path.join(companyRoot, "b.md"), "beta!"); // 5 bytes

    const planEvents: Array<{
      type: string;
      filesToUpload?: number;
      bytesToUpload?: number;
      filesToDownload?: number;
      bytesToDownload?: number;
      filesToSkip?: number;
      filesToConflict?: number;
    }> = [];
    await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      onEvent: (e) => {
        if (e.type === "plan") planEvents.push(e);
      },
    });

    expect(planEvents).toHaveLength(1);
    expect(planEvents[0]).toMatchObject({
      type: "plan",
      filesToUpload: 2,
      bytesToUpload: 10,
      filesToDownload: 0, // share() is push-only
      bytesToDownload: 0,
      filesToSkip: 0,
      // Push conflicts can't be classified pre-HEAD (V1 limitation);
      // the complete event reports the authoritative count.
      filesToConflict: 0,
    });
  });

  it("plan event filesToSkip reflects skip-unchanged hits when journal hash matches", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    fs.writeFileSync(path.join(companyRoot, "unchanged.md"), "stable content");
    fs.writeFileSync(path.join(companyRoot, "changed.md"), "newer content");

    // Pre-seed the journal so unchanged.md matches its hash but
    // changed.md does not.
    const crypto = await import("crypto");
    const unchangedHash = crypto
      .createHash("sha256")
      .update("stable content")
      .digest("hex");
    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "unchanged.md": {
            hash: unchangedHash,
            size: 14,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
          "changed.md": {
            hash: "stale-hash",
            size: 13,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
        },
      }),
    );

    const planEvents: Array<{
      type: string;
      filesToUpload?: number;
      filesToSkip?: number;
    }> = [];
    await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      skipUnchanged: true,
      onEvent: (e) => {
        if (e.type === "plan") planEvents.push(e);
      },
    });

    expect(planEvents).toHaveLength(1);
    expect(planEvents[0]).toMatchObject({
      filesToUpload: 1,
      filesToSkip: 1,
    });
  });
});
