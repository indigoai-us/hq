import { execSync } from "child_process";

function hasGlobalGitConfig(key: string): boolean {
  try {
    execSync(`git config --global ${key}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function initGit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });

  // Ensure user.email and user.name are set — use local config if global is missing
  if (!hasGlobalGitConfig("user.email")) {
    execSync('git config user.email "hq-user@localhost"', { cwd: dir, stdio: "pipe" });
  }
  if (!hasGlobalGitConfig("user.name")) {
    execSync('git config user.name "HQ User"', { cwd: dir, stdio: "pipe" });
  }

  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync('git commit -m "Initial HQ setup via create-hq"', {
    cwd: dir,
    stdio: "pipe",
  });
}

export function hasGit(): boolean {
  try {
    execSync("git --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
