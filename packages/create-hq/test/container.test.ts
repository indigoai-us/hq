import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { fetchTemplate } from "../src/fetch-template.js";

const TEST_DIR = path.resolve(__dirname);
const REPO_ROOT = path.resolve(TEST_DIR, "../../..");
const PKG_DIR = path.resolve(REPO_ROOT, "packages/create-hq");
const DOCKER_DIR = path.join(TEST_DIR, "docker");
const SMOKE_SCRIPT = path.join(TEST_DIR, "smoke-test.sh");

function exec(cmd: string, opts?: { cwd?: string; timeout?: number }): string {
  return execSync(cmd, {
    encoding: "utf-8",
    timeout: opts?.timeout ?? 120_000,
    cwd: opts?.cwd ?? REPO_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function execSafe(
  cmd: string,
  opts?: { cwd?: string; timeout?: number }
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = exec(cmd, opts);
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.status ?? 1,
    };
  }
}

let tarballPath = "";
let templateDir = "";

describe("container smoke tests", () => {
  beforeAll(async () => {
    // Build create-hq and pack tarball
    exec("npm run build", { cwd: PKG_DIR });
    const packOutput = exec("npm pack", { cwd: PKG_DIR }).trim();
    const tarballName = packOutput.split("\n").pop()!;
    tarballPath = path.join(PKG_DIR, tarballName);
    expect(fs.existsSync(tarballPath)).toBe(true);

    // Fetch the hq-core scaffold to a host-side temp dir for `--local-template`.
    // The repo's old `template/` subdirectory was removed when the scaffold was
    // split into its own repo (indigoai-us/hq-core). Fetching once on the host
    // lets blank-slate containers run without GitHub auth, and dogfoods the
    // real fetchTemplate path that end users hit on `npx create-hq`.
    templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-hq-smoke-template-"));
    await fetchTemplate(templateDir);

    // Pre-flight regression guard: refuse to run smoke tests against an empty
    // or malformed scaffold. Without this, a missing/empty template dir causes
    // every `dir-exists:*` assertion inside the container to fail with the
    // unhelpful "Assertion failed" message — exactly the silent regression
    // that hit CI when `template/` was deleted.
    expect(
      fs.existsSync(path.join(templateDir, "core.yaml")),
      "Fetched hq-core template missing core.yaml — fetchTemplate likely failed"
    ).toBe(true);
    expect(
      fs.existsSync(path.join(templateDir, ".claude", "CLAUDE.md")),
      "Fetched hq-core template missing .claude/CLAUDE.md"
    ).toBe(true);

    // Build Docker images (use cache)
    exec(
      `docker build -f ${DOCKER_DIR}/Dockerfile.blank-slate -t create-hq-test:blank ${DOCKER_DIR}`,
      { timeout: 120_000 }
    );
    exec(
      `docker build -f ${DOCKER_DIR}/Dockerfile.pre-deps -t create-hq-test:pre-deps ${DOCKER_DIR}`,
      { timeout: 120_000 }
    );
  }, 240_000); // 4 min: build + tarball fetch + docker

  it(
    "smoke-test.sh passes in blank-slate container",
    () => {
      const { stdout, stderr, exitCode } = execSafe(
        `docker run --rm ` +
          `-v "${tarballPath}:/opt/create-hq/create-hq.tgz:ro" ` +
          `-v "${templateDir}:/opt/create-hq/template:ro" ` +
          `-v "${SMOKE_SCRIPT}:/opt/create-hq/smoke-test.sh:ro" ` +
          `create-hq-test:blank bash /opt/create-hq/smoke-test.sh --image blank-slate`
      );

      if (exitCode !== 0) {
        console.log("=== stdout ===");
        console.log(stdout);
        console.log("=== stderr ===");
        console.log(stderr);
      }

      // blank-slate is best-effort — git assertions will be skipped.
      // We don't require exit 0 here since missing git is expected.
      // But if the container ran at all, we expect the JSON report.
      const jsonMatch = stdout.match(
        /JSON_REPORT_START\n(.*)\nJSON_REPORT_END/
      );
      expect(jsonMatch, "Expected JSON report in output").toBeTruthy();

      const report = JSON.parse(jsonMatch![1]);
      expect(report.image).toBe("blank-slate");
      // blank-slate should pass all assertions (git ones are skipped, not failed)
      expect(report.passed).toBe(true);
    },
    120_000
  );

  it(
    "smoke-test.sh passes in pre-deps container (happy path)",
    () => {
      const { stdout, stderr, exitCode } = execSafe(
        `docker run --rm ` +
          `-v "${tarballPath}:/opt/create-hq/create-hq.tgz:ro" ` +
          `-v "${templateDir}:/opt/create-hq/template:ro" ` +
          `-v "${SMOKE_SCRIPT}:/opt/create-hq/smoke-test.sh:ro" ` +
          `create-hq-test:pre-deps bash /opt/create-hq/smoke-test.sh --image pre-deps`
      );

      if (exitCode !== 0) {
        console.log("=== stdout ===");
        console.log(stdout);
        console.log("=== stderr ===");
        console.log(stderr);
      }

      // pre-deps is the happy path — must pass with exit 0
      expect(exitCode, "pre-deps container must exit 0").toBe(0);

      const jsonMatch = stdout.match(
        /JSON_REPORT_START\n(.*)\nJSON_REPORT_END/
      );
      expect(jsonMatch, "Expected JSON report in output").toBeTruthy();

      const report = JSON.parse(jsonMatch![1]);
      expect(report.image).toBe("pre-deps");
      expect(report.passed).toBe(true);
      expect(report.fail_count).toBe(0);
    },
    120_000
  );

  // Cleanup tarball + fetched template dir after all tests
  afterAll(() => {
    if (tarballPath && fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
    if (templateDir && fs.existsSync(templateDir)) {
      fs.rmSync(templateDir, { recursive: true, force: true });
    }
  });
});
