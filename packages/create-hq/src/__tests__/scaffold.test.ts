import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { fetchTemplate } from "../fetch-template.js";

/**
 * Paths within the scaffolded HQ that intentionally contain user-configurable
 * placeholder strings like {your-username}. These are template variables meant
 * to be replaced by users after scaffolding — not scaffold bugs.
 */
const PLACEHOLDER_EXEMPT_PATHS = [
  "knowledge",
  "starter-projects",
  ".claude/policies",
  ".claude/commands",
  "modules/modules.yaml",
  "README.md",
  "workers",
];

function isExemptFromPlaceholderCheck(relPath: string): boolean {
  return PLACEHOLDER_EXEMPT_PATHS.some((exempt) => relPath.startsWith(exempt));
}

describe("scaffold integration", () => {
  let tmpDir: string;
  let fetchResult: { version: string };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-test-"));
    fetchResult = await fetchTemplate(tmpDir);
  }, 60000); // 60s timeout for network fetch

  afterAll(() => {
    if (tmpDir) fs.removeSync(tmpDir);
  });

  it("creates expected top-level directories", () => {
    const expected = [".claude", "workers", "companies", "workspace", "knowledge", "scripts"];
    for (const dir of expected) {
      expect(
        fs.existsSync(path.join(tmpDir, dir)),
        `Expected directory "${dir}" to exist in scaffolded HQ`
      ).toBe(true);
    }
  });

  it("creates .claude/CLAUDE.md that is non-empty", () => {
    const claudeMd = path.join(tmpDir, ".claude", "CLAUDE.md");
    expect(fs.existsSync(claudeMd), ".claude/CLAUDE.md must exist").toBe(true);
    expect(fs.statSync(claudeMd).size, ".claude/CLAUDE.md must be non-empty").toBeGreaterThan(0);
  });

  it("creates core.yaml with valid YAML and has rules.locked array", () => {
    const coreYaml = path.join(tmpDir, "core.yaml");
    expect(fs.existsSync(coreYaml), "core.yaml must exist").toBe(true);
    const content = fs.readFileSync(coreYaml, "utf-8");
    expect(content.length, "core.yaml must be non-empty").toBeGreaterThan(0);
    expect(content, "core.yaml must contain 'locked' key").toContain("locked");
  });

  it("creates executable scripts/core-integrity.sh", () => {
    const script = path.join(tmpDir, "scripts", "core-integrity.sh");
    expect(fs.existsSync(script), "scripts/core-integrity.sh must exist").toBe(true);
    const stat = fs.statSync(script);
    // Check any executable bit (owner/group/other)
    expect(stat.mode & 0o111, "core-integrity.sh must be executable").toBeTruthy();
  });

  it("core-integrity.sh passes (exit code 0)", () => {
    const script = path.join(tmpDir, "scripts", "core-integrity.sh");
    if (!fs.existsSync(script)) {
      // No governance script in this template version — skip gracefully
      return;
    }
    // Run compute-checksums first so integrity check has fresh checksums
    const computeScript = path.join(tmpDir, "scripts", "compute-checksums.sh");
    if (fs.existsSync(computeScript)) {
      execSync(`bash "${computeScript}"`, { cwd: tmpDir, stdio: "pipe" });
    }
    // execSync throws on non-zero exit code, so reaching next line means success
    execSync(`bash "${script}"`, { cwd: tmpDir, stdio: "pipe" });
    expect(true).toBe(true);
  });

  it("no {your-username} or {your-name} placeholder strings in core operational files", () => {
    /**
     * Checks that scaffolded core files (core.yaml, .claude/CLAUDE.md, scripts/, settings/)
     * do not contain placeholder strings. User-configurable template locations such as
     * knowledge/, starter-projects/, .claude/policies/, .claude/commands/, modules/modules.yaml,
     * workers/, and README.md are intentionally exempt — they ship with placeholder values
     * that users fill in after setup.
     */
    const violations: string[] = [];

    const checkDir = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(tmpDir, fullPath);

        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".git") &&
          entry.name !== "node_modules"
        ) {
          // Skip exempt directories entirely
          if (!PLACEHOLDER_EXEMPT_PATHS.some((e) => relPath.startsWith(e) || e.startsWith(relPath))) {
            checkDir(fullPath);
          } else if (!isExemptFromPlaceholderCheck(relPath)) {
            checkDir(fullPath);
          }
        } else if (entry.isFile() && !isExemptFromPlaceholderCheck(relPath)) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.includes("{your-username}")) {
              violations.push(`${relPath}: contains {your-username}`);
            }
            if (content.includes("{your-name}")) {
              violations.push(`${relPath}: contains {your-name}`);
            }
          } catch {
            // Binary file or unreadable — skip
          }
        }
      }
    };

    checkDir(tmpDir);
    expect(violations, `Placeholder strings in core files:\n${violations.join("\n")}`).toHaveLength(0);
  });

  it("fetched version is a non-empty string", () => {
    /**
     * Verifies fetchTemplate returns a version string. When a GitHub release exists,
     * this will be a semver tag (e.g. "v9.0.0"). When falling back to gh CLI without
     * a release, it returns "latest". Either way, the string must be non-empty.
     */
    expect(
      fetchResult.version,
      "fetchTemplate must return a non-empty version string"
    ).toBeTruthy();
    expect(typeof fetchResult.version).toBe("string");
    expect(fetchResult.version.length).toBeGreaterThan(0);
  });

  it("fetched version matches latest release tag when a release exists", async () => {
    /**
     * When the GitHub repo has published releases, verifies the returned version
     * matches the semver format of the latest release tag. Skips if no releases exist.
     */
    const response = await fetch(
      "https://api.github.com/repos/indigoai-us/hq/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } }
    );

    if (!response.ok) {
      // No releases published yet — version format check not applicable
      console.log(`  Skipping release tag format check (GitHub API returned ${response.status})`);
      return;
    }

    const release = (await response.json()) as { tag_name: string };
    expect(
      fetchResult.version,
      `Fetched version "${fetchResult.version}" should match latest release tag "${release.tag_name}"`
    ).toBe(release.tag_name);
  });
});
