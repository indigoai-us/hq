import { execSync, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GitInitResult {
  initialized: boolean;
  committed: boolean;
  error?: string;
}

export async function initGit(dir: string): Promise<GitInitResult> {
  try {
    await execAsync("git init", { cwd: dir });
  } catch {
    return { initialized: false, committed: false, error: "git init failed" };
  }

  try {
    await execAsync("git add -A", { cwd: dir });
  } catch {
    return { initialized: true, committed: false, error: "git add failed" };
  }

  try {
    await execAsync('git commit -m "Initial HQ setup via create-hq"', {
      cwd: dir,
    });
    return { initialized: true, committed: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { initialized: true, committed: false, error: msg };
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

export function hasGitUser(): { name: string | null; email: string | null } {
  let name: string | null = null;
  let email: string | null = null;
  try {
    name = execSync("git config user.name", { stdio: "pipe", encoding: "utf-8" }).trim() || null;
  } catch { /* not configured */ }
  try {
    email = execSync("git config user.email", { stdio: "pipe", encoding: "utf-8" }).trim() || null;
  } catch { /* not configured */ }
  return { name, email };
}

export async function configureGitUser(name: string, email: string): Promise<void> {
  await execAsync(`git config --global user.name "${name}"`);
  await execAsync(`git config --global user.email "${email}"`);
}

export async function gitCommit(dir: string, message: string): Promise<boolean> {
  try {
    await execAsync(`git commit -m "${message}"`, { cwd: dir });
    return true;
  } catch {
    return false;
  }
}
