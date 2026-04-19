/**
 * Company / team-repo template generator.
 *
 * When an admin creates a new team, we need to seed the new {org}/hq private
 * repo with a baseline directory structure that mirrors what /newcompany
 * produces. This module renders that structure into a target directory
 * (which is then committed and pushed to the new GitHub repo).
 *
 * No filesystem dependencies on the core HQ template — these files are
 * synthesized in code so the seed is version-locked with the create-hq
 * release the user just installed.
 */

import * as fs from "fs";
import * as path from "path";

export interface TeamMetadata {
  team_id: string;
  team_name: string;
  team_slug: string;
  org_login: string;
  org_id: number;
  created_by: string;
  created_at: string;
  hq_version: string;
  /** GitHub HTML URL for the team repo (set by promote flow). */
  repo_url?: string;
  /** HTTPS clone URL for the team repo (set by promote flow). */
  clone_url?: string;
}

const COMPANY_SUBDIRS = [
  "knowledge",
  "settings",
  "data",
  "workers",
  "repos",
  "projects",
  "policies",
];

const GITIGNORE = `# Local secrets and caches — never commit
settings/*.local.*
settings/.env*
data/cache/
data/tmp/
*.log
.DS_Store
Thumbs.db
`;

function readme(meta: TeamMetadata): string {
  return `# ${meta.team_name}

HQ Teams workspace for **${meta.org_login}**.

## What is this?

This repository is the shared workspace for the **${meta.team_name}** HQ team.
Members of the \`${meta.org_login}\` GitHub organization with access to this
repo will see its contents inside their local HQ at:

\`\`\`
companies/${meta.team_slug}/
\`\`\`

## Structure

| Directory | Purpose |
|-----------|---------|
| \`knowledge/\` | Shared docs, references, and qmd-indexed content |
| \`settings/\` | Team-scoped credentials and config (gitignore secrets) |
| \`data/\` | Exports, datasets, and reports |
| \`workers/\` | Custom worker definitions for this team |
| \`repos/\` | References to repos the team owns |
| \`projects/\` | Active projects with PRDs and stories |
| \`policies/\` | Team policies (auto-loaded by Claude Code) |

## Adding members

Anyone with access to this repository on GitHub will automatically pick up
this workspace when they run \`npx create-hq\`. To add a teammate, grant them
access through the \`${meta.org_login}\` GitHub organization or directly to
this repository.

## Created

- Created by: @${meta.created_by}
- Created at: ${meta.created_at}
- Seeded from: create-hq / HQ template ${meta.hq_version}
`;
}

function knowledgeReadme(meta: TeamMetadata): string {
  return `# ${meta.team_name} Knowledge

This is the shared knowledge base for the ${meta.team_name} HQ team.

Drop markdown files here to share docs, references, and conventions across
the team. Indexed by qmd for semantic + full-text search.
`;
}

/**
 * Render the company template into targetDir. Creates the directory if it
 * does not exist. Will not overwrite existing files (idempotent on re-runs).
 */
export function writeCompanyTemplate(
  targetDir: string,
  meta: TeamMetadata
): void {
  fs.mkdirSync(targetDir, { recursive: true });

  // Subdirectories with .gitkeep
  for (const sub of COMPANY_SUBDIRS) {
    const dir = path.join(targetDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    const gitkeep = path.join(dir, ".gitkeep");
    if (!fs.existsSync(gitkeep)) {
      fs.writeFileSync(gitkeep, "", "utf-8");
    }
  }

  // README.md
  const readmePath = path.join(targetDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, readme(meta), "utf-8");
  }

  // team.json
  const teamJsonPath = path.join(targetDir, "team.json");
  if (!fs.existsSync(teamJsonPath)) {
    fs.writeFileSync(teamJsonPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
  }

  // knowledge/README.md (replaces .gitkeep there)
  const knowledgeReadmePath = path.join(targetDir, "knowledge", "README.md");
  if (!fs.existsSync(knowledgeReadmePath)) {
    fs.writeFileSync(knowledgeReadmePath, knowledgeReadme(meta), "utf-8");
    // Remove the redundant .gitkeep now that there's a real file
    const gitkeep = path.join(targetDir, "knowledge", ".gitkeep");
    if (fs.existsSync(gitkeep)) {
      try {
        fs.unlinkSync(gitkeep);
      } catch {
        // ignore
      }
    }
  }

  // .gitignore
  const gitignorePath = path.join(targetDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, GITIGNORE, "utf-8");
  }
}

/**
 * Ensure all standard company subdirectories exist inside targetDir
 * without overwriting any existing files. Used after cloning a team repo
 * to fill in any directories the upstream repo doesn't have yet.
 */
export function ensureCompanyStructure(targetDir: string): void {
  for (const sub of COMPANY_SUBDIRS) {
    const dir = path.join(targetDir, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
