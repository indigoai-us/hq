---
title: "GHQ Slash Commands"
category: ghq-core
tags: ["commands", "agent-loop", "pipeline", "automation"]
source: system
confidence: 1.0
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

GHQ defines six slash commands in `.claude/commands/`. Each is a markdown file with YAML frontmatter (description, allowed-tools) and a detailed prompt that Claude executes when invoked.

## Core Commands

### /learn

**Purpose:** Capture session insights into the knowledge base.

Reflects on the current conversation, identifies durable insights (user corrections, decisions, technical discoveries), deduplicates against existing entries via `qmd query`, and writes new knowledge entries. Queues unanswered questions to the curiosity queue. Runs `reindex.ts` after all writes.

Categories of insight (by confidence): user corrections (0.9), decisions/rationale (0.7), technical insights (0.7), new facts (0.5–0.7), inferences (0.5).

Triggered automatically by PreCompact and Stop hooks. Accepts `-c <company>` to target a specific company (default: `ghq`).

### /research

**Purpose:** Process one item from the curiosity queue.

Picks the highest-priority pending item from `.queue.jsonl` (or a specific ID), researches it via `WebSearch`, synthesizes findings into a knowledge entry, deduplicates, writes the entry, moves the queue item to `.queue-done.jsonl`, and logs the session to `.research-log.jsonl`. Queues follow-up questions discovered during research.

One item per run — call repeatedly or use `/research-loop` for batch processing.

### /new-company

**Purpose:** Scaffold a new company workspace.

Interactive command that prompts for company name, goal, slug, and storage location. Creates the directory structure, symlink, bd tracker, qmd collection, and manifest entry. See `company-workspace-architecture.md` for details.

### /autopilot

**Purpose:** Fully autonomous task execution across all companies.

Reads the manifest, spawns a bd-manager agent (via `ask-claude.sh -a`) for each company in parallel, plus a retrospective loop agent for reviewing previous runs. Polls until all agents complete, then prints a summary. Read-only from the main session — all file changes happen in sub-agents.

## Utility Commands

### /research-loop

**Purpose:** Batch process the curiosity queue.

Loops through pending queue items, running `/research` on each one via `ask-claude.sh` subprocesses. Continues until the queue is empty or a configurable limit is reached.

### /tag-audit

**Purpose:** Audit knowledge base tags.

Finds near-duplicate tags, orphaned tags, and overly broad tags, then fixes them. Keeps the tag vocabulary clean and consistent.

### /blueprint

**Purpose:** Bootstrap a new knowledge domain.

Scaffolds categories, seeds initial entries, and queues curiosity items for a new area of knowledge. Useful when entering a new domain where the knowledge base has no coverage.

## Command Design Pattern

All commands follow the same structure:
1. YAML frontmatter with `description` and `allowed-tools`
2. Markdown body that serves as a detailed prompt
3. Company context resolution (`-c <slug>` or default `ghq`)
4. Structured output/report at the end
