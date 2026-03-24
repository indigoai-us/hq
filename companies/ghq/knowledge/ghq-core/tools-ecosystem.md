---
title: "GHQ Tools Ecosystem"
category: ghq-core
tags: ["tools", "architecture", "automation", "cli"]
source: system
confidence: 1.0
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

GHQ's shared tools live in `companies/ghq/tools/` and are auto-indexed — any write to that directory triggers `index-tools.sh` to regenerate `INDEX.md`.

## Tool Categories

### Core Infrastructure

| Tool | Purpose |
|------|---------|
| `ask-claude.sh` | Spawn Claude CLI subprocesses (sync or async). The backbone of multi-agent orchestration. |
| `reindex.ts` | Scan `knowledge/` and regenerate INDEX.md files for all categories. |
| `queue-curiosity.ts` | Append items to the curiosity queue (`.queue.jsonl`). |
| `read-queue.ts` | Display pending curiosity queue items. |
| `index-tools.sh` | Auto-generate `INDEX.md` for the tools directory. |
| `setup.sh` | Bootstrap GHQ on a fresh machine. |

### Agent Tooling

| Tool | Purpose |
|------|---------|
| `agent-stream.sh` | Parse and display an agent run's `stream.jsonl` — supports progress, errors, and tree views. |
| `reviewable-runs.sh` | List agent runs eligible for retrospective review. |
| `tool-usage-report.sh` | Analyze tool call patterns across `.agents/runs/`. |

### Wrapper Tools (subdirectories)

Tool groups provide ergonomic wrappers around common CLIs, enforcing GHQ conventions:

| Directory | Tool | Wraps |
|-----------|------|-------|
| `aws/` | `aws-helper.sh` | AWS CLI |
| `bd/` | `bd-helper.sh` | Beads issue tracker |
| `file/` | `write-file.sh`, `edit-file.sh` | Built-in Write/Edit (required for `.claude/` files) |
| `git/` | `git-helper.sh`, `gh-helper.sh` | Git and GitHub CLI |
| `http/` | `http-request.sh` | HTTP requests (JSON defaults) |
| `indigo/` | `indigo-helper.sh` | Indigo CLI |
| `node/` | `node-runner.sh` | Node/npm/bun |
| `python/` | `python-runner.sh` | Python with venv awareness |
| `qmd/` | `qmd-search.sh` | Knowledge search |

### Maintenance

| Tool | Purpose |
|------|---------|
| `tag-inventory.sh` | Frequency-ranked tag vocabulary from the knowledge base. Used by `/learn` to suggest tags. |
| `report_issue.sh` | File bug reports with duplicate detection. |
| `pre-commit` | Block commits containing secrets or sensitive files. |

## Auto-Indexing

The `PostToolUse` hook watches for writes to `companies/ghq/tools/` and runs `index-tools.sh` automatically. Each script's index entry is derived from the `#` comment on line 2 of the file (the description line). INDEX.md is referenced from CLAUDE.md so the agent always knows what tools are available.

## .claude/ File Guard

The `guard-claude-dir.sh` hook blocks built-in `Write`/`Edit` for files inside `.claude/`. Instead, agents must use `file/write-file.sh` and `file/edit-file.sh`. This ensures `.claude/` modifications are tracked and controlled separately from normal file operations.
