---
title: "GHQ v0.2 Overview"
category: ghq-core
tags: ["ghq", "architecture", "philosophy", "agent-orchestration"]
source: system
confidence: 1.0
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

GHQ is a knowledge-first personal operating system built on top of Claude Code. Intelligence accumulates through use — there is no pre-loaded content, no scaffolded directories, and no starter templates. Everything is earned through learning.

## Core Principles

**Knowledge before action.** Before starting any task, the agent queries the knowledge base (`qmd query`) for relevant context. This is enforced by a `UserPromptSubmit` hook that automatically injects matching knowledge entries into every prompt.

**Capture before losing context.** When a session ends or context compresses, the agent captures durable insights via `/learn`. Hooks on `PreCompact` and `Stop` events remind the agent to do this.

**Company-scoped workspaces.** All knowledge, tools, data, and projects are organized under `companies/{slug}/`. Each company has its own knowledge base, curiosity queue, and tool set. Cross-cutting concerns (GHQ itself, agent patterns, meta-knowledge) live under the `ghq` slug.

**No pre-loaded content.** New companies start empty. Knowledge, categories, and tools emerge organically from use.

**Subprocess, not subagents.** GHQ delegates work by spawning Claude CLI subprocesses via `ask-claude.sh`, not by using the built-in Agent tool. This gives full control over model, tools, working directory, and turn limits.

## System Components

| Component | Purpose |
|-----------|---------|
| **Hooks** (`.claude/settings.json`) | Six lifecycle hooks that automate knowledge retrieval, learning capture, reindexing, and safety guards |
| **Slash Commands** (`.claude/commands/`) | `/learn`, `/research`, `/new-company`, `/autopilot`, `/tag-audit`, `/blueprint` |
| **Tools** (`companies/ghq/tools/`) | Shared scripts: `ask-claude.sh`, `reindex.ts`, `queue-curiosity.ts`, tool wrappers, and more |
| **qmd** | Search engine for the knowledge base — supports BM25, vector, and hybrid search |
| **Knowledge Base** (`companies/{slug}/knowledge/`) | Markdown files with YAML frontmatter, organized by category |
| **Curiosity Queue** (`.queue.jsonl`) | Unanswered questions logged for later `/research` processing |
| **Company Manifest** (`companies/manifest.yaml`) | Registry of all companies with name, goal, path, and created date |
| **Agent System** (`.agents/`) | Templates, run logs, and stream output for async subprocess agents |

## Data Flow

1. User submits a prompt
2. `consult-knowledge.sh` hook queries qmd and injects relevant knowledge
3. Agent processes the prompt with augmented context
4. If files in `knowledge/` are written/edited, `auto-reindex.sh` rebuilds the search index
5. On session end or context compaction, hooks nudge the agent to run `/learn`
6. `/learn` distills insights, deduplicates, writes entries, and queues follow-up questions
7. `/research` later processes the curiosity queue via web search
