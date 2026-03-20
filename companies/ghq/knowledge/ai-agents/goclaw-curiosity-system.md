---
title: "goclaw Curiosity Queue System"
category: ai-agents
tags: ["curiosity-queue", "self-learning", "research-pipeline", "goclaw", "agent-architecture"]
source: "code review of ~/repos/indigo/goclaw"
confidence: 0.9
created_at: "2026-03-19T00:00:00Z"
updated_at: "2026-03-19T00:00:00Z"
---

goclaw's curiosity system is prompt-driven — the LLM decides when to file curiosity items based on tool descriptions and system prompt instructions. There is no rule engine or classifier.

## Two Curiosity Tools

**`file_curiosity`** (structured outcome gaps): requires observation, expected, actual, and question fields. All items get source `outcome_gap` and default priority 7. Designed for when reality doesn't match expectations.

**`add_curiosity`** (general knowledge gaps): lighter-weight, needs only a question and source type. Supports five source types: `user_interaction`, `outcome_gap`, `trend_detection`, `knowledge_gap`, `conversation_insight`.

## Storage

SQLite-backed queue (`research.db`) with WAL mode. Schema: id, question, context, source (enum-validated), priority (1-10), status (pending/in_progress/completed/failed/dismissed), optional embedding, timestamps. Indexed on status+priority and created_at.

## Vector Dedup

When an embedding is provided with a new item, it's checked against all pending/in_progress items by cosine similarity. Threshold is 0.92 — items above that are treated as duplicates and the existing item is returned instead.

## Research Pipeline

The research orchestrator processes pending curiosity items by priority (highest first). Each item goes through: web search, resource vetting (trust signals, quality scoring), LLM synthesis, and knowledge entry writing. Budget tracking prevents overspend (daily USD limits with per-call cost estimates).

## Prompt-Driven Decision

The system prompt (`infra/global-claude.md`) instructs the agent: "When you observe an unexpected outcome (expected X, got Y), use `file_curiosity` to record it" and "File curiosity items. When something surprises you, file it." The tool descriptions reinforce this with the learning loop framing: act, observe, be curious, research, learn, act better.

## Blueprint Seeding

New agents get 3-5 curiosity items pre-seeded via the blueprint generator during provisioning. The blueprint generation prompt tells Claude to generate initial research questions based on the agent's role and domain.

## Sources

- `packages/core/src/research-tools.ts` — `file_curiosity` tool definition
- `packages/knowledge/src/mcp-tools.ts` — `add_curiosity` tool definition
- `packages/knowledge/src/research/curiosity-queue.ts` — SQLite queue with vector dedup
- `infra/global-claude.md` — system prompt with curiosity instructions
- `packages/manager/src/agent/blueprint-generator.ts` — blueprint seeding
