/**
 * Unit tests for hq share command (VLT-5 US-002).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { clearContextCache } from "../context.js";
import type { VaultServiceConfig } from "../types.js";

// Mock s3 module at the top level
vi.mock("../s3.js", () => ({
  uploadFile: vi.fn().mockResolvedValue({ versionId: "vMOCK" }),
  downloadFile: vi.fn().mockResolvedValue({ versionId: "vMOCK" }),
  downloadFileBytes: vi.fn().mockResolvedValue({
    bytes: Buffer.from("mock cloud content"),
    versionId: "vMOCK",
  }),
  listRemoteFiles: vi.fn().mockResolvedValue([]),
  listObjectVersions: vi.fn().mockResolvedValue([]),
  deleteRemoteFile: vi.fn().mockResolvedValue(undefined),
  headRemoteFile: vi.fn().mockResolvedValue(null),
  isPreconditionFailed: vi.fn().mockReturnValue(false),
}));

import { share } from "./share.js";
import { headRemoteFile, uploadFile, downloadFileBytes, isPreconditionFailed } from "../s3.js";

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

  it("lineage push 412 writes conflict file + index entry, leaves local untouched", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const localPath = path.join(companyRoot, "notes.md");
    const localContent = "local edits the user just made";
    fs.writeFileSync(localPath, localContent);

    // Seed a lineage-active journal entry — different hash than current
    // local content, with an s3VersionId pointer to the parent we *think*
    // is in the cloud.
    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date(Date.now() - 60_000).toISOString(),
        files: {
          "notes.md": {
            hash: "old-hash-from-last-sync",
            size: 10,
            syncedAt: new Date(Date.now() - 60_000).toISOString(),
            direction: "up",
            s3VersionId: "vPARENT",
          },
        },
      }),
    );

    // Make the upload look like a 412 from S3 — the cloud advanced past our
    // parent. The conflict path should fire.
    const preconditionErr = Object.assign(new Error("PreconditionFailed"), {
      name: "PreconditionFailed",
    });
    vi.mocked(uploadFile).mockRejectedValueOnce(preconditionErr);
    vi.mocked(isPreconditionFailed).mockReturnValueOnce(true);
    vi.mocked(downloadFileBytes).mockResolvedValueOnce({
      bytes: Buffer.from("CLOUD VERSION the other machine pushed"),
      versionId: "vCLOUD",
    });

    const events: Array<{ type: string; path?: string; conflictPath?: string }> = [];
    const result = await share({
      paths: [localPath],
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

    expect(result.filesUploaded).toBe(0);
    expect(result.filesSkipped).toBe(1);

    // Local file is unchanged — user's edits never touched.
    expect(fs.readFileSync(localPath, "utf-8")).toBe(localContent);

    // Conflict event emitted with both paths.
    const conflictEvent = events.find((e) => e.type === "conflict-detected");
    expect(conflictEvent).toBeDefined();
    expect(conflictEvent!.path).toBe("notes.md");

    // Conflict file written next to the original (HQ-relative path).
    const conflictAbs = path.join(tmpDir, conflictEvent!.conflictPath!);
    expect(fs.existsSync(conflictAbs)).toBe(true);
    expect(fs.readFileSync(conflictAbs, "utf-8")).toBe(
      "CLOUD VERSION the other machine pushed",
    );

    // Index entry appended.
    const indexPath = path.join(tmpDir, ".hq-conflicts", "index.json");
    expect(fs.existsSync(indexPath)).toBe(true);
    const idx = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    expect(idx.conflicts).toHaveLength(1);
    expect(idx.conflicts[0].side).toBe("push");
    expect(idx.conflicts[0].lastKnownVersionId).toBe("vPARENT");
    expect(idx.conflicts[0].remoteVersionId).toBe("vCLOUD");

    // Journal NOT updated for this file — entry stays at the old hash so a
    // subsequent sync re-evaluates against the same parent. (See spec: we
    // never silently bump s3VersionId without resolution.)
    const journalAfter = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journalAfter.files["notes.md"].hash).toBe("old-hash-from-last-sync");
    expect(journalAfter.files["notes.md"].s3VersionId).toBe("vPARENT");
  });
});
