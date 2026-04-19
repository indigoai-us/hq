#!/usr/bin/env npx tsx
/**
 * probe-findbyslug.ts — sanity-check that vault-service's /entity/by-slug route
 * actually returns the right entity for a known slug, and 404s on a missing one.
 *
 * Why this exists: the e2e demo currently provisions a fresh company on every
 * run because the server is NOT throwing VaultConflictError on duplicate slugs.
 * Before patching the orchestrator to do a "findBySlug then create" guard, we
 * need to know whether findBySlug itself works as advertised. If it doesn't,
 * the orchestrator fix is pointless and the bug must be fixed server-side.
 *
 * Usage:
 *   npx tsx tools/vlt-e2e/probe-findbyslug.ts
 *
 * Prints one block per probe; non-zero exit if findBySlug doesn't behave.
 */

import {
  VaultClient,
  VaultNotFoundError,
  VaultClientError,
} from "../../packages/hq-cloud/src/vault-client.js";
import {
  loadCachedTokens,
  isExpiring,
  refreshTokens,
  type CognitoAuthConfig,
} from "../../packages/hq-cloud/src/cognito-auth.js";

const cognitoConfig: CognitoAuthConfig = {
  region: "us-east-1",
  userPoolDomain: "hq-vault-dev",
  clientId: "4mmujmjq3srakdueg656b9m0mp",
};

const vaultApiUrl =
  process.env.VAULT_API_URL ??
  "https://tqdwdqxv75.execute-api.us-east-1.amazonaws.com";

async function getAccessToken(): Promise<string> {
  const cached = loadCachedTokens();
  if (!cached) {
    throw new Error(
      "No cached cognito token. Run e2e-create-company-smoke first to sign in.",
    );
  }
  if (isExpiring(cached, 120)) {
    const refreshed = await refreshTokens(cognitoConfig, cached.refreshToken);
    return refreshed.accessToken;
  }
  return cached.accessToken;
}

async function probe(client: VaultClient, type: string, slug: string) {
  const label = `findBySlug("${type}", "${slug}")`;
  try {
    const entity = await client.entity.findBySlug(type, slug);
    console.log(`  ✓ ${label}`);
    console.log(`     uid:  ${entity.uid}`);
    console.log(`     type: ${entity.type}`);
    console.log(`     slug: ${entity.slug}`);
    console.log(`     name: ${entity.displayName ?? "(none)"}`);
    return { ok: true as const, entity };
  } catch (err) {
    if (err instanceof VaultNotFoundError) {
      console.log(`  · ${label} → 404 (not found)`);
      return { ok: false as const, notFound: true };
    }
    if (err instanceof VaultClientError) {
      console.log(`  ✗ ${label} → ${err.statusCode} ${err.message}`);
      return { ok: false as const, status: err.statusCode };
    }
    console.log(`  ✗ ${label} → ${err instanceof Error ? err.message : err}`);
    return { ok: false as const };
  }
}

async function main() {
  const accessToken = await getAccessToken();
  const client = new VaultClient({
    apiUrl: vaultApiUrl,
    authToken: accessToken,
    region: "us-east-1",
  });

  console.log("Probing vault-service findBySlug...\n");
  console.log(`  api: ${vaultApiUrl}\n`);

  console.log("Probe 1: known-existing slug (created by repeated e2e demo runs)");
  const existing = await probe(client, "company", "indigo-demo-flow");
  console.log();

  console.log("Probe 2: known-missing slug (random)");
  const random = `nonexistent-${Date.now()}`;
  const missing = await probe(client, "company", random);
  console.log();

  console.log('Probe 3: known-existing person slug ("stefan" — slugFromEmail format)');
  await probe(client, "person", "stefan");
  console.log();

  console.log("─".repeat(60));
  console.log("Verdict:");
  if (existing.ok && !missing.ok && missing.notFound) {
    console.log("  ✓ findBySlug works correctly — orchestrator fix is viable");
    process.exit(0);
  }
  if (!existing.ok && existing.notFound) {
    console.log(
      "  ✗ findBySlug returns 404 for a slug that DEFINITELY exists.",
    );
    console.log(
      "    → Server bug: /entity/by-slug is not finding entities created via /entity",
    );
    console.log(
      "    → Orchestrator fix (findBySlug → create) will NOT work; fix server first",
    );
    process.exit(1);
  }
  console.log("  ? findBySlug behavior unexpected — see probe output above");
  process.exit(2);
}

main().catch((err) => {
  console.error("FATAL:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
