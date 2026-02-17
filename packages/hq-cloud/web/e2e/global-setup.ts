import { clerkSetup } from "@clerk/testing/playwright";
import { FullConfig } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Playwright global setup.
 *
 * 1. Loads .env.e2e (E2E test credentials: E2E_TEST_EMAIL, etc.)
 * 2. Calls clerkSetup() from @clerk/testing to provision a testing token.
 *
 * clerkSetup() internally loads .env.local / .env for Clerk keys,
 * then calls the Clerk Backend API to create a testing token.
 *
 * Required env vars:
 *   .env.local:  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
 *   .env.e2e:    E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 */

/** Load a .env file into process.env (without overwriting existing vars) */
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // Don't overwrite existing env vars (e.g. from CI secrets)
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export default async function globalSetup(config: FullConfig) {
  // Load E2E test credentials from .env.e2e
  const webRoot = path.resolve(__dirname, "..");
  loadEnvFile(path.join(webRoot, ".env.e2e"));

  await clerkSetup({
    frontendApiUrl:
      config.projects[0]?.use?.baseURL ?? "http://localhost:3000",
  });
}
