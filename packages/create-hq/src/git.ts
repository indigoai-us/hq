import { execSync } from "child_process";

export function initGit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
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
