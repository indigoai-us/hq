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
  uploadFile: vi.fn().mockResolvedValue(undefined),
  downloadFile: vi.fn().mockResolvedValue(undefined),
  listRemoteFiles: vi.fn().mockResolvedValue([]),
  deleteRemoteFile: vi.fn().mockResolvedValue(undefined),
  headRemoteFile: vi.fn().mockResolvedValue(null),
}));

import { share } from "./share.js";
import { headRemoteFile } from "../s3.js";

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

  it("shares a single file", async () => {
    const testFile = path.join(tmpDir, "test.md");
    fs.writeFileSync(testFile, "# Hello World");

    const result = await share({
      paths: [testFile],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
    expect(result.aborted).toBe(false);
  });

  it("respects ignore rules", async () => {
    fs.mkdirSync(path.join(tmpDir, ".git"));
    fs.writeFileSync(path.join(tmpDir, ".git", "config"), "git config");
    fs.writeFileSync(path.join(tmpDir, "readme.md"), "readme");

    const result = await share({
      paths: [tmpDir],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
  });

  it("shares a directory of files", async () => {
    fs.mkdirSync(path.join(tmpDir, "docs"));
    fs.writeFileSync(path.join(tmpDir, "docs", "a.md"), "doc a");
    fs.writeFileSync(path.join(tmpDir, "docs", "b.md"), "doc b");

    const result = await share({
      paths: [path.join(tmpDir, "docs")],
      company: "acme",
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(2);
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
    fs.mkdirSync(path.join(tmpDir, ".hq"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".hq", "config.json"), JSON.stringify({ activeCompany: "acme" }));
    fs.writeFileSync(path.join(tmpDir, "test.md"), "test");

    const result = await share({
      paths: [path.join(tmpDir, "test.md")],
      vaultConfig: mockConfig,
      hqRoot: tmpDir,
    });

    expect(result.filesUploaded).toBe(1);
  });
});
