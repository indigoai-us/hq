import { execSync } from "child_process";

export function initGit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
}

export function hasGit(): boolean {
  try {
    execSync("git --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
