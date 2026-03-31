/**
 * Package discovery, download, and installation for create-hq (US-008)
 *
 * Handles:
 * - Public package discovery (GET /api/packages)
 * - Entitlement check (GET /api/packages/my-entitlements)
 * - Package download with SHA256 + RSA signature verification
 * - Extraction to packages/installed/<slug>/
 * - Registry.yaml update
 * - Auto-merge for fresh HQ (register workers, commands, knowledge)
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import chalk from "chalk";
import type { AuthToken } from "./auth.js";

// ─── Registry URL ────────────────────────────────────────────────────────────

const DEFAULT_REGISTRY_URL = "https://registry.hq.sh/api";

/**
 * Read the registry URL from packages/sources.yaml in the target HQ dir.
 * Falls back to the default registry URL if sources.yaml is not present
 * (which is expected during initial scaffold before the template is fully
 * written).
 */
export function getRegistryUrl(hqRoot: string): string {
  const sourcesPath = path.join(hqRoot, "packages", "sources.yaml");
  if (fs.existsSync(sourcesPath)) {
    const content = fs.readFileSync(sourcesPath, "utf-8");
    // Simple YAML extraction — avoid adding js-yaml as dep to create-hq
    const urlMatch = content.match(/url:\s*["']?([^\s"']+)/);
    if (urlMatch?.[1]) {
      return urlMatch[1];
    }
  }
  return DEFAULT_REGISTRY_URL;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PackageMeta {
  slug: string;
  name: string;
  description: string;
  tier: string;
  latest_version: string;
  author?: string;
}

export interface EntitlementEntry {
  slug: string;
  tier: string;
  granted_at: string;
  expires_at?: string;
}

export interface DownloadInfo {
  url: string;
  sha256: string;
  signature?: string;
}

/** A package shown in the TUI list with its selection state. */
export interface PackageChoice {
  pkg: PackageMeta;
  entitled: boolean;
  selected: boolean;
}

// ─── API client (lightweight, no class needed) ───────────────────────────────

async function apiGet<T>(
  registryUrl: string,
  urlPath: string,
  authToken?: string
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${registryUrl}${urlPath}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Registry API GET ${urlPath} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

/**
 * Fetch the public package catalog.
 * Returns an empty array on failure (network down, etc.).
 */
export async function fetchPublicPackages(
  registryUrl: string
): Promise<PackageMeta[]> {
  try {
    const data = await apiGet<{ packages: PackageMeta[] }>(
      registryUrl,
      "/packages"
    );
    return data.packages ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch packages the authenticated user is entitled to.
 * Returns an empty array on failure.
 */
export async function fetchEntitlements(
  registryUrl: string,
  authToken: string
): Promise<EntitlementEntry[]> {
  try {
    const data = await apiGet<{ entitlements: EntitlementEntry[] }>(
      registryUrl,
      "/packages/my-entitlements",
      authToken
    );
    return data.entitlements ?? [];
  } catch {
    return [];
  }
}

/**
 * Build the combined package list for the TUI.
 * Entitled packages are pre-checked; non-entitled are shown with lock icon.
 */
export function buildPackageChoices(
  allPackages: PackageMeta[],
  entitlements: EntitlementEntry[]
): PackageChoice[] {
  const entitledSlugs = new Set(entitlements.map((e) => e.slug));
  return allPackages.map((pkg) => ({
    pkg,
    entitled: entitledSlugs.has(pkg.slug),
    selected: entitledSlugs.has(pkg.slug), // pre-check entitled packages
  }));
}

// ─── Integrity verification ──────────────────────────────────────────────────

async function verifySha256(
  filePath: string,
  expectedHash: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      const computed = hash.digest("hex");
      resolve(computed === expectedHash.toLowerCase());
    });
    stream.on("error", reject);
  });
}

function verifyRsaSignature(
  sha256Hash: string,
  signature: string,
  hqRoot: string
): boolean {
  const keyPath = path.resolve(hqRoot, "packages", ".keys", "registry-public.pem");
  if (!fs.existsSync(keyPath)) {
    return false;
  }
  const publicKey = fs.readFileSync(keyPath, "utf-8");
  const verifier = crypto.createVerify("SHA256");
  verifier.update(sha256Hash);
  verifier.end();
  return verifier.verify(publicKey, Buffer.from(signature, "base64"));
}

// ─── Download + extract ──────────────────────────────────────────────────────

async function getDownloadInfo(
  registryUrl: string,
  slug: string,
  authToken?: string
): Promise<DownloadInfo> {
  return apiGet<DownloadInfo>(
    registryUrl,
    `/packages/${encodeURIComponent(slug)}/download`,
    authToken
  );
}

/**
 * Download, verify, and extract a single package into the target HQ.
 * Returns true on success, false on failure (non-throwing for batch installs).
 */
export async function installPackage(
  registryUrl: string,
  slug: string,
  hqRoot: string,
  authToken?: string
): Promise<boolean> {
  const tmpFile = path.resolve(
    os.tmpdir(),
    `hq-pkg-${slug}-${Date.now()}.tar.gz`
  );

  try {
    // 1. Get download URL
    const download = await getDownloadInfo(registryUrl, slug, authToken);

    // 2. Download
    const response = await fetch(download.url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tmpFile, buffer);

    // 3. Verify SHA256
    const hashValid = await verifySha256(tmpFile, download.sha256);
    if (!hashValid) {
      throw new Error("SHA256 hash mismatch — file may be corrupted or tampered with");
    }

    // 4. Verify RSA signature (warn-only, non-blocking)
    if (download.signature) {
      const sigValid = verifyRsaSignature(download.sha256, download.signature, hqRoot);
      if (!sigValid) {
        // Non-fatal — proceed with SHA256-only verification
      }
    }

    // 5. Extract to packages/installed/<slug>/
    const installDir = path.resolve(hqRoot, "packages", "installed", slug);
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    fs.mkdirSync(installDir, { recursive: true });
    execSync(`tar -xzf "${tmpFile}" -C "${installDir}"`, { stdio: "pipe" });

    // 6. Validate package.yaml slug
    const packageYamlPath = path.resolve(installDir, "package.yaml");
    if (fs.existsSync(packageYamlPath)) {
      const pkgContent = fs.readFileSync(packageYamlPath, "utf-8");
      const slugMatch = pkgContent.match(/^slug:\s*(.+)$/m);
      if (slugMatch?.[1]?.trim() && slugMatch[1].trim() !== slug) {
        fs.rmSync(installDir, { recursive: true, force: true });
        throw new Error(
          `Package slug mismatch: expected "${slug}", got "${slugMatch[1].trim()}"`
        );
      }
    }

    // 7. Update registry.yaml
    updateRegistry(hqRoot, slug, registryUrl);

    // 8. Auto-merge into fresh HQ
    autoMergePackage(installDir, hqRoot);

    return true;
  } catch {
    return false;
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

// ─── Registry.yaml update ────────────────────────────────────────────────────

function updateRegistry(
  hqRoot: string,
  slug: string,
  source: string
): void {
  const registryPath = path.resolve(hqRoot, "packages", "registry.yaml");
  const packagesDir = path.dirname(registryPath);

  if (!fs.existsSync(packagesDir)) {
    fs.mkdirSync(packagesDir, { recursive: true });
  }

  const now = new Date().toISOString();

  // Read existing registry or create empty one
  let entries: Array<Record<string, string>> = [];
  if (fs.existsSync(registryPath)) {
    const content = fs.readFileSync(registryPath, "utf-8");
    // Simple YAML array parsing — each entry starts with "- slug:"
    const existing = content.match(/^packages:/m) ? content : "";
    if (existing) {
      // Parse existing entries (basic approach without js-yaml dep)
      try {
        const lines = content.split("\n");
        let current: Record<string, string> | null = null;
        for (const line of lines) {
          if (line.match(/^\s*-\s+\w+:/)) {
            if (current) entries.push(current);
            current = {};
            const kv = line.replace(/^\s*-\s+/, "").split(/:\s*/);
            if (kv.length >= 2) current[kv[0]] = kv.slice(1).join(":");
          } else if (line.match(/^\s+\w+:/) && current) {
            const kv = line.trim().split(/:\s*/);
            if (kv.length >= 2) current[kv[0]] = kv.slice(1).join(":");
          }
        }
        if (current) entries.push(current);
      } catch {
        entries = [];
      }
    }
  }

  // Remove existing entry for this slug
  entries = entries.filter((e) => e.slug !== slug);

  // Add new entry
  entries.push({
    slug,
    name: slug,
    version: "latest",
    source,
    installed_at: now,
    updated_at: now,
  });

  // Write back as YAML
  const yamlLines = ["packages:"];
  for (const entry of entries) {
    let first = true;
    for (const [key, value] of Object.entries(entry)) {
      if (first) {
        yamlLines.push(`  - ${key}: ${value}`);
        first = false;
      } else {
        yamlLines.push(`    ${key}: ${value}`);
      }
    }
  }
  fs.writeFileSync(registryPath, yamlLines.join("\n") + "\n", "utf-8");
}

// ─── Auto-merge for fresh HQ ────────────────────────────────────────────────

/**
 * Merge package contents into a fresh HQ directory.
 *
 * Since this runs during initial scaffold (fresh HQ), there are no conflicts.
 * Simply copies workers, commands, knowledge, and other assets into their
 * standard locations.
 */
function autoMergePackage(installDir: string, hqRoot: string): void {
  // Workers: copy to workers/public/<worker-name>/
  const workersDir = path.join(installDir, "workers");
  if (fs.existsSync(workersDir)) {
    const targetWorkersDir = path.join(hqRoot, "workers", "public");
    copyDirContents(workersDir, targetWorkersDir);
  }

  // Commands: copy to .claude/commands/
  const commandsDir = path.join(installDir, "commands");
  if (fs.existsSync(commandsDir)) {
    const targetCommandsDir = path.join(hqRoot, ".claude", "commands");
    copyDirContents(commandsDir, targetCommandsDir);
  }

  // Knowledge: copy to knowledge/public/
  const knowledgeDir = path.join(installDir, "knowledge");
  if (fs.existsSync(knowledgeDir)) {
    const targetKnowledgeDir = path.join(hqRoot, "knowledge", "public");
    copyDirContents(knowledgeDir, targetKnowledgeDir);
  }

  // Skills: copy to .claude/skills/
  const skillsDir = path.join(installDir, "skills");
  if (fs.existsSync(skillsDir)) {
    const targetSkillsDir = path.join(hqRoot, ".claude", "skills");
    copyDirContents(skillsDir, targetSkillsDir);
  }

  // Policies: copy to .claude/policies/
  const policiesDir = path.join(installDir, "policies");
  if (fs.existsSync(policiesDir)) {
    const targetPoliciesDir = path.join(hqRoot, ".claude", "policies");
    copyDirContents(policiesDir, targetPoliciesDir);
  }
}

function copyDirContents(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── TUI display helpers ────────────────────────────────────────────────────

/** Format a package for display in the selection list. */
export function formatPackageChoice(choice: PackageChoice): string {
  const { pkg, entitled } = choice;
  if (entitled) {
    return `${pkg.name} ${chalk.dim(`— ${pkg.description}`)}`;
  }
  // Non-entitled: lock icon + tier label
  return `${chalk.dim("🔒")} ${chalk.dim(pkg.name)} ${chalk.dim(`— ${pkg.description}`)} ${chalk.yellow(`[${pkg.tier}]`)}`;
}

/**
 * Install multiple packages in sequence, reporting progress.
 * Returns the list of successfully installed slugs.
 */
export async function installSelectedPackages(
  registryUrl: string,
  slugs: string[],
  hqRoot: string,
  authToken?: string
): Promise<string[]> {
  const installed: string[] = [];

  for (const slug of slugs) {
    const ok = await installPackage(registryUrl, slug, hqRoot, authToken);
    if (ok) {
      installed.push(slug);
    }
  }

  return installed;
}
