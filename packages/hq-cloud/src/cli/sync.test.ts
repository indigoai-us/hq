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
});
