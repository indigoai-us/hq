# loops/

Runtime state for GHQ's autonomous loops. This directory stores execution state using append-only JSONL files.

## Files

| File | Purpose |
|------|---------|
| `state.jsonl` | Current execution state -- append-only log of state transitions during loop execution |
| `history.jsonl` | Completed loop summaries -- one entry per finished `/run-loop` execution |

## state.jsonl

An append-only JSONL file where each line records a state transition during execution. The orchestrator appends entries as skills start, complete, or fail.

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `ts` | `string` (ISO 8601) | Timestamp of the event |
| `type` | `string` (enum) | Event type (see table below) |
| `story_id` | `string` | Task identifier (e.g. `ghq-def456`). Present on task/skill events. |
| `skill_id` | `string` | Skill identifier (e.g. `architect`). Present on skill events. |
| `batch_id` | `string` (optional) | Parallel batch identifier. Present when subtasks run in batches. See below. |
| `data` | `object` | Event-specific payload (see table below) |

#### batch_id (parallel execution tracking)

Tracks which subtasks ran concurrently during batch-parallel execution. **Optional** for backwards compatibility -- entries without `batch_id` are from sequential execution.

| Rule | Description |
|------|-------------|
| Format | `{parent-task-id}-b{batch-number}-{epoch-seconds}` (e.g. `ghq-abc123-b1-1709312400`) |
| Parallel subtasks | Share the **same** `batch_id` |
| Sequential subtasks | Each gets a **unique** `batch_id` (batch of one) |
| Absent `batch_id` | Backwards compatible -- sequential execution |
| Applied to | `skill_start`, `skill_complete`, `skill_error`, `story_complete`, `story_blocked` |
| Not applied to | `loop_start`, `loop_end` (loop-level events) |

### Event Types

| Type | When | Data Fields | batch_id |
|------|------|-------------|----------|
| `loop_start` | `/run-loop` begins | `task_id`, `stories_total`, `stories_pending` | -- |
| `skill_start` | Sub-agent spawned for a skill | `story_id`, `skill_id` | optional |
| `skill_complete` | Skill finishes successfully | `story_id`, `skill_id`, `files_changed`, `back_pressure` | optional |
| `skill_error` | Skill fails or back-pressure fails | `story_id`, `skill_id`, `error`, `retry` | optional |
| `story_complete` | All skills in chain pass | `story_id`, `skills_run` | optional |
| `story_blocked` | Task fails after retry | `story_id`, `skill_id`, `reason` | optional |
| `loop_end` | `/run-loop` finishes | `task_id`, `stories_completed`, `stories_blocked` | -- |

### Example: Sequential Execution (no batch_id -- backwards compatible)

```jsonl
{"ts":"2026-03-01T14:00:00Z","type":"loop_start","data":{"task_id":"ghq-abc123","stories_total":5,"stories_pending":5}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"ghq-def456","skill_id":"architect","data":{}}
{"ts":"2026-03-01T14:05:30Z","type":"skill_complete","story_id":"ghq-def456","skill_id":"architect","data":{"files_changed":["docs/design.md"],"back_pressure":{"tests":"pass","lint":"pass"}}}
{"ts":"2026-03-01T14:15:01Z","type":"story_complete","story_id":"ghq-def456","data":{"skills_run":["architect","backend"]}}
{"ts":"2026-03-01T14:15:02Z","type":"story_blocked","story_id":"ghq-ghi789","skill_id":"backend","data":{"reason":"typecheck failed after 2 retries"}}
{"ts":"2026-03-01T15:30:00Z","type":"loop_end","data":{"task_id":"ghq-abc123","stories_completed":4,"stories_blocked":1}}
```

### Example: Parallel Execution (with batch_id)

Subtasks `ghq-sub1` and `ghq-sub2` run concurrently (batch 1), then `ghq-sub3` runs alone (batch 2).

```jsonl
{"ts":"2026-03-01T14:00:00Z","type":"loop_start","data":{"task_id":"ghq-abc123","stories_total":3,"stories_pending":3}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"ghq-sub1","skill_id":"content","batch_id":"ghq-abc123-b1-1709312400","data":{}}
{"ts":"2026-03-01T14:00:01Z","type":"skill_start","story_id":"ghq-sub2","skill_id":"backend","batch_id":"ghq-abc123-b1-1709312400","data":{}}
{"ts":"2026-03-01T14:03:01Z","type":"story_complete","story_id":"ghq-sub1","batch_id":"ghq-abc123-b1-1709312400","data":{"skills_run":["content"]}}
{"ts":"2026-03-01T14:05:01Z","type":"story_complete","story_id":"ghq-sub2","batch_id":"ghq-abc123-b1-1709312400","data":{"skills_run":["backend"]}}
{"ts":"2026-03-01T14:05:10Z","type":"skill_start","story_id":"ghq-sub3","skill_id":"frontend","batch_id":"ghq-abc123-b2-1709312710","data":{}}
{"ts":"2026-03-01T14:10:01Z","type":"story_complete","story_id":"ghq-sub3","batch_id":"ghq-abc123-b2-1709312710","data":{"skills_run":["frontend"]}}
{"ts":"2026-03-01T14:10:02Z","type":"loop_end","data":{"task_id":"ghq-abc123","stories_completed":3,"stories_blocked":0}}
```

**Reading parallel execution:** entries sharing a `batch_id` ran concurrently. `loop_start`/`loop_end` have no `batch_id`.

## history.jsonl

Completed loop summaries. Each line is one finished `/run-loop` execution.

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `ts` | `string` (ISO 8601) | Timestamp when the loop finished |
| `task_id` | `string` | Parent task ID |
| `duration_s` | `number` | Total loop duration in seconds |
| `stories_completed` | `number` | Count of subtasks that finished successfully |
| `stories_blocked` | `number` | Count of subtasks that failed after retries |
| `skills_invoked` | `number` | Total skill invocations across all subtasks |
| `blocked_stories` | `string[]` | List of task IDs that were blocked |

### Example Entry

```jsonl
{"ts":"2026-03-01T15:30:00Z","task_id":"ghq-abc123","duration_s":5400,"stories_completed":4,"stories_blocked":1,"skills_invoked":12,"blocked_stories":["ghq-ghi789"]}
```

## Usage

Read the last few state transitions:

```bash
tail -20 loops/state.jsonl | jq .
```

Check if a task completed:

```bash
grep '"story_complete"' loops/state.jsonl | grep 'ghq-def456'
```

List all blocked tasks:

```bash
grep '"story_blocked"' loops/state.jsonl | jq -r '.story_id'
```

Find all subtasks that ran in a specific batch:

```bash
grep '"ghq-abc123-b1-1709312400"' loops/state.jsonl | jq -r '.story_id' | sort -u
```

List all batches from a loop:

```bash
grep 'batch_id' loops/state.jsonl | jq -r '.batch_id' | sort -u
```

## Design Principles

1. **Append-only** -- state.jsonl is never edited, only appended to. This preserves full execution history.
2. **JSONL format** -- One JSON object per line. Easy to grep, tail, and stream.
3. **Minimal fields** -- Each entry contains only what changed. Full state is reconstructed by reading the log.
4. **No nested state files** -- Flat files only.

## See Also

- `knowledge/ghq-core/loops-schema.md` -- Canonical schema definition
- `knowledge/ghq-core/task-schema.md` -- Task definitions and beads workflow
