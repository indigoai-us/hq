---
title: "GHQ v0.2 Knowledge Pipeline Architecture"
category: ghq-core
tags: ["ghq", "architecture", "knowledge", "hooks", "pipeline"]
source: conversation
confidence: 0.7
created_at: 2026-03-19T00:00:00Z
updated_at: 2026-03-19T00:00:00Z
---

GHQ v0.2's knowledge pipeline has three automated triggers, all defined as Claude Code hooks: (1) **UserPromptSubmit** runs `consult-knowledge.sh` which queries `qmd` against the user's prompt and injects relevant knowledge hits before Claude processes the message — this replaces a CLAUDE.md rule-based approach with a reliable hook. (2) **PreCompact** fires `capture-learnings.sh` when context fills up, nudging Claude to run `/learn` before insights are lost. (3) **Stop** fires the same `capture-learnings.sh` at session end. The `/learn` command handles reflection, dedup via `qmd vsearch`, writing knowledge entries, and queuing gaps to the curiosity JSONL queue. Research is processed by the `/research` command which uses Claude's own reasoning and `WebSearch` tool — no external LLM API calls needed since Claude Code IS the LLM.
