# Scheduler Scripts — Index

> Auto-generated. Updated: 2026-03-04

## Core Scripts

| Script | Description |
|--------|-------------|
| `scheduler.sh` | Core scheduler daemon — dispatches agents per company |
| `strategy-planner.sh` | Reads strategy.yaml, creates draft tasks for cadence gaps |
| `digest.sh` | Generates daily markdown digest at loops/digests/ |
| `check-escalation.sh` | Escalation policy engine (always_ask, autonomous, etc.) |
| `bd-resolve.sh` | Resolves decision tasks with structured answer + preference capture |
| `read-preferences.sh` | Reads user preferences by company and action |
| `write-preference.sh` | Writes a preference entry to company preferences.yaml |

## Test Scripts

| Script | Description |
|--------|-------------|
| `test-scheduler.sh` | Unit tests for scheduler dispatch |
| `test-strategy-planner.sh` | Unit tests for strategy planner |
| `test-digest.sh` | Unit tests for digest generator |
| `test-escalation.sh` | Unit tests for escalation policy |
| `test-bd-extensions.sh` | Tests for draft status and decision type |
| `test-preferences.sh` | Tests for preference memory system |
| `test-integration.sh` | End-to-end integration test (full cycle) |
