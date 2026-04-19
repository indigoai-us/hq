/**
 * Integration test: share/sync lifecycle (VLT-5 US-003).
 *
 * Exercises the full share/sync cycle against a real dev-stage company entity
 * using real STS vending (VLT-3). Requires:
 *   - VAULT_API_URL env var (vault-service API endpoint)
 *   - VAULT_AUTH_TOKEN env var (Cognito JWT for an active member)
 *   - VAULT_TEST_COMPANY env var (company slug with an active entity + bucket)
 *
 * Run: pnpm test:e2e
 *
 * This test:
 *   1. M1 shares file A
 *   2. M2 (same creds, different local dir) syncs → receives A
 *   3. M2 shares file B
 *   4. M1 syncs → receives B
 *   5. M1 edits A locally + M2 pushes newer A → M1 syncs with --on-conflict=keep
 *
 * Cleanup: all shared files are deleted from S3 on teardown.
 */

import { describe, it, expect, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  resolveEntityContext,
  clearContextCache,
  deleteRemoteFile,
  listRemoteFiles,
} from "../src/index.js";
import { share } from "../src/cli/share.js";
import { sync } from "../src/cli/sync.js";
import type { VaultServiceConfig, EntityContext } from "../src/types.js";

// Skip if env vars not set
const VAULT_API_URL = process.env.VAULT_API_URL;
const VAULT_AUTH_TOKEN = process.env.VAULT_AUTH_TOKEN;
const VAULT_TEST_COMPANY = process.env.VAULT_TEST_COMPANY;

const canRun = VAULT_API_URL && VAULT_AUTH_TOKEN && VAULT_TEST_COMPANY;

const TEST_PREFIX = `__integration-test-${Date.now()}`;

describe.skipIf(!canRun)("share-sync integration", () => {
  let vaultConfig: VaultServiceConfig;
  let m1Root: string;
  let m2Root: string;
  let ctx: EntityContext;

  // Track files to clean up
  const sharedKeys: string[] = [];

  // Create two simulated machine roots
  const setup = async () => {
    vaultConfig = {
      apiUrl: VAULT_API_URL!,
      authToken: VAULT_AUTH_TOKEN!,
      region: "us-east-1",
    };

    m1Root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-integ-m1-"));
    m2Root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-integ-m2-"));

    // Resolve entity context to verify connectivity
    clearContextCache();
    ctx = await resolveEntityContext(VAULT_TEST_COMPANY!, vaultConfig);

    console.log(`Integration test: entity=${ctx.uid}, bucket=${ctx.bucketName}`);
    console.log(`M1 root: ${m1Root}`);
    console.log(`M2 root: ${m2Root}`);
  };

  afterAll(async () => {
    // Cleanup: delete all test files from S3
    try {
      if (ctx) {
        for (const key of sharedKeys) {
          try {
            await deleteRemoteFile(ctx, key);
          } catch {
            // Best-effort cleanup
          }
        }

        // Also scan for any orphaned test files
        const remoteFiles = await listRemoteFiles(ctx, TEST_PREFIX);
        for (const file of remoteFiles) {
          try {
            await deleteRemoteFile(ctx, file.key);
          } catch {
            // Best-effort
          }
        }
      }
    } finally {
      // Clean up temp directories
      if (m1Root) fs.rmSync(m1Root, { recursive: true, force: true });
      if (m2Root) fs.rmSync(m2Root, { recursive: true, force: true });
    }
  });

  it("completes the full share/sync lifecycle", async () => {
    await setup();

    // --- Step 1: M1 shares file A ---
    const fileA = `${TEST_PREFIX}/docs/handoff.md`;
    const fileALocal = path.join(m1Root, fileA);
    fs.mkdirSync(path.dirname(fileALocal), { recursive: true });
    fs.writeFileSync(fileALocal, "# Handoff from M1\n\nDiscovery notes here.");
    sharedKeys.push(fileA);

    const shareResult1 = await share({
      paths: [fileALocal],
      company: VAULT_TEST_COMPANY!,
      message: "Initial handoff notes",
      vaultConfig,
      hqRoot: m1Root,
    });

    expect(shareResult1.filesUploaded).toBe(1);
    expect(shareResult1.aborted).toBe(false);
    console.log("Step 1 PASS: M1 shared file A");

    // --- Step 2: M2 syncs → receives A ---
    clearContextCache();

    const syncResult1 = await sync({
      company: VAULT_TEST_COMPANY!,
      vaultConfig,
      hqRoot: m2Root,
    });

    expect(syncResult1.filesDownloaded).toBeGreaterThanOrEqual(1);
    expect(syncResult1.aborted).toBe(false);

    const m2FileA = path.join(m2Root, fileA);
    expect(fs.existsSync(m2FileA)).toBe(true);
    expect(fs.readFileSync(m2FileA, "utf-8")).toContain("Handoff from M1");
    console.log("Step 2 PASS: M2 synced and received file A");

    // --- Step 3: M2 shares file B ---
    const fileB = `${TEST_PREFIX}/knowledge/findings.md`;
    const fileBLocal = path.join(m2Root, fileB);
    fs.mkdirSync(path.dirname(fileBLocal), { recursive: true });
    fs.writeFileSync(fileBLocal, "# Findings from M2\n\nNew discovery.");
    sharedKeys.push(fileB);

    const shareResult2 = await share({
      paths: [fileBLocal],
      company: VAULT_TEST_COMPANY!,
      message: "Research findings",
      vaultConfig,
      hqRoot: m2Root,
    });

    expect(shareResult2.filesUploaded).toBe(1);
    console.log("Step 3 PASS: M2 shared file B");

    // --- Step 4: M1 syncs → receives B ---
    clearContextCache();

    const syncResult2 = await sync({
      company: VAULT_TEST_COMPANY!,
      vaultConfig,
      hqRoot: m1Root,
    });

    expect(syncResult2.filesDownloaded).toBeGreaterThanOrEqual(1);

    const m1FileB = path.join(m1Root, fileB);
    expect(fs.existsSync(m1FileB)).toBe(true);
    expect(fs.readFileSync(m1FileB, "utf-8")).toContain("Findings from M2");
    console.log("Step 4 PASS: M1 synced and received file B");

    // --- Step 5: Conflict — M1 edits A locally, M2 pushes newer A, M1 syncs with keep ---
    // M1 edits locally
    fs.writeFileSync(fileALocal, "# Handoff from M1\n\nEDITED LOCALLY by M1.");

    // M2 pushes newer version
    fs.writeFileSync(m2FileA, "# Handoff from M1\n\nUPDATED by M2.");
    clearContextCache();

    await share({
      paths: [m2FileA],
      company: VAULT_TEST_COMPANY!,
      onConflict: "overwrite",
      vaultConfig,
      hqRoot: m2Root,
    });

    // M1 syncs with --on-conflict=keep
    clearContextCache();

    await sync({
      company: VAULT_TEST_COMPANY!,
      onConflict: "keep",
      vaultConfig,
      hqRoot: m1Root,
    });

    // M1's local version should be preserved
    const m1Content = fs.readFileSync(fileALocal, "utf-8");
    expect(m1Content).toContain("EDITED LOCALLY by M1");
    expect(m1Content).not.toContain("UPDATED by M2");
    console.log("Step 5 PASS: M1 kept local version on conflict");

    console.log("\n=== All 5 lifecycle steps passed ===");
  }, 60_000); // 60s timeout for network ops
});
