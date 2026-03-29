import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const REPO = "indigoai-us/hq";
const GITHUB_API = "https://api.github.com";

interface ReleaseInfo {
  tag_name: string;
  tarball_url: string;
}

async function getLatestRelease(): Promise<ReleaseInfo> {
  const response = await fetch(`${GITHUB_API}/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }
  const data = (await response.json()) as ReleaseInfo;
  return data;
}

async function getTagRelease(tag: string): Promise<ReleaseInfo> {
  const response = await fetch(`${GITHUB_API}/repos/${REPO}/releases/tags/${tag}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }
  const data = (await response.json()) as ReleaseInfo;
  return data;
}

async function downloadAndExtractViaApi(tarballUrl: string, targetDir: string): Promise<void> {
  const response = await fetch(tarballUrl, {
    headers: { Accept: "application/vnd.github+json" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Failed to download tarball: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-"));
  const tarPath = path.join(tmpDir, "hq.tar.gz");

  try {
    fs.writeFileSync(tarPath, Buffer.from(buffer));
    extractTemplateDirFromTar(tarPath, targetDir);
  } finally {
    fs.removeSync(tmpDir);
  }
}

function extractTemplateDirFromTar(tarPath: string, targetDir: string): void {
  // The tarball contains a top-level directory like `indigoai-us-hq-<sha>/`
  // We need to find the `template/` subdirectory within that and extract it.
  const tmpExtract = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-extract-"));

  try {
    // Extract the full tarball to a temp location
    execSync(`tar -xzf "${tarPath}" -C "${tmpExtract}"`, { stdio: "pipe" });

    // Find the top-level directory created by GitHub's tarball
    const entries = fs.readdirSync(tmpExtract);
    if (entries.length === 0) {
      throw new Error("Tarball was empty");
    }
    const rootDir = path.join(tmpExtract, entries[0]);
    const templateSrc = path.join(rootDir, "template");

    if (!fs.existsSync(templateSrc)) {
      throw new Error("template/ directory not found in HQ tarball");
    }

    // Copy template contents to targetDir
    fs.ensureDirSync(targetDir);
    fs.copySync(templateSrc, targetDir, { overwrite: true });
  } finally {
    fs.removeSync(tmpExtract);
  }
}

function extractTemplateDirViaGhCli(tag: string, targetDir: string): void {
  const ref = tag || "HEAD";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-gh-"));
  const tarPath = path.join(tmpDir, "hq.tar.gz");

  try {
    // Use sh -c so that output redirection works
    execSync(`gh api repos/${REPO}/tarball/${ref} > "${tarPath}"`, {
      stdio: "pipe",
      shell: "/bin/sh",
    });
    extractTemplateDirFromTar(tarPath, targetDir);
  } finally {
    fs.removeSync(tmpDir);
  }
}

/**
 * Fetch the HQ template from GitHub and extract it into targetDir.
 *
 * Strategy:
 * 1. GitHub REST API → download tarball_url
 * 2. Fallback: gh CLI (`gh api repos/indigoai-us/hq/tarball/{ref}`)
 * 3. If both fail: throw with manual clone instructions
 *
 * Returns the version tag that was fetched.
 */
export async function fetchTemplate(
  targetDir: string,
  tag?: string
): Promise<{ version: string }> {
  let version = tag || "";
  let tarballUrl = "";
  let apiError: unknown = null;

  // --- Attempt 1: GitHub API ---
  try {
    const release = tag ? await getTagRelease(tag) : await getLatestRelease();
    version = release.tag_name;
    tarballUrl = release.tarball_url;
    await downloadAndExtractViaApi(tarballUrl, targetDir);
    return { version };
  } catch (err) {
    apiError = err;
  }

  // --- Attempt 2: gh CLI fallback ---
  try {
    const ref = tag || "HEAD";
    extractTemplateDirViaGhCli(ref, targetDir);
    // If we got a version from the API response (even if download failed later), keep it.
    // Otherwise mark as unknown.
    if (!version) {
      version = tag || "latest";
    }
    return { version };
  } catch (ghErr) {
    // Both failed — provide a clear error message.
    const apiMsg = apiError instanceof Error ? apiError.message : String(apiError);
    const ghMsg = ghErr instanceof Error ? ghErr.message : String(ghErr);
    throw new Error(
      `Failed to fetch HQ template from GitHub.\n\n` +
        `  GitHub API error: ${apiMsg}\n` +
        `  gh CLI error:     ${ghMsg}\n\n` +
        `You appear to be offline or rate-limited.\n` +
        `To set up HQ manually, clone the repo and copy the template directory:\n\n` +
        `  git clone https://github.com/indigoai-us/hq.git\n` +
        `  cp -R hq/template ${targetDir}\n`
    );
  }
}
