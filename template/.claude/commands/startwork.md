---
description: Start a work session — pick company, project, or repo, gather context
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion
argument-hint: [company-or-project-or-repo]
visibility: public
---

# /startwork - Start Work Session

Lightweight session entry point. Resolves context fast, presents smart options, gets you working.

## When to Use

Beginning of every session. Replaces ad-hoc orientation. Much lighter than `/reanchor`.

## Process

### 1. Resolve Argument

**Argument: `$ARGUMENTS`**

Determine mode from arg (first match wins):

- **No arg / empty** → Resume mode
- **Arg matches company slug** in `companies/manifest.yaml` (liverecover, abacus, indigo, personal, golden-thread, haven-slay, holler-mgmt, ridgeline, brandstage, estate-manager) → Company mode
- **Arg matches a directory** in `projects/` (not `_archive/`) → Project mode
- **Arg matches a directory** in `repos/private/` or `repos/public/` → Repo mode
- **Partial match** → arg is a substring of any company slug, project dir, or repo name (exclude `knowledge-*` repos). 1 match → use that mode. 2-5 matches → present list via AskUserQuestion, ask user to pick. >5 → ask user to be more specific
- **No match** → ask user to clarify

### 2. Gather Context

#### Resume Mode (no arg)

1. Read `workspace/threads/handoff.json`
2. Read the thread file it points to → extract: `conversation_summary`, `next_steps`, `git.branch`, `git.current_commit`, `git.dirty`, `files_touched`
3. Run `git log --oneline -3` for recent HQ commits
4. Quick scan: Glob `projects/*/prd.json` (skip `_archive`). For each (max 5), read only `name` and count stories where `passes !== true`. Collect projects with remaining work.

#### Company Mode (arg = company slug)

1. Read `companies/manifest.yaml` → extract the company's entry (repos, workers, knowledge, qmd_collections)
2. Read `workspace/threads/handoff.json` → if last thread relates to this company, note it
3. Glob `projects/*/prd.json` (skip `_archive`). For each, read `metadata.repoPath` and `name`. Filter to projects whose repoPath matches any of the company's repos. Count incomplete stories per project.
4. If company has repos, run `git -C {first-repo} log --oneline -3` and `git -C {first-repo} branch --show-current`
5. List the company's workers from manifest (names only, don't read worker.yaml files)

#### Project Mode (arg = project name)

1. Read `projects/{name}/prd.json` → extract: `name`, `description`, `branchName`, incomplete stories (where `passes !== true`) with id + title + priority
2. Extract `metadata.repoPath` → identify company by matching against manifest repos
3. If repoPath exists: `git -C {repoPath} branch --show-current` and `git -C {repoPath} status --short`

#### Repo Mode (arg = repo directory name)

1. Resolve full path: check `repos/private/{arg}` then `repos/public/{arg}`
2. Git state: `git -C {repoPath} branch --show-current`, `git -C {repoPath} log --oneline -5`, `git -C {repoPath} status --short`
3. Owning company: scan `companies/manifest.yaml` for a company whose `repos:` list contains this path. If not found, infer from repo name prefix or note as untracked
4. Related projects: Grep all `projects/*/prd.json` (skip `_archive`) for repoPath containing the repo name. For each match (max 5), read `name` and count incomplete stories (where `passes !== true`)

### 3. Present & Ask

Display a concise orientation block:

```
Session Start
─────────────
{Mode: Resume | Company: {slug} | Project: {name}}

{If resume: "Last session: {summary}" + "Next steps: {next_steps}"}
{If company: "Repos: {list}" + "Workers: {list}"}
{If project: "Goal: {description}" + "Branch: {branchName}"}
{If repo: "Repo: {repoPath}" + "Company: {slug}" + "Branch: {branch}"}

Git: {branch} @ {short-hash} {" (dirty)" if dirty}

Active work:
  • {project} — {done}/{total} stories ({remaining} left)
  ...
```

Then use **AskUserQuestion** with options built from context:

- **Resume mode**: next_steps items (up to 3) + "Pick a project" + "Something else"
- **Company mode**: active projects for that company (up to 3) + "Run a worker" + "Something else"
- **Project mode**: top 3 incomplete stories by priority + "Something else"
- **Repo mode**: related projects with incomplete work (up to 3) + "Open repo (no project)" + "Something else"

After user picks, proceed directly into the work. If they picked a project story, treat it like `/execute-task {project}/{story-id}`. If they picked "Run a worker", ask which worker/skill. If they picked "Open repo (no project)", cd to the repo and proceed as a free-form coding session.

## Rules

- NEVER read INDEX.md, agents files, or company knowledge dirs during startup
- NEVER run qmd searches to orient — this command replaces exploration with targeted reads
- Max file reads: handoff.json + 1 thread + manifest + up to 5 prd.json (headers only). Repo mode: Grep for matching prd.json files first (single pass), then read up to 5
- If >5 active projects found, show top 5 by most recent file modification
- Always verify git branch with `git branch --show-current` before displaying git state
- Context diet: every read must serve the orientation summary. No speculative loading
- If handoff.json doesn't exist, skip resume context — go straight to asking what to work on
