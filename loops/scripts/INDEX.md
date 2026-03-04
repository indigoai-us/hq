# Scheduler Scripts — Index

> Auto-generated. Updated: 2026-03-05

## Core Scripts

| Script | Description |
|--------|-------------|
| `bd-resolve.sh` | Resolves decision tasks with structured answer + preference capture |
| `check-escalation.sh` | Escalation policy engine (always_ask, autonomous, etc.) |
| `dep-graph.sh` | Builds dependency graph for parallel task execution |
| `digest.sh` | Generates daily markdown digest at loops/digests/ |
| `file-overlap.sh` | Detects file overlap between parallel tasks |
| `read-preferences.sh` | Reads user preferences by company and action |
| `scheduler.sh` | Core scheduler daemon — dispatches agents per company |
| `strategy-planner.sh` | Reads strategy.yaml, creates draft tasks for cadence gaps |
| `write-preference.sh` | Writes a preference entry to company preferences.yaml |

## Test Scripts

| Script | Description |
|--------|-------------|
| `test-bd-extensions.sh` | Tests for draft status and decision type |
| `test-dep-graph.sh` | Tests for dependency graph builder |
| `test-digest.sh` | Tests for digest generator |
| `test-escalation.sh` | Tests for escalation policy |
| `test-file-overlap.sh` | Tests for file overlap detector |
| `test-integration.sh` | End-to-end integration test (full cycle) |
| `test-parallel-spawn.sh` | Tests for parallel task spawning |
| `test-preferences.sh` | Tests for preference memory system |
| `test-scheduler.sh` | Tests for scheduler dispatch |
| `test-strategy-planner.sh` | Tests for strategy planner |
