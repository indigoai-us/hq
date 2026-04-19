#!/usr/bin/env npx tsx
/**
 * verify-hq-sync.ts — Operator smoke check for hq-sync (VLT-5 US-003).
 *
 * Runs a single-machine share + sync round-trip against the dev stage
 * to verify the sync pipeline is alive and working.
 *
 * Usage:
 *   VAULT_API_URL=https://... VAULT_AUTH_TOKEN=... VAULT_TEST_COMPANY=acme npx tsx tools/vlt-e2e/verify-hq-sync.ts
 *
 * Exit codes:
 *   0 — success
 *   1 — failure
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  resolveEntityContext,
  clearContextCache,
  deleteRemoteFile,
} from "../../packages/hq-cloud/src/index.js";
import { share } from "../../packages/hq-cloud/src/cli/share.js";
import { sync } from "../../packages/hq-cloud/src/cli/sync.js";
import type { VaultServiceConfig } from "../../packages/hq-cloud/src/types.js";

const VAULT_API_URL = process.env.VAULT_API_URL;
const VAULT_AUTH_TOKEN = process.env.VAULT_AUTH_TOKEN;
const VAULT_TEST_COMPANY = process.env.VAULT_TEST_COMPANY;

if (!VAULT_API_URL || !VAULT_AUTH_TOKEN || !VAULT_TEST_COMPANY) {
  console.error("Required env vars: VAULT_API_URL, VAULT_AUTH_TOKEN, VAULT_TEST_COMPANY");
  process.exit(1);
}

const vaultConfig: VaultServiceConfig = {
  apiUrl: VAULT_API_URL,
  authToken: VAULT_AUTH_TOKEN,
  region: "us-east-1",
};

async function main() {
  const testKey = `__verify-hq-sync-${Date.now()}.md`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-verify-sync-"));

  try {
    console.log("verify-hq-sync: starting smoke check...");
    console.log(`  Company: ${VAULT_TEST_COMPANY}`);

    // Step 1: Resolve entity context
    clearContextCache();
    const ctx = await resolveEntityContext(VAULT_TEST_COMPANY!, vaultConfig);
    console.log(`  Entity: ${ctx.uid}`);
    console.log(`  Bucket: ${ctx.bucketName}`);

    // Step 2: Share a test file
    const testFile = path.join(tmpDir, testKey);
    fs.writeFileSync(testFile, `verify-hq-sync smoke check at ${new Date().toISOString()}`);

    const shareResult = await share({
      paths: [testFile],
      company: VAULT_TEST_COMPANY!,
      message: "verify-hq-sync smoke check",
      vaultConfig,
      hqRoot: tmpDir,
    });

    if (shareResult.filesUploaded !== 1) {
      throw new Error(`Expected 1 file uploaded, got ${shareResult.filesUploaded}`);
    }
    console.log("  ✓ Share: 1 file uploaded");

    // Step 3: Sync back to a fresh directory
    const syncDir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-verify-sync-rx-"));
    clearContextCache();

    const syncResult = await sync({
      company: VAULT_TEST_COMPANY!,
      vaultConfig,
      hqRoot: syncDir,
    });

    if (syncResult.filesDownloaded < 1) {
      throw new Error(`Expected ≥1 file downloaded, got ${syncResult.filesDownloaded}`);
    }

    const receivedFile = path.join(syncDir, testKey);
    if (!fs.existsSync(receivedFile)) {
      throw new Error(`Test file not found after sync: ${testKey}`);
    }
    console.log("  ✓ Sync: test file received");

    // Cleanup sync dir
    fs.rmSync(syncDir, { recursive: true, force: true });

    // Step 4: Delete test file from S3
    clearContextCache();
    const cleanCtx = await resolveEntityContext(VAULT_TEST_COMPANY!, vaultConfig);
    await deleteRemoteFile(cleanCtx, testKey);
    console.log("  ✓ Cleanup: test file deleted from S3");

    console.log("\nverify-hq-sync: PASS — share+sync round-trip successful");
    process.exit(0);
  } catch (err) {
    console.error(`\nverify-hq-sync: FAIL — ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
