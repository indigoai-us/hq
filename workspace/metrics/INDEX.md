# Metrics

Metrics collection for HQ workers and commands.

## Purpose

Stores append-only JSONL log files tracking worker execution, model usage, and audit events. Files here are written by commands and workers during normal operation.

## Expected Files

| File | Description | Status |
|------|-------------|--------|
| `test-coverage.jsonl` | Test coverage data from worker runs | sparse |
| `model-usage.jsonl` | Model routing metrics (opus/sonnet/haiku per task) | expected |
| `audit-log.jsonl` | Garden/audit run records | expected |
| `metrics.jsonl` | General worker metrics | expected |

## Format

All files use JSONL (newline-delimited JSON). Each line is one event with an `at` ISO8601 timestamp.

## Written By

- `/execute-task` — writes to `model-usage.jsonl`
- `/run-project` — writes to `model-usage.jsonl`
- Garden curator workers — write to `audit-log.jsonl`
