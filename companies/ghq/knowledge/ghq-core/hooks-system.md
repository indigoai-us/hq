---
title: "GHQ Hooks System"
category: ghq-core
tags: ["hooks", "claude-code", "pipeline", "automation"]
source: system
confidence: 1.0
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

GHQ uses six Claude Code hooks defined in `.claude/settings.json` to automate the knowledge lifecycle. All hooks live in `.claude/hooks/` and follow a fail-safe design — they exit 0 on errors to avoid blocking the agent.

## Hook Inventory

### 1. UserPromptSubmit — `consult-knowledge.sh`

**When:** Before every user prompt is processed.

Reads the user's prompt from stdin, runs `qmd query "$PROMPT" -n 5 --json` (hybrid BM25 + vector search), and outputs matching knowledge entries as a `## Relevant Knowledge` markdown section. This section is injected into the agent's context so prior knowledge informs every response.

Fails silently on all errors — empty prompts, qmd failures, and jq parse errors all result in a clean exit 0 with no output.

### 2. PostToolUse (Write|Edit) — `auto-reindex.sh`

**When:** After any `Write` or `Edit` tool call.

Checks if the modified file is under `companies/*/knowledge/*.md`. If so, runs `reindex.ts` for that company and `qmd update` to refresh the search index. Also detects writes to `companies/ghq/tools/` and regenerates the tool INDEX.md via `index-tools.sh`.

This ensures the search index stays current without manual intervention.

### 3. PreCompact (auto) — `capture-learnings.sh`

**When:** Before automatic context compaction.

Outputs a multi-line message telling the agent to: (1) finish its current atomic action, (2) run `/learn` to capture insights, and (3) not start new tasks. This prevents knowledge loss when context is about to be compressed.

### 4. Stop — `learn-reminder.sh`

**When:** When the session ends.

Outputs a one-line reminder to run `/learn` before the session ends. Lighter-touch than the PreCompact hook since the agent may have already captured learnings.

### 5. PreToolUse (Write|Edit) — `guard-claude-dir.sh`

**When:** Before any `Write` or `Edit` targeting a file.

Blocks writes to files inside `.claude/` using the built-in tools. Returns exit code 2 with instructions to use the custom `write-file.sh` and `edit-file.sh` tools instead. This ensures `.claude/` modifications go through controlled tooling. All non-`.claude/` files pass through freely.

### 6. PostToolUseFailure — `report-issue-reminder.sh`

**When:** After any tool call fails.

Outputs a reminder to check `.claude/settings.local.json` for allowed commands and, if the failure is blocking, to file a bug report via `report_issue.sh`. Prevents the agent from retrying the same failing call in a loop.

## Design Principles

- **Fail-safe:** All hooks exit 0 on error to avoid blocking the agent. The knowledge pipeline is best-effort — a failed search should never prevent work.
- **All in settings.json:** Hooks belong in `.claude/settings.json` (version-controlled, portable across machines) rather than `.claude/settings.local.json` (user-local, gitignored). `settings.local.json` should only contain permissions and user-specific overrides. When multiple hook events need the same behavior (e.g. PreCompact and Stop both triggering learning capture), use a single shared script rather than duplicating.
- **Minimal latency:** Hooks use timeouts (5-60s) to prevent hangs. The consult-knowledge hook is the most latency-sensitive since it fires on every prompt.
