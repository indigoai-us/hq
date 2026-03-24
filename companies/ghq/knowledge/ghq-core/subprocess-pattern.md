---
title: "Subprocess Pattern: ask-claude.sh"
category: ghq-core
tags: ["agent-orchestration", "subprocess", "cli", "async"]
source: system
confidence: 1.0
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

GHQ delegates work by spawning Claude CLI subprocesses via `ask-claude.sh` rather than using the built-in Agent tool. This gives full control over model, working directory, template, and execution mode.

## Usage

```bash
# Sync — blocks until complete, prints result
./companies/ghq/tools/ask-claude.sh -c ghq -w $(git rev-parse --show-toplevel) "Summarize this"

# Async — returns immediately, agent runs in background
./companies/ghq/tools/ask-claude.sh -a -c ghq -w $(git rev-parse --show-toplevel) "Long task"

# With stdin
cat file.txt | ./companies/ghq/tools/ask-claude.sh -c ghq -w $PWD "Explain this"

# With template
./companies/ghq/tools/ask-claude.sh -a -c myco -w $PWD -t bd-manager "myco"
```

## Required Flags

- `-c, --company SLUG` — Company slug. Sets `{{COMPANY_DIR}}` to `companies/SLUG/`.
- `-w, --work-dir PATH` — Absolute path to the working directory. File changes are restricted here.

## How It Works

1. Generates a unique agent ID: `YYYYMMDD_HHMMSS_xxxx` (timestamp + 4 random chars)
2. Creates `.agents/runs/{agent-id}/` with `prompt.txt`, `meta.json`, `status`
3. Runs `claude -p --verbose --output-format stream-json` with the prompt piped to stdin
4. Streams all output to `stream.jsonl`; extracts the final result to `result.txt`
5. Sets `status` to `done` or `error` on completion

## Templates

Templates are markdown files in `.agents/templates/{name}.md` that serve as system prompts for specialized agents. Template variables are replaced from flags:

| Variable | Source |
|----------|--------|
| `{{WORK_DIR}}` | `--work-dir` flag |
| `{{COMPANY_DIR}}` | Resolved from `--company` flag |
| `{{COMPANY}}` | Company slug |
| `{{TASK_ID}}` | The prompt itself (for executor templates) |
| `{{AGENT_RUN_ID}}` | The prompt itself (for reviewer templates) |

## Parent-Child Tracking

The `ASK_CLAUDE_PARENT_ID` environment variable is automatically exported so child `ask-claude.sh` calls inherit parentage. This enables tree-structured agent hierarchies where `/autopilot` spawns bd-managers which spawn task executors.

## Monitoring

```bash
# Check status
cat .agents/runs/{id}/status

# Read final result
cat .agents/runs/{id}/result.txt

# Stream progress in real time
./companies/ghq/tools/agent-stream.sh {id}

# Show only errors
./companies/ghq/tools/agent-stream.sh --errors {id}

# Show agent tree
./companies/ghq/tools/agent-stream.sh --tree {id}

# Live tail
tail -f .agents/runs/{id}/stream.jsonl | ./companies/ghq/tools/agent-stream.sh /dev/stdin
```

## Why Not the Agent Tool?

The built-in Agent tool runs inside the same session, consuming context and offering limited control. `ask-claude.sh` provides:

- **Isolated context**: Each subprocess gets a fresh context window
- **Model selection**: Can specify different models per task
- **Working directory control**: Sandbox file changes to specific paths
- **Async execution**: Fire-and-forget with background processing
- **Template system**: Reusable system prompts for specialized agent roles
- **Observability**: Full stream logs, status tracking, and agent trees
