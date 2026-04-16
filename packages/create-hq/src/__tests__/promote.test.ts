import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { scanForSecrets } from "../promote.js";

describe("scanForSecrets", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "promote-test-"));
  });

  afterEach(() => {
    if (tmpDir) fs.removeSync(tmpDir);
  });

  it("returns clean for a folder with only knowledge and workers", () => {
    // Create safe files
    fs.mkdirSync(path.join(tmpDir, "knowledge"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "workers"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "knowledge", "README.md"),
      "# Knowledge\nSome docs here."
    );
    fs.writeFileSync(
      path.join(tmpDir, "workers", "worker.yaml"),
      "name: test-worker\nskills: []\n"
    );

    const result = scanForSecrets(tmpDir);
    expect(result.clean).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("flags API keys in settings directory", () => {
    fs.mkdirSync(path.join(tmpDir, "settings"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "settings", "credentials.json"),
      '{\n  "api_key": "sk-1234567890abcdefghijklmnopqrstuvwxyz"\n}'
    );

    const result = scanForSecrets(tmpDir);
    expect(result.clean).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.file.includes("credentials.json"))).toBe(true);
  });

  it("flags private keys", () => {
    fs.writeFileSync(
      path.join(tmpDir, "key.pem"),
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEow..."
    );

    const result = scanForSecrets(tmpDir);
    expect(result.clean).toBe(false);
    expect(result.findings.some((f) => f.pattern === "Private key")).toBe(true);
  });

  it("flags 1Password references", () => {
    fs.mkdirSync(path.join(tmpDir, "settings"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "settings", "config.json"),
      '{"token": "op://Personal/MyToken/credential"}'
    );

    const result = scanForSecrets(tmpDir);
    expect(result.clean).toBe(false);
    expect(result.findings.some((f) => f.pattern === "1Password reference")).toBe(true);
  });

  it("flags GitHub tokens", () => {
    fs.writeFileSync(
      path.join(tmpDir, "env.txt"),
      "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890"
    );

    const result = scanForSecrets(tmpDir);
    expect(result.clean).toBe(false);
    expect(result.findings.some((f) => f.pattern === "GitHub token")).toBe(true);
  });

  it("skips team.json and .gitignore", () => {
    fs.writeFileSync(
      path.join(tmpDir, "team.json"),
      '{"api_key": "sk-fake1234567890abcdefghij"}'
    );
    fs.writeFileSync(
      path.join(tmpDir, ".gitignore"),
      "api_key = sk-shouldnotflag1234567890"
    );

    const result = scanForSecrets(tmpDir);
    expect(result.clean).toBe(true);
  });

  it("skips binary files by extension", () => {
    fs.writeFileSync(path.join(tmpDir, "image.png"), "fake-png-content-with-secret api_key=abcdefghijklmnopqrstuvwxyz");

    const result = scanForSecrets(tmpDir);
    expect(result.clean).toBe(true);
  });

  it("skips .git directory", () => {
    fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".git", "config"),
      "ghp_abcdefghijklmnopqrstuvwxyz1234567890"
    );

    const result = scanForSecrets(tmpDir);
    expect(result.clean).toBe(true);
  });
});
