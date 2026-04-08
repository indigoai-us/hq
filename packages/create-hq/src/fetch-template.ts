import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const REPO = "indigoai-us/hq";
const REPO_HTTPS = `https://github.com/${REPO}.git`;
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
  return (await response.json()) as ReleaseInfo;
}

async function getTagRelease(tag: string): Promise<ReleaseInfo> {
  const response = await fetch(`${GITHUB_API}/repos/${REPO}/releases/tags/${tag}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }
  return (await response.json()) as ReleaseInfo;
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
    // tar is part of git for windows + present on macOS/Linux
    execSync(`tar -xzf "${tarPath}" -C "${tmpExtract}"`, { stdio: "pipe" });

    const entries = fs.readdirSync(tmpExtract);
    if (entries.length === 0) {
      throw new Error("Tarball was empty");
    }
    const rootDir = path.join(tmpExtract, entries[0]);
    const templateSrc = path.join(rootDir, "template");

    if (!fs.existsSync(templateSrc)) {
      throw new Error("template/ directory not found in HQ tarball");
    }

    fs.ensureDirSync(targetDir);
    fs.copySync(templateSrc, targetDir, { overwrite: true });
  } finally {
    fs.removeSync(tmpExtract);
  }
}

/**
 * Fallback: shallow git clone the public HQ repo and copy template/ out.
 * Used when the GitHub REST API tarball download fails (network, rate limit,
 * proxy issues). Requires git, which is checked as a hard dep before this
 * function is reached.
 */
function fetchViaGitClone(targetDir: string, tag: string | undefined): { version: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-git-"));

  try {
    if (tag) {
      // Clone with a specific tag (still shallow)
      execSync(
        `git clone --depth 1 --branch "${tag}" "${REPO_HTTPS}" "${tmpDir}"`,
        { stdio: "pipe" }
      );
    } else {
      // Default branch shallow clone
      execSync(`git clone --depth 1 "${REPO_HTTPS}" "${tmpDir}"`, {
        stdio: "pipe",
      });
    }

    const templateSrc = path.join(tmpDir, "template");
    if (!fs.existsSync(templateSrc)) {
      throw new Error("template/ directory not found in cloned HQ repo");
    }

    fs.ensureDirSync(targetDir);
    fs.copySync(templateSrc, targetDir, { overwrite: true });

    // Best-effort version detection: read the cloned tag, or fall back
    let version = tag || "latest";
    if (!tag) {
      try {
        const described = execSync(`git -C "${tmpDir}" describe --tags --abbrev=0`, {
          stdio: "pipe",
          encoding: "utf-8",
        }).trim();
        if (described) version = described;
      } catch {
        // No tags reachable in shallow clone — keep "latest"
      }
    }

    return { version };
  } finally {
    fs.removeSync(tmpDir);
  }
}

/**
 * Fetch the HQ template from GitHub and extract it into targetDir.
 *
 * Strategy:
 * 1. GitHub REST API → download tarball_url
 * 2. Fallback: `git clone --depth 1` (git is a hard dep, checked up front)
 * 3. If both fail: throw with manual instructions
 *
 * Returns the version tag that was fetched.
 */
export async function fetchTemplate(
  targetDir: string,
  tag?: string
): Promise<{ version: string }> {
  let version = tag || "";
  let apiError: unknown = null;

  // --- Attempt 1: GitHub API ---
  try {
    const release = tag ? await getTagRelease(tag) : await getLatestRelease();
    version = release.tag_name;
    await downloadAndExtractViaApi(release.tarball_url, targetDir);
    return { version };
  } catch (err) {
    apiError = err;
  }

  // --- Attempt 2: git clone fallback ---
  try {
    return fetchViaGitClone(targetDir, tag);
  } catch (gitErr) {
    const apiMsg = apiError instanceof Error ? apiError.message : String(apiError);
    const gitMsg = gitErr instanceof Error ? gitErr.message : String(gitErr);
    throw new Error(
      `Failed to fetch HQ template from GitHub.\n\n` +
        `  GitHub API error: ${apiMsg}\n` +
        `  git clone error:  ${gitMsg}\n\n` +
        `Check your network connection and try again. To set up HQ manually:\n\n` +
        `  git clone https://github.com/${REPO}.git\n` +
        `  cp -R hq/template ${targetDir}\n`
    );
  }
}
