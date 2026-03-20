---
title: "Beads Storage Layer: Dolt as a Version-Controlled SQL Backend"
category: beads-architecture
tags: ["dolt", "distributed-systems", "task-management", "ai-agents", "architecture", "agent-memory"]
source: "https://github.com/steveyegge/beads"
confidence: 0.5
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Beads stores all data in Dolt — a MySQL-compatible database with Git-like version control at the cell level. This gives it branching, merging, and diff capabilities without requiring a separate sync layer.

## Two-Layer Architecture

The system runs as CLI → local Dolt database, with optional remote sync. Two access modes exist:

- **Embedded mode**: Single-writer, direct database access. Default for CLI usage.
- **Server mode**: Multi-writer via `dolt sql-server` with RPC coordination. Needed for concurrent agent access.

Data lives in `.beads/dolt/`. A shared server mode consolidates all projects to `~/.beads/shared-server/`.

## Hash-Based Collision Prevention

The key distributed innovation: content-based hashing instead of sequential IDs. Random UUIDs generate short hash IDs (`bd-a1b2`) that scale from 4 to 5-6 characters as the database grows. This eliminates central coordination — multiple agents on different machines can create issues simultaneously without conflicts.

Merge logic: identical content hashes skip, different hashes update, unmatched issues create. See COLLISION_MATH.md in the repo for birthday paradox analysis on hash length vs collision probability.

## Write/Read Paths

- **Write**: CLI command → Dolt write (immediate) → Dolt auto-commit
- **Read**: SQL query against local Dolt (millisecond latency)
- **Export**: `bd export` produces JSONL for portability
