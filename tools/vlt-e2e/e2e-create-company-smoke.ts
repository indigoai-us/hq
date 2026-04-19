#!/usr/bin/env npx tsx
/**
 * e2e-full-demo-flow.ts — proves the entire HQ flow end-to-end.
 *
 * The flow this script exercises (matches the user's stated demo goal):
 *
 *   0. Cognito browser sign-in (loopback PKCE) → JWT
 *   1. createCompanyFlow: provision person + company entity + bucket + KMS +
 *      owner membership + verify STS + write .hq/config.json
 *   2. Write a local file under companies/{slug}/
 *   3. share() — push the file via vault-vended STS to the company bucket
 *   4. Verify the file landed in S3 with the expected bytes (head + get)
 *   5. Simulate "edit in S3 from another device" by PUTting new content
 *      (still using vault-vended STS — no local AWS creds needed)
 *   6. sync() — pull from S3 (auto-overwrite policy)
 *   7. Read the local file and assert it now matches the S3-side edit
 *
 * Why one script for everything: this is the smallest, most-direct artifact
 * that proves the entire data path works end-to-end. Each phase fails loud,
 * each phase prints a status line, the whole run takes <30s once the user
 * is signed in.
 *
 * Defaults target the deployed `stefanjohnson` stage of hq-pro:
 *   region          = us-east-1
 *   userPoolDomain  = hq-vault-dev
 *   clientId        = 4mmujmjq3srakdueg656b9m0mp
 *   vaultApiUrl     = https://tqdwdqxv75.execute-api.us-east-1.amazonaws.com
 *
 * Override any of them via env (see CONFIG section below).
 *
 * Usage:
 *   npx tsx tools/vlt-e2e/e2e-create-company-smoke.ts
 *
 * Or with overrides:
 *   HQ_ROOT=/tmp/hq-demo COMPANY_SLUG=demo-co \
 *   npx tsx tools/vlt-e2e/e2e-create-company-smoke.ts
 *
 * Idempotent: re-running with the same slug + email reuses entities via
 * VaultConflictError handling in createCompanyFlow.
 *
 * Exit codes:
 *   0 — full flow succeeded
 *   1 — failure in any phase (details printed)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { createCompanyFlow } from "../../packages/hq-onboarding/src/orchestrator.js";
import type { OnboardingProgress } from "../../packages/hq-onboarding/src/types.js";
import type { VaultServiceConfig } from "../../packages/hq-cloud/src/types.js";
import {
  browserLogin,
  loadCachedTokens,
  isExpiring,
  refreshTokens,
  type CognitoAuthConfig,
} from "../../packages/hq-cloud/src/cognito-auth.js";
import { share } from "../../packages/hq-cloud/src/cli/share.js";
import { sync } from "../../packages/hq-cloud/src/cli/sync.js";
import {
  resolveEntityContext,
  refreshEntityContext,
} from "../../packages/hq-cloud/src/context.js";
import {
  uploadFile,
  downloadFile,
  headRemoteFile,
} from "../../packages/hq-cloud/src/s3.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const cognitoConfig: CognitoAuthConfig = {
  region: process.env.AWS_REGION ?? "us-east-1",
  userPoolDomain: process.env.COGNITO_DOMAIN ?? "hq-vault-dev",
  clientId: process.env.COGNITO_CLIENT_ID ?? "4mmujmjq3srakdueg656b9m0mp",
  // 3000 collides with Next.js dev servers (e.g. Levelfit). 8765 is a
  // stable alternate baked into the Cognito client's allowed callback list.
  port: process.env.COGNITO_CALLBACK_PORT
    ? Number(process.env.COGNITO_CALLBACK_PORT)
    : 8765,
};

const vaultApiUrl =
  process.env.VAULT_API_URL ??
  "https://tqdwdqxv75.execute-api.us-east-1.amazonaws.com";

const hqRoot = process.env.HQ_ROOT ?? path.join(os.homedir(), "hq-demo-flow");
const companySlug = process.env.COMPANY_SLUG ?? "indigo-demo-flow";
const companyName = process.env.COMPANY_NAME ?? "Indigo Demo Flow";
const personEmail = process.env.PERSON_EMAIL ?? "stefan@getindigo.ai";
const personName = process.env.PERSON_NAME ?? "Stefan Johnson";

// ---------------------------------------------------------------------------
// Pretty printing
// ---------------------------------------------------------------------------

const HR = "═".repeat(72);

function header(title: string) {
  console.log();
  console.log(HR);
  console.log(`  ${title}`);
  console.log(HR);
}

function step(n: number, label: string, status: "→" | "✓" | "✗" = "→") {
  const icon = status;
  console.log(`  ${icon}  Step ${n}. ${label}`);
}

const STEP_LABELS: Record<string, string> = {
  "create-person": "create person entity",
  "create-company": "create company entity",
  "provision-bucket": "provision S3 bucket + KMS key",
  "bootstrap-membership": "create owner membership",
  "verify-sts": "verify STS credentials",
  "write-config": "write .hq/config.json",
};

function printOnboardingProgress(e: OnboardingProgress) {
  const label = STEP_LABELS[e.step] ?? e.step;
  const icon =
    e.status === "done"
      ? "✓"
      : e.status === "failed"
        ? "✗"
        : e.status === "running"
          ? "→"
          : e.status === "skipped"
            ? "·"
            : "·";
  const detail = e.detail ? ` — ${e.detail}` : "";
  console.log(`     ${icon} ${label}${detail}`);
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

async function phaseLogin(): Promise<string> {
  header("Phase 0 — Cognito browser sign-in");
  console.log(`  Domain:   ${cognitoConfig.userPoolDomain}`);
  console.log(`  ClientID: ${cognitoConfig.clientId}`);
  console.log(`  Callback: http://localhost:${cognitoConfig.port}/callback`);
  console.log();

  // Try cached token first — refresh if near expiry, browser-login if missing
  const cached = loadCachedTokens();
  if (cached && !isExpiring(cached, 120)) {
    step(0, "Reusing cached HQ session", "✓");
    return cached.accessToken;
  }
  if (cached) {
    try {
      step(0, "Refreshing expiring HQ session");
      const refreshed = await refreshTokens(cognitoConfig, cached.refreshToken);
      step(0, "HQ session refreshed", "✓");
      return refreshed.accessToken;
    } catch (err) {
      console.log(
        `     refresh failed (${err instanceof Error ? err.message : err}), falling back to browser login`,
      );
    }
  }

  step(0, "Launching browser for sign-in");
  const tokens = await browserLogin(cognitoConfig);
  step(0, "Signed in to HQ", "✓");
  console.log(`     access token expires at ${tokens.expiresAt}`);
  return tokens.accessToken;
}

interface CompanyHandle {
  personUid: string;
  companyUid: string;
  bucketName: string;
  configPath: string;
}

async function phaseCreateCompany(
  authToken: string,
): Promise<{ vaultConfig: VaultServiceConfig; handle: CompanyHandle }> {
  header("Phase 1 — createCompanyFlow");
  console.log(`  HQ root:  ${hqRoot}`);
  console.log(`  Company:  ${companyName} (${companySlug})`);
  console.log(`  Person:   ${personName} <${personEmail}>`);
  console.log();

  if (!fs.existsSync(hqRoot)) fs.mkdirSync(hqRoot, { recursive: true });

  const vaultConfig: VaultServiceConfig = {
    apiUrl: vaultApiUrl,
    authToken,
    region: cognitoConfig.region,
  };

  const result = await createCompanyFlow(
    {
      mode: "create-company",
      personName,
      personEmail,
      companyName,
      companySlug,
    },
    { vaultConfig, hqRoot },
    printOnboardingProgress,
  );

  if (!result.bucketName) {
    throw new Error(
      "createCompanyFlow returned without bucketName — provisioning may have been skipped",
    );
  }

  const handle: CompanyHandle = {
    personUid: result.personUid,
    companyUid: result.companyUid,
    bucketName: result.bucketName,
    configPath: result.configPath,
  };

  console.log();
  console.log(`     personUid:  ${handle.personUid}`);
  console.log(`     companyUid: ${handle.companyUid}`);
  console.log(`     bucket:     ${handle.bucketName}`);
  console.log(`     config:     ${handle.configPath}`);
  return { vaultConfig, handle };
}

interface FilePlan {
  relativeKey: string;
  absolutePath: string;
  initialContent: string;
}

function planDemoFile(): FilePlan {
  const relativeKey = `companies/${companySlug}/demo-flow.md`;
  const absolutePath = path.join(hqRoot, relativeKey);
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const initialContent = `# HQ End-to-End Demo File

Written locally at ${new Date().toISOString()}.

This file demonstrates the full sync loop:
  1. Local edit
  2. share() → S3
  3. Verify in S3
  4. Edit in S3
  5. sync() → local
  6. Verify local matches S3
`;
  return { relativeKey, absolutePath, initialContent };
}

async function phaseLocalEditAndPush(
  vaultConfig: VaultServiceConfig,
  plan: FilePlan,
) {
  header("Phase 2 + 3 — Local edit + share() push");
  step(2, "Writing local file");
  fs.writeFileSync(plan.absolutePath, plan.initialContent, "utf-8");
  console.log(`     ${plan.absolutePath}`);
  console.log(`     bytes: ${Buffer.byteLength(plan.initialContent)}`);

  step(3, "share() → S3");
  const result = await share({
    paths: [plan.relativeKey],
    company: companySlug,
    vaultConfig,
    hqRoot,
    onConflict: "overwrite",
  });

  if (result.aborted || result.filesUploaded === 0) {
    throw new Error(
      `share() did not upload anything — uploaded=${result.filesUploaded} skipped=${result.filesSkipped} aborted=${result.aborted}`,
    );
  }
  step(3, `Pushed ${result.filesUploaded} file(s), ${result.bytesUploaded} bytes`, "✓");
}

async function phaseVerifyInS3(
  vaultConfig: VaultServiceConfig,
  plan: FilePlan,
): Promise<void> {
  header("Phase 4 — Verify file landed in S3");
  const ctx = await resolveEntityContext(companySlug, vaultConfig);
  console.log(`     bucket: ${ctx.bucketName}`);

  const meta = await headRemoteFile(ctx, plan.relativeKey);
  if (!meta) {
    throw new Error(`Remote object not found: s3://${ctx.bucketName}/${plan.relativeKey}`);
  }
  step(4, `head OK — size=${meta.size}, etag=${meta.etag}, modified=${meta.lastModified.toISOString()}`, "✓");

  // Round-trip the bytes to be 100% sure
  const tmp = path.join(os.tmpdir(), `hq-demo-${Date.now()}.md`);
  await downloadFile(ctx, plan.relativeKey, tmp);
  const remoteBytes = fs.readFileSync(tmp, "utf-8");
  fs.unlinkSync(tmp);
  if (remoteBytes !== plan.initialContent) {
    throw new Error(
      `S3 content mismatch.\n  expected: ${plan.initialContent.length} bytes\n  got:      ${remoteBytes.length} bytes`,
    );
  }
  step(4, `Round-trip bytes match local`, "✓");
}

async function phaseEditInS3AndPull(
  vaultConfig: VaultServiceConfig,
  plan: FilePlan,
): Promise<string> {
  header("Phase 5 + 6 — Edit in S3 + sync() pull");

  // Build a "from another device" content with a clear marker
  const editedContent = `${plan.initialContent}
---

EDITED IN S3 at ${new Date().toISOString()} — this section was added by another device.
`;

  step(5, "uploadFile() to simulate remote edit");
  // refreshEntityContext re-derives STS creds end-to-end, so we don't need a
  // resolveEntityContext warm-up — that turned into a dead `let ctx` write.
  const ctx = await refreshEntityContext(companySlug, vaultConfig);
  const tmp = path.join(os.tmpdir(), `hq-demo-edit-${Date.now()}.md`);
  fs.writeFileSync(tmp, editedContent, "utf-8");
  await uploadFile(ctx, tmp, plan.relativeKey);
  fs.unlinkSync(tmp);
  console.log(`     pushed ${Buffer.byteLength(editedContent)} bytes to s3://${ctx.bucketName}/${plan.relativeKey}`);

  step(6, "sync() pull");
  const result = await sync({
    company: companySlug,
    vaultConfig,
    hqRoot,
    onConflict: "overwrite",
  });
  if (result.aborted) {
    throw new Error("sync() aborted unexpectedly");
  }
  step(6, `Downloaded ${result.filesDownloaded} file(s), ${result.bytesDownloaded} bytes (skipped=${result.filesSkipped}, conflicts=${result.conflicts})`, "✓");
  return editedContent;
}

async function phaseVerifyLocalMatchesEdit(
  plan: FilePlan,
  expectedContent: string,
) {
  header("Phase 7 — Verify local file matches the S3 edit");
  const localBytes = fs.readFileSync(plan.absolutePath, "utf-8");
  if (localBytes !== expectedContent) {
    throw new Error(
      `Local file does not match S3 edit.\n  local bytes:    ${localBytes.length}\n  expected bytes: ${expectedContent.length}\n  --- local ---\n${localBytes.slice(0, 200)}\n  --- expected ---\n${expectedContent.slice(0, 200)}`,
    );
  }
  step(7, `Local file (${localBytes.length} bytes) matches S3 edit byte-for-byte`, "✓");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();

  console.log();
  console.log(HR);
  console.log("  HQ END-TO-END DEMO FLOW");
  console.log(HR);
  console.log(`  Vault API:    ${vaultApiUrl}`);
  console.log(`  Cognito:      https://${cognitoConfig.userPoolDomain}.auth.${cognitoConfig.region}.amazoncognito.com`);
  console.log(`  HQ root:      ${hqRoot}`);
  console.log(`  Demo company: ${companyName} (${companySlug})`);

  const accessToken = await phaseLogin();
  const { vaultConfig, handle } = await phaseCreateCompany(accessToken);
  const plan = planDemoFile();
  await phaseLocalEditAndPush(vaultConfig, plan);
  await phaseVerifyInS3(vaultConfig, plan);
  const expectedContent = await phaseEditInS3AndPull(vaultConfig, plan);
  await phaseVerifyLocalMatchesEdit(plan, expectedContent);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  header(`✓  END-TO-END DEMO PASSED — ${elapsed}s`);
  console.log(`  personUid:  ${handle.personUid}`);
  console.log(`  companyUid: ${handle.companyUid}`);
  console.log(`  bucket:     ${handle.bucketName}`);
  console.log(`  test key:   ${plan.relativeKey}`);
  console.log();
  console.log("  Round-trip verified:");
  console.log("    local → share → S3 ✓");
  console.log("    S3 PUT (other device) → sync → local ✓");
  console.log();
}

main().catch((err) => {
  console.error();
  console.error(HR);
  console.error("  ✗  DEMO FLOW FAILED");
  console.error(HR);
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  console.error();
  process.exit(1);
});
