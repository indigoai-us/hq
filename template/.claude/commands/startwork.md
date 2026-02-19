---
description: Start a work session — pick company or project, gather context
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion
argument-hint: [company-or-project]
visibility: public
---

# /startwork - Start Work Session

Lightweight session entry point. Resolves context fast, presents smart options, gets you working.

## When to Use

Beginning of every session. Replaces ad-hoc orientation. Much lighter than `/reanchor`.

## Process

### 1. Resolve Argument

**Argument: `$ARGUMENTS`**

Determine mode from arg:

- **No arg / empty** → Resume mode
- **Arg matches company slug** in `companies/manifest.yaml` ({company-1}, {company-2}, {company-3}, personal, {company-7}, {company-8}, {company-4}, {company-6}, {company-5}, {company-9}) → Company mode
- **Arg matches a directory** in `projects/` (not `_archive/`) → Project mode
- **Ambiguous** (matches both or neither) → ask user to clarify

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

### 3. Present & Ask

Display a concise orientation block:

```
Session Start
─────────────
{Mode: Resume | Company: {slug} | Project: {name}}

{If resume: "Last session: {summary}" + "Next steps: {next_steps}"}
{If company: "Repos: {list}" + "Workers: {list}"}
{If project: "Goal: {description}" + "Branch: {branchName}"}

Git: {branch} @ {short-hash} {" (dirty)" if dirty}

Active work:
  • {project} — {done}/{total} stories ({remaining} left)
  ...
```

Then use **AskUserQuestion** with options built from context:

- **Resume mode**: next_steps items (up to 3) + "Pick a project" + "Something else"
- **Company mode**: active projects for that company (up to 3) + "Run a worker" + "Something else"
- **Project mode**: top 3 incomplete stories by priority + "Something else"

After user picks, proceed directly into the work. If they picked a project story, treat it like `/execute-task {project}/{story-id}`. If they picked "Run a worker", ask which worker/skill.

## Rules

- NEVER read INDEX.md, agents files, or company knowledge dirs during startup
- NEVER run qmd searches to orient — this command replaces exploration with targeted reads
- Max file reads: handoff.json + 1 thread + manifest + up to 5 prd.json (headers only)
- If >5 active projects found, show top 5 by most recent file modification
- Always verify git branch with `git branch --show-current` before displaying git state
- Context diet: every read must serve the orientation summary. No speculative loading
- If handoff.json doesn't exist, skip resume context — go straight to asking what to work on
