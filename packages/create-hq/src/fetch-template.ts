import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Scaffold source: the hq-core repo IS the scaffold (its entire tree is the
// starter content). This replaced the older `indigoai-us/hq` + `template/`
// subdirectory pattern when the monorepo was split (hq-core v12+). Old tags
// still on the `indigoai-us/hq` side will not resolve via this client — users
// on those must use the matching create-hq pre-v12 release.
const REPO = "indigoai-us/hq-core";

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
  // The tarball contains a top-level directory like `indigoai-us-hq-core-<sha>/`.
  // The hq-core repo IS the scaffold — every file in it becomes part of the
  // new HQ instance. Copy the entire root directory's contents (not a subdir).
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

    // Sanity check — hq-core must carry core.yaml at its root.
    const coreYaml = path.join(rootDir, "core.yaml");
    if (!await fs.pathExists(coreYaml)) {
      throw new Error(
        "core.yaml not found at tarball root — this does not look like an hq-core scaffold",
      );
    }

    // Copy the entire hq-core tree to targetDir
    onProgress?.("Copying scaffold files...");
    await fs.ensureDir(targetDir);
    await fs.copy(rootDir, targetDir, { overwrite: true });
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
 * Fetch the hq-core scaffold from GitHub and extract it into targetDir.
 *
 * hq-core is the standalone scaffold seed (formerly the `template/` subdir of
 * `indigoai-us/hq`). Its entire repository tree is the fresh-install content.
 * Rich add-ons ship separately as `@indigoai-us/hq-pack-*` content packs
 * installed by the next phase of create-hq via `hq install`.
 *
 * Strategy:
 * 1. GitHub REST API → download tarball_url
 * 2. Fallback: gh CLI (`gh api repos/indigoai-us/hq-core/tarball/{ref}`)
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
      `Failed to fetch hq-core scaffold from GitHub.\n\n` +
        `  GitHub API error: ${apiMsg}\n` +
        `  gh CLI error:     ${ghMsg}\n\n` +
        `You appear to be offline or rate-limited.\n` +
        `To set up HQ manually, clone the scaffold repo:\n\n` +
        `  git clone https://github.com/indigoai-us/hq-core.git ${targetDir}\n` +
        `  rm -rf ${targetDir}/.git\n`
    );
  }
}
