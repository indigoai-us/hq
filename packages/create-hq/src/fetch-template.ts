import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const REPO = "indigoai-us/hq";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
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

async function downloadAndExtractViaApi(
  tarballUrl: string,
  targetDir: string,
  onProgress?: (phase: string) => void,
): Promise<void> {
  onProgress?.("Downloading HQ template...");
  const response = await fetch(tarballUrl, {
    headers: { Accept: "application/vnd.github+json" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Failed to download tarball: ${response.status} ${response.statusText}`);
  }

  // Stream download with progress
  const totalBytes = Number(response.headers.get("content-length")) || 0;
  const chunks: Uint8Array[] = [];
  let downloadedBytes = 0;

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloadedBytes += value.length;
      if (totalBytes > 0) {
        onProgress?.(`Downloading HQ template... ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`);
      } else {
        onProgress?.(`Downloading HQ template... ${formatBytes(downloadedBytes)}`);
      }
    }
  } else {
    // Fallback if body stream not available
    const buf = await response.arrayBuffer();
    chunks.push(new Uint8Array(buf));
  }

  const buffer = Buffer.concat(chunks);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-hq-"));
  const tarPath = path.join(tmpDir, "hq.tar.gz");

  try {
    onProgress?.("Extracting template...");
    await fs.writeFile(tarPath, buffer);
    await extractTemplateDirFromTar(tarPath, targetDir, onProgress);
  } finally {
    await fs.remove(tmpDir);
  }
}

async function extractTemplateDirFromTar(
  tarPath: string,
  targetDir: string,
  onProgress?: (phase: string) => void,
): Promise<void> {
  // The tarball contains a top-level directory like `indigoai-us-hq-<sha>/`
  // We need to find the `template/` subdirectory within that and extract it.
  const tmpExtract = await fs.mkdtemp(path.join(os.tmpdir(), "create-hq-extract-"));

  try {
    // Extract the full tarball to a temp location
    await execAsync(`tar -xzf "${tarPath}" -C "${tmpExtract}"`);

    // Find the top-level directory created by GitHub's tarball
    const entries = await fs.readdir(tmpExtract);
    if (entries.length === 0) {
      throw new Error("Tarball was empty");
    }
    const rootDir = path.join(tmpExtract, entries[0]);
    const templateSrc = path.join(rootDir, "template");

    if (!await fs.pathExists(templateSrc)) {
      throw new Error("template/ directory not found in HQ tarball");
    }

    // Copy template contents to targetDir
    onProgress?.("Copying template files...");
    await fs.ensureDir(targetDir);
    await fs.copy(templateSrc, targetDir, { overwrite: true });
  } finally {
    await fs.remove(tmpExtract);
  }
}

async function extractTemplateDirViaGhCli(
  tag: string,
  targetDir: string,
  onProgress?: (phase: string) => void,
): Promise<void> {
  const ref = tag || "HEAD";
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-hq-gh-"));
  const tarPath = path.join(tmpDir, "hq.tar.gz");

  try {
    onProgress?.("Downloading via gh CLI...");
    await execAsync(`gh api repos/${REPO}/tarball/${ref} > "${tarPath}"`, {
      shell: "/bin/sh",
    });
    onProgress?.("Extracting template...");
    await extractTemplateDirFromTar(tarPath, targetDir, onProgress);
  } finally {
    await fs.remove(tmpDir);
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
  tag?: string,
  onProgress?: (phase: string) => void,
): Promise<{ version: string }> {
  let version = tag || "";
  let tarballUrl = "";
  let apiError: unknown = null;

  // --- Attempt 1: GitHub API ---
  try {
    onProgress?.("Resolving latest release...");
    const release = tag ? await getTagRelease(tag) : await getLatestRelease();
    version = release.tag_name;
    tarballUrl = release.tarball_url;
    await downloadAndExtractViaApi(tarballUrl, targetDir, onProgress);
    return { version };
  } catch (err) {
    apiError = err;
  }

  // --- Attempt 2: gh CLI fallback ---
  try {
    const ref = tag || "HEAD";
    await extractTemplateDirViaGhCli(ref, targetDir, onProgress);
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
