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
import { deleteRemoteFile, headRemoteFile, uploadFile } from "../s3.js";
import type { EntityContext } from "../types.js";

const mockConfig: VaultServiceConfig = {
  apiUrl: "https://vault-api.test",
  authToken: "test-jwt-token",
  region: "us-east-1",
};

/**
 * Build a pre-vended EntityContext as if a caller (e.g. AppBar) had already
 * called `/sts/vend-child` and is passing the result into share() via the
 * subprocess stdin contract. `expiresAt` defaults to 15min in the future
 * to model a healthy first-push window; tests can override it to model
 * an "expiring soon" credential.
 */
function makeEntityContext(overrides: Partial<EntityContext> = {}): EntityContext {
  return {
    uid: "cmp_01ABCDEF",
    slug: "acme",
    bucketName: "hq-vault-acme-123",
    region: "us-east-1",
    credentials: {
      accessKeyId: "ASIA_PRE_VENDED",
      secretAccessKey: "pre-vended-secret",
      sessionToken: "pre-vended-session",
    },
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

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

  it("forwards UploadAuthor to uploadFile when present (created-by metadata)", async () => {
    // Regression: hq-console vault UI's CREATED BY column was always blank
    // because the sync engine never stamped Metadata['created-by'] on PUT.
    // share() now accepts an `author` and threads it to s3.uploadFile so
    // every synced file lands in S3 with the syncer's identity attached.
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "attribution.md");
    fs.writeFileSync(testFile, "attributed content");

    await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      author: { userSub: "abc-123", email: "alice@example.com" },
    });

    expect(uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      testFile,
      "attribution.md",
      { userSub: "abc-123", email: "alice@example.com" },
    );
  });

  it("omits author arg when not provided (back-compat)", async () => {
    // share() must remain a 3-arg call to uploadFile when no author is
    // configured — older test stubs and external integrations rely on it.
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "no-author.md");
    fs.writeFileSync(testFile, "anonymous");

    await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      testFile,
      "no-author.md",
    );
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

  // ── Pre-vended entityContext path (AppBar shell-out contract) ──────────
  //
  // share() accepts a fully-resolved EntityContext from callers that vend
  // their own STS credentials (e.g. AppBar HQ Sync calls /sts/vend-child
  // before invoking `hq sync push --creds-from-stdin`). When entityContext
  // is supplied, share() must skip its own resolveEntityContext flow
  // entirely — no /entity lookup, no /sts/vend, no auto-refresh.

  it("uses entityContext directly without calling vault-service when provided", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "from-appbar.md");
    fs.writeFileSync(testFile, "first push");

    // Replace the default fetch mock with one that throws if called — proves
    // that the entityContext path doesn't touch vault-service at all.
    const fetchMock = vi.fn(async () => {
      throw new Error(
        "fetch called during share() with entityContext — should never happen",
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const ctx = makeEntityContext();
    const result = await share({
      paths: [testFile],
      entityContext: ctx,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    // The S3 upload sees the pre-vended credentials, not freshly-vended ones.
    // (uploadFile is mocked, so we just verify it was called with our ctx.)
    expect(uploadFile).toHaveBeenCalledWith(ctx, testFile, "from-appbar.md");
  });

  it("falls back to entityContext.slug when company is not specified", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "no-company-arg.md");
    fs.writeFileSync(testFile, "data");

    // No company arg, no .hq/config.json — only entityContext.slug to anchor on.
    const result = await share({
      paths: [testFile],
      entityContext: makeEntityContext({ slug: "acme" }),
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
    // Confirms the relative-path scoping landed under acme even without an
    // explicit company arg.
    expect(uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      testFile,
      "no-company-arg.md",
    );
  });

  it("does NOT auto-refresh when entityContext is expiring soon (no vending source)", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    const testFile = path.join(companyRoot, "race.md");
    fs.writeFileSync(testFile, "racing the clock");

    // Force a fetch error if any /sts/vend* call is made — this is the
    // critical assertion: the auto-refresh branch must be unreachable on
    // the pre-vended path because we have no Cognito token to re-vend with.
    const fetchMock = vi.fn(async () => {
      throw new Error(
        "share() must not vend when using entityContext — caller owns TTL",
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    // Credentials expiring in 30s — well within the 2-min refresh threshold.
    const expiringCtx = makeEntityContext({
      expiresAt: new Date(Date.now() + 30 * 1000).toISOString(),
    });

    const result = await share({
      paths: [testFile],
      entityContext: expiringCtx,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    // The original (still-valid-for-30s) credentials must have been used as-is.
    expect(uploadFile).toHaveBeenCalledWith(expiringCtx, testFile, "race.md");
  });

  it("throws when both vaultConfig and entityContext are provided (ambiguous)", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    fs.writeFileSync(path.join(companyRoot, "ambiguous.md"), "x");

    await expect(
      share({
        paths: [path.join(companyRoot, "ambiguous.md")],
        company: "acme",
        vaultConfig: mockConfig,
        entityContext: makeEntityContext(),
        hqRoot: tmpDir,
      }),
    ).rejects.toThrow(/exactly one of/i);
  });

  it("throws when neither vaultConfig nor entityContext is provided", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    fs.writeFileSync(path.join(companyRoot, "needs-creds.md"), "x");

    // Both vaultConfig and entityContext are optional in the type signature
    // (a future discriminated-union refactor could enforce exactly-one at
    // compile time); for now the contract is enforced at runtime and tested
    // here.
    await expect(
      share({
        paths: [path.join(companyRoot, "needs-creds.md")],
        company: "acme",
        hqRoot: tmpDir,
      }),
    ).rejects.toThrow(/either `vaultConfig`.*or `entityContext`/i);
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

  // ── Delete propagation (propagateDeletes) ──────────────────────────────────
  //
  // The bug: when a user deletes a local file, the next pull re-downloads it
  // from S3 because the remote object is still listable and the pull plan
  // can't tell "never synced" from "synced then deleted". The fix is to
  // propagate local deletes to S3 on the push side. The vault buckets have
  // versioning enabled, so DeleteObject is soft (a delete-marker becomes the
  // current version; prior object versions remain recoverable).

  it("propagateDeletes: deletes journal-tracked files whose local copy is gone", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });
    // Only "kept.md" exists locally; "gone.md" was previously synced and then
    // deleted by the user.
    fs.writeFileSync(path.join(companyRoot, "kept.md"), "still here");

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "kept.md": {
            hash: "irrelevant-not-checked-here",
            size: 10,
            syncedAt: new Date().toISOString(),
            direction: "up",
            remoteEtag: "kept-etag",
          },
          "gone.md": {
            hash: "irrelevant-not-checked-here",
            size: 7,
            syncedAt: new Date().toISOString(),
            direction: "up",
            remoteEtag: "gone-etag",
          },
        },
      }),
    );

    const result = await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      skipUnchanged: true,
      propagateDeletes: true,
    });

    expect(result.filesDeleted).toBe(1);
    expect(deleteRemoteFile).toHaveBeenCalledTimes(1);
    expect(deleteRemoteFile).toHaveBeenCalledWith(expect.anything(), "gone.md");

    // Journal entry for the gone file is removed; the kept entry stays.
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journal.files["gone.md"]).toBeUndefined();
    expect(journal.files["kept.md"]).toBeDefined();
  });

  it("propagateDeletes: emits a `progress` event with deleted:true and bytes from the journal", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "removed.md": {
            hash: "h",
            size: 42,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
        },
      }),
    );

    const events: Array<{ type: string; path?: string; bytes?: number; deleted?: boolean }> = [];
    await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      skipUnchanged: true,
      propagateDeletes: true,
      onEvent: (e) => events.push(e as { type: string }),
    });

    const planEvent = events.find((e) => e.type === "plan") as { filesToDelete?: number } | undefined;
    expect(planEvent?.filesToDelete).toBe(1);

    const deleteProgress = events.find(
      (e) => e.type === "progress" && e.deleted === true,
    );
    expect(deleteProgress).toMatchObject({
      type: "progress",
      path: "removed.md",
      bytes: 42,
      deleted: true,
    });
  });

  it("propagateDeletes=false (default): missing local files do NOT trigger a remote delete", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "gone.md": {
            hash: "h",
            size: 7,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
        },
      }),
    );

    const result = await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      skipUnchanged: true,
      // propagateDeletes omitted ⇒ defaults to false
    });

    expect(result.filesDeleted).toBe(0);
    expect(deleteRemoteFile).not.toHaveBeenCalled();
    // Journal entry survives so the next opt-in run can still propagate.
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journal.files["gone.md"]).toBeDefined();
  });

  it("propagateDeletes: scope is constrained to the supplied paths — sibling deletes are not swept", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(path.join(companyRoot, "in-scope"), { recursive: true });
    fs.mkdirSync(path.join(companyRoot, "other"), { recursive: true });

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "in-scope/gone.md": {
            hash: "h",
            size: 1,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
          "other/also-gone.md": {
            hash: "h",
            size: 1,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
        },
      }),
    );

    const result = await share({
      paths: [path.join(companyRoot, "in-scope")],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      skipUnchanged: true,
      propagateDeletes: true,
    });

    expect(result.filesDeleted).toBe(1);
    expect(deleteRemoteFile).toHaveBeenCalledTimes(1);
    expect(deleteRemoteFile).toHaveBeenCalledWith(
      expect.anything(),
      "in-scope/gone.md",
    );

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journal.files["in-scope/gone.md"]).toBeUndefined();
    // Sibling tree's journal entry is untouched — `hq share <subtree>` must
    // not act on files outside the named scope.
    expect(journal.files["other/also-gone.md"]).toBeDefined();
  });

  it("propagateDeletes: a failed DeleteObject leaves the journal entry intact for retry", async () => {
    const companyRoot = path.join(tmpDir, "companies", "acme");
    fs.mkdirSync(companyRoot, { recursive: true });

    const journalPath = path.join(stateDir, "sync-journal.acme.json");
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: "1",
        lastSync: new Date().toISOString(),
        files: {
          "flaky.md": {
            hash: "h",
            size: 5,
            syncedAt: new Date().toISOString(),
            direction: "up",
          },
        },
      }),
    );

    vi.mocked(deleteRemoteFile).mockRejectedValueOnce(new Error("S3 down"));

    const events: Array<{ type: string; path?: string; message?: string }> = [];
    const result = await share({
      paths: [companyRoot],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
      skipUnchanged: true,
      propagateDeletes: true,
      onEvent: (e) => events.push(e as { type: string }),
    });

    expect(result.filesDeleted).toBe(0);
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toMatchObject({ path: "flaky.md", message: expect.stringContaining("S3 down") });

    // Entry survives — next run will retry the delete.
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    expect(journal.files["flaky.md"]).toBeDefined();
  });
});
