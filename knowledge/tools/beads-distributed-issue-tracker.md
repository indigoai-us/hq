---
title: "Beads (bd) — Distributed Issue Tracker for AI Agents"
category: tools
tags: ["ai-agents", "task-management", "distributed-systems", "dolt", "graph-database"]
source: "https://github.com/steveyegge/beads"
confidence: 0.7
created_at: "2026-03-19T00:00:00Z"
updated_at: "2026-03-19T00:00:00Z"
---

Beads (`bd`) is a distributed, graph-based issue tracker designed specifically for AI coding agents, created by Steve Yegge (~19k GitHub stars). It solves the problem of agents losing context across sessions by providing persistent, dependency-aware task memory that survives session boundaries.

## Core Design

- **Dolt backend**: Uses Dolt (Git for databases) for cell-level version control, branching, and merge-safe distributed sync. Data stored in `.beads/dolt/`, separate from Git.
- **Hash-based IDs**: Issues get content-hashed IDs (e.g., `bd-a3f8`) instead of sequential numbers, enabling conflict-free multi-agent concurrent creation.
- **Dependency graph**: Blocking relationships (`blocks`, `parent-child`, `waits-for`) and non-blocking annotations (`related`, `caused-by`, `supersedes`). `bd ready` surfaces unblocked work.
- **Hierarchical IDs**: `bd-a3f8` (epic) → `bd-a3f8.1` (task) → `bd-a3f8.1.1` (subtask).

## Key Concepts

- **Molecules**: Structured work graphs — parallel-by-default execution with explicit dependency ordering. Three phases: Solid (frozen templates), Liquid (persistent instances), Vapor (ephemeral wisps).
- **Gates**: Special issues blocking on external conditions (PR merge, CI pass, timer, manual approval). Bridges internal tracking with external systems.
- **Memory compaction**: Semantic summarization of closed tasks preserves context while freeing agent token budget. Critical for long-horizon projects.
- **Auto-routing**: Detects maintainer vs. contributor role via SSH URL; routes issues to appropriate repos.

## Agent-First Design

- All output supports `--json` for programmatic parsing.
- No interactive commands for agents (`bd edit` prohibited; use `bd update` with flags).
- Atomic claim operations (`bd update <id> --claim`) prevent multi-agent race conditions.
- Git hooks integration (`bd hooks install`) auto-syncs on commit.

## Installation

Available via npm (`@beads/bd`), Homebrew, and `go install`. Written in Go 1.24+. Supports macOS, Linux, Windows, FreeBSD.

## Relevance to GHQ

Beads and GHQ share the philosophy of persistent, structured knowledge that accumulates through use. Beads focuses on task/issue tracking for agents, while GHQ focuses on knowledge management. The `bd` CLI could complement GHQ's workflow for managing agent-driven development tasks.
