import * as fs from 'fs';
import * as path from 'path';
import { simpleGit, type SimpleGit } from 'simple-git';

export async function cloneRepo(repoUrl: string, targetDir: string, branch?: string): Promise<void> {
  const git = simpleGit();
  const options = branch ? ['--branch', branch] : [];
  await git.clone(repoUrl, targetDir, options);
}

export async function fetchRepo(repoDir: string): Promise<void> {
  const git = simpleGit(repoDir);
  await git.fetch(['--all']);
}

export async function pullRepo(repoDir: string): Promise<void> {
  const git = simpleGit(repoDir);
  await git.pull();
}

export async function getCurrentCommit(repoDir: string): Promise<string> {
  const git = simpleGit(repoDir);
  const log = await git.log({ maxCount: 1 });
  return log.latest?.hash ?? '';
}

export async function checkoutCommit(repoDir: string, commitSha: string): Promise<void> {
  const git = simpleGit(repoDir);
  await git.checkout(commitSha);
}

export async function isRepo(dir: string): Promise<boolean> {
  if (!fs.existsSync(dir)) return false;
  try {
    const git = simpleGit(dir);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

export async function getRemoteUrl(repoDir: string): Promise<string | null> {
  try {
    const git = simpleGit(repoDir);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    return origin?.refs?.fetch ?? null;
  } catch {
    return null;
  }
}

export async function isBehindRemote(repoDir: string): Promise<{ behind: boolean; commits: number }> {
  try {
    const git = simpleGit(repoDir);
    await git.fetch();
    const status = await git.status();
    return { behind: status.behind > 0, commits: status.behind };
  } catch {
    return { behind: false, commits: 0 };
  }
}

export function ensureGitignore(hqRoot: string, entry: string): void {
  const gitignorePath = path.join(hqRoot, '.gitignore');
  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');
  }
  if (!content.includes(entry)) {
    content = content.trimEnd() + '\n' + entry + '\n';
    fs.writeFileSync(gitignorePath, content);
  }
}
