import { execSync } from "child_process";

function hasGitConfig(key: string, cwd?: string): boolean {
  try {
    // Check both global and local config
    execSync(`git config ${key}`, { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function initGit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });

  // Ensure user.email and user.name are set — use local config if global is missing
  if (!hasGitConfig("user.email", dir)) {
    execSync('git config user.email "hq-user@localhost"', { cwd: dir, stdio: "pipe" });
  }
  if (!hasGitConfig("user.name", dir)) {
    execSync('git config user.name "HQ User"', { cwd: dir, stdio: "pipe" });
  }

  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  try {
    execSync('git commit -m "Initial HQ setup via create-hq"', {
      cwd: dir,
      stdio: "pipe",
    });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    throw new Error(
      `git commit failed: ${stderr || stdout || err.message}`
    );
  }
}

export function hasGit(): boolean {
  try {
    execSync("git --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
